/**
 * App harness: boots createApp() on an ephemeral port in a child process.
 * Used by integration tests so each test run can point the app at an isolated
 * scratch database via the inherited DATABASE_URL.
 *
 * Parent must provide (via env): DATABASE_URL (test DB), and either real or
 * dummy JWT_SECRET / TOKEN_ENCRYPTION_KEY (falls back to dummy values so the
 * harness is never blocked on credentials it does not itself need).
 */
process.env["NODE_ENV"] ??= "test";
process.env["DATABASE_URL"] ??= "postgresql://dummy:dummy@127.0.0.1:1/dummy";
process.env["JWT_SECRET"] ??= "dummy-jwt-secret-for-regression-tests-0000000";
process.env["TOKEN_ENCRYPTION_KEY"] ??= "dummy-encryption-key-for-regression-tests-000";

const { createHash } = await import("node:crypto");
const { config } = await import("../../apps/backend/src/config/index.js");
// Diagnostic: hash only — never prints the secret itself.
console.log(
  "HARNESS_JWT_HASH",
  createHash("sha256").update(config.jwtSecret).digest("hex").slice(0, 12)
);

const { createApp } = await import("../../apps/backend/src/app.js");

const app = createApp();
const server = app.listen(0, "127.0.0.1", () => {
  const addr = server.address();
  console.log(`READY ${addr.port}`);
});
