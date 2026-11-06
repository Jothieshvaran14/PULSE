// =============================================================================
// PULSE — Generate Test JWT Token
// =============================================================================
// Usage (from the repo root, with the local .env):
//   node --env-file=.env tests/generate-test-token.mjs
// Requires: jsonwebtoken (already installed in apps/backend)
// =============================================================================
// This script generates a valid JWT token for testing protected routes
// WITHOUT needing a real GitHub OAuth flow.
//
// SEC-03: there is NO fallback secret. If JWT_SECRET is not supplied the
// script exits with an error instead of signing with a well-known value.
//
// Steps:
// 1. Start the backend
// 2. Run this script (with JWT_SECRET available)
// 3. Use the output token with curl or Postman
// =============================================================================

import { createRequire } from "node:module";

// jsonwebtoken is a dependency of apps/backend; resolve it from there so the
// script works from the repo root under pnpm's strict node_modules layout.
const requireFromBackend = createRequire(
  new URL("../apps/backend/package.json", import.meta.url)
);
const jwt = requireFromBackend("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error(
    "ERROR: JWT_SECRET is missing or shorter than 32 characters.\n" +
      "Run with the local environment file, for example:\n" +
      "  node --env-file=.env tests/generate-test-token.mjs"
  );
  process.exit(1);
}
const JWT_EXPIRES_IN = "24h";

const payload = {
  sub: "test-user-id-001",
  githubId: 12345,
  githubLogin: "testuser",
};

const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

console.log("=".repeat(60));
console.log("PULSE — Test JWT Token");
console.log("=".repeat(60));
console.log("");
console.log("Token:");
console.log(token);
console.log("");
console.log("Use with curl:");
console.log(`  curl -H "Authorization: Bearer ${token}" http://localhost:3001/api/v1/auth/me`);
console.log("");
console.log("Use with Postman:");
console.log('  Header: Authorization = Bearer ' + token);
console.log("");
console.log("Payload:");
console.log(JSON.stringify(payload, null, 2));
console.log("");
console.log("Expires in: " + JWT_EXPIRES_IN);
console.log("=".repeat(60));
