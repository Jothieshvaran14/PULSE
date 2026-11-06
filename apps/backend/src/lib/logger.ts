import pino from "pino";
import { config } from "../config/index.js";

/**
 * Structured logger using pino.
 *
 * In development: pretty-printed output with timestamps.
 * In production: JSON lines for log aggregation systems.
 */
export const logger = pino({
  level: config.nodeEnv === "development" ? "debug" : "info",
  transport:
    config.nodeEnv === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  base: {
    service: "pulse-backend",
  },
});
