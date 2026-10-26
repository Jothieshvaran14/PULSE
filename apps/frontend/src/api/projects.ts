import { api, type ApiResponse } from "./client";

export interface Project {
  id: string;
  name: string;
  repositoryUrl: string;
  githubId?: number | null;
  cloneUrl?: string | null;
  defaultBranch: string;
  frameworkId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  framework?: { name: string; displayName: string } | null;
  _count?: { deployments: number };
  deployments?: Array<{
    id: string;
    status: string;
    framework: string | null;
    url: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
}

export interface CreateProjectInput {
  name: string;
  repositoryUrl: string;
  githubToken?: string;
  defaultBranch?: string;
}

export interface ImportProjectInput {
  githubId: number;
  name: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
}

export interface FrameworkDetectionInfo {
  framework: string | null;
  displayName: string | null;
  confidence: number | null;
  packageManager: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  installCommand: string | null;
  devCommand: string | null;
  outputDirectory: string | null;
  frameworkVersion: string | null;
  detectedAt: string;
}

export const projectsApi = {
  async list(page = 1, limit = 20) {
    const res = await api.get<ApiResponse<Project[]>>("/projects", {
      params: { page, limit },
    });
    return res.data;
  },

  async getById(id: string) {
    const res = await api.get<ApiResponse<Project>>(`/projects/${id}`);
    return res.data;
  },

  async create(data: CreateProjectInput) {
    const res = await api.post<ApiResponse<Project>>("/projects", data);
    return res.data;
  },

  async importFromGithub(data: ImportProjectInput) {
    const res = await api.post<ApiResponse<Project>>("/projects/import", data);
    return res.data;
  },

  async update(id: string, data: Partial<CreateProjectInput>) {
    const res = await api.put<ApiResponse<Project>>(`/projects/${id}`, data);
    return res.data;
  },

  async delete(id: string) {
    const res = await api.delete<ApiResponse<{ message: string }>>(
      `/projects/${id}`
    );
    return res.data;
  },

  async getFramework(id: string) {
    const res = await api.get<ApiResponse<FrameworkDetectionInfo>>(
      `/projects/${id}/framework`
    );
    return res.data;
  },
};
