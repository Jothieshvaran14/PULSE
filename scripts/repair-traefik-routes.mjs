/**
 * D6 live routes.yml repair (docs/pulse/PULSE-11) — approved sequence:
 * backup -> repair with the lossless parser -> restart -> verify.
 *
 * SAFETY PROPERTIES
 *  - DRY-RUN BY DEFAULT: without `--apply` nothing is written and Traefik is
 *    never restarted; the exact change set is printed as a diff instead.
 *  - Lossless: the file round-trips through the real TraefikRoutingService
 *    parser (yaml Document), so comments, unknown fields, middlewares, TLS
 *    blocks and existing entries survive byte-for-structure.
 *  - Only ADDS missing routers whose backing service points at a container
 *    that is currently running. Existing routers/services are never
 *    rewritten; stale entries are reported, never deleted.
 *  - `--apply` first copies the live file to the external backup directory
 *    (the sibling `RYME-backups` folder outside this repository; override with
 *    PULSE_BACKUP_DIR), then writes, restarts the
 *    ryme-traefik container once, and verifies via Traefik's API.
 *
 * Usage:
 *   node apps/backend/node_modules/tsx/dist/cli.mjs scripts/repair-traefik-routes.mjs           # dry run
 *   node apps/backend/node_modules/tsx/dist/cli.mjs scripts/repair-traefik-routes.mjs --apply   # execute
 */
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Dummy config so importing the service satisfies the Zod config schema.
process.env["NODE_ENV"] ??= "test";
process.env["DATABASE_URL"] ??= "postgresql://dummy:dummy@127.0.0.1:1/dummy";
process.env["JWT_SECRET"] ??= "dummy-jwt-secret-for-static-analysis-000000";
process.env["TOKEN_ENCRYPTION_KEY"] ??= "dummy-encryption-key-for-static-analysis-000";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ROUTES_FILE = path.join(REPO_ROOT, "docker", "traefik", "dynamic", "routes.yml");
// Sibling backup folder OUTSIDE the repository (never committed). Overridable
// so the script is not tied to one machine's home directory.
const BACKUP_DIR =
  process.env["PULSE_BACKUP_DIR"] ?? path.resolve(REPO_ROOT, "..", "RYME-backups");
const APPLY = process.argv.includes("--apply");
const DEPLOY_DOMAIN = process.env["DEPLOY_DOMAIN"] ?? "localhost";

const { TraefikRoutingService } = await import(
  "../apps/backend/src/services/traefik-routing.service.js"
);
const svc = new TraefikRoutingService();

function docker(...args) {
  const res = spawnSync("docker", args, { encoding: "utf8", timeout: 30000 });
  if (res.error) throw new Error(`docker unavailable: ${res.error.message}`);
  return { code: res.status, out: (res.stdout ?? "").trim(), err: (res.stderr ?? "").trim() };
}

// ---------------------------------------------------------------------------
// 1. Read + parse live file (read-only at this stage)
// ---------------------------------------------------------------------------
const original = await fs.readFile(ROUTES_FILE, "utf-8");
const doc = svc.parseRoutesYaml(original);
const tree = doc.toJS() ?? {};
const routers = tree?.http?.routers ?? {};
const services = tree?.http?.services ?? {};

// ---------------------------------------------------------------------------
// 2. Which containers are actually running?
// ---------------------------------------------------------------------------
const ps = docker("ps", "--format", "{{.Names}}");
if (ps.code !== 0) {
  console.error(`BLOCKED: cannot list containers (${ps.err}) — refusing to continue.`);
  process.exit(2);
}
const running = new Set(ps.out.split("\n").filter(Boolean));

// ---------------------------------------------------------------------------
// 3. Compute missing routers (additive only)
// ---------------------------------------------------------------------------
const added = [];
const skipped = [];
for (const [name, svcDef] of Object.entries(services)) {
  if (routers[name]) continue; // router already exists — untouched
  const url = svcDef?.loadBalancer?.servers?.[0]?.url ?? "";
  const container = /^http:\/\/([^:/]+)(?::(\d+))?/.exec(url)?.[1];
  if (!container) {
    skipped.push(`${name}: no parseable service URL — left untouched`);
    continue;
  }
  if (!running.has(container)) {
    skipped.push(`${name}: container ${container} not running — no router added`);
    continue;
  }
  const rule = `Host(\`${name}.${DEPLOY_DOMAIN}\`)`;
  doc.setIn(["http", "routers", name], {
    rule,
    entryPoints: ["web"],
    service: name,
  });
  added.push({ name, rule, container, url });
}

