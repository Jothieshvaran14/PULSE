export const DeploymentStatus = {
  QUEUED: "QUEUED",
  CLONING: "CLONING",
  DETECTING: "DETECTING",
  INSTALLING: "INSTALLING",
  BUILDING: "BUILDING",
  STARTING: "STARTING",
  RUNNING: "RUNNING",
  FAILED: "FAILED",
  STOPPED: "STOPPED",
} as const;

export type DeploymentStatus =
  (typeof DeploymentStatus)[keyof typeof DeploymentStatus];

/** Statuses that indicate the deployment is still in progress */
export const ACTIVE_DEPLOYMENT_STATUSES: readonly DeploymentStatus[] = [
  DeploymentStatus.QUEUED,
  DeploymentStatus.CLONING,
  DeploymentStatus.DETECTING,
  DeploymentStatus.INSTALLING,
  DeploymentStatus.BUILDING,
  DeploymentStatus.STARTING,
] as const;

/** Statuses that indicate the deployment has reached a terminal state */
export const TERMINAL_DEPLOYMENT_STATUSES: readonly DeploymentStatus[] = [
  DeploymentStatus.RUNNING,
  DeploymentStatus.FAILED,
  DeploymentStatus.STOPPED,
] as const;

/** Human-readable labels for each status */
export const DEPLOYMENT_STATUS_LABELS: Record<DeploymentStatus, string> = {
  [DeploymentStatus.QUEUED]: "Queued",
  [DeploymentStatus.CLONING]: "Cloning Repository",
  [DeploymentStatus.DETECTING]: "Detecting Framework",
  [DeploymentStatus.INSTALLING]: "Installing Dependencies",
  [DeploymentStatus.BUILDING]: "Building Image",
  [DeploymentStatus.STARTING]: "Starting Container",
  [DeploymentStatus.RUNNING]: "Running",
  [DeploymentStatus.FAILED]: "Failed",
  [DeploymentStatus.STOPPED]: "Stopped",
};
