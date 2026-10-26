import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import tar from "tar-fs";
import { docker } from "../lib/docker-client.js";
import { DockerError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { config } from "../config/index.js";
import type Docker from "dockerode";

/**
 * DockerService manages all Docker operations through the dockerode SDK.
 *
 * Every operation goes through dockerode — never through shell commands.
 * This eliminates command injection risks and provides structured output.
 */
export class DockerService {
  /**
   * Checks if the Docker daemon is reachable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensures the ryme-network Docker bridge network exists.
   * Creates it if it doesn't exist.
   */
  async ensureNetwork(): Promise<void> {
    const networkName = config.dockerNetwork;
    try {
      const networks = await docker.listNetworks({
        filters: { name: [networkName] },
      });
      const exists = networks.some((n) => n.Name === networkName);

      if (!exists) {
        await docker.createNetwork({
          Name: networkName,
          Driver: "bridge",
        });
        logger.info({ networkName }, "Docker network created");
      }
    } catch (error) {
      throw new DockerError(
        `Failed to ensure Docker network '${networkName}': ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Checks if the Traefik reverse proxy container is running.
   */
  async isTraefikRunning(): Promise<boolean> {
    try {
      const containers = await docker.listContainers({
        filters: {
          name: ["ryme-traefik"],
          status: ["running"],
        },
      });
      return containers.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Builds a Docker image from a project directory.
   *
   * Streams build output via the onLog callback for real-time logging.
   * Uses tar-fs to create the build context from the project directory.
   *
   * @param contextPath - Absolute path to the directory containing the Dockerfile
   * @param imageTag - Tag for the built image (e.g., "ryme/project:abc123")
   * @param onLog - Callback for each build log line
   * @returns The built image ID
   */
  async buildImage(
    contextPath: string,
    imageTag: string,
    onLog?: (message: string) => void
  ): Promise<{ imageId: string }> {
    logger.info({ contextPath, imageTag }, "Starting Docker image build");

    try {
      // Verify Dockerfile exists
      try {
        await fs.access(path.join(contextPath, "Dockerfile"));
      } catch {
        throw new DockerError(
          "Dockerfile not found in project directory"
        );
      }

      // Create tar stream from the project directory as build context
      const tarStream = tar.pack(contextPath);

      const stream = await docker.buildImage(tarStream, {
        t: imageTag,
        dockerfile: "Dockerfile",
        rm: true,
        forcerm: true,
        nocache: true,
      });

      // Stream and collect build output
      const startTime = Date.now();
      const buildResult = await new Promise<{ imageId: string; hasError: boolean; errorMessage: string }>((resolve) => {
        let imageId = "";
        let hasError = false;
        let errorMessage = "";
        let buildSucceeded = false;

        docker.modem.followProgress(
          stream,
          (err: Error | null, output: Array<Record<string, unknown>>) => {
            // Check for transport-level errors
            if (err) {
              resolve({ imageId: "", hasError: true, errorMessage: err.message });
              return;
            }

            // Scan all output for image ID and success markers
            for (const entry of output) {
              // Classic Docker: aux event with ID
              if (entry["aux"] && typeof entry["aux"] === "object") {
                const aux = entry["aux"] as Record<string, string>;
                if (aux["ID"]) {
                  imageId = aux["ID"];
                }
              }

              // Classic Docker: "Successfully built <id>"
              if (typeof entry["stream"] === "string") {
                const builtMatch = entry["stream"].match(/Successfully built ([a-f0-9]+)/);
                if (builtMatch?.[1]) {
                  imageId = builtMatch[1];
                }

                // BuildKit: "exporting to image" or "naming to" means success
                if (entry["stream"].includes("naming to") || entry["stream"].includes("exporting to image")) {
                  buildSucceeded = true;
                }

                // Detect real errors (not npm notices or warnings)
                if (entry["stream"].includes("ERROR:")) {
                  const errorMsg = entry["stream"].replace("ERROR: ", "").trim();
                  // Ignore non-fatal messages
                  if (!errorMsg.includes("npm notice") && !errorMsg.includes("npm warn")) {
                    hasError = true;
                    errorMessage = errorMsg;
                  }
                }
              }
            }

            // If image was tagged, build succeeded regardless of ID extraction
            if (!imageId && buildSucceeded) {
              imageId = imageTag;
            }

            // Final fallback: if no errors occurred, use the image tag
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
        throw new DockerError(`Image build failed: ${buildResult.errorMessage}`);
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

  /**
   * Creates and starts a Docker container.
   *
   * The container is:
   * - Attached to the ryme-network for Traefik routing
   * - Labeled with Traefik routing configuration
   * - NOT port-published to host (Traefik handles routing)
   * - Named with the ryme-deploy prefix
   *
   * @param imageTag - Docker image to run
   * @param containerPort - Internal container port (used by Traefik label)
   * @param projectName - Project name (used for routing and naming)
   * @param deploymentId - Deployment ID (used for container name)
   * @param projectId - Project ID (stored as label)
   * @returns Container ID
   */
  async runContainer(
    imageTag: string,
    containerPort: number,
    projectName: string,
    deploymentId: string,
    projectId: string
  ): Promise<{ containerId: string }> {
    const containerName = `ryme-deploy-${deploymentId.substring(0, 8)}`;

    logger.info(
      { imageTag, containerPort, containerName },
      "Creating container"
    );

    try {
      // Ensure network exists before creating container
      await this.ensureNetwork();

      const container = await docker.createContainer({
        Image: imageTag,
        name: containerName,
        ExposedPorts: {
          [`${containerPort}/tcp`]: {},
        },
        HostConfig: {
          NetworkMode: config.dockerNetwork,
          RestartPolicy: {
            Name: "unless-stopped",
            MaximumRetryCount: 0,
          },
        },
        Labels: {
          // RYME metadata labels (no Traefik labels — routing via file provider)
          "ryme.managed": "true",
          "ryme.project.id": projectId,
          "ryme.deployment.id": deploymentId,
          "ryme.project.name": projectName,
        },
      });

      await container.start();

      const inspectData = await container.inspect();
      const containerId = inspectData.Id;

      logger.info(
        { containerId, containerName },
        "Container started successfully"
      );

      return { containerId };
    } catch (error) {
      throw new DockerError(
        `Failed to start container: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Stops a running container gracefully.
   */
  async stopContainer(containerId: string): Promise<void> {
    try {
      const container = docker.getContainer(containerId);
      await container.stop({ t: 10 }); // 10 second grace period
      logger.info({ containerId }, "Container stopped");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Ignore "not running" errors
      if (message.includes("is not running") || message.includes("304")) {
        logger.debug({ containerId }, "Container already stopped");
        return;
      }
      throw new DockerError(`Failed to stop container: ${message}`);
    }
  }

  /**
   * Removes a container (must be stopped first).
   */
  async removeContainer(containerId: string): Promise<void> {
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

  /**
   * Checks if a container is running.
   */
  async isContainerRunning(containerId: string): Promise<boolean> {
    try {
      const container = docker.getContainer(containerId);
      const inspect = await container.inspect();
      return inspect.State.Running;
    } catch {
      return false;
    }
  }

  /**
   * Gets container logs.
   */
  async getContainerLogs(
    containerId: string,
    tail: number = 200
  ): Promise<string> {
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

  /**
   * Removes a Docker image.
   */
  async removeImage(imageTag: string): Promise<void> {
    try {
      const image = docker.getImage(imageTag);
      await image.remove({ force: true });
      logger.info({ imageTag }, "Image removed");
    } catch (error) {
      logger.warn(
        { imageTag, error },
        "Failed to remove image (may still be in use)"
      );
    }
  }

  /**
   * Lists all RYME-managed containers.
   */
  async listManagedContainers(): Promise<Docker.ContainerInfo[]> {
    return docker.listContainers({
      all: true,
      filters: {
        label: ["ryme.managed=true"],
      },
    });
  }

  /**
   * Gets detailed container inspection data.
   * Equivalent to: docker inspect <container>
   */
  async inspectContainer(containerId: string): Promise<Docker.ContainerInspectInfo> {
    try {
      const container = docker.getContainer(containerId);
      return await container.inspect();
    } catch (error) {
      throw new DockerError(
        `Failed to inspect container: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Lists running containers (RYME-managed).
   * Equivalent to: docker ps
   */
  async listRunningContainers(): Promise<Docker.ContainerInfo[]> {
    return docker.listContainers({
      filters: {
        label: ["ryme.managed=true"],
        status: ["running"],
      },
    });
  }

  /**
   * Performs an HTTP health check against a URL via Traefik.
   * Connects to 127.0.0.1:80 (Traefik) and sets the Host header,
   * bypassing DNS resolution entirely.
   *
   * @param hostname - The Host header value (e.g., "ryme-test-app.localhost")
   * @param timeoutMs - Maximum time to wait for a single attempt
   * @returns true if Traefik responds with HTTP 200
   */
  async healthCheckUrl(hostname: string, timeoutMs: number = 5000): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://127.0.0.1:80/`,
        {
          timeout: timeoutMs,
          headers: { Host: hostname },
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

  /**
   * Polls health check until Traefik responds HTTP 200 or timeout is reached.
   *
   * @param hostname - The Host header value (e.g., "ryme-test-app.localhost")
   * @param timeoutMs - Total time to keep retrying (default: 30s)
   * @param intervalMs - Time between attempts (default: 1s)
   * @returns true if healthy, false if timed out
   */
  async waitForHealthyUrl(hostname: string, timeoutMs: number = 30000, intervalMs: number = 1000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const healthy = await this.healthCheckUrl(hostname, 3000);
      if (healthy) return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    return false;
  }
}

export const dockerService = new DockerService();
