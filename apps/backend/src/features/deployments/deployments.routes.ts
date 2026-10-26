import { Router } from "express";
import { deploymentsController } from "./deployments.controller.js";
import { authenticate } from "../auth/auth.middleware.js";
import { requireDeploymentOwner } from "../../middleware/ownership.js";

export const deploymentRoutes: Router = Router();

// Deployment-specific routes (by deployment ID).
// D13 (PULSE-10): ownership resolves through the deployment's parent project;
// foreign/orphan deployments return the same 404 as nonexistent IDs.
deploymentRoutes.get(
  "/:id",
  authenticate,
  requireDeploymentOwner,
  deploymentsController.getById
);
// NOTE: GET /:id/logs intentionally NOT registered here. The validated route
// (validate(deploymentLogQuerySchema)) lives in features/logs/logs.routes.ts
// and is mounted separately; the previous duplicate won the match first and
// served unvalidated query params (SEC-10, consolidated in Phase 0.1).
deploymentRoutes.post(
  "/:id/stop",
  authenticate,
  requireDeploymentOwner,
  deploymentsController.stop
);

// Project deployment routes are mounted under /projects/:id in the project routes
// These are the standalone deployment routes at /api/v1/deployments
