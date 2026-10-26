import type { Request, Response, NextFunction } from "express";
import { projectsService } from "./projects.service.js";
import { deploymentsService } from "../deployments/deployments.service.js";
import type { CreateProjectSchema, UpdateProjectSchema, ImportProjectSchema, PaginationQuerySchema } from "@ryme/shared";

export const projectsController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit } = req.query as unknown as PaginationQuerySchema;
      // D13: list is scoped to the authenticated principal (PULSE-10).
      const result = await projectsService.list(page, limit, req.userId!);

      res.json({
        success: true,
        data: result.projects,
        meta: {
          timestamp: new Date().toISOString(),
          pagination: result.pagination,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const project = await projectsService.getById(req.params["id"] as string);

      res.json({
        success: true,
        data: project,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const project = await projectsService.create(
        req.body as CreateProjectSchema,
        req.userId! // D13: new projects are always owned by their creator
      );

      res.status(201).json({
        success: true,
        data: project,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  },

  async importFromGithub(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const data = req.body as ImportProjectSchema;

      const project = await projectsService.importFromGithub({
        githubId: data.githubId,
        name: data.name,
        fullName: data.fullName,
        cloneUrl: data.cloneUrl,
        defaultBranch: data.defaultBranch,
        private: data.private,
        ownerId: userId,
      });

      res.status(201).json({
        success: true,
        data: project,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const project = await projectsService.update(
        req.params["id"] as string,
        req.body as UpdateProjectSchema
      );

      res.json({
        success: true,
        data: project,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await projectsService.delete(req.params["id"] as string);

      res.json({
        success: true,
        data: { message: "Project deleted successfully" },
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

  async getFramework(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const project = await projectsService.getById(req.params["id"] as string);

      const framework = {
        framework: project.detectedFramework ?? project.framework?.name ?? null,
        displayName: project.framework?.displayName ?? project.detectedFramework ?? null,
        confidence: project.frameworkConfidence,
        packageManager: project.packageManager,
        buildCommand: project.buildCommand,
        startCommand: project.startCommand,
        installCommand: project.installCommand,
        devCommand: project.devCommand,
        outputDirectory: project.outputDirectory,
        frameworkVersion: project.frameworkVersion,
        detectedAt: project.updatedAt,
      };

      res.json({
        success: true,
        data: framework,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  },

  async listDeployments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20 } = req.query as unknown as PaginationQuerySchema;
      const result = await deploymentsService.listByProject(
        req.params["id"] as string,
        Number(page),
        Number(limit)
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
};
