import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/**
 * Global error handler middleware.
 *
 * Catches all errors thrown by controllers/services and formats them
 * into the consistent API error envelope. Never exposes stack traces
 * or internal details to the client.
 *
 * Must be registered LAST in the Express middleware chain.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Operational errors: known, expected, safe to expose to client
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, code: err.code }, err.message);
    } else {
      logger.warn({ code: err.code }, err.message);
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        ...("details" in err ? { details: (err as Record<string, unknown>).details } : {}),
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Body-parser operational errors. Malformed JSON and oversized payloads are
  // CLIENT errors (4xx) — mapping them to 500 mislabels caller mistakes as
  // server faults (Phase 0 confirmed: SyntaxError from express.json reached
  // this handler as a generic error). Never echo the offending body back.
  const bodyType = (err as { type?: string }).type;
  if (bodyType === "entity.parse.failed" || bodyType === "entity.too.large") {
    const tooLarge = bodyType === "entity.too.large";
    const status = tooLarge ? 413 : 400;
    logger.warn({ type: bodyType, status }, "Request body rejected");
    res.status(status).json({
      success: false,
      error: {
        code: tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR",
        message: tooLarge
          ? "Request payload exceeds the 1mb limit"
          : "Invalid JSON payload",
        statusCode: status,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Raw ZodError escaping validation (thrown anywhere outside validate()).
  // Input-validation failures are CLIENT errors → 400, never 500. Duck-typed
  // because of the CJS/ESM dual-package hazard documented in validate.ts
  // (schemas from @pulse/shared throw the CJS copy of ZodError). Only the
  // field path and message are exposed — never the offending input value.
  const zodIssues = (err as { name?: string; issues?: unknown }).issues;
  if (
    err.name === "ZodError" &&
    Array.isArray(zodIssues) &&
    zodIssues.every(
      (i: unknown) =>
        typeof i === "object" && i !== null && "message" in i
    )
  ) {
    const details = (zodIssues as Array<{ path?: unknown; message: string }>)
      .slice(0, 20)
      .map((i) => ({
        field: Array.isArray(i.path) ? i.path.join(".") : "",
        message: i.message,
      }));
    logger.warn({ count: details.length }, "Zod validation failure");
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        statusCode: 400,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Programming errors: unexpected, log full details but hide from client
  logger.error({ err }, "Unhandled error");

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
      statusCode: 500,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}
