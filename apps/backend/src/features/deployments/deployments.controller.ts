import type { Request, Response, NextFunction } from "express";
import { deploymentsService } from "./deployments.service.js";
import type { PaginationQuerySchema } from "@pulse/shared";

export const deploymentsController = {
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deployment = await deploymentsService.getById(req.params["id"] as string);

      res.json({
        success: true,
        data: deployment,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  },

  async listByProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit } = req.query as unknown as PaginationQuerySchema;
      const result = await deploymentsService.listByProject(
        req.params["id"] as string,
        page,
        limit
      );

      res.json({
        success: true,
        data: result.deployments,
        meta: {
          timestamp: new Date().toISOString(),
          pagination: result.pagination,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async getLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { step, level, limit, offset } = req.query as Record<string, string | undefined>;
      const logs = await deploymentsService.getLogs(req.params["id"] as string, {
        step,
        level,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });

      res.json({
        success: true,
        data: logs,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  },

  async triggerDeploy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deployment = await deploymentsService.triggerDeploy(
        req.params["id"] as string
      );

      res.status(202).json({
        success: true,
        data: deployment,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  },

  async stop(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deployment = await deploymentsService.stopDeployment(
        req.params["id"] as string
      );

      res.json({
        success: true,
        data: deployment,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  },
};
