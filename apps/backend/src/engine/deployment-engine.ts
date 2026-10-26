/**
 * Configuration for deploying a container.
 */
export interface DeployConfig {
  imageTag: string;
  containerName: string;
  containerPort: number;
  network: string;
  labels: Record<string, string>;
  env?: Record<string, string>;
  restartPolicy?: "unless-stopped" | "always" | "on-failure" | "no";
}

/**
 * Result of a deploy operation.
 */
export interface DeployResult {
  containerId: string;
}

/**
 * Configuration for a health check.
 */
export interface HealthCheckConfig {
  hostname: string;
  port: number;
  path: string;
  timeoutMs: number;
  intervalMs: number;
}

/**
 * Information about a running container.
 */
export interface ContainerInfo {
  id: string;
  name: string;
  running: boolean;
  status: string;
  networks: string[];
  ipAddress: string;
  ports: Record<string, string>;
  labels: Record<string, string>;
}

/**
 * DeploymentEngine defines the interface for container orchestration backends.
 *
 * Each implementation (Docker, Swarm, Kubernetes) provides its own behavior.
 * The deployment orchestrator communicates only through this interface.
 */
export interface DeploymentEngine {
  /** Human-readable name of this engine (e.g., "docker", "swarm", "kubernetes"). */
  readonly name: string;

  /** Whether this engine is available and reachable. */
  isAvailable(): Promise<boolean>;

  // ── Lifecycle ──────────────────────────────────────────────────────

  /** Build a Docker image from a build context. */
  buildImage(
    contextPath: string,
    imageTag: string,
    onLog?: (message: string) => void
  ): Promise<{ imageId: string }>;

  /** Deploy (create + start) a container. */
  deploy(config: DeployConfig): Promise<DeployResult>;

  /** Stop a running container gracefully. */
  stop(containerId: string): Promise<void>;

  /** Remove a container (must be stopped first). */
  remove(containerId: string): Promise<void>;

  // ── Inspection ─────────────────────────────────────────────────────

  /** Retrieve container logs. */
  logs(containerId: string, tail?: number): Promise<string>;

  /** Get detailed container inspection data. */
  inspect(containerId: string): Promise<ContainerInfo>;

  /** Check if a container is currently running. */
  isRunning(containerId: string): Promise<boolean>;

  /** List all containers managed by this engine. */
  list(): Promise<ContainerInfo[]>;

  // ── Health ─────────────────────────────────────────────────────────

  /** Perform a single HTTP health check. */
  healthCheck(config: HealthCheckConfig): Promise<boolean>;

  /** Poll health check until success or timeout. */
  waitForHealthy(config: HealthCheckConfig): Promise<boolean>;

  // ── Future ─────────────────────────────────────────────────────────

  /** Rollback to a previous deployment (optional). */
  rollback?(deploymentId: string): Promise<void>;
}
