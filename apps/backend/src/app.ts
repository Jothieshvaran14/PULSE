import express from "express";
import helmet from "helmet";
import { corsMiddleware } from "./middleware/cors.js";
import { requestLogger } from "./middleware/request-logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRoutes } from "./features/health/health.routes.js";
import { projectRoutes } from "./features/projects/projects.routes.js";
import { deploymentRoutes } from "./features/deployments/deployments.routes.js";
import { logRoutes } from "./features/logs/logs.routes.js";
import { authRoutes } from "./features/auth/auth.routes.js";
import { devRoutes } from "./features/dev/dev.routes.js";
import { isDevLoginEnabled } from "./features/dev/dev.controller.js";
import { githubRoutes } from "./features/github/github.routes.js";

/**
 * Express application factory.
 *
 * Creates and configures the Express app with all middleware and routes.
 * Separated from server.ts to enable testing without starting HTTP server.
 */
export function createApp(): express.Application {
  const app = express();

  // ---------------------------------------------------------------------------
  // Security middleware
  // ---------------------------------------------------------------------------
  app.use(helmet({
    // Disable CSP for Phase 1 — deployed apps serve their own HTML
    contentSecurityPolicy: false,
  }));

  // ---------------------------------------------------------------------------
  // Request parsing
  // ---------------------------------------------------------------------------
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  // ---------------------------------------------------------------------------
  // CORS
  // ---------------------------------------------------------------------------
  app.use(corsMiddleware);

  // ---------------------------------------------------------------------------
  // Request logging
  // ---------------------------------------------------------------------------
  app.use(requestLogger);

  // ---------------------------------------------------------------------------
  // API routes
  // ---------------------------------------------------------------------------
  app.use("/api/v1/health", healthRoutes);
  app.use("/api/v1/auth", authRoutes);
  // Dev auth bypass is fail-closed: mounted only when NODE_ENV=development AND
  // ENABLE_DEV_LOGIN=true. Otherwise both /dev routes fall through to 404.
  if (isDevLoginEnabled()) {
    app.use("/api/v1/dev", devRoutes);
  }
  app.use("/api/v1/github", githubRoutes);
  app.use("/api/v1/projects", projectRoutes);
  app.use("/api/v1/deployments", deploymentRoutes);
  app.use("/api/v1", logRoutes);

  // ---------------------------------------------------------------------------
  // 404 handler for unknown routes
  // ---------------------------------------------------------------------------
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "The requested endpoint does not exist",
        statusCode: 404,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Global error handler (must be last)
  // ---------------------------------------------------------------------------
  app.use(errorHandler);

  return app;
}
