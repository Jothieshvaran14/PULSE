import { api, type ApiResponse } from "./client";

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  docker: boolean;
  database: boolean;
  uptime: number;
  version: string;
  environment: string;
}

export const healthApi = {
  async check() {
    const res = await api.get<ApiResponse<HealthStatus>>("/health");
    return res.data;
  },
};
