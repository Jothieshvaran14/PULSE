import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { authService } from "./auth.service.js";
import { logger } from "../../lib/logger.js";

// Store state parameters temporarily (in production, use Redis)
const pendingStates = new Map<string, number>();
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// Cleanup expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of pendingStates) {
    if (now - timestamp > STATE_EXPIRY_MS) {
      pendingStates.delete(key);
    }
  }
}, 5 * 60 * 1000);

export const authController = {
  /**
   * GET /auth/github
   *
   * Initiates the GitHub OAuth flow.
   * Generates a CSRF state parameter, stores it, and redirects to GitHub.
   */
  async initiateLogin(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const state = crypto.randomBytes(32).toString("hex");
      pendingStates.set(state, Date.now());
      logger.debug({ state: state.substring(0, 8) + "...", mapSize: pendingStates.size }, "Stored OAuth state");

      const authorizationUrl = authService.getAuthorizationUrl(state);

      res.json({
        success: true,
        data: { authorizationUrl, state },
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /auth/github/callback
   *
   * Handles the OAuth callback from the frontend.
   * Validates the state parameter, exchanges code for token, returns JWT.
   *
   * Body: { code: string, state: string }
   */
  async handleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, state } = req.body as { code?: string; state?: string };

      if (!code || !state) {
        res.status(400).json({
          success: false,
          error: {
            code: "MISSING_PARAMETERS",
            message: "Authorization code and state are required",
            statusCode: 400,
          },
        });
        return;
      }

      // Validate state parameter (CSRF protection)
      logger.debug({ state: state?.substring(0, 8) + "...", mapSize: pendingStates.size }, "Validating OAuth state");
      
      if (!pendingStates.has(state)) {
        logger.error({ state: state?.substring(0, 8) + "...", mapSize: pendingStates.size, keys: Array.from(pendingStates.keys()).map(k => k.substring(0, 8) + "...") }, "INVALID_STATE - state not found in pendingStates");
        res.status(403).json({
          success: false,
          error: {
            code: "INVALID_STATE",
            message: "Invalid or expired authorization state",
            statusCode: 403,
          },
        });
        return;
      }
      pendingStates.delete(state);
      logger.debug({ mapSize: pendingStates.size }, "State validated and removed");

      const result = await authService.handleCallback(code);

      logger.info({ userId: result.user.id, githubLogin: result.user.githubLogin }, "User authenticated via GitHub OAuth");

      res.json({
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /auth/me
   *
   * Returns the currently authenticated user's profile.
   * Requires valid JWT in Authorization header.
   */
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as unknown as { userId: string }).userId;
      const user = await authService.getUserById(userId);

      if (!user) {
        res.status(404).json({
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "User account not found",
            statusCode: 404,
          },
        });
        return;
      }

      res.json({
        success: true,
        data: user,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /auth/logout
   *
   * Logs out the current user. Since we use stateless JWTs,
   * this is primarily a client-side operation. The endpoint
   * exists for future session revocation.
   */
  async logout(_req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      data: { message: "Logged out successfully" },
      meta: { timestamp: new Date().toISOString() },
    });
  },
};
