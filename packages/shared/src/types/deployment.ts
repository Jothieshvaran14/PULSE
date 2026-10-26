import type { DeploymentStatus } from "../constants/deployment-status.js";
import type { DeploymentStep, LogLevel } from "../constants/log-levels.js";

export interface Deployment {
  id: string;
  projectId: string;
  status: DeploymentStatus;
  commitHash: string | null;
  imageId: string | null;
  containerId: string | null;
  port: number | null;
  url: string | null;
  framework: string | null;
  packageManager: string | null;
  installCommand: string | null;
  buildCommand: string | null;
  dockerfileGenerated: boolean;
  errorMessage: string | null;
  exitCode: number | null;
  startedAt: string | null;
  completedAt: string | null;
  installDuration: number | null;
  buildDuration: number | null;
  totalDuration: number | null;
  createdAt: string;
  project?: {
    name: string;
    repositoryUrl: string;
  };
}

export interface DeploymentLog {
  id: string;
  deploymentId: string;
  step: DeploymentStep;
  level: LogLevel;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface DeploymentLogQuery {
  step?: DeploymentStep;
  level?: LogLevel;
  limit?: number;
  offset?: number;
}
