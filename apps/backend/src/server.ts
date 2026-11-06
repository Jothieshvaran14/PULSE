import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { templateRegistry } from "./services/template-registry.js";
import type { DeploymentStatus } from "@prisma/client";

/**
 * Cleans up deployments stuck in non-terminal states from a previous crash.
 * Marks them as FAILED so new deployments can proceed.
 */
async function cleanupStaleDeployments(): Promise<void> {
  const staleStatuses: DeploymentStatus[] = ["QUEUED", "CLONING", "DETECTING", "INSTALLING", "BUILDING", "STARTING"];
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const stale = await prisma.deployment.updateMany({
    where: {
      status: { in: staleStatuses },
      startedAt: { lt: fiveMinutesAgo },
    },
    data: {
      status: "FAILED",
      errorMessage: "Deployment interrupted — server restarted",
      completedAt: new Date(),
    },
  });

  if (stale.count > 0) {
    logger.warn({ count: stale.count }, "Cleaned up stale deployments from previous session");
  }
}

/**
 * Application entry point.
 *
 * Starts the HTTP server with graceful shutdown handling.
 * On SIGTERM/SIGINT, the server stops accepting new connections,
 * waits for in-flight requests, then disconnects from the database.
 */
async function main(): Promise<void> {
  // Verify database connectivity before starting
  try {
    await prisma.$connect();
    logger.info("✅ Database connected");
  } catch (error) {
    logger.error({ error }, "❌ Failed to connect to database");
    process.exit(1);
  }

  // Load deployment templates
  try {
    const { loaded, failed } = await templateRegistry.loadAll();
    logger.info(`✅ Templates loaded: ${loaded} frameworks`);
    if (failed.length > 0) {
      logger.warn({ failed }, "Some templates failed to load");
    }
  } catch (error) {
    logger.error({ error }, "❌ Failed to load templates");
    process.exit(1);
  }

  // Clean up any deployments stuck from a previous crash
  await cleanupStaleDeployments();

  const app = createApp();

  const server = app.listen(config.port, config.host, () => {
    logger.info(
      `🚀 PULSE Backend running at http://${config.host}:${config.port}`
    );
    logger.info(`📋 Environment: ${config.nodeEnv}`);
    logger.info(`🐳 Docker socket: ${config.dockerSocketPath}`);
    logger.info(`🌐 Deploy domain: *.${config.deployDomain}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    server.close(async () => {
      logger.info("HTTP server closed");
      await prisma.$disconnect();
      logger.info("Database disconnected");
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  logger.error({ error }, "Fatal error during startup");
  process.exit(1);
});
