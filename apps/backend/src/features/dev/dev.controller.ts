import type { Request, Response, NextFunction } from "express";
import { config } from "../../config/index.js";
import { authService } from "../auth/auth.service.js";
import { logger } from "../../lib/logger.js";

/**
 * Whether the development authentication bypass is enabled.
 *
 * Fail-closed by design — BOTH conditions are required:
 *   1. NODE_ENV === "development" (explicitly set; note config defaults it to
 *      "development" only when the variable is missing entirely, so the flag
 *      below is the deciding factor for misconfigured deployments), and
 *   2. ENABLE_DEV_LOGIN === "true" (explicit operator opt-in).
 *
 * Production can never satisfy condition 2 together with a real production
 * NODE_ENV, so a production startup cannot enable this bypass.
 */
export function isDevLoginEnabled(): boolean {
  return config.nodeEnv === "development" && config.enableDevLogin;
}

export const devController = {
  /**
   * POST /dev/login
   *
   * Development-only endpoint that authenticates using a user-provided
   * GitHub Personal Access Token.
   *
   * Flow:
   * 1. Accept token from request body
   * 2. Call GitHub API to validate token and fetch user profile
   * 3. Create/update user in database (token encrypted at rest)
   * 4. Generate and return JWT
   *
   * Fail-closed: only available when NODE_ENV=development AND
   * ENABLE_DEV_LOGIN=true (explicit opt-in). Production cannot enable it.
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isDevLoginEnabled()) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "This endpoint is not available",
            statusCode: 404,
          },
        });
        return;
      }

      const { token } = req.body as { token?: string };

      if (!token) {
        res.status(400).json({
          success: false,
          error: {
            code: "MISSING_PARAMETERS",
            message: "GitHub Personal Access Token is required",
            statusCode: 400,
          },
        });
        return;
      }

      // Validate token format
      if (!/^ghp_[a-zA-Z0-9]{36}$/.test(token) && !/^github_pat_[a-zA-Z0-9_]{82,}$/.test(token)) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_TOKEN_FORMAT",
            message: "Invalid GitHub token format. Expected ghp_* or github_pat_*",
            statusCode: 400,
          },
        });
        return;
      }

      const result = await authService.loginWithToken(token);

      logger.info(
        { userId: result.user.id, githubLogin: result.user.githubLogin },
        "User authenticated via dev PAT"
      );

      res.json({
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error({ error }, "Dev login failed");

      if ((error as Error).message?.includes("Failed to fetch user profile")) {
        res.status(401).json({
          success: false,
          error: {
            code: "INVALID_GITHUB_TOKEN",
            message: "The provided GitHub token is invalid or expired",
            statusCode: 401,
          },
        });
        return;
      }

      next(error);
    }
  },

  /**
   * GET /dev/status
   *
   * Returns whether dev login is enabled.
   */
  async status(_req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      data: {
        enabled: isDevLoginEnabled(),
      },
      meta: { timestamp: new Date().toISOString() },
    });
  },
};
