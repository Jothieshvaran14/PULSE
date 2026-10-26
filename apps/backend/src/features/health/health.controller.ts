import type { Request, Response } from "express";
import { healthService } from "./health.service.js";

export const healthController = {
  async check(_req: Request, res: Response): Promise<void> {
    try {
      const health = await healthService.getHealth();
      const allHealthy = health.docker && health.database;

      res.status(allHealthy ? 200 : 503).json({
        success: true,
        data: health,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(503).json({
        success: true,
        data: {
          status: "unhealthy",
          docker: false,
          database: false,
          uptime: process.uptime(),
          version: "0.1.0",
          environment: process.env["NODE_ENV"] || "unknown",
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }
  },
};
