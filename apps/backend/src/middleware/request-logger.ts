import pinoHttpPkg from "pino-http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { logger } from "../lib/logger.js";

const pinoHttp = pinoHttpPkg as unknown as (options: unknown) => unknown;

/**
 * HTTP request/response logger middleware.
 *
 * Logs every incoming request and its response status using pino.
 * Automatically adds request ID, method, URL, status code, and response time.
 */
export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req: IncomingMessage) => {
      // Don't log health check polls to keep logs clean
      return req.url === "/api/v1/health";
    },
  },
  customSuccessMessage: (req: IncomingMessage, res: ServerResponse) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req: IncomingMessage, res: ServerResponse) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
}) as unknown as import("express").RequestHandler;
