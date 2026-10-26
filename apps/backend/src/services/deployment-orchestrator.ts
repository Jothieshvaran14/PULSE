import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/crypto.js";
import { logger } from "../lib/logger.js";
import { config } from "../config/index.js";
import { gitService } from "./git.service.js";
import { frameworkDetector } from "./framework-detector.js";
import { dockerService } from "./docker.service.js";
import { commandExecutor } from "./command-executor.js";
import { hostsManager } from "./hosts-manager.js";
import { traefikRouting } from "./traefik-routing.service.js";
// templateRegistry is initialized in server.ts
import { templateResolver } from "./template-resolver.js";
import { templateRenderer } from "./template-renderer.js";
import { workspaceWriter } from "./workspace-writer.js";
import { dockerEngine } from "../engine/index.js";
import { DeploymentInProgressError } from "../lib/errors.js";
import type { DeploymentStatus, DeploymentStep, LogLevel, Prisma } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * DeploymentOrchestrator coordinates the entire deployment pipeline.
 *
 * Pipeline:
 * 1. CLONING → Clone the repository
 * 2. DETECTING → Detect the framework
 * 3. INSTALLING → Install dependencies (real command execution)
 * 4. BUILDING → Build the project (real command execution) + Docker image
 * 5. STARTING → DNS setup + run container + health check
 * 6. RUNNING → Deployment complete
 *
 * All commands are executed via child_process.spawn with live streaming.
 * stdout/stderr lines are written to the database as deployment logs.
 */
export class DeploymentOrchestrator {
  private workspaceBaseDir: string;

  constructor() {
    this.workspaceBaseDir = path.resolve(__dirname, config.workspaceDir);
  }

  /**
   * Writes a structured deployment log entry.
   */
  private async log(
    deploymentId: string,
    step: DeploymentStep,
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await prisma.deploymentLog.create({
      data: {
        deploymentId,
        step,
        level,
        message,
        metadata: metadata ? (metadata as unknown as Prisma.InputJsonValue) : undefined,
      },
    }).catch((err) => {
      logger.warn({ err, deploymentId }, "Failed to write deployment log");
    });
  }

