/**
 * Isolated test-database helpers (Phase 0.1).
 *
 * Guarantees used by the integration tests:
 *  - NEVER touches the live database: all schema/seed work happens in a
 *    dedicated scratch database whose name is hard-guarded (`*_test`).
 *  - Works both locally (scratch DB inside the dockerized Postgres) and in CI
 *    (scratch DB inside the ephemeral service container), because both use
 *    Prisma + the DATABASE_URL credential already present in the environment.
 *  - Explicit cleanup: `dropTestDb()` removes the scratch database.
 *
 * No config/logger imports here: this module must be usable BEFORE the app's
 * Zod config is loaded, with only DATABASE_URL available.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Scratch database name. Must always match *_test (guarded below). */
export const TEST_DB_NAME = "ryme_phase01_test";

const requireFromBackend = createRequire(
  path.join(REPO_ROOT, "apps", "backend", "package.json")
);

// Hard guard: we only ever create/drop databases with this exact suffix.
if (!/^[a-z0-9_]+_test$/.test(TEST_DB_NAME)) {
  throw new Error(`Refusing to use unsafe scratch database name: ${TEST_DB_NAME}`);
}

/**
 * Load DATABASE_URL (from the environment or the local untracked .env) and
 * return it with any surrounding quotes stripped. Never logged.
 */
export function loadDatabaseUrl() {
  if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(path.join(REPO_ROOT, ".env"));
    } catch {
      /* .env may not exist (CI) — env must then be provided directly */
    }
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not set (use --env-file=.env or export it)");
  }
  const clean = raw.replace(/^"([\s\S]*)"$/, "$1");
  if (clean !== raw) process.env.DATABASE_URL = clean;
  return clean;
}

/** URL for the scratch database, derived from a live/CI URL. */
export function testUrlFrom(url) {
  const u = new URL(url);
  const target = `/${TEST_DB_NAME}`;
  if (u.pathname === target) return url; // already the scratch DB (explicit override)
  if (!u.pathname.startsWith("/")) throw new Error("Unexpected DATABASE_URL pathname");
  u.pathname = target;
  if (u.pathname === new URL(url).pathname) {
    throw new Error("Refusing to operate: derived URL equals source URL");
  }
  return u.toString();
}

function adminUrlFrom(url) {
  const u = new URL(url);
  u.pathname = "/postgres"; // always-connectable maintenance database
  return u.toString();
}

function adminClient(url) {
  const { PrismaClient } = requireFromBackend("@prisma/client");
  return new PrismaClient({ datasourceUrl: adminUrlFrom(url) });
}

async function databaseExists(admin, name) {
  const rows = await admin.$queryRawUnsafe(
    `SELECT 1 FROM pg_database WHERE datname = '${name}'`
  );
  return rows.length > 0;
}

/** Drop the scratch database if it exists (FORCE closes any stale test connections). */
export async function dropTestDb(testUrl) {
  const admin = adminClient(testUrl);
  try {
    if (await databaseExists(admin, TEST_DB_NAME)) {
      // Scoped strictly to the guarded scratch name; FORCE only ever affects
      // connections to that scratch DB (never the live database).
      await admin.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`
      );
    }
  } finally {
    await admin.$disconnect();
  }
}

/** Create the scratch database if missing. */
export async function createTestDb(testUrl) {
  const admin = adminClient(testUrl);
  try {
    if (!(await databaseExists(admin, TEST_DB_NAME))) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${TEST_DB_NAME}"`);
    }
  } finally {
    await admin.$disconnect();
  }
}

/**
 * Create a pristine scratch database and push the current Prisma schema to
 * it (schema-only — mirrors what `db push` would do to a fresh database).
 * Returns the test URL.
 */
export async function prepareFreshTestDb(liveUrl) {
  const testUrl = testUrlFrom(liveUrl);
  await dropTestDb(testUrl);
  await createTestDb(testUrl);
  pushSchema(testUrl);
  return testUrl;
}

/** Run `prisma db push --skip-generate` against the scratch database. */
export function pushSchema(testUrl) {
  const res = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
    cwd: path.join(REPO_ROOT, "packages", "db"),
    env: { ...process.env, DATABASE_URL: testUrl },
    shell: true,
    encoding: "utf8",
    timeout: 240000,
  });
  if (res.status !== 0) {
    throw new Error(
      `prisma db push failed (exit ${res.status}):\n${res.stdout ?? ""}\n${res.stderr ?? ""}`
    );
  }
  return res.stdout ?? "";
}
