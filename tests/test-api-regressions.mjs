/**
 * API regression tests (Phase 0.1) — run against an ISOLATED scratch database.
 *
 * Covers:
 *  1. Malformed JSON  => HTTP 400 (not 500), body NOT echoed back.
 *  2. Oversized body  => HTTP 413 (not 500).
 *  3. Consolidated logs route serves the VALIDATED handler (SEC-10):
 *     meta.pagination present, strict query validation, step=INSTALL accepted
 *     (enum parity — 298 real log rows use INSTALL).
 *  4. Deployment list/detail endpoints succeed against a correctly ALIGNED
 *     database (regression for the schema-drift P2022 500s).
 *  5. Authentication still enforced (401 without token).
 *
 * Lifecycle: create scratch DB -> prisma db push -> seed fixtures -> boot app
 * -> assert -> drop scratch DB. The live database is never written to.
 *
 * Run: node apps/backend/node_modules/tsx/dist/cli.mjs tests/test-api-regressions.mjs
 *      (optionally with --env-file=.env; otherwise .env is loaded automatically)
 * Exit 0 = all pass.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDatabaseUrl,
  prepareFreshTestDb,
  dropTestDb,
  REPO_ROOT,
} from "./helpers/test-db.mjs";
import { seedFixtures, signJwt } from "./helpers/fixtures.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TSX_CLI = path.join(REPO_ROOT, "apps", "backend", "node_modules", "tsx", "dist", "cli.mjs");
const HARNESS = path.join(__dirname, "helpers", "app-harness.mjs");

// ---------------------------------------------------------------------------
// 1. Isolated database (fresh scratch DB + current schema)
// ---------------------------------------------------------------------------
const liveUrl = loadDatabaseUrl();
const testUrl = await prepareFreshTestDb(liveUrl);
console.log(`scratch DB prepared: ${new URL(testUrl).pathname} (live DB untouched)`);
process.env.DATABASE_URL = testUrl; // from here on, only the scratch DB is reachable

const { prisma } = await import("../apps/backend/src/lib/prisma.js");
const fx = await seedFixtures(prisma);
console.log(
  `fixtures seeded: victim=${fx.victim.id.slice(0, 8)} project=${fx.victimProject.id.slice(0, 8)} logs=${fx.logCount}`
);

const victimToken = signJwt(
  { sub: fx.victim.id, githubId: fx.victim.githubId, githubLogin: fx.victim.githubLogin },
  process.env["JWT_SECRET"]
);

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

let child = null;
let prismaOpen = true;
const disconnectPrisma = async () => {
  if (prismaOpen) { prismaOpen = false; await prisma.$disconnect(); }
};

try {
  // ---------------------------------------------------------------------------
  // 2. Boot the real app against the scratch DB
  // ---------------------------------------------------------------------------
  child = spawn(process.execPath, [TSX_CLI, HARNESS], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const port = await new Promise((resolve, reject) => {
    let out = "";
    let errOut = "";
    child.stderr.on("data", (c) => (errOut += c.toString()));
    const timer = setTimeout(() => reject(new Error(`harness timeout:\n${out}\n${errOut}`)), 40000);
    child.stdout.on("data", (c) => {
      out += c.toString();
      const m = out.match(/READY (\d+)/);
      if (m) { clearTimeout(timer); resolve(Number(m[1])); }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`harness exited early (${code}):\n${out}\n${errOut}`));
    });
  });
  const base = `http://127.0.0.1:${port}/api/v1`;
  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const get = async (p, token) => {
    const res = await fetch(`${base}${p}`, { headers: token ? auth(token) : {} });
    let body = null, text = "";
    try { text = await res.text(); body = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, body, text };
  };
  const postJson = async (p, rawBody, token) => {
    const res = await fetch(`${base}${p}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? auth(token) : {}) },
      body: rawBody,
    });
    let body = null, text = "";
    try { text = await res.text(); body = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, body, text };
  };

  const depPath = `/deployments/${fx.deployment.id}/logs`;
  const projDeps = `/projects/${fx.victimProject.id}/deployments`;

  // -------------------------------------------------------------------------
  // 3. Malformed JSON => 400, not 500, never echoed
  // -------------------------------------------------------------------------
  console.log("\n[1] Malformed JSON handling");
  const CANARY = "SECRET_CANARY_NOT_ECHOED";
  const bad = await postJson(
    "/auth/github/callback",
    `{"code": "${CANARY}", "state": "unterminated`
  );
  check("malformed JSON => 400 (was 500)", bad.status === 400, `got ${bad.status}`);
  check("error code is VALIDATION_ERROR", bad.body?.error?.code === "VALIDATION_ERROR",
    bad.body?.error?.code);
  check("error envelope shape intact", bad.body?.success === false && bad.body?.error?.statusCode === 400);
  check("request body is NOT echoed in response", !bad.text.includes(CANARY));

  // -------------------------------------------------------------------------
  // 4. Oversized payload => 413, not 500
  // -------------------------------------------------------------------------
  console.log("\n[2] Oversized payload handling");
  const big = await postJson("/auth/github/callback", `{"pad":"${"x".repeat(1_100_000)}"}`);
  check("1.1MB body => 413", big.status === 413, `got ${big.status}`);
  check("error code is PAYLOAD_TOO_LARGE", big.body?.error?.code === "PAYLOAD_TOO_LARGE",
    big.body?.error?.code);

  // -------------------------------------------------------------------------
  // 5. Consolidated + validated logs route (SEC-10)
  // -------------------------------------------------------------------------
  console.log("\n[3] Consolidated logs route (SEC-10)");
  const logsOk = await get(`${depPath}?limit=10`, victimToken);
  check("valid logs query => 200", logsOk.status === 200, `got ${logsOk.status}`);
  check("serves the VALIDATED handler (meta.pagination present)",
    Boolean(logsOk.body?.meta?.pagination), JSON.stringify(logsOk.body?.meta ?? {}).slice(0, 80));
  check("data is an array", Array.isArray(logsOk.body?.data));

  const logsInstall = await get(`${depPath}?step=INSTALL`, victimToken);
  check("step=INSTALL accepted (enum parity; was 400 on validated route)",
    logsInstall.status === 200 && (logsInstall.body?.data ?? []).length >= 1,
    `status ${logsInstall.status}, rows ${logsInstall.body?.data?.length}`);

  const logsBadStep = await get(`${depPath}?step=NOT_A_STEP`, victimToken);
  check("unknown step => 400 (was 500/ignored)", logsBadStep.status === 400, `got ${logsBadStep.status}`);

  const logsBigLimit = await get(`${depPath}?limit=9999`, victimToken);
  check("limit above max => 400", logsBigLimit.status === 400, `got ${logsBigLimit.status}`);

  const logsNan = await get(`${depPath}?limit=abc`, victimToken);
  check("non-numeric limit => 400 (was 500 via NaN)", logsNan.status === 400, `got ${logsNan.status}`);

  const logsAnon = await get(depPath);
  check("logs without token => 401 (auth unchanged)", logsAnon.status === 401, `got ${logsAnon.status}`);

  // -------------------------------------------------------------------------
  // 6. Deployment endpoints against the ALIGNED database (drift-500 regression)
  // -------------------------------------------------------------------------
  console.log("\n[4] Deployment endpoints on aligned schema");
  const deps = await get(projDeps, victimToken);
  check("GET /projects/:id/deployments => 200 (was 500: P2022 rolled_back_from_id)",
    deps.status === 200, `got ${deps.status} ${deps.body?.error?.code ?? ""}`);
  check("deployments list returns data array", Array.isArray(deps.body?.data) && deps.body.data.length >= 1);

  const depDetail = await get(`/deployments/${fx.deployment.id}`, victimToken);
  check("GET /deployments/:id => 200 (was 500: P2022)", depDetail.status === 200,
    `got ${depDetail.status} ${depDetail.body?.error?.code ?? ""}`);
  check("deployment detail id matches fixture", depDetail.body?.data?.id === fx.deployment.id);

  const projList = await get("/projects?page=1&limit=50", victimToken);
  check("GET /projects => 200", projList.status === 200, `got ${projList.status}`);
  check("victim sees own project under owner-scoping (D13 enforced)",
    Array.isArray(projList.body?.data) && projList.body.data.some((p) => p.id === fx.victimProject.id));

  const projDetail = await get(`/projects/${fx.victimProject.id}`, victimToken);
  check("GET /projects/:id => 200", projDetail.status === 200, `got ${projDetail.status}`);

  const noToken = await get(projDeps);
  check("deployments list without token => 401 (auth unchanged)", noToken.status === 401,
    `got ${noToken.status}`);
} catch (err) {
  failures++;
  console.log(`FAIL  test run aborted — ${String(err).message.split("\n").slice(0, 6).join(" | ")}`);
} finally {
  if (child) child.kill();
  await disconnectPrisma();
  try {
    await dropTestDb(testUrl);
    console.log(`\nscratch DB ${new URL(testUrl).pathname} dropped (cleanup)`);
  } catch (e) {
    console.log(`\nWARN  scratch DB cleanup failed: ${String(e.message).slice(0, 160)}`);
  }
}

console.log(failures === 0 ? "\nALL ASSERTIONS PASSED" : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