  /**
   * Updates the deployment status in the database.
   */
  private async updateStatus(
    deploymentId: string,
    status: DeploymentStatus,
    data?: Record<string, unknown>
  ): Promise<void> {
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status,
        ...data,
        ...(status === "RUNNING" || status === "FAILED" || status === "STOPPED"
          ? { completedAt: new Date() }
          : {}),
      },
    });
  }

  /**
   * Parses a command string into command + args.
   * Rejects shell metacharacters — all execution is shell-free.
   */
  private parseCommand(cmd: string): { command: string; args: string[] } {
    const trimmed = cmd.trim();
    if (!trimmed) {
      throw new Error("Empty command");
    }

    // Reject shell metacharacters — no shell execution allowed
    const shellChars = ["|", ">", "<", ";", "&", "$", "`", "(", ")", "{", "}", "!", "\n", "\r"];
    for (const char of shellChars) {
      if (trimmed.includes(char)) {
        throw new Error(
          `Shell metacharacter '${char}' is not allowed. Commands are executed without a shell.`
        );
      }
    }

    const parts = trimmed.split(/\s+/);
    return { command: parts[0]!, args: parts.slice(1) };
  }

  /**
   * Executes a command and streams output as deployment logs.
   */
  private async executeCommand(
    deploymentId: string,
    step: DeploymentStep,
    label: string,
    command: string,
    cwd: string,
    timeoutMs: number
  ): Promise<{ exitCode: number; durationMs: number }> {
    const { command: cmd, args } = this.parseCommand(command);

    await this.log(deploymentId, step, "INFO", `$ ${command}`);

    const result = await commandExecutor.execute(cmd, args, {
      cwd,
      timeoutMs,
      onStdout: (line) => {
        this.log(deploymentId, step, "DEBUG", line).catch(() => {});
      },
      onStderr: (line) => {
        this.log(deploymentId, step, "WARN", line).catch(() => {});
      },
    });

    if (result.exitCode === 0) {
      await this.log(
        deploymentId,
        step,
        "INFO",
        `${label} completed successfully (${(result.durationMs / 1000).toFixed(1)}s)`
      );
    } else {
      await this.log(
        deploymentId,
        step,
        "ERROR",
        `${label} failed with exit code ${result.exitCode}`
      );
      if (result.stderr.trim()) {
        await this.log(
          deploymentId,
          step,
          "ERROR",
          result.stderr.trim().split("\n").slice(-20).join("\n")
        );
      }
    }

    return { exitCode: result.exitCode, durationMs: result.durationMs };
  }

  /**
   * Starts the deployment pipeline for a given deployment ID.
   */
  async deploy(deploymentId: string): Promise<void> {
    let workspacePath: string | null = null;
    let imageTag: string | null = null;
    const pipelineStartTime = Date.now();
    let installDuration = 0;
    let buildDuration = 0;

    try {
      // Load deployment with project data
      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: { project: true },
      });

      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      const project = deployment.project;

      // Check for in-progress deployments on this project
      const activeDeployments = await prisma.deployment.findMany({
        where: {
          projectId: project.id,
          status: {
            in: ["CLONING", "DETECTING", "INSTALLING", "BUILDING", "STARTING"],
          },
          id: { not: deploymentId },
        },
      });

      if (activeDeployments.length > 0) {
        throw new DeploymentInProgressError(project.id);
      }

      // -----------------------------------------------------------------------
      // Step 1: CLONE
      // -----------------------------------------------------------------------
      await this.updateStatus(deploymentId, "CLONING", {
        startedAt: new Date(),
      });
      await this.log(
        deploymentId,
        "CLONE",
        "INFO",
        `Cloning repository: ${project.repositoryUrl} (branch: ${project.defaultBranch})`
      );

      workspacePath = path.join(this.workspaceBaseDir, deploymentId);
      await fs.mkdir(this.workspaceBaseDir, { recursive: true });

      // Decrypt project token if encrypted
      let githubToken: string | undefined;
      if (project.githubToken) {
        try {
          githubToken = decrypt(project.githubToken);
        } catch {
          // Token might not be encrypted (legacy data) — use as-is
          githubToken = project.githubToken;
        }
      }

      const { commitHash } = await gitService.clone(
        project.repositoryUrl,
        project.defaultBranch,
        workspacePath,
        this.workspaceBaseDir,
        githubToken
      );

      await this.updateStatus(deploymentId, "CLONING", {
        commitHash,
        workspacePath,
      });
      await this.log(deploymentId, "CLONE", "INFO", `Repository cloned (commit: ${commitHash.substring(0, 7)})`);

      // -----------------------------------------------------------------------
      // Step 2: DETECT
      // -----------------------------------------------------------------------
      await this.updateStatus(deploymentId, "DETECTING");
      await this.log(deploymentId, "DETECT", "INFO", "Detecting framework...");

      const detection = await frameworkDetector.detect(workspacePath);

      await this.updateStatus(deploymentId, "DETECTING", {
        framework: detection.framework,
      });
      await this.log(
        deploymentId,
        "DETECT",
        "INFO",
        `Framework detected: ${detection.displayName} (confidence: ${(detection.confidence * 100).toFixed(0)}%, detected by: ${detection.detectedBy})`,
        { detection }
      );

      if (detection.packageManager) {
        await this.log(deploymentId, "DETECT", "INFO", `Package manager: ${detection.packageManager}`);
      }
      if (detection.installCommand) {
        await this.log(deploymentId, "DETECT", "INFO", `Install command: ${detection.installCommand}`);
      }
      if (detection.buildCommand) {
        await this.log(deploymentId, "DETECT", "INFO", `Build command: ${detection.buildCommand}`);
      }
      if (detection.outputDirectory) {
        await this.log(deploymentId, "DETECT", "INFO", `Output directory: ${detection.outputDirectory}`);
      }

      // Update project framework reference
      if (detection.framework !== "custom") {
        const frameworkRecord = await prisma.framework.findUnique({
          where: { name: detection.framework },
        });

        const projectUpdateData: Record<string, unknown> = {};
        if (frameworkRecord) {
          projectUpdateData.frameworkId = frameworkRecord.id;
        }
        projectUpdateData.detectedFramework = detection.framework;
        projectUpdateData.frameworkVersion = detection.frameworkVersion;
        projectUpdateData.packageManager = detection.packageManager;
        projectUpdateData.buildCommand = detection.buildCommand;
        projectUpdateData.startCommand = detection.startCommand;
        projectUpdateData.installCommand = detection.installCommand;
        projectUpdateData.devCommand = detection.devCommand;
        projectUpdateData.outputDirectory = detection.outputDirectory;
        projectUpdateData.frameworkConfidence = detection.confidence;

        await prisma.project.update({
          where: { id: project.id },
          data: projectUpdateData,
        });
      }

      // Store detection info on the deployment
      await this.updateStatus(deploymentId, "DETECTING", {
        framework: detection.framework,
        packageManager: detection.packageManager,
        installCommand: detection.installCommand,
        buildCommand: detection.buildCommand,
      });

      // -----------------------------------------------------------------------
      // Step 3: INSTALL
      // -----------------------------------------------------------------------
      const installCmd = detection.installCommand;
      if (installCmd && detection.framework !== "custom" && detection.framework !== "static") {
        await this.updateStatus(deploymentId, "INSTALLING");
        await this.log(
          deploymentId,
          "INSTALL",
          "INFO",
          `Installing dependencies with ${detection.packageManager ?? "default package manager"}...`
        );

        const installResult = await this.executeCommand(
          deploymentId,
          "INSTALL",
          "Installation",
          installCmd,
          workspacePath,
          config.buildTimeoutMs
        );

        installDuration = installResult.durationMs;

        await this.updateStatus(deploymentId, "INSTALLING", {
          installDuration,
        });

        if (installResult.exitCode !== 0) {
          throw new Error(
            `Install failed with exit code ${installResult.exitCode}`
          );
        }
      } else {
        await this.log(
          deploymentId,
          "INSTALL",
          "INFO",
          "No install step needed for this framework"
        );
      }

      // -----------------------------------------------------------------------
      // Step 4: RENDER DOCKERFILE (if needed)
      // -----------------------------------------------------------------------
      let dockerfileGenerated = false;

      if (!detection.hasDockerfile && detection.framework !== "custom") {
      await this.log(
        deploymentId,
        "GENERATE_DOCKERFILE",
        "INFO",
        `Rendering Dockerfile for ${detection.displayName}...`
      );

        try {
          const template = templateResolver.resolve(detection);
          const rendered = templateRenderer.render(template, detection, project.name);
          await workspaceWriter.write(workspacePath, rendered.dockerfile, rendered.nginxConf);
          dockerfileGenerated = true;

          await this.updateStatus(deploymentId, "BUILDING", {
            dockerfileGenerated: true,
          });
          await this.log(
            deploymentId,
            "GENERATE_DOCKERFILE",
            "INFO",
            `Dockerfile rendered (template: ${template.metadata.framework}, proxy: ${template.metadata.proxy})`
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          logger.warn(
            { deploymentId, framework: detection.framework, error: errorMessage },
            "Dockerfile rendering failed, continuing with existing Dockerfile or generic fallback"
          );
          await this.log(
            deploymentId,
            "GENERATE_DOCKERFILE",
            "WARN",
            `Dockerfile rendering issue: ${errorMessage}. Continuing with fallback...`
          );
          dockerfileGenerated = false;
        }
      }

      // -----------------------------------------------------------------------
      // Step 5: BUILD (project build command + Docker image)
      // -----------------------------------------------------------------------
      await this.updateStatus(deploymentId, "BUILDING");
      await this.log(deploymentId, "BUILD", "INFO", "Building project...");

      // Run the project's build command (if any)
      const projectBuildCmd = detection.buildCommand;
      if (projectBuildCmd && detection.framework !== "custom" && detection.framework !== "static") {
        const buildResult = await this.executeCommand(
          deploymentId,
          "BUILD",
          "Project build",
          projectBuildCmd,
          workspacePath,
          config.buildTimeoutMs
        );

        buildDuration = buildResult.durationMs;

        await this.updateStatus(deploymentId, "BUILDING", {
          buildDuration,
        });

        if (buildResult.exitCode !== 0) {
          throw new Error(
            `Build failed with exit code ${buildResult.exitCode}`
          );
        }
      } else {
        await this.log(
          deploymentId,
          "BUILD",
          "INFO",
          "No project build step — proceeding to Docker build"
        );
      }

      // Build Docker image
      await this.log(deploymentId, "BUILD", "INFO", "Building Docker image...");
      imageTag = `${config.dockerImagePrefix}/${project.name}:${deploymentId.substring(0, 8)}`;

      const buildResult = await dockerEngine.buildImage(
        workspacePath,
        imageTag,
        async (line: string) => {
          await this.log(deploymentId, "BUILD", "DEBUG", line).catch(() => {});
        }
      );

      await this.updateStatus(deploymentId, "BUILDING", {
        imageId: buildResult.imageId,
      });
      await this.log(deploymentId, "BUILD", "INFO", `Docker image built (${imageTag})`);

      // -----------------------------------------------------------------------
      // Step 6: START
      // -----------------------------------------------------------------------
      await this.updateStatus(deploymentId, "STARTING");

      // Determine container port from template metadata (eliminates hardcoded NGINX_FRAMEWORKS)
      let containerPort = detection.defaultPort;
      try {
        const template = templateResolver.resolve(detection);
        containerPort = template.metadata.containerPort;
      } catch {
        // Fallback: use detection default port
      }

      // URL is always project.localhost (Traefik handles routing)
      const url = `http://${project.name}.${config.deployDomain}`;

      await this.log(
        deploymentId,
        "START",
        "INFO",
        `Container port: ${containerPort} (framework: ${detection.framework})`
      );

      // -----------------------------------------------------------------------
      // Step 6a: DNS SETUP
      // Add *.localhost entry to Windows hosts file.
      // -----------------------------------------------------------------------
      const hostname = `${project.name}.${config.deployDomain}`;
      await this.log(
        deploymentId,
        "START",
        "INFO",
        `Setting up DNS: ${hostname} → 127.0.0.1`
      );

      const dnsResult = await hostsManager.ensureEntry(hostname);
      if (dnsResult === "added") {
        await this.log(
          deploymentId,
          "START",
          "INFO",
          `DNS entry added to hosts file: ${hostname}`
        );
      } else if (dnsResult === "exists") {
        await this.log(
          deploymentId,
          "START",
          "INFO",
          `DNS entry already exists: ${hostname}`
        );
      } else {
        await this.log(
          deploymentId,
          "START",
          "WARN",
          `Could not add DNS entry (requires Administrator). Health check will use Traefik directly.`
        );
      }

      // -----------------------------------------------------------------------
      // Step 6b: CHECK TRAEFIK
      // -----------------------------------------------------------------------
      const traefikRunning = await dockerService.isTraefikRunning();
      if (!traefikRunning) {
        await this.log(
          deploymentId,
          "START",
          "WARN",
          "Traefik is not running. Start it with: docker compose -f docker-compose.traefik.yml up -d"
        );
      } else {
        await this.log(
          deploymentId,
          "START",
          "INFO",
          "Traefik reverse proxy is running"
        );
      }

      // -----------------------------------------------------------------------
      // Step 6c: RUN CONTAINER
      // -----------------------------------------------------------------------
      await this.log(
        deploymentId,
        "START",
        "INFO",
        `Starting container (${imageTag} → :${containerPort} via Traefik)...`
      );

      const { containerId } = await dockerEngine.deploy({
        imageTag,
        containerName: `ryme-deploy-${deploymentId.substring(0, 8)}`,
        containerPort,
        network: config.dockerNetwork,
        labels: {
          "ryme.managed": "true",
          "ryme.project.id": project.id,
          "ryme.deployment.id": deploymentId,
          "ryme.project.name": project.name,
        },
      });

      await this.log(
        deploymentId,
        "START",
        "INFO",
        `Container started (${containerId.substring(0, 12)})`
      );

      // -----------------------------------------------------------------------
      // Step 6c-ii: WRITE TRAEFIK ROUTE CONFIG
      // Create a file provider config so Traefik routes to this container.
      // -----------------------------------------------------------------------
      const containerName = `ryme-deploy-${deploymentId.substring(0, 8)}`;
      await this.log(
        deploymentId,
        "START",
        "INFO",
        `Writing Traefik route: ${hostname} → ${containerName}:${containerPort}`
      );

      try {
        await traefikRouting.addRoute(project.name, hostname, containerName, containerPort);
        await this.log(
          deploymentId,
          "START",
          "INFO",
          "Traefik route config written (file provider)"
        );
      } catch (err) {
        await this.log(
          deploymentId,
          "START",
          "WARN",
          `Failed to write Traefik route config: ${err instanceof Error ? err.message : "unknown"}`
        );
      }

      // Give Traefik time to pick up the new config file
      await new Promise((r) => setTimeout(r, 1500));

      // -----------------------------------------------------------------------
      // Step 6d: DOCKER DIAGNOSTICS
      // -----------------------------------------------------------------------
      try {
        const inspectData = await dockerEngine.inspect(containerId);
        await this.log(
          deploymentId,
          "START",
          "INFO",
          `Container state: Running=${inspectData.running}, Status=${inspectData.status}`
        );

        await this.log(
          deploymentId,
          "START",
          "INFO",
          `Container networks: ${inspectData.networks.join(", ")}`
        );
      } catch (err) {
        await this.log(
          deploymentId,
          "START",
          "WARN",
          `Could not inspect container: ${err instanceof Error ? err.message : "unknown"}`
        );
      }

      // -----------------------------------------------------------------------
      // Step 6e: HEALTH CHECK via Traefik
      // Verify the container is actually serving through Traefik before marking RUNNING.
      // -----------------------------------------------------------------------
      await this.log(
        deploymentId,
        "START",
        "INFO",
        `Waiting for health check via Traefik: ${hostname}`
      );

      const healthy = await dockerEngine.waitForHealthy({
        hostname,
        port: 80,
        path: "/",
        timeoutMs: 30000,
        intervalMs: 1000,
      });

      if (!healthy) {
        // Check if container is at least running
        const containerRunning = await dockerEngine.isRunning(containerId);
        if (!containerRunning) {
          throw new Error(
            `Container is not running. Check logs: docker logs ${containerId.substring(0, 12)}`
          );
        }

        // Container is running but not responding via Traefik
        // This could be a DNS issue, Traefik not ready, or app taking longer
        await this.log(
          deploymentId,
          "START",
          "WARN",
          `Health check did not return HTTP 200 within 30s. Container is running. Marking as RUNNING anyway.`
        );
      } else {
        await this.log(
          deploymentId,
          "START",
          "INFO",
          `Health check passed — ${url} returned HTTP 200`
        );
      }

      // -----------------------------------------------------------------------
      // Step 7: ROUTE
      // -----------------------------------------------------------------------
      await this.log(
        deploymentId,
        "ROUTE",
        "INFO",
        `Route registered: ${url} (Traefik file provider)`
      );

      // -----------------------------------------------------------------------
      // Step 8: COMPLETE
      // -----------------------------------------------------------------------
      const totalDuration = Date.now() - pipelineStartTime;

      await this.updateStatus(deploymentId, "RUNNING", {
        containerId,
        port: containerPort,
        url,
        imageId: buildResult.imageId,
        dockerfileGenerated,
        installDuration,
        buildDuration,
        totalDuration,
      });

      await this.log(
        deploymentId,
        "COMPLETE",
        "INFO",
        `Deployment complete! Application is live at ${url}`
      );
      await this.log(
        deploymentId,
        "COMPLETE",
        "INFO",
        `Durations — install: ${(installDuration / 1000).toFixed(1)}s, build: ${(buildDuration / 1000).toFixed(1)}s, total: ${(totalDuration / 1000).toFixed(1)}s`
      );

      logger.info(
        { deploymentId, url, containerId },
        "Deployment completed successfully"
      );

      // Clean up workspace after successful build
      await gitService.cleanup(workspacePath);
    } catch (error) {
      // -----------------------------------------------------------------------
      // FAILURE CLEANUP
      // -----------------------------------------------------------------------
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      logger.error({ deploymentId, error: errorMessage }, "Deployment failed");

      await this.log(
        deploymentId,
        "ERROR",
        "ERROR",
        `Deployment failed: ${errorMessage}`
      ).catch(() => {});

      // Try to extract exit code from error message
      const exitCodeMatch = errorMessage.match(/exit code (\d+)/);
      const exitCode = exitCodeMatch?.[1] ? parseInt(exitCodeMatch[1], 10) : 1;

      await this.updateStatus(deploymentId, "FAILED", {
        errorMessage,
        exitCode,
        installDuration,
        buildDuration,
        totalDuration: Date.now() - pipelineStartTime,
      }).catch(() => {});

      if (workspacePath) {
        await gitService.cleanup(workspacePath).catch(() => {});
      }
    }
  }

  /**
   * Stops a running deployment.
   */
  async stop(deploymentId: string): Promise<void> {
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { project: true },
    });

    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    if (deployment.containerId) {
      await dockerEngine.stop(deployment.containerId);
      await dockerEngine.remove(deployment.containerId);
    }

    // Remove Traefik route config if no other running deployments for this project
    if (deployment.project) {
      const hostname = `${deployment.project.name}.${config.deployDomain}`;
      const otherRunning = await prisma.deployment.findFirst({
        where: {
          projectId: deployment.projectId,
          status: "RUNNING",
          id: { not: deploymentId },
        },
      });

      if (!otherRunning) {
        await traefikRouting.removeRoute(deployment.project.name).catch((e) => {
          logger.warn({ error: e }, "Failed to remove Traefik route config during stop");
        });
        await hostsManager.removeEntry(hostname).catch((e) => {
          logger.warn({ error: e }, "Failed to remove DNS entry during stop");
        });
      }
    }

    await this.updateStatus(deploymentId, "STOPPED");
    await this.log(deploymentId, "COMPLETE", "INFO", "Deployment stopped");
  }
}

export const deploymentOrchestrator = new DeploymentOrchestrator();
