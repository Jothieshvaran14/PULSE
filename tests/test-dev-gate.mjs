/**
 * Regression test: development authentication bypass must FAIL CLOSED.
 *
 * POST /api/v1/dev/login authenticates a caller with a GitHub PAT and returns a
 * JWT. It must only ever be reachable when BOTH are true:
 *   - NODE_ENV === "development"
 *   - ENABLE_DEV_LOGIN === "true"   (explicit opt-in)
 *
 * Contract asserted here:
 *   disabled  -> POST /api/v1/dev/login  => 404 (route not mounted)
 *                 GET  /api/v1/dev/status => 404
 *   enabled   -> POST /api/v1/dev/login  => 400 (missing token)  [never reaches GitHub]
 *                 GET  /api/v1/dev/status => 200 { enabled: true }
 *
 * The test sends an EMPTY body so an enabled endpoint stops at input validation
 * and makes no external network calls.
 *
 * Run: node tests/test-dev-gate.mjs      Exit 0 = all scenarios pass.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HARNESS = path.join(ROOT, "tests", "helpers", "dev-gate-harness.mjs");
// tsx is a devDependency of @pulse/backend only — invoke its CLI directly so the
// test works from the repo root without npx/shell resolution.
const TSX_CLI = path.join(ROOT, "apps", "backend", "node_modules", "tsx", "dist", "cli.mjs");

const DUMMY_ENV = {
  DATABASE_URL: "postgresql://dummy:dummy@127.0.0.1:1/dummy",
  JWT_SECRET: "dummy-jwt-secret-for-regression-tests-0000000",
  TOKEN_ENCRYPTION_KEY: "dummy-encryption-key-for-regression-tests-0000",
};

/** scenario: [name, envOverrides (null value = unset), expectations] */
const SCENARIOS = [
  {
    name: "1. NODE_ENV=production, no flag -> dev login DISABLED",
    env: { NODE_ENV: "production", ENABLE_DEV_LOGIN: null },
    expect: { login: 404, status: 404 },
  },
  {
    name: "2. NODE_ENV=production + flag forced -> STILL DISABLED (cannot enable in prod)",
    env: { NODE_ENV: "production", ENABLE_DEV_LOGIN: "true" },
    expect: { login: 404, status: 404 },
  },
  {
    name: "3. NODE_ENV unset (misconfigured prod), no flag -> DISABLED (fail-closed)",
    env: { NODE_ENV: null, ENABLE_DEV_LOGIN: null },
    expect: { login: 404, status: 404 },
  },
  {
    name: "4. NODE_ENV=development, no flag -> DISABLED (explicit opt-in required)",
    env: { NODE_ENV: "development", ENABLE_DEV_LOGIN: null },
    expect: { login: 404, status: 404 },
  },
  {
    name: "5. NODE_ENV=development + flag -> ENABLED (dev workflow preserved)",
    env: { NODE_ENV: "development", ENABLE_DEV_LOGIN: "true" },
    expect: { login: 400, status: 200, enabled: true },
  },
];

function startHarness(envOverrides) {
  const env = { ...process.env, ...DUMMY_ENV };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === null) delete env[key];
    else env[key] = value;
  }
  const child = spawn(process.execPath, [TSX_CLI, HARNESS], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let output = "";
    let errOutput = "";
    child.stderr.on("data", (chunk) => { errOutput += chunk.toString(); });
    const timer = setTimeout(
      () => reject(new Error(`harness timeout. stdout:\n${output}\nstderr:\n${errOutput}`)),
      30000
    );
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const m = output.match(/READY (\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve({ child, port: Number(m[1]) });
      }
    });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`harness exited early (code ${code}). stdout:\n${output}\nstderr:\n${errOutput}`));
    });
  });
}

async function post(url) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return res.status;
}

async function getStatus(url) {
  const res = await fetch(url);
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  return { status: res.status, enabled: body?.data?.enabled };
}

const results = [];
for (const scenario of SCENARIOS) {
  let harness;
  try {
    harness = await startHarness(scenario.env);
    const base = `http://127.0.0.1:${harness.port}/api/v1/dev`;
    const loginStatus = await post(`${base}/login`);
    const statusRes = await getStatus(`${base}/status`);

    const loginOk = loginStatus === scenario.expect.login;
    const statusOk = statusRes.status === scenario.expect.status;
    const enabledOk =
      scenario.expect.enabled === undefined || statusRes.enabled === scenario.expect.enabled;

    const pass = loginOk && statusOk && enabledOk;
    results.push({ name: scenario.name, pass, loginStatus, statusRes });
    console.log(
      `${pass ? "PASS" : "FAIL"}  ${scenario.name}\n` +
        `      POST /login => ${loginStatus} (expected ${scenario.expect.login}) | ` +
        `GET /status => ${statusRes.status} (expected ${scenario.expect.status})` +
        (scenario.expect.enabled !== undefined ? ` enabled=${statusRes.enabled}` : "")
    );
  } catch (err) {
    results.push({ name: scenario.name, pass: false, error: String(err) });
    console.log(`FAIL  ${scenario.name}\n      ${String(err).split("\n")[0]}`);
  } finally {
    if (harness?.child) harness.child.kill();
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
process.exit(failed.length === 0 ? 0 : 1);
