/**
 * Deterministic, isolated test fixtures for Phase 0.1 integration tests.
 *
 * All fixture records are clearly prefixed (`pulse-fx-*`) and only ever
 * created inside the scratch database produced by test-db.mjs. Re-seeding is
 * idempotent: previous fixture rows are removed first.
 *
 * NEVER import the app or config from this module (it must work with only
 * DATABASE_URL set by the caller).
 */
import { createHmac } from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

/** Sign an HS256 JWT with the same contract authService uses. Token never logged. */
export function signJwt(payload, secret) {
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET missing or too short for fixture signing");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + 600 }));
  const sig = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

const FX_PREFIX = "pulse-fx-";

/**
 * Seed (or re-seed) the fixture set. Returns handles the tests assert on:
 *   victim / attacker users, victim-owned / attacker-owned / orphan projects,
 *   one deployment on the victim project with logs covering step=INSTALL.
 */
export async function seedFixtures(prisma) {
  // Idempotent cleanup of prior fixture runs.
  await prisma.deploymentLog.deleteMany({
    where: { deployment: { project: { name: { startsWith: FX_PREFIX } } } },
  });
  await prisma.deployment.deleteMany({
    where: { project: { name: { startsWith: FX_PREFIX } } },
  });
  await prisma.project.deleteMany({ where: { name: { startsWith: FX_PREFIX } } });
  await prisma.user.deleteMany({
    where: { githubLogin: { in: ["pulse-fx-victim", "pulse-fx-attacker"] } },
  });

  const victim = await prisma.user.create({
    data: {
      githubId: 900001,
      githubLogin: "pulse-fx-victim",
      name: "FX Victim",
      accessTokenEncrypted: "fx-fixture-not-a-real-token",
    },
  });
  const attacker = await prisma.user.create({
    data: {
      githubId: 900002,
      githubLogin: "pulse-fx-attacker",
      name: "FX Attacker",
      accessTokenEncrypted: "fx-fixture-not-a-real-token",
    },
  });

  const victimProject = await prisma.project.create({
    data: {
      name: `${FX_PREFIX}victim-project`,
      repositoryUrl: "https://github.com/example/victim.git",
      defaultBranch: "main",
      ownerId: victim.id,
    },
  });
  const attackerProject = await prisma.project.create({
    data: {
      name: `${FX_PREFIX}attacker-project`,
      repositoryUrl: "https://github.com/example/attacker.git",
      defaultBranch: "main",
      ownerId: attacker.id,
    },
  });
  // Orphan: owner_id IS NULL — mirrors the 5 real null-owner projects.
  const orphanProject = await prisma.project.create({
    data: {
      name: `${FX_PREFIX}orphan-project`,
      repositoryUrl: "https://github.com/example/orphan.git",
      defaultBranch: "main",
    },
  });

  const deployment = await prisma.deployment.create({
    data: {
      projectId: victimProject.id,
      status: "RUNNING",
      url: "http://pulse-fx-victim.localhost",
      framework: "react-vite",
    },
  });

  const logs = await prisma.deploymentLog.createMany({
    data: [
      { deploymentId: deployment.id, step: "CLONE", level: "INFO", message: "fx: cloned" },
      { deploymentId: deployment.id, step: "INSTALL", level: "INFO", message: "fx: installed" },
      { deploymentId: deployment.id, step: "BUILD", level: "WARN", message: "fx: built" },
      { deploymentId: deployment.id, step: "ERROR", level: "ERROR", message: "fx: done" },
    ],
  });

  return {
    victim,
    attacker,
    victimProject,
    attackerProject,
    orphanProject,
    deployment,
    logCount: logs.count,
  };
}
