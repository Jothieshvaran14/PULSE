/**
 * IDOR REGRESSION TEST (Phase 0.1, D13 approved: owner-scoping + quarantine)
 * formerly: reproduction script from Phase 0.
 *
 * Proves the approved ownership policy is enforced server-side:
 *  - an authenticated attacker cannot list another user's projects;
 *  - cannot read a victim project's details or repositoryUrl;
 *  - cannot read victim deployment logs, deployment details, or mutate them;
 *  - quarantined orphans (owner_id IS NULL) are inaccessible to EVERYONE;
 *  - unauthorized access returns the SAME 404 as a nonexistent ID (no
 *    existence oracle);
 *  - the legitimate owner retains full access to their own resources;
 *  - unauthenticated requests still get 401.
 *
 * Runs against an ISOLATED scratch database with isolated fixtures
 * (pulse-fx-* records only) — never the live database. The scratch DB is
 * created before the run and dropped afterwards.
 *
 * Run: pnpm test:integration   (or: node apps/backend/node_modules/tsx/dist/cli.mjs tests/repro-idor.mjs)
 * Exit 0 = all assertions pass; 1 = vulnerability/regression detected.
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

const liveUrl = loadDatabaseUrl();
const testUrl = await prepareFreshTestDb(liveUrl);
console.log(`scratch DB prepared: ${new URL(testUrl).pathname} (live DB untouched)`);

process.env.DATABASE_URL = testUrl;
const { prisma } = await import("../apps/backend/src/lib/prisma.js");
const fx = await seedFixtures(prisma);

const asToken = (user) =>
  signJwt(
    { sub: user.id, githubId: user.githubId, githubLogin: user.githubLogin },
    process.env["JWT_SECRET"]
  );
const victimToken = asToken(fx.victim);
const attackerToken = asToken(fx.attacker);
const RANDOM_UUID = "00000000-4000-8000-a000-000000000000";

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

let child = null;
let prismaOpen = true;
try {
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
      reject(new Error(`harness exited early (${code}):\\n${out}\\n${errOut}`));
    });
  });
  const base = `http://127.0.0.1:${port}/api/v1`;
  const call = async (method, p, token, body) => {
    const res = await fetch(`${base}${p}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? body : undefined,
    });
    let json = null;
    let text = "";
    try { text = await res.text(); json = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, body: json, text };
  };

  const vP = fx.victimProject.id;
  const aP = fx.attackerProject.id;
  const oP = fx.orphanProject.id;
  const vD = fx.deployment.id;

  // -------------------------------------------------------------------------
  console.log("[1] Project LIST scoping");
  // -------------------------------------------------------------------------
  const aList = await call("GET", "/projects?page=1&limit=100", attackerToken);
  const aIds = Array.isArray(aList.body?.data) ? aList.body.data.map((p) => p.id) : [];
  check("attacker list => 200", aList.status === 200, `got ${aList.status}`);
  check("attacker list does NOT contain victim project", !aIds.includes(vP));
  check("attacker list does NOT contain orphan project (quarantine)", !aIds.includes(oP));
  check("attacker list DOES contain attacker's own project", aIds.includes(aP));

  const vList = await call("GET", "/projects?page=1&limit=100", victimToken);
  const vIds = Array.isArray(vList.body?.data) ? vList.body.data.map((p) => p.id) : [];
  check("victim list => 200", vList.status === 200, `got ${vList.status}`);
  check("victim list DOES contain victim project", vIds.includes(vP));
  check("victim list does NOT contain attacker project", !vIds.includes(aP));
  check("victim list does NOT contain orphan project (quarantine)", !vIds.includes(oP));
  const anonList = await call("GET", "/projects");
  check("list without token => 401", anonList.status === 401, `got ${anonList.status}`);

  // -------------------------------------------------------------------------
  console.log("\n[2] Project DETAIL — cross-user + orphan + no-existence-leak");
  // -------------------------------------------------------------------------
  const aOnV = await call("GET", `/projects/${vP}`, attackerToken);
  check("attacker GET victim project => 404", aOnV.status === 404, `got ${aOnV.status}`);
  check("victim repositoryUrl NOT leaked", !aOnV.text.includes("victim.git"));
  check("error code is PROJECT_NOT_FOUND", aOnV.body?.error?.code === "PROJECT_NOT_FOUND", aOnV.body?.error?.code);

  const aOnRandom = await call("GET", `/projects/${RANDOM_UUID}`, attackerToken);
  check("attacker GET nonexistent project => 404 (same code as foreign)",
    aOnRandom.status === 404 && aOnRandom.body?.error?.code === aOnV.body?.error?.code,
    `${aOnRandom.status}/${aOnRandom.body?.error?.code}`);

  const vOnOrphan = await call("GET", `/projects/${oP}`, victimToken);
  check("victim GET orphan project => 404 (quarantine, not public)", vOnOrphan.status === 404,
    `got ${vOnOrphan.status}`);
  check("orphan repositoryUrl NOT exposed to authenticated users",
    !vOnOrphan.text.includes("orphan.git"));

  const aOnOwn = await call("GET", `/projects/${aP}`, attackerToken);
  check("attacker GET own project => 200", aOnOwn.status === 200, `got ${aOnOwn.status}`);
  const vOnOwn = await call("GET", `/projects/${vP}`, victimToken);
  check("victim GET own project => 200 (owner access intact)",
    vOnOwn.status === 200 && vOnOwn.body?.data?.repositoryUrl === "https://github.com/example/victim.git",
    `got ${vOnOwn.status}`);

  // -------------------------------------------------------------------------
  console.log("\n[3] NESTED deployments — list + detail");
  // -------------------------------------------------------------------------
  const aDeps = await call("GET", `/projects/${vP}/deployments`, attackerToken);
  check("attacker GET victim deployments list => 404", aDeps.status === 404, `got ${aDeps.status}`);
  const oDeps = await call("GET", `/projects/${oP}/deployments`, victimToken);
  check("orphan deployments list => 404 for authenticated users", oDeps.status === 404, `got ${oDeps.status}`);

  const aDepDetail = await call("GET", `/deployments/${vD}`, attackerToken);
  check("attacker GET victim deployment => 404", aDepDetail.status === 404, `got ${aDepDetail.status}`);
  check("victim deployment URL not leaked", !aDepDetail.text.includes("pulse-fx-victim.localhost"));
  const aDepRandom = await call("GET", `/deployments/${RANDOM_UUID}`, attackerToken);
  check("attacker GET nonexistent deployment => 404 (identical code)",
    aDepRandom.status === 404 && aDepRandom.body?.error?.code === aDepDetail.body?.error?.code,
    `${aDepRandom.status}/${aDepRandom.body?.error?.code}`);

  const vDepDetail = await call("GET", `/deployments/${vD}`, victimToken);
  check("victim GET own deployment => 200 (owner access intact)",
    vDepDetail.status === 200 && vDepDetail.body?.data?.id === vD, `got ${vDepDetail.status}`);

  // -------------------------------------------------------------------------
  console.log("\n[4] LOGS — cross-user read blocked, owner read intact");
  // -------------------------------------------------------------------------
  const aLogs = await call("GET", `/deployments/${vD}/logs`, attackerToken);
  check("attacker GET victim logs => 404", aLogs.status === 404, `got ${aLogs.status}`);
  check("log content NOT leaked", !aLogs.text.includes("fx: cloned"));

  const vLogs = await call("GET", `/deployments/${vD}/logs?limit=10`, victimToken);
  check("victim GET own logs => 200 with rows",
    vLogs.status === 200 && Array.isArray(vLogs.body?.data) && vLogs.body.data.length === 4,
    `got ${vLogs.status}, rows ${vLogs.body?.data?.length}`);

  const anonLogs = await call("GET", `/deployments/${vD}/logs`);
  check("logs without token => 401", anonLogs.status === 401, `got ${anonLogs.status}`);

  // -------------------------------------------------------------------------
  console.log("\n[5] MUTATIONS — cross-user write blocked");
  // -------------------------------------------------------------------------
  const stopByAttacker = await call("POST", `/deployments/${vD}/stop`, attackerToken, "{}");
  check("attacker POST stop on victim deployment => 404 (no mutation)",
    stopByAttacker.status === 404, `got ${stopByAttacker.status}`);
  const stillRunning = await prisma.deployment.findUnique({ where: { id: vD }, select: { status: true } });
  check("victim deployment status unchanged after attack attempt",
    stillRunning?.status === "RUNNING", `status=${stillRunning?.status}`);

  const putByAttacker = await call("PUT", `/projects/${vP}`, attackerToken, `{"defaultBranch":"hacked"}`);
  check("attacker PUT victim project => 404", putByAttacker.status === 404, `got ${putByAttacker.status}`);
  const delByAttacker = await call("DELETE", `/projects/${vP}`, attackerToken);
  check("attacker DELETE victim project => 404", delByAttacker.status === 404, `got ${delByAttacker.status}`);
  const deployByAttacker = await call("POST", `/projects/${vP}/deploy`, attackerToken, "{}");
  check("attacker trigger-deploy on victim project => 404", deployByAttacker.status === 404,
    `got ${deployByAttacker.status}`);
  const fwByAttacker = await call("GET", `/projects/${vP}/framework`, attackerToken);
  check("attacker GET victim framework => 404", fwByAttacker.status === 404, `got ${fwByAttacker.status}`);

  const delOrphan = await call("DELETE", `/projects/${oP}`, victimToken);
  check("orphan DELETE blocked for every user (data preserved)", delOrphan.status === 404,
    `got ${delOrphan.status}`);

  const putByOwner = await call("PUT", `/projects/${aP}`, attackerToken, `{"defaultBranch":"develop"}`);
  check("owner PUT own project => 200 (legit mutation intact)",
    putByOwner.status === 200 && putByOwner.body?.data?.defaultBranch === "develop",
    `got ${putByOwner.status}`);

  const victimAfter = await prisma.project.findUnique({ where: { id: vP }, select: { status: true, defaultBranch: true, ownerId: true } });
  check("victim project untouched by attack attempts",
    victimAfter?.status === "ACTIVE" && victimAfter?.defaultBranch === "main",
    JSON.stringify(victimAfter));

  // -------------------------------------------------------------------------
  console.log("\n[6] Quarantine data integrity (no ownership modification)");
  // -------------------------------------------------------------------------
  const orphanRow = await prisma.project.findUnique({ where: { id: oP }, select: { ownerId: true, status: true } });
  check("orphan owner_id still NULL (never auto-assigned)",
    orphanRow?.ownerId === null && orphanRow?.status === "ACTIVE", JSON.stringify(orphanRow));
} catch (err) {
  failures++;
  console.log(`FAIL  test run aborted — ${String(err.message).split("\n").slice(0, 6).join(" | ")}`);
} finally {
  if (child) child.kill();
  if (prismaOpen) { prismaOpen = false; await prisma.$disconnect(); }
  try {
    await dropTestDb(testUrl);
    console.log(`\nscratch DB ${new URL(testUrl).pathname} dropped (cleanup)`);
  } catch (e) {
    console.log(`\nWARN  scratch DB cleanup failed: ${String(e.message).slice(0, 160)}`);
  }
}

console.log(failures === 0 ? "\nALL ASSERTIONS PASSED" : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
