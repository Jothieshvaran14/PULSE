# PULSE — Repository Audit & Reuse Plan

**Status:** Draft for review · **Date:** 2026-10-26 · **Scope:** Inspection and planning only. No functional code was changed in this pass.

This document records (1) a repository architecture inventory, (2) the component-by-component
REUSE / ADAPT / REPLACE / REMOVE / VERIFY matrix, (3) the test inventory, and (4) the ordered list of
files that should change first.

---

## 1. Method and evidence rules

Everything below is grounded in one of three evidence levels:

| Level | Meaning |
| --- | --- |
| **[RUN]** | Executed in this pass; result recorded verbatim. |
| **[STATIC]** | Read from source files during this pass; not executed. |
| **[INFERRED]** | Reasoned from code/docs; needs verification before it is relied on. |

Nothing in this document claims a feature works at runtime unless it carries `[RUN]`.
Docker was **not available** during this pass, so no container, database, or end-to-end
deployment behavior was verified.

### Commands executed in this pass

| Command | Result | Level |
| --- | --- | --- |
| `git status --porcelain` | 5 modified files (uncommitted rollback work) — **preserved, untouched** | [RUN] |
| `git log --oneline --all` | 7 commits, branch `main` only, remote `origin` = `https://github.com/Ryme-Labs/Ryme-dash.git` | [RUN] |
| `git ls-files \| Measure-Object` | 191 tracked files | [RUN] |
| Identity scan: `Select-String -Pattern 'ryme'` over tracked files | **190 matches in 75 tracked files** | [RUN] |
| Secret scan over tracked files and `git log -p --all` | No real credentials found; only placeholders (`ghp_xxxx…`, `user@example.com`) | [RUN] |
| `pnpm typecheck` | **PASS** (exit 0) — `shared`, `db`, `frontend`, `backend` all `tsc --noEmit` clean | [RUN] |
| `pnpm lint` | **FAIL** (exit 1) — `db` and `shared` pass; `frontend` = 1 error + 2 warnings; `backend` lint did not run because pnpm stopped at the first failure | [RUN] |
| `npx tsx test-e2e.mjs` (no env) | **FAIL** (exit 1) — `databaseUrl: Required`, `jwtSecret: Required`, `tokenEncryptionKey: Required` | [RUN] |
| `npx tsx --env-file=../../.env test-e2e.mjs` | **PASS** (exit 0) — 23 templates loaded, 0 failed, rendered Dockerfile assertions pass | [RUN] |
| `pnpm build` | **PASS** (exit 0) — shared/db/backend `tsc` clean; frontend `vite build` OK (1721 modules, `index.js` 394.10 kB / 119.24 kB gzip, 30.42 s) | [RUN] |
| `docker version` / `docker ps` | **FAIL** — Docker daemon not running (`npipe:////./pipe/dockerDesktopLinuxEngine` not found) | [RUN] |
| `Test-Path packages/db/prisma/migrations` | `False` — **no migrations committed** | [RUN] |
| `Test-Path` for `LICENSE`, `.dockerignore`, `SECURITY.md`, `CONTRIBUTING.md`, `.github/workflows` | All `False` — **no license file, no root `.dockerignore`, no community docs, no CI** | [RUN] |

**Known-failing at start of this pass:** frontend `lint` (1 error, 2 warnings).

---

## 2. Repository architecture inventory

### 2.1 Structure

```
RYME/ (root package: "ryme" v0.1.0, MIT declared in package.json only)
├── apps/
│   ├── backend/        Express 4 + TS (ESM, tsx), deployment engine, 24 Handlebars templates
│   └── frontend/       React 19 + Vite 6 + Tailwind v4, react-router 7, TanStack Query 5, axios
├── packages/
│   ├── db/             Prisma 6 + PostgreSQL; schema.prisma, seed.ts (NO migrations dir)
│   └── shared/         Zod schemas + types + constants (consumed by backend only, NOT frontend)
├── docker/             docker-compose.yml (postgres + traefik), traefik static/dynamic config,
│                       templates/ (13 static Dockerfiles, parallel to backend's Handlebars set)
├── scripts/            setup.sh, reset-db.sh
├── tests/              PowerShell smoke scripts + 2 Postman collections + 2 Node utilities
├── docs/               architecture.md, DEV_AUTH.md
├── docker-compose.traefik.yml   (root; Traefik v3.4 — conflicts with docker/ compose v3.3)
└── (untracked, ignored): .env, .env.test, server.log, data/workspaces
```

