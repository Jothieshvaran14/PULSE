import { Router } from "express";
import { authController } from "./auth.controller.js";
import { authenticate } from "./auth.middleware.js";

export const authRoutes: Router = Router();

/**
 * Public routes — no authentication required
 */
authRoutes.get("/github", authController.initiateLogin);
authRoutes.post("/github/callback", authController.handleCallback);
authRoutes.post("/logout", authController.logout);

/**
 * Protected routes — valid JWT required
 */
authRoutes.get("/me", authenticate, authController.getMe);
