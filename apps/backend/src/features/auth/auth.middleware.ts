import type { Request, Response, NextFunction } from "express";
import { authService } from "./auth.service.js";

/**
 * Authentication middleware.
 *
 * Extracts the JWT from the Authorization header, verifies it,
 * and attaches the userId to the request object.
 *
 * Usage:
 *   router.get("/protected", authenticate, controller.handler);
 *
 * The userId is then available at:
 *   req.userId (via type augmentation)
 */

// Extend Express Request to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid Authorization header",
          statusCode: 401,
        },
      });
      return;
    }

    const token = authHeader.slice(7);

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "No token provided",
          statusCode: 401,
        },
      });
      return;
    }

    const payload = authService.verifyToken(token);
    req.userId = payload.sub;

    next();
  } catch (error) {
    if ((error as Error).name === "TokenExpiredError") {
      res.status(401).json({
        success: false,
        error: {
          code: "TOKEN_EXPIRED",
          message: "Access token has expired",
          statusCode: 401,
        },
      });
      return;
    }

    if ((error as Error).name === "JsonWebTokenError") {
      res.status(401).json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid access token",
          statusCode: 401,
        },
      });
      return;
    }

    next(error);
  }
}