Monorepo: `pnpm-workspace.yaml` = `apps/*`, `packages/*`. Root scripts: `dev`, `build`, `db:*`,
`lint`, `typecheck`, `infra:up|down|logs`, `setup`.

### 2.2 Runtime topology (as designed; not runtime-verified this pass `[INFERRED]`)

```
Browser ──> Vite dev server :5173 ──proxy /api──> Express :3001 ──> PostgreSQL :5432
User    ──> Traefik :80 ──(file provider: routes.yml)──> app containers on ryme-network
```

### 2.3 Backend surface (all under `/api/v1`)

| Group | Endpoints | Notes `[STATIC]` |
| --- | --- | --- |
| health | `GET /health` | Docker ping + `SELECT 1` |
| auth | `GET /auth/github`, `POST /auth/github/callback`, `POST /auth/logout`, `GET /auth/me` | Stateful OAuth state in in-memory Map |
| dev | `POST /dev/login`, `GET /dev/status` | PAT login, `NODE_ENV`-gated **inside the handler** |
| github | `GET /github/repos` | Proxy using the user's encrypted token |
| projects | CRUD, `/import`, `/:id/deploy`, `/:id/framework`, `/:id/deployments` | Soft delete |
| deployments | `GET /:id`, `GET /:id/logs`, `POST /:id/stop` | Duplicate log route registered in `logs` router (validated version loses) |

Pipeline (`services/deployment-orchestrator.ts`, fire-and-forget after `202`):
`CLONE → DETECT → INSTALL → GENERATE_DOCKERFILE → BUILD → START → ROUTE → COMPLETE`,
every step persisted to `deployment_logs`.

### 2.4 Data model (`packages/db/prisma/schema.prisma`) `[STATIC]`

PostgreSQL. Models: `User`, `Project`, `Deployment`, `DeploymentLog`, `Port`, `Framework`.
Enums: `ProjectStatus`, `DeploymentStatus`, `DeploymentStep`, `LogLevel`, `PortStatus`.
Uncommitted working-tree change adds rollback fields + `ROLLBACK` enum values (preserved).

### 2.5 Frontend surface `[STATIC]`

Routes: `/login`, `/auth/callback`, `/` (dashboard), `/projects`, `/projects/:id`,
`/deployments/:id`, `/settings` (stub). No catch-all 404, no ErrorBoundary, no code splitting.
Design system is a hand-written 574-line `src/index.css` (Tailwind v4 `@theme` tokens + custom
classes); **no Tailwind utility classes are used in JSX**. Real-time is polling only (2s/5s/15s/30s).

### 2.6 Infrastructure `[STATIC]`

- `docker/docker-compose.yml`: `postgres:16-alpine` (`ryme-postgres`) + `traefik:v3.3` (`ryme-traefik`),
  network `ryme-network`, does **not** mount `traefik/dynamic/`.
- `docker-compose.traefik.yml`: `traefik:v3.4`, **does** mount `dynamic/`, external `ryme-network`.
  → Two compose files, two Traefik versions, different mount behavior `[STATIC]`.
- Windows-specific: `hosts-manager.ts` edits `C:\Windows\System32\drivers\etc\hosts`;
  `command-executor.ts` spawns `cmd.exe /c`.

---

## 3. Reuse matrix

Classification key: **REUSE** (minimal change) · **ADAPT** (useful, needs change) ·
**REPLACE** (coupled to old purpose) · **REMOVE** (obsolete/unsafe) · **VERIFY** (insufficient evidence).

Effort: L = low, M = medium, H = high.

### 3.1 Infrastructure worth preserving (PULSE's "shared execution substrate")

#### REUSE

