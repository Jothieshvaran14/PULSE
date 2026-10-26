/**
 * REGRESSION TEST — Traefik routes.yml round-trip integrity (Phase 0.1, D6).
 *
 * Supersedes the Phase 0 reproduction script: it now ASSERTS that the
 * rewritten parser/serializer (yaml Document-based) is lossless.
 *
 * Originally this file proved three defects in the hand-rolled line parser:
 *   D-A  last router dropped on first read (services section followed it)
 *   D-B  entryPoints list items never parsed (always [])
 *   D-C  router count eroded on every round-trip
 *
 * This test NEVER writes docker/traefik/dynamic/routes.yml and NEVER restarts
 * Traefik: only parseRoutesYaml/generateRoutesYaml are called (in memory).
 *
 * Run: node apps/backend/node_modules/tsx/dist/cli.mjs tests/repro-traefik-roundtrip.mjs
 * Exit 0 = all assertions pass; 1 = regression detected.
 */

// Dummy env before import: the service pulls in the logger → config (Zod).
process.env["NODE_ENV"] ??= "test";
process.env["DATABASE_URL"] ??= "postgresql://dummy:dummy@127.0.0.1:1/dummy";
process.env["JWT_SECRET"] ??= "dummy-jwt-secret-for-static-analysis-000000";
process.env["TOKEN_ENCRYPTION_KEY"] ??= "dummy-encryption-key-for-static-analysis-000";

