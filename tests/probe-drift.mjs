/**
 * READ-ONLY probe: which deployment endpoints fail against the current
 * (misaligned) database? Boots the app in-process on an ephemeral port.
 *
 * Run: node apps/backend/node_modules/tsx/dist/cli.mjs --env-file=.env tests/probe-drift.mjs
 * Exit 0 always (report only). Never mutates data: only GET requests.
 */
const { createApp } = await import("../apps/backend/src/app.js");

const app = createApp();
const server = await new Promise((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}/api/v1`;

// Minimal valid HS256 JWT for an existing user (read-only probes).
const { prisma } = await import("../apps/backend/src/lib/prisma.js");
const user = await prisma.user.findFirst({ select: { id: true, githubId: true, githubLogin: true } });
const { createHmac } = await import("node:crypto");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const h = b64({ alg: "HS256", typ: "JWT" });
const p = b64({ sub: user.id, githubId: user.githubId, githubLogin: user.githubLogin, iat: now, exp: now + 600 });
const sig = createHmac("sha256", process.env["JWT_SECRET"]).update(`${h}.${p}`).digest("base64url");
const token = `${h}.${p}.${sig}`;

const project = await prisma.project.findFirst({
  where: { deployments: { some: {} } },
  select: { id: true, deployments: { select: { id: true }, take: 1 } },
});
const depId = project?.deployments?.[0]?.id;
console.log(`project=${project?.id?.slice(0, 8)} deployment=${depId?.slice(0, 8)}`);

const probes = [
  ["GET /projects (list)", `/projects?page=1&limit=5`],
  ["GET /projects/:id (detail)", `/projects/${project.id}`],
  ["GET /projects/:id/deployments", `/projects/${project.id}/deployments`],
  ["GET /deployments/:id", `/deployments/${depId}`],
  ["GET /deployments/:id/logs", `/deployments/${depId}/logs?limit=1`],
];

console.log("\n=== Drift probe (GET only, live DB) ===");
for (const [label, path] of probes) {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  let code = "";
  try { code = (await res.json())?.error?.code ?? ""; } catch { /* empty */ }
  console.log(`${res.status === 200 ? "OK  " : "FAIL"} ${label} => ${res.status} ${code}`);
}
server.close();
await prisma.$disconnect();
process.exit(0);
