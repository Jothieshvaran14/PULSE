import { Router } from "express";
import { projectsController } from "./projects.controller.js";
import { validate } from "../../middleware/validate.js";
import { authenticate } from "../auth/auth.middleware.js";
import {
  requireProjectOwner,
} from "../../middleware/ownership.js";
import {
  createProjectSchema,
  updateProjectSchema,
  importProjectSchema,
  paginationQuerySchema,
} from "@pulse/shared";

export const projectRoutes: Router = Router();

projectRoutes.get(
  "/",
  authenticate,
  validate(paginationQuerySchema, "query"),
  projectsController.list
);

// D13 (PULSE-10): every `:id`-addressed project route requires ownership.
// Quarantined (owner_id NULL) and foreign projects both return the same 404.
projectRoutes.get("/:id", authenticate, requireProjectOwner, projectsController.getById);

projectRoutes.post(
  "/",
  authenticate,
  validate(createProjectSchema, "body"),
  projectsController.create
);

projectRoutes.post(
  "/import",
  authenticate,
  validate(importProjectSchema, "body"),
  projectsController.importFromGithub
);

projectRoutes.put(
  "/:id",
  authenticate,
  requireProjectOwner,
  validate(updateProjectSchema, "body"),
  projectsController.update
);

projectRoutes.delete(
  "/:id",
  authenticate,
  requireProjectOwner,
  projectsController.delete
);

projectRoutes.post(
  "/:id/deploy",
  authenticate,
  requireProjectOwner,
  projectsController.triggerDeploy
);
projectRoutes.get(
  "/:id/framework",
  authenticate,
  requireProjectOwner,
  projectsController.getFramework
);
projectRoutes.get(
  "/:id/deployments",
  authenticate,
  requireProjectOwner,
  projectsController.listDeployments
);
