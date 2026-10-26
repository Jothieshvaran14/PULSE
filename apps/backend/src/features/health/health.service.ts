import { prisma } from "../../lib/prisma.js";
import { dockerService } from "../../services/docker.service.js";
import { config } from "../../config/index.js";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  docker: boolean;
  database: boolean;
  uptime: number;
  version: string;
  environment: string;
}

export const healthService = {
  async getHealth(): Promise<HealthStatus> {
    const [dockerOk, dbOk] = await Promise.all([
      dockerService.isAvailable().catch(() => false),
      prisma
        .$queryRaw`SELECT 1`
        .then(() => true)
        .catch(() => false),
    ]);

    return {
      status: dockerOk && dbOk ? "healthy" : dockerOk || dbOk ? "degraded" : "unhealthy",
      docker: dockerOk,
      database: dbOk,
      uptime: process.uptime(),
      version: "0.1.0",
      environment: config.nodeEnv,
    };
  },
};
