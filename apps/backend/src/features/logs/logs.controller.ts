import type { Request, Response, NextFunction } from "express";
import { logsService } from "./logs.service.js";
import type { DeploymentLogQuerySchema } from "@pulse/shared";
import type { DeploymentStep, LogLevel } from "@prisma/client";

export const logsController = {
  async getByDeploymentId(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = req.query as unknown as DeploymentLogQuerySchema;
      const result = await logsService.getByDeploymentId(
        req.params["deploymentId"] as string,
        {
          step: query.step as DeploymentStep | undefined,
          level: query.level as LogLevel | undefined,
          limit: query.limit,
          offset: query.offset,
        }
      );

      res.json({
        success: true,
        data: result.logs,
        meta: {
          timestamp: new Date().toISOString(),
          pagination: result.pagination,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
