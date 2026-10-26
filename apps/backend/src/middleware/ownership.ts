import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { NotFoundError } from "../lib/errors.js";

/**
 * Ownership guards implementing the approved D13 policy
 * (docs/pulse/PULSE-10-tenancy-and-idor-remediation.md):
 *
 *  - Single-tenant, multi-user MVP: every project-scoped object is accessible
 *    only to the authenticated principal that owns its project.
 *  - Resources whose project has `owner_id IS NULL` (quarantined orphans) are
 *    inaccessible to EVERY user — a missing owner is never treated as
 *    permission to access.
 *  - Unauthorized and nonexistent resources return the IDENTICAL 404
 *    envelope, so callers cannot distinguish "someone else's project"
 *    from "no such project" (no existence oracle).
 *
 * These guards run AFTER `authenticate` on every route that addresses a
 * project, deployment, or log object by ID. List endpoints are scoped in the
 * query layer instead (see projectsRepository.findAll).
 */

/** True only when the project exists AND has a non-null owner equal to the caller. */
async function callerOwnsProject(projectId: string, userId?: string): Promise<boolean> {
  if (!userId) return false;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  return project?.ownerId !== null && project?.ownerId !== undefined && project.ownerId === userId;
}

/** Express guard for routes with an `:id` project parameter. */
export async function requireProjectOwner(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const id = req.params["id"] as string;
  try {
    if (!(await callerOwnsProject(id, req.userId))) {
      // Identical response for missing, foreign, and quarantined projects.
      next(new NotFoundError("Project", id));
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Express guard for routes addressing a deployment by `:id` (deployments
 * router) or `:deploymentId` (logs router). Ownership is resolved through
 * the deployment's parent project, so deployment/log IDs can never be used
 * to reach across tenants.
 */
export async function requireDeploymentOwner(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const id = (req.params["id"] ?? req.params["deploymentId"]) as string;
  try {
    const deployment = await prisma.deployment.findUnique({
      where: { id },
      select: { project: { select: { ownerId: true } } },
    });
    const ownerId = deployment?.project?.ownerId;
    if (!ownerId || !req.userId || ownerId !== req.userId) {
      next(new NotFoundError("Deployment", id));
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
