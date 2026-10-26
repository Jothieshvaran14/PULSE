import { Router } from "express";
import { githubController } from "./github.controller.js";
import { authenticate } from "../auth/auth.middleware.js";

export const githubRoutes: Router = Router();

/**
 * Protected routes — valid JWT required
 */
githubRoutes.get("/repos", authenticate, githubController.getRepos);
