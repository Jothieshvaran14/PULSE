import { Router } from "express";
import { logsController } from "./logs.controller.js";
import { validate } from "../../middleware/validate.js";
import { authenticate } from "../auth/auth.middleware.js";
import { requireDeploymentOwner } from "../../middleware/ownership.js";
import { deploymentLogQuerySchema } from "@pulse/shared";

export const logRoutes: Router = Router();

// Deployment logs: GET /api/v1/deployments/:deploymentId/logs
// This is now the ONLY route serving that URL (the unvalidated duplicate in
// deployments.routes.ts was removed in Phase 0.1 — SEC-10).
// D13 (PULSE-10): ownership is enforced via the parent project before any
// log rows are read, so deployment IDs cannot be used to cross users.
logRoutes.get(
  "/deployments/:deploymentId/logs",
  authenticate,
  requireDeploymentOwner,
  validate(deploymentLogQuerySchema, "query"),
  logsController.getByDeploymentId
);

// NOTE: the previous GET /projects/:id/deployments and POST /projects/:id/deploy
// registrations here were unreachable duplicates — app.ts mounts
// /api/v1/projects (projects.routes.ts) BEFORE /api/v1 (this router), so the
// projects routes always matched first. Removed as dead code.