const fs = await import("node:fs");
const path = await import("node:path");
const { fileURLToPath } = await import("node:url");
const { TraefikRoutingService } = await import(
  "../apps/backend/src/services/traefik-routing.service.js"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesFile = path.resolve(__dirname, "../docker/traefik/dynamic/routes.yml");

const svc = new TraefikRoutingService();
const parse = (s) => svc.parseRoutesYaml(s);
const generate = (d) => svc.generateRoutesYaml(d);
const tree = (doc) => doc.toJS() ?? {};

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const stable = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// Fixture 1: multiple routers, nested values, unknown fields, comments,
// top-level sections outside http.routers/services, escaped strings.
// ---------------------------------------------------------------------------
const FIXTURE = `# operator comment: must survive the round-trip
http:
  routers:
    dashboard:
      rule: "Host(\`traefik.localhost\`)"
      # inline comment must survive
      entryPoints:
        - web
      service: api@internal
    app-one:
      rule: 'Host(\`one.localhost\`) && PathPrefix(\`/api\`)'
      entryPoints:
        - web
        - websecure
      priority: 10
      middlewares:
        - strip-prefix@file
        - auth@file
      tls:
        certResolver: letsencrypt
        domains:
          - main: one.localhost
            sans:
              - "*.one.localhost"
      service: app-one
    app-two:
      rule: "Host(\`two.localhost\`)"
      entryPoints: [web]
      service: app-two
    app-three:
      rule: "Host(\x60three.localhost\x60)"
      entryPoints:
        - web
      service: app-three
  services:
    app-one:
      loadBalancer:
        servers:
          - url: "http://10.0.0.1:8080"
          - url: "http://10.0.0.2:8080?token=a=b&x=1"
    app-two:
      loadBalancer:
        passHostHeader: true
        servers:
          - url: 'http://10.0.0.3:9000'
    app-three:
      loadBalancer:
        servers:
          - url: "http://10.0.0.4:7000"
  middlewares:
    strip-prefix:
      stripPrefix:
        prefixes:
          - /api
tls:
  certificates:
    - certFile: "/certs/fullchain.pem"
      keyFile: "/certs/privkey.pem"
`;

console.log("=== Fixture: full document ===");
const d1 = parse(FIXTURE);
const t1 = tree(d1);
check("fixture parses without errors", d1.errors.length === 0);

const routerNames = Object.keys(t1?.http?.routers ?? {});
const serviceNames = Object.keys(t1?.http?.services ?? {});
check("all 4 routers parsed (D-A regression)", routerNames.length === 4, `[${routerNames.join(", ")}]`);
check("last router retained (stress-test-3 pattern)", routerNames.includes("app-three"));
check("all 3 services parsed", serviceNames.length === 3);

const appOne = t1?.http?.routers?.["app-one"];
check(
  "entryPoints list items parsed (D-B regression)",
  Array.isArray(appOne?.entryPoints) && appOne.entryPoints.length === 2 &&
    appOne.entryPoints[1] === "websecure",
  JSON.stringify(appOne?.entryPoints)
);
check("escaped/backticked rule preserved exactly",
  appOne?.rule === 'Host(`one.localhost`) && PathPrefix(`/api`)', JSON.stringify(appOne?.rule));
check("unknown router fields preserved (priority, middlewares, tls)",
  appOne?.priority === 10 && Array.isArray(appOne?.middlewares) && appOne?.tls?.domains?.[0]?.main === "one.localhost");
check("nested sequence values preserved",
  t1?.http?.services?.["app-one"]?.loadBalancer?.servers?.length === 2 &&
  t1?.http?.services?.["app-two"]?.loadBalancer?.passHostHeader === true);
check("query-string URL preserved",
  t1?.http?.services?.["app-one"]?.loadBalancer?.servers?.[1]?.url === "http://10.0.0.2:8080?token=a=b&x=1");
check("top-level sections outside routers/services preserved (http.middlewares, tls)",
  Boolean(t1?.http?.middlewares?.["strip-prefix"]?.stripPrefix) && t1?.tls?.certificates?.length === 1);

// Round-trip 1 and repeated round-trips
let current = d1;
const roundTrips = 5;
let countsStable = true;
let treesStable = true;
for (let i = 1; i <= roundTrips; i++) {
  const out = generate(current);
  const next = parse(out);
  if (next.errors.length > 0) { treesStable = false; break; }
  const tNext = tree(next);
  if (Object.keys(tNext?.http?.routers ?? {}).length !== 4) countsStable = false;
  if (!stable(t1, tNext)) treesStable = false;
  current = next;
}
check(`${roundTrips} repeated round-trips: router count stable`, countsStable);
check(`${roundTrips} repeated round-trips: full configuration deep-equal`, treesStable);

const finalText = generate(current);
check("comments survive round-trip",
  finalText.includes("operator comment: must survive") && finalText.includes("inline comment must survive"));

// ---------------------------------------------------------------------------
// Fixture 2: empty collections and empty/absent sections
// ---------------------------------------------------------------------------
console.log("\n=== Fixture: empty collections ===");
const e1 = parse("http:\n  routers: {}\n  services: {}\n");
check("empty flow maps parse", stable(tree(e1), { http: { routers: {}, services: {} } }));
check("empty maps round-trip", stable(tree(parse(generate(e1))), tree(e1)));

const e2 = parse("");
check("empty document handled (null tree)", tree(e2) !== undefined && stable(tree(e2), {}));
check("empty document round-trip does not throw", typeof generate(e2) === "string");

const e3 = parse("http:\n  routers:\n  services:\n");
check("null section values handled", typeof generate(e3) === "string");

// addRoute-style mutation on an empty doc must create both collections
const dEmpty = parse("");
dEmpty.setIn(["http", "routers", "new-app"], { rule: "Host(`n.localhost`)", entryPoints: ["web"], service: "new-app" });
dEmpty.setIn(["http", "services", "new-app"], { loadBalancer: { servers: [{ url: "http://c:80" }] } });
const tEmpty = tree(dEmpty);
check("setIn creates missing intermediate sections",
  Object.keys(tEmpty?.http?.routers ?? {}).length === 1 &&
  Object.keys(tEmpty?.http?.services ?? {}).length === 1);

// deleteIn of a missing entry must be a safe no-op
const dNoop = parse(FIXTURE);
dNoop.deleteIn(["http", "routers", "does-not-exist"]);
dNoop.deleteIn(["http", "services", "does-not-exist"]);
check("deleteIn of missing entry is a safe no-op", Object.keys(tree(dNoop)?.http?.routers ?? {}).length === 4);

// ---------------------------------------------------------------------------
// Fixture 3: malformed YAML must throw (fail-fast, never overwrite silently)
// ---------------------------------------------------------------------------
console.log("\n=== Fixture: invalid input ===");
let threw = false;
try { parse("http:\n  routers:\n   - broken: [unclosed\n"); } catch { threw = true; }
check("invalid YAML throws instead of silently corrupting", threw);

// ---------------------------------------------------------------------------
// Fixture 4: deterministic output
// ---------------------------------------------------------------------------
console.log("\n=== Determinism ===");
check("generate is deterministic for the same document", generate(d1) === generate(d1));

// ---------------------------------------------------------------------------
// Live file (READ-ONLY): the original defect's real-world evidence
// ---------------------------------------------------------------------------
console.log("\n=== Live docker/traefik/dynamic/routes.yml (READ-ONLY) ===");
const original = fs.readFileSync(routesFile, "utf-8");
const liveDoc = parse(original);
const liveTree = tree(liveDoc);
const liveRouters = Object.keys(liveTree?.http?.routers ?? {});
const liveServices = Object.keys(liveTree?.http?.services ?? {});
const liveOut = generate(liveDoc);
const liveTree2 = tree(parse(liveOut));

check("live file parses", liveDoc.errors.length === 0);
check("live non-dashboard router retained (D-A: was dropped before)",
  liveRouters.filter((r) => r !== "dashboard").length >= 1,
  `routers=[${liveRouters.join(", ")}]`);
check("live services retained", liveServices.length >= 1, `${liveServices.length} services`);
check("live round-trip preserves router count", liveRouters.length === Object.keys(liveTree2?.http?.routers ?? {}).length);
check("live round-trip preserves service count", liveServices.length === Object.keys(liveTree2?.http?.services ?? {}).length);
check("live round-trip deep-equal", stable(liveTree, liveTree2));

console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
