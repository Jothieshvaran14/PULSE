/**
 * Test harness: boots the Express app (createApp) on an ephemeral port.
 * Used by tests/test-dev-gate.mjs as a child process so each scenario can run
 * with a different NODE_ENV / ENABLE_DEV_LOGIN combination.
 *
 * Requires (set by the parent): DATABASE_URL, JWT_SECRET, TOKEN_ENCRYPTION_KEY.
 * Dummy values are accepted — this harness never touches the database.
 */
process.env["DATABASE_URL"] ??= "postgresql://dummy:dummy@127.0.0.1:1/dummy";
process.env["JWT_SECRET"] ??= "dummy-jwt-secret-for-regression-tests-0000000";
process.env["TOKEN_ENCRYPTION_KEY"] ??= "dummy-encryption-key-for-regression-tests-0000";

const { createApp } = await import("../../apps/backend/src/app.js");

const app = createApp();
const server = app.listen(0, "127.0.0.1", () => {
  const addr = server.address();
  console.log(`READY ${addr.port}`);
});
