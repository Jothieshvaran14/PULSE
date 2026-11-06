import type { Request, Response, NextFunction } from "express";
import { ZodError, type ZodSchema } from "zod";
import { ValidationError } from "../lib/errors.js";

/**
 * Detects a ZodError across module-system boundaries.
 *
 * @pulse/shared ships a CJS build; when its schemas reject, they throw the CJS
 * copy of zod's ZodError. This backend module (ESM) imports the ESM copy —
 * zod's exports map has distinct `import`/`require` entry points, so the two
 * classes have DIFFERENT identities and `instanceof` fails (dual-package
 * hazard). Confirmed empirically in Phase 0.1: every validation failure was
 * escaping as a raw ZodError → HTTP 500. Duck-type on the stable shape.
 */
function isZodError(error: unknown): error is ZodError {
  if (error instanceof ZodError) return true;
  const e = error as { name?: string; issues?: unknown } | null;
  return (
    typeof e === "object" &&
    e !== null &&
    e.name === "ZodError" &&
    Array.isArray(e.issues)
  );
}

/**
 * Validation middleware factory.
 *
 * Creates Express middleware that validates request body, query, or params
 * against a Zod schema. On validation failure, throws a ValidationError
 * that the global error handler formats into a 400 response.
 *
 * Usage:
 *   router.post("/", validate(createProjectSchema, "body"), controller.create);
 *   router.get("/", validate(paginationSchema, "query"), controller.list);
 */
export function validate(
  schema: ZodSchema,
  source: "body" | "query" | "params" = "body"
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const result = schema.parse(req[source]);
      // Replace with parsed + coerced values (e.g., string "1" → number 1)
      (req as unknown as Record<string, unknown>)[source] = result;
      next();
    } catch (error) {
      if (isZodError(error)) {
        const details = error.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));
        next(new ValidationError("Validation failed", details));
      } else {
        next(error);
      }
    }
  };
}
