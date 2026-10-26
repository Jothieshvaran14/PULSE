import pinoHttpPkg from "pino-http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { logger } from "../lib/logger.js";

const pinoHttp = pinoHttpPkg as unknown as (options: unknown) => unknown;

/**
 * HTTP request/response logger middleware.
 *
 * Logs every incoming request and its response status using pino.
 * Automatically adds request ID, method, URL, status code, and response time.
 * Redacts Authorization header to prevent JWT leakage in logs.
 */
export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req: IncomingMessage) => {
      return req.url === "/api/v1/health";
    },
  },
  customLogLevel: (_req: IncomingMessage, res: ServerResponse) => {
    if (res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req: IncomingMessage, res: ServerResponse) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req: IncomingMessage, res: ServerResponse) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  serializers: {
    req(req: IncomingMessage) {
      return {
        method: req.method,
        url: req.url,
        // Redact Authorization header — prevents JWT leakage in logs
        headers: {
          ...req.headers,
          authorization: req.headers.authorization ? "[REDACTED]" : undefined,
        },
        remoteAddress: req.socket?.remoteAddress,
      };
    },
  },
}) as unknown as import("express").RequestHandler;
