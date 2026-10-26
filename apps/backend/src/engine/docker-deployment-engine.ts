import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import tar from "tar-fs";
import { docker } from "../lib/docker-client.js";
import { DockerError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type {
  DeploymentEngine,
  DeployConfig,
  DeployResult,
  HealthCheckConfig,
  ContainerInfo,
} from "./deployment-engine.js";

/**
 * DockerDeploymentEngine implements the DeploymentEngine interface
 * using the Docker Engine API via dockerode.
 *
 * This is the active deployment backend.
 */
export class DockerDeploymentEngine implements DeploymentEngine {
  readonly name = "docker";

  async isAvailable(): Promise<boolean> {
    try {
      await docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  async buildImage(
    contextPath: string,
    imageTag: string,
    onLog?: (message: string) => void
  ): Promise<{ imageId: string }> {
    logger.info({ contextPath, imageTag }, "Starting Docker image build");

    try {
      try {
        await fs.access(path.join(contextPath, "Dockerfile"));
      } catch {
        throw new DockerError("Dockerfile not found in project directory");
      }

      const tarStream = tar.pack(contextPath);

      const stream = await docker.buildImage(tarStream, {
        t: imageTag,
        dockerfile: "Dockerfile",
        rm: true,
        forcerm: true,
        nocache: true,
      });

      const startTime = Date.now();
      const buildResult = await new Promise<{
        imageId: string;
        hasError: boolean;
        errorMessage: string;
      }>((resolve) => {
        let imageId = "";
        let hasError = false;
        let errorMessage = "";
        let buildSucceeded = false;

        docker.modem.followProgress(
          stream,
          (
            err: Error | null,
            output: Array<Record<string, unknown>>
          ) => {
            if (err) {
              resolve({ imageId: "", hasError: true, errorMessage: err.message });
              return;
            }

            for (const entry of output) {
              if (entry["aux"] && typeof entry["aux"] === "object") {
                const aux = entry["aux"] as Record<string, string>;
                if (aux["ID"]) {
                  imageId = aux["ID"];
                }
              }

              if (typeof entry["stream"] === "string") {
                const builtMatch = entry["stream"].match(
                  /Successfully built ([a-f0-9]+)/
                );
                if (builtMatch?.[1]) {
                  imageId = builtMatch[1];
                }

                if (
                  entry["stream"].includes("naming to") ||
                  entry["stream"].includes("exporting to image")
                ) {
                  buildSucceeded = true;
                }

                if (entry["stream"].includes("ERROR:")) {
                  const errorMsg = entry["stream"]
                    .replace("ERROR: ", "")
                    .trim();
                  if (
                    !errorMsg.includes("npm notice") &&
                    !errorMsg.includes("npm warn")
                  ) {
                    hasError = true;
                    errorMessage = errorMsg;
                  }
                }
              }
            }

            if (!imageId && buildSucceeded) {
              imageId = imageTag;
            }
            if (!imageId && !hasError) {
              imageId = imageTag;
            }

            resolve({ imageId, hasError, errorMessage });
          },
          (event: Record<string, unknown>) => {
            if (typeof event["stream"] === "string") {
              const line = event["stream"].trim();
              if (line) {
                onLog?.(line);
              }
            }
            if (typeof event["error"] === "string") {
              const errorMsg = event["error"].trim();
              onLog?.(`ERROR: ${errorMsg}`);
              hasError = true;
              errorMessage = errorMsg;
            }
          }
        );
      });

      const buildDuration = Date.now() - startTime;

      if (buildResult.hasError) {
        throw new DockerError(
          `Image build failed: ${buildResult.errorMessage}`
        );
      }

      logger.info(
        { imageId: buildResult.imageId, imageTag, buildDuration },
        "Docker image built successfully"
      );
      return { imageId: buildResult.imageId };
    } catch (error) {
      if (error instanceof DockerError) throw error;
      throw new DockerError(
        `Failed to build image: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async deploy(config: DeployConfig): Promise<DeployResult> {
    logger.info(
      {
        imageTag: config.imageTag,
        containerPort: config.containerPort,
        containerName: config.containerName,
      },
      "Creating container"
    );

    try {
      const container = await docker.createContainer({
        Image: config.imageTag,
        name: config.containerName,
        ExposedPorts: {
          [`${config.containerPort}/tcp`]: {},
        },
        HostConfig: {
          NetworkMode: config.network,
          RestartPolicy: {
            Name: config.restartPolicy ?? "unless-stopped",
            MaximumRetryCount: 0,
          },
        },
        Labels: config.labels,
        ...(config.env
          ? { Env: Object.entries(config.env).map(([k, v]) => `${k}=${v}`) }
          : {}),
      });

      await container.start();

      const inspectData = await container.inspect();
      const containerId = inspectData.Id;

      logger.info(
        { containerId, containerName: config.containerName },
        "Container started successfully"
      );

      return { containerId };
    } catch (error) {
      throw new DockerError(
        `Failed to start container: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async stop(containerId: string): Promise<void> {
    try {
      const container = docker.getContainer(containerId);
      await container.stop({ t: 10 });
      logger.info({ containerId }, "Container stopped");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("is not running") || message.includes("304")) {
        logger.debug({ containerId }, "Container already stopped");
        return;
      }
      throw new DockerError(`Failed to stop container: ${message}`);
    }
  }

  async remove(containerId: string): Promise<void> {
    try {
      const container = docker.getContainer(containerId);
      await container.remove({ force: true });
      logger.info({ containerId }, "Container removed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("no such container") || message.includes("404")) {
        logger.debug({ containerId }, "Container already removed");
        return;
      }
      throw new DockerError(`Failed to remove container: ${message}`);
    }
  }

  // ── Inspection ─────────────────────────────────────────────────────

  async logs(containerId: string, tail: number = 200): Promise<string> {
    try {
      const container = docker.getContainer(containerId);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true,
      });
      return logs.toString();
    } catch (error) {
      throw new DockerError(
        `Failed to get container logs: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async inspect(containerId: string): Promise<ContainerInfo> {
    try {
      const container = docker.getContainer(containerId);
      const data = await container.inspect();

      const networks = data.NetworkSettings?.Networks ?? {};
      const networkNames = Object.keys(networks);
      const firstNetwork = networks[networkNames[0]!];

      return {
        id: data.Id,
        name: data.Name.replace(/^\//, ""),
        running: data.State.Running,
        status: data.State.Status,
        networks: networkNames,
        ipAddress: firstNetwork?.IPAddress ?? "",
        ports: Object.fromEntries(
          Object.entries(data.NetworkSettings.Ports ?? {}).map(
            ([k, v]) => [k, Array.isArray(v) ? v[0]?.HostPort ?? "" : ""]
          )
        ),
        labels: data.Config.Labels ?? {},
      };
    } catch (error) {
      throw new DockerError(
        `Failed to inspect container: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async isRunning(containerId: string): Promise<boolean> {
    try {
      const container = docker.getContainer(containerId);
      const inspect = await container.inspect();
      return inspect.State.Running;
    } catch {
      return false;
    }
  }

  async list(): Promise<ContainerInfo[]> {
    const containers = await docker.listContainers({
      all: true,
      filters: { label: ["ryme.managed=true"] },
    });

    return containers.map((c) => ({
      id: c.Id,
      name: c.Names[0]?.replace(/^\//, "") ?? "",
      running: c.State === "running",
      status: c.Status,
      networks: Object.keys(c.NetworkSettings?.Networks ?? {}),
      ipAddress:
        c.NetworkSettings?.Networks?.["ryme-network"]?.IPAddress ?? "",
      ports: Object.fromEntries(
        (c.Ports ?? []).map((p) => [
          `${p.PrivatePort}/${p.Type}`,
          p.PublicPort ? `${p.PublicPort}` : "",
        ])
      ),
      labels: c.Labels ?? {},
    }));
  }

  // ── Health ─────────────────────────────────────────────────────────

  async healthCheck(config: HealthCheckConfig): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://127.0.0.1:${config.port}${config.path}`,
        {
          timeout: config.timeoutMs,
          headers: { Host: config.hostname },
        },
        (res) => {
          const statusCode = res.statusCode ?? 0;
          res.resume();
          res.on("end", () => {
            resolve(statusCode === 200);
          });
        }
      );

      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  async waitForHealthy(config: HealthCheckConfig): Promise<boolean> {
    const deadline = Date.now() + config.timeoutMs;

    while (Date.now() < deadline) {
      const healthy = await this.healthCheck({
        ...config,
        timeoutMs: 3000,
      });
      if (healthy) return true;
      await new Promise((r) => setTimeout(r, config.intervalMs));
    }

    return false;
  }
}