| # | Component / path | Current responsibility | Evidence | Intended PULSE role | Required modifications | Dependencies & risks | Tests needed | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | `packages/db` (Prisma client singleton, `prisma/`) | PostgreSQL client, schema, seed | `typecheck` PASS `[RUN]`; **no migrations dir** `[RUN]` | Persistence for all PULSE modules | Commit migrations before any schema work; add `db:push`-free workflow | Schema is deployment-product-shaped; new PULSE tables are additive (Phase 2+, needs approval) | Migration up/down test on empty DB; seed idempotency test | L |
| R2 | `packages/shared` (Zod schemas, types, constants) | Validation + shared types for API | `typecheck` PASS `[RUN]`; consumed by backend routes | Contract/validation layer for PULSE APIs | Add PULSE schemas; keep `GITHUB_URL_PATTERN`, `BRANCH_NAME_PATTERN`, pagination schema as-is | Frontend does **not** import it today — decide whether to wire it in (approval item) | Unit tests for every schema (currently zero) | L |
| R3 | `apps/backend/src/lib/` — `errors.ts`, `logger.ts`, `crypto.ts`, `prisma.ts` | AppError hierarchy, pino, AES-256-GCM token encryption, Prisma re-export | `[STATIC]` well-formed; logger service name `ryme-backend` | Core platform primitives for PULSE | Rename logger `service` → `pulse-backend`; otherwise unchanged | `crypto.ts` silently truncates non-hex keys — add key-length validation (approval: config behavior change) | Unit tests: error status mapping, encrypt/decrypt round-trip, non-hex key rejection | L |
| R4 | `apps/backend/src/config/index.ts` | Zod fail-fast env config | Fails fast when env missing `[RUN]` (observed via test-e2e without `--env-file`) | PULSE config validation | Keep mechanism; rename vars in a **later, approved** pass (`DOCKER_*`, `DEPLOY_DOMAIN` → PULSE equivalents) | Renaming env vars breaks existing `.env` files → needs migration note | Config validation unit tests (missing/invalid values) | L |
| R5 | `apps/backend/src/middleware/` — `validate.ts`, `error-handler.ts`, `request-logger.ts` | Zod request validation, error envelope, structured request logs with `Authorization` redaction | `request-logger` redaction is part of the **uncommitted** work `[RUN: git diff]` | Same role in PULSE | Preserve uncommitted change; no functional change now | Uncommitted → must be committed before other work | Route-level 400/500 envelope tests | L |
| R6 | `apps/backend/src/services/git.service.ts` | Shallow clone via `simple-git`, URL allowlist (`https://github.com/owner/repo`), path-traversal guard, token scrubbing from errors | `[STATIC]` strong guards | **Repository ingestion** — pulling repos/specs/pipeline definitions into PULSE | Broaden URL rules only if PULSE needs non-GitHub sources (default: keep GitHub-only) | Token in URL for git; scrubbing already implemented; SSRF surface = DNS resolution of `github.com` only | Unit tests: URL validation matrix (ssh, `..`, file://, IP literals), clone failure sanitization | L |
| R7 | `apps/backend/src/services/command-executor.ts` | `spawn(shell:false)` + Windows `cmd.exe /c`, env-var **whitelist**, timeout → SIGTERM → SIGKILL, stdout/stderr streaming into DB logs | `[STATIC]` | **Controlled job execution** for validators/linters/pipeline steps | Add: per-job workdir cgroup limits are out of scope for host runs; must not be used for untrusted code | ⚠ Shell metacharacter denylist is over-broad and Windows-only; host-side execution of user code is a **trust-boundary violation** unless containerized | Command allowlist tests; env leak test (`DATABASE_URL` must not appear in child env); timeout/kill test | M |
| R8 | `apps/backend/src/services/deployment-orchestrator.ts` | Async state machine: status transitions, per-step DB logs, error capture, cleanup, stale-run recovery on boot | `[STATIC]`; rollback extension is uncommitted `[RUN: git diff]` | **Job lifecycle engine** for PULSE runs (test runs, pipeline executions) | Rename domain from "deployment" → "run"; stages become PULSE stages; keep the transition/log/cleanup skeleton | 28 KB monolith; `void`-fired async work with no queue; fixed `sleep(1500)`; exit-code regex parsing; **no concurrency lock** | State-machine unit tests (every transition), stale-run recovery test, concurrent-trigger test | H |
| R9 | `apps/backend/src/lib/docker-client.ts` + `apps/backend/src/engine/docker-deployment-engine.ts` | dockerode singleton; build (tar stream), create/start/stop/remove container, logs, inspect, health-wait | `[STATIC]`; **not executed this pass** — Docker daemon down `[RUN]` | **Isolated execution environments** for validators and pipeline runs | Add: `NanoCpus`/`Memory`/`PidsLimit`, read-only rootfs, `NetworkMode` without socket mount, egress restriction, `cap_drop` | ⚠ Docker ≠ sandbox for hostile code; compose currently shares the host socket with Traefik; `ryme-network` is created nowhere in code (`ensureNetwork()` unused) | Container-limit tests (CPU/mem/timeout kill), no-socket-access assertion, egress test, health-check test | H |
| R10 | `apps/backend/src/middleware/cors.ts`, `helmet` in `app.ts` | CORS (currently reflects any origin), security headers (CSP disabled) | `[STATIC]` | Baseline hardening for PULSE | Restrict CORS to `FRONTEND_URL`; enable CSP; both flagged "Phase 1" in comments | Behavior change affects dev convenience → approval item | CORS preflight tests (allowed/ disallowed origin), header assertions | L |
| R11 | `apps/backend/src/features/auth/*` | GitHub OAuth + JWT (HS256, 24h) + `authenticate` middleware | `[STATIC]`; OAuth flow reachable but **no UI links to it** `[STATIC]`; untested at runtime | PULSE authentication | Keep mechanism; **add authorization scoping** (see A1 in architecture doc) | ⚠ No resource-level ownership checks; no rate limiting; state Map is per-process | Auth middleware tests (missing/expired/invalid token), ownership enforcement tests | M |
| R12 | Frontend shell: `src/main.tsx`, `src/App.tsx`, `src/api/client.ts`, `src/contexts/AuthContext.tsx`, `components/layout/Layout.tsx` | Provider stack, router + `ProtectedRoute`, axios client with 401 handling, auth context, sidebar shell | `typecheck` PASS `[RUN]` | PULSE app shell | Terminology + navigation changes (see rebrand audit); add catch-all route | Axios interceptor rejects with plain object (not `Error`) → error UX bug to fix | Route guard tests; 401 redirect test | M |
| R13 | Reusable UI: `components/ui/Button.tsx`, `StatusBadge.tsx`, `components/logs/LogViewer.tsx` | Button variants, status→color mapping, terminal-style log view with auto-scroll | `[STATIC]` | PULSE status/log presentation (run states, check results) | Extend status map to PULSE states (QUEUED/RUNNING/PASSED/FAILED…); fix dead `outline`/`success` variants | Status enum must stay in sync with backend enums (currently already drifting) | Status mapping table test; LogViewer render test | L |
| R14 | `scripts/setup.sh`, `scripts/reset-db.sh` | Prereq checks, `.env` bootstrap, compose up, migrate, seed; destructive DB reset with confirmation | `[STATIC]` (not run — Docker down) | Developer onboarding for PULSE | Rename banner/labels; keep flow | Requires Docker + bash on Windows (WSL/Git Bash) | Dry-run in CI later | L |

#### ADAPT

| # | Component / path | Current responsibility | Evidence | Intended PULSE role | Required modifications | Dependencies & risks | Tests needed | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | `apps/backend/src/services/framework-detector.ts` (983 lines) | Detects app framework from `package.json`, lockfiles, config files; emits confidence + commands | `[STATIC]`; not executed this pass | **Runtime/language detection** for choosing execution images, plus *spec detection* (OpenAPI files, `dbt`, Airflow, Dagster, Prefect, schema files) | Split: keep language/runtime detector; add a PULSE "artifact detector" for OpenAPI/GraphQL/SQL/pipeline configs; delete app-framework heuristics that have no PULSE use (Next.js/Nuxt/etc.) | Heavy template coupling via `DetectionResult`; `extractVersion()` is a stub returning `null` | Detection fixtures: repo-per-framework corpus; new fixtures per PULSE artifact type | H |
| A2 | `apps/backend/src/templates/**` (24 frameworks × `template.json` + `Dockerfile.hbs`) + `template-registry/resolver/renderer`, `workspace-writer.ts` | Renders production Dockerfiles for deployed apps | `test-e2e.mjs` **PASS** for `react-vite` `[RUN]`; 23 templates load `[RUN]` | **Execution environment images** for PULSE validators/pipelines (pinned `node`, `python`, `java`, `go`, `rust`, `sql` tool images) | Re-scope template set to runtime toolchains; remove app-serving templates; keep registry/renderer/validation logic | Known defects to fix when reused: `nextjs` template uses invalid `COPY … 2>/dev/null \|\| true` shell syntax; `.dockerignore` excludes `dist` while some templates `COPY . .` | Golden-file tests per template (render → parse with a Dockerfile linter) | M |
| A3 | `apps/backend/src/features/{projects,deployments,logs}` controllers/services/repositories/routes | CRUD + trigger + logs for deployments | `[STATIC]`; API envelope consistent | **Blueprint** for PULSE module structure (controller/service/repository/routes + Zod validate) | Copy the *pattern*, replace the *domain*: PULSE modules become contracts, checks, pipelines, runs, lineage | Domain logic (deploy, Traefik, hosts) is not reusable — do not carry it over | Per-module controller tests using supertest | H |
| A4 | `apps/frontend/src/pages/*`, `components/projects/*` | Dashboard, lists, detail pages, import modal | `typecheck` PASS `[RUN]`; `lint` FAIL `[RUN]` | PULSE views: dashboards, run history, contract diffs, lineage graph | Rebuild content around PULSE entities; keep layout/grid/skeleton patterns | `SettingsPage` is a "Phase 2" stub; pagination UI missing (always page 1); no error boundaries | Component tests; fix the existing lint error first | H |
| A5 | `apps/backend/src/services/docker.service.ts` | Older duplicate of the Docker engine (build/run/stop/health/network) | `[STATIC]` ~60% duplicate; only 4 methods used, `ensureNetwork()` never called in the live path | Should become **one** Docker adapter used by PULSE execution | Consolidate into `docker-deployment-engine` (or a renamed `execution-runtime`), delete the duplicate | Consolidation touches the live deploy path → regression risk; no runtime coverage exists | Adapter unit tests with a mocked dockerode; one integration test with Docker up | M |
| A6 | `docker/docker-compose.yml` + `docker/traefik/*` | Postgres + Traefik reverse proxy for deployed apps | `[STATIC]`; **Traefik path bug suspected**: `parseRoutesYaml` drops the last router and mis-parses `entryPoints` on every rewrite; live `routes.yml` shows 6 services / 1 router | Postgres (keep) + optional PULSE dashboard routing (decide) | Keep `postgres` as-is. Traefik: either **remove** (PULSE doesn't publish user apps) or fix + mount `dynamic/` consistently across both compose files | Two compose files disagree (v3.3 vs v3.4, different mounts) — must converge regardless | Compose config validation (`docker compose config`), Traefik route round-trip test | M |
| A7 | `tests/` (2 PowerShell scripts, 2 Postman collections, `verify-db.mjs`, `generate-test-token.mjs`) | Manual smoke tests for API/auth | `generate-test-token.mjs` uses a **hardcoded fallback JWT secret** `[STATIC]` | Baseline API smoke suite for PULSE | Rename, replace hardcoded secret with required env, wire into a `test:smoke` script | Manual-only, no CI; relies on live server | Runs against a spawned dev server in CI | M |
| A8 | `apps/backend/test-e2e.mjs` | Template render assertions | **PASS with `--env-file`**, FAIL without `[RUN]` | Model for real tests | Move to a `test` script with proper env loading; expand coverage | Currently unwired to any script/CI | Already a test; needs runner integration | L |

#### REPLACE

| # | Component / path | Current responsibility | Evidence | Intended PULSE role | Required modifications | Dependencies & risks | Tests needed | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | Deployment domain language (`Project` = "app to deploy", `Deployment` = "container build/run") | Core product concept | `[STATIC]` | PULSE concepts: **service → API/pipeline definition → check/run → evidence** | New domain naming in API/UI (DB rename deferred; see approval items) | Schema/enum changes are **out of scope this pass** per instructions | Domain mapping tests once implemented | H |
| P2 | `docs/architecture.md` | Describes RYME as a Vercel/Railway clone | `[STATIC]` | Superseded by `docs/pulse/PULSE-02-target-architecture.md` | Rewrite after architecture approval; keep old file until then for provenance | Must not claim PULSE features that don't exist | n/a (doc review) | M |
| P3 | `docs/DEV_AUTH.md` | Documents the dev-only PAT login bypass | `[STATIC]` | Must not exist in the public repo as an enabled path | Remove endpoint + doc before publication (approval item) | Frontend login currently **depends** on `/dev/login` — needs replacement flow first | Test that `/dev/login` returns 404 in production mode | M |

#### REMOVE (candidates; removal requires approval)

| # | Component / path | Why removable | Evidence | Risk | Tests needed | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| X1 | `services/dockerfile-generator.ts` (526 lines) | Dead code — never imported; duplicates the Handlebars system | `[STATIC]` grep: no importers | None (verify with typecheck) | `pnpm typecheck` after removal | L |
| X2 | `services/port-allocator.ts` + `Port` model + `PORT_RANGE_*` config | Dead code — host ports are never published; Traefik file routing made it obsolete | `[STATIC]` no callers; model still in schema | DB schema change (later phase, approval) | typecheck + schema diff | L |
| X3 | `engine/swarm-deployment-engine.ts`, `engine/kubernetes-deployment-engine.ts` | Pure stubs — every method throws | `[STATIC]` | None | typecheck | L |
| X4 | `services/hosts-manager.ts` | Windows `hosts` editing exists only to serve deployed apps at `*.localhost` | `[STATIC]` | PULSE dashboards don't need it; only deploy path uses it | Covered by deploy-path tests when touched | L |
| X5 | `services/traefik-routing.service.ts` | Routes deployed apps; contains the suspected route-corruption bug | `[STATIC]` + live `routes.yml` evidence (6 services / 1 router) | Only if Traefik is retained for something else | Round-trip YAML test if retained | M |
| X6 | Frontend `hooks/useRepos.ts` | Never imported | `[STATIC]` | None | typecheck + lint | L |
| X7 | `docker/templates/*.Dockerfile` (13 static files) | Parallel legacy template set; backend uses its own Handlebars templates | `[STATIC]`; `config.templateDir` points here but is **unused** | Low — confirm no consumer first | typecheck | L |
| X8 | Duplicate `GET /deployments/:id/logs` route registration | Two routers register the same path; unvalidated one wins | `[STATIC]` | Behavior change → add validation test before removing | Route test asserting query validation | L |

#### VERIFY (insufficient evidence in this pass)

| # | Question | Why unresolved | How to resolve | Effort |
| --- | --- | --- | --- | --- |
| V1 | Does the full deploy pipeline actually work end-to-end? | Docker daemon unavailable `[RUN]` | Start Docker, run one real deploy, capture logs | M |
| V2 | Are DB-backed flows correct (migrations, seed, soft delete)? | No DB; **no migrations exist** `[RUN]` | `prisma migrate diff` → commit baseline migration → up/down test | M |
| V3 | Do the HTTP API flows behave as documented? | No server run (needs DB + Docker) | Start stack, run `tests/test-api.ps1` + Postman collection, record results | M |
| V4 | Does `pnpm build` succeed? | — | **Resolved: PASS** (exit 0) `[RUN]`; single 394 kB JS bundle, no code splitting | L |
| V5 | Is Traefik routing corruption real (not just static reading)? | Docker down; needs two consecutive deploys to reproduce | Two-deploy reproduction test asserting router count | M |
| V6 | Are the personal emails / repo name in history acceptable for publication? | Ownership/legal, not technical | Owner decision (approval item D7) | L |
| V7 | Which reused modules survive real load? | No perf/stress testing exists | Add smoke + soak tests in Phase 3 | H |

---

## 4. Test inventory and coverage gaps

### 4.1 Existing tests (complete list)

| Asset | Type | What it actually covers | Status |
| --- | --- | --- | --- |
| `apps/backend/test-e2e.mjs` | Node script (not wired to any `test` script) | Template registry load + `react-vite` Dockerfile rendering assertions | **PASS** with `--env-file=../../.env`; **FAIL** without `[RUN]` |
| `tests/test-api.ps1` | PowerShell, live server | 8 smoke checks: health, OAuth init, callback errors, 401s, 404 | **Not run** (server needs DB/Docker) `[UNVERIFIED]` |
| `tests/test-dev-login.ps1` | PowerShell, live server | Dev PAT login + repo listing | **Not run** `[UNVERIFIED]` |
| `tests/postman_collection.json` | Postman | Auth/projects/deployments smoke | **Not run** `[UNVERIFIED]` |
| `tests/postman-dev-login.json` | Postman | Dev login flow | **Not run** `[UNVERIFIED]` |
| `tests/verify-db.mjs` | Node script | DB connectivity + row counts | **Not run** (Docker down) `[UNVERIFIED]` |
| `tests/generate-test-token.mjs` | Node utility | Signs a JWT; falls back to a **hardcoded dev secret** | Utility, not a test; secret must be removed |

### 4.2 Checks executed this pass

| Check | Result |
| --- | --- |
| `pnpm typecheck` | **PASS** (4/4 packages) |
| `pnpm lint` | **FAIL** — frontend: 1 error (`DeploymentDetailPage.tsx:83` no-non-null-asserted-optional-chain), 2 warnings (`useRepos.ts:35`, `AuthCallbackPage.tsx:43`) |
| `pnpm build` | **PASS** (exit 0) — 4/4 packages; frontend bundle 394.10 kB (119.24 kB gzip) |
| Unit tests | **None exist** (no `*.test.ts` / `*.spec.ts` outside `node_modules`) |
| CI | **None** (`.github/workflows` absent) |

### 4.3 Missing coverage (priority order)

1. Unit: Zod schemas in `@ryme/shared` (input validation is the #1 API security control).
2. Unit: `git.service` URL validation matrix (SSRF/traversal defense).
3. Unit: orchestrator state transitions + stale-run recovery.
4. Unit: `command-executor` env whitelist + timeout kill behavior.
5. Integration: Docker execution with resource limits (requires Docker).
6. Integration: HTTP route tests (auth, validation, error envelope).
7. E2E: one PULSE "check run" producing stored evidence.
8. Security regression: no secret leakage into child process env or logs.

---

## 5. Files that should change first (ordered)

| # | File(s) | Why first | Risk |
| --- | --- | --- | --- |
| 1 | Commit (or stash with a note) the 5 uncommitted files | All later work builds on rollback + log-redaction changes; they must not be lost | Low — no content change, only recording state |
| 2 | `apps/frontend/src/pages/DeploymentDetailPage.tsx:83` | Fixes the **only known failing check** (`pnpm lint`) and makes the gate usable in CI | Low |
| 3 | New `docs/pulse/*` (this set) | Establishes approved direction before code changes | None |
| 4 | `package.json` (root) — add `test` script wiring `test-e2e.mjs` with env | Converts the existing passing test into a repeatable gate | Low |
| 5 | `README.md`, `apps/frontend/index.html`, `Layout.tsx`, `LoginPage.tsx` | First visible branding surface (see rebrand audit for full list) — after approval D1 | Low |
| 6 | `.gitignore` hygiene check + root `.dockerignore` + `LICENSE` + `SECURITY.md` | Public-repo prerequisites; currently all absent `[RUN]` | Low |
| 7 | Baseline Prisma migration (`prisma migrate diff --from-empty`) | Unblocks every future schema change safely | Medium — must be reviewed against production DB if any exists |
| 8 | Remove `/dev/login` in production + hardcoded test secret | Removes debug/auth bypass before any public exposure | Medium — needs replacement login path (D4) |

Items 1–4 are safe to do in the next phase without further architectural decisions. Items 5–8 map
to approval decisions documented in `PULSE-05-decisions-for-approval.md`.

---

## 6. What this pass did **not** do

Per the execution boundary: no module removal, no schema change, no new infrastructure, no auth
behavior change, no core architecture replacement, no Git history rewrite, no push/publish.
The 5 uncommitted files were read but not modified.
