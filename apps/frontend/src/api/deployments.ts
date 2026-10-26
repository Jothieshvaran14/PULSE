import { api, type ApiResponse } from "./client";

export interface Deployment {
  id: string;
  projectId: string;
  status: string;
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
  project?: { name: string; repositoryUrl: string };
}

export interface DeploymentLog {
  id: string;
  deploymentId: string;
  step: string;
  level: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export const deploymentsApi = {
  async triggerDeploy(projectId: string) {
    const res = await api.post<ApiResponse<Deployment>>(
      `/projects/${projectId}/deploy`
    );
    return res.data;
  },

  async getById(id: string) {
    const res = await api.get<ApiResponse<Deployment>>(`/deployments/${id}`);
    return res.data;
  },

  async listByProject(projectId: string, page = 1, limit = 20) {
    const res = await api.get<ApiResponse<Deployment[]>>(
      `/projects/${projectId}/deployments`,
      { params: { page, limit } }
    );
    return res.data;
  },

  async stop(id: string) {
    const res = await api.post<ApiResponse<Deployment>>(
      `/deployments/${id}/stop`
    );
    return res.data;
  },

  async getLogs(
    deploymentId: string,
    params?: { step?: string; level?: string; limit?: number; offset?: number }
  ) {
    const res = await api.get<ApiResponse<DeploymentLog[]>>(
      `/deployments/${deploymentId}/logs`,
      { params }
    );
    return res.data;
  },
};