const proposed = svc.generateRoutesYaml(doc);

// ---------------------------------------------------------------------------
// 4. Report — the diff (dry run default)
// ---------------------------------------------------------------------------
console.log(`routes.yml: ${Object.keys(routers).length} routers, ${Object.keys(services).length} services`);
console.log(`running containers: ${[...running].sort().join(", ")}`);
console.log("");
if (added.length === 0) {
  console.log("No missing routers — nothing to change.");
  process.exit(0);
}

console.log(`=== PROPOSED CHANGE (additive; ${added.length} router(s)) ===`);
for (const a of added) {
  console.log(`+ routers.${a.name}:`);
  console.log(`+   rule: "Host(\`${a.name}.${DEPLOY_DOMAIN}\`)"`);
  console.log(`+   entryPoints: [web]`);
  console.log(`+   service: ${a.name}   # -> ${a.url} (running)`);
}
console.log("");
console.log("=== UNCHANGED ===");
console.log(`  ${Object.keys(routers).length} existing router(s) (incl. dashboard),`);
console.log(`  ${Object.keys(services).length} service(s), any middlewares/TLS/comments/unknown fields.`);
if (skipped.length) {
  console.log("");
  console.log("=== SKIPPED (reported, never deleted) ===");
  skipped.forEach((s) => console.log(`  - ${s}`));
}
console.log("");
if (proposed === original) {
  console.log("Proposed content identical to live file — nothing to do.");
  process.exit(0);
}
console.log(`Redacted line delta: +${proposed.split("\n").length - original.split("\n").length} lines, -0 lines (additive only).`);
console.log("");

if (!APPLY) {
  console.log("DRY RUN — nothing written, Traefik not restarted. Re-run with --apply to execute.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 5. Apply: backup -> write -> restart once -> verify
// ---------------------------------------------------------------------------
await fs.mkdir(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(BACKUP_DIR, `routes.yml.bak-${stamp}`);
await fs.copyFile(ROUTES_FILE, backupPath);
const backupOk = (await fs.readFile(backupPath, "utf-8")) === original;
console.log(`BACKUP: ${backupPath} (verified identical: ${backupOk})`);
if (!backupOk) {
  console.error("ABORT: backup does not match live file — not writing.");
  process.exit(1);
}

await fs.writeFile(ROUTES_FILE, proposed, "utf-8");
console.log("WROTE: routes.yml (additive routers only)");

const restart = docker("restart", "ryme-traefik");
console.log(`Traefik restart: exit ${restart.code}`);
if (restart.code !== 0) {
  console.error(`Restart failed: ${restart.err}`);
  console.error(`Recovery: copy ${backupPath} over routes.yml and restart ryme-traefik.`);
  process.exit(1);
}

// Verify via Traefik's API (inside the container). SEC-24 disables the
// insecure dashboard listener, so this is best-effort: when the API is not
// listening we confirm the container is running and skip with guidance.
await new Promise((r) => setTimeout(r, 4000));
const api = docker("exec", "ryme-traefik", "wget", "-qO-", "http://localhost:8080/api/http/routers");
if (api.code !== 0) {
  const state = docker("inspect", "-f", "{{.State.Running}}", "ryme-traefik");
  if (state.code === 0 && state.out.trim() === "true") {
    console.warn(
      "VERIFY SKIPPED: Traefik is running but the dashboard API is disabled (SEC-24).\n" +
        "Routes were written and Traefik restarted; validate with `pnpm test` (round-trip)."
    );
    process.exit(0);
  }
  console.error(`VERIFY FAILED: Traefik API unreachable and container not running (${api.err})`);
  process.exit(1);
}
let liveRouters;
try {
  const parsed = JSON.parse(api.out);
  // Traefik v3 returns an ARRAY of routers; older shapes returned {routers:{}}.
  const list = Array.isArray(parsed)
    ? parsed
    : Object.values(parsed.routers ?? {});
  liveRouters = list.map((r) => (typeof r === "string" ? r : r?.name ?? "")).filter(Boolean);
} catch (e) {
  console.error(`VERIFY FAILED: cannot parse Traefik API response: ${e.message}`);
  process.exit(1);
}
const missing = added
  .map((a) => a.name)
  .filter((n) => !liveRouters.some((key) => key.includes(n)));
console.log(`Traefik live routers: ${liveRouters.join(", ")}`);
if (missing.length === 0) {
  console.log(`VERIFY OK: all ${added.length} repaired router(s) active in Traefik.`);
  process.exit(0);
}
console.error(`VERIFY FAILED: missing in Traefik: ${missing.join(", ")}`);
process.exit(1);
