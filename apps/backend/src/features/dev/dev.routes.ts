import { Router } from "express";
import { devController } from "./dev.controller.js";

export const devRoutes: Router = Router();

/**
 * Development-only routes — no authentication required
 * These routes are only available when NODE_ENV=development
 */
devRoutes.post("/login", devController.login);
devRoutes.get("/status", devController.status);
