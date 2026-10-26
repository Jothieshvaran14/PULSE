# =============================================================================
# RYME — Generate Test JWT Token
# =============================================================================
# Usage: node tests\generate-test-token.js
# Requires: jsonwebtoken (already installed in apps/backend)
# =============================================================================
# This script generates a valid JWT token for testing protected routes
# WITHOUT needing a real GitHub OAuth flow.
#
# Steps:
# 1. Start the backend
# 2. Run this script
# 3. Use the output token with curl or Postman
# =============================================================================

import jwt from "jsonwebtoken";

// Use the same secret as your backend
// For dev, use: "dev-secret-at-least-32-characters-long!!"
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-at-least-32-characters-long!!";
const JWT_EXPIRES_IN = "24h";

const payload = {
  sub: "test-user-id-001",
  githubId: 12345,
  githubLogin: "testuser",
};

const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

console.log("=".repeat(60));
console.log("RYME — Test JWT Token");
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
