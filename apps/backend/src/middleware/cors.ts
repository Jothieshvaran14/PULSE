import cors from "cors";

/**
 * CORS configuration.
 *
 * In Phase 1, we allow all origins since this is a self-hosted platform.
 * The frontend dev server runs on a different port (5173) than the
 * backend (3001), so CORS is required for development.
 */
export const corsMiddleware = cors({
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400,
});
