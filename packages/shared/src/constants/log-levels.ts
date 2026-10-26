export const LogLevel = {
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const DeploymentStep = {
  CLONE: "CLONE",
  DETECT: "DETECT",
  INSTALL: "INSTALL",
  GENERATE_DOCKERFILE: "GENERATE_DOCKERFILE",
  BUILD: "BUILD",
  START: "START",
  ROUTE: "ROUTE",
  COMPLETE: "COMPLETE",
  ERROR: "ERROR",
} as const;

export type DeploymentStep =
  (typeof DeploymentStep)[keyof typeof DeploymentStep];

/** Human-readable labels for each step */
export const DEPLOYMENT_STEP_LABELS: Record<DeploymentStep, string> = {
  [DeploymentStep.CLONE]: "Clone Repository",
  [DeploymentStep.DETECT]: "Detect Framework",
  [DeploymentStep.INSTALL]: "Install Dependencies",
  [DeploymentStep.GENERATE_DOCKERFILE]: "Generate Dockerfile",
  [DeploymentStep.BUILD]: "Build Image",
  [DeploymentStep.START]: "Start Container",
  [DeploymentStep.ROUTE]: "Configure Route",
  [DeploymentStep.COMPLETE]: "Complete",
  [DeploymentStep.ERROR]: "Error",
};
