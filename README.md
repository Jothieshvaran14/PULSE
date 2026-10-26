# PULSE — API & Data Reliability Intelligence

**Trust Every Flow.**

> **Repository status:** private, in early development. Nothing here is
> production-ready, and no capability is claimed beyond what the checks in
> [Testing and quality checks](#8-testing-and-quality-checks) actually prove.

---

## 1. Overview

Teams ship APIs and data pipelines, then discover contract breaks, schema changes, and
performance regressions — usually in production, usually after users do. The evidence
that something broke (the response shape, the run log, the schema diff) is scattered
across services, hard to reconstruct, and gone by the time anyone investigates.

PULSE aims to be the place where that evidence lives: validate API contracts against
real responses, detect breaking changes before release, run performance regression
checks, validate data pipelines and schemas, and answer "what breaks if this field
changes?" — all backed by stored, reviewable run evidence.

**Intended users:** engineering teams that operate self-hosted infrastructure and want
reliability checks they can run inside their own network, without sending data to a
third-party SaaS.

**Where the code stands today:** the working tree is a self-hosted deployment platform
(a repository-to-container PaaS with reverse-proxy routing) that is being transformed
into PULSE. The deployment platform works and is tested; the PULSE reliability
capabilities are planned and documented, not yet built. Sections 3 and 6 separate the
two precisely.

---

## 2. Planned capabilities

Labels follow the evidence vocabulary in [`docs/pulse/PULSE-04-roadmap.md`](docs/pulse/PULSE-04-roadmap.md):
**Implemented** (code exists and is exercised by tests) · **In development** (partially
built) · **Planned** (designed and scheduled, no code yet).

| Capability | Status | Evidence |
| --- | --- | --- |
| Request/input validation on API endpoints (Zod schemas, typed 400 errors) | **Implemented** | `packages/shared/src/validation/*`, `apps/backend/src/middleware/validate.ts`; covered by `test-api-regressions` (22/22) |
| Owner-scoped authorization across projects, deployments, and logs | **Implemented** | `apps/backend/src/middleware/ownership.ts`; covered by `repro-idor` (37/37) |
| Repo → build → container deployment with framework detection and Traefik routing | **Implemented** (legacy baseline being re-used) | `apps/backend/src/services/*`; live smoke `8/8` |
| Lossless management of Traefik routing configuration | **Implemented** | `traefik-routing.service.ts` on the `yaml` Document API; 28/28 round-trip assertions |
| **API contract validation** (OpenAPI spec → validate real responses) | **Planned** | Roadmap Phase 2 (items 2.3–2.4); target module M1 in `PULSE-02` |
| **Breaking-change detection** (schema/spec diff classified additive vs breaking) | **Planned** | Roadmap Phase 3 (item 3.3) |
| **Performance regression testing** (latency/error-rate thresholds per run) | **Planned** | Roadmap Phase 2 (item 2.5); target module M2 |
| **Data pipeline validation** (multi-step runs with per-step evidence) | **Planned** | Roadmap Phase 3 (items 3.1–3.4); target module M3 |
| **Schema/data-quality checks** (rule sets + schema snapshots) | **Planned** | Roadmap Phase 3 (item 3.3); target module M4 |
| **Lineage** (edge graph from run events) | **Planned** | Roadmap Phase 4 (item 4.1); target module M5 |
| **Dependency-impact analysis** ("what breaks if this field changes?") | **Planned** | Roadmap Phase 4 (item 4.1); target module M7 |
| CI quality + integration gate | **In development** | `.github/workflows/ci.yml` is written and YAML-validated, but has not yet run on GitHub runners |

---

## 3. Architecture

### 3.1 Verified existing components (read from this repository)

```
apps/backend/         Express 4 + TypeScript (ESM), Zod validation, Pino logging
  src/features/       auth, dev, github, health, projects, deployments, logs
  src/middleware/     JWT auth, Zod validate, owner-scoping, error envelope, request logger
  src/services/       git, framework detection, Dockerfile generation, Docker (dockerode),
                      port allocation, workspace writer, Traefik routing
apps/frontend/        React 19 + Vite 6 SPA (TanStack Query, React Router, Tailwind 4)
packages/db/          Prisma 6 schema + client for PostgreSQL
packages/shared/      shared Zod schemas and API types
docker/               Compose stack: PostgreSQL 16 + Traefik (file provider)
docker/traefik/dynamic/routes.yml   routing config managed by the backend service
.github/workflows/    ci.yml — quality job + integration job (Postgres service)
docs/pulse/           audit, architecture, security, roadmap, and decision records
```

Verified runtime behavior: JWT authentication, project/deployment CRUD with owner
scoping, validated log queries, health endpoint, container deployment behind Traefik,
structured error responses.

### 3.2 Proposed target architecture (design only — not built)

Documented in [`docs/pulse/PULSE-02-target-architecture.md`](docs/pulse/PULSE-02-target-architecture.md)
as modules M1–M10: OpenAPI spec ingest, contract validation, HTTP check execution,
pipeline runs, lineage graph, append-only run events/artifacts, job queue + worker,
and health/metrics. The proposed model adds new PULSE tables alongside the existing
`projects`/`deployments`/`deployment_logs` tables (ADR-006), which stay untouched
until after the MVP cutover.

Nothing in §3.2 exists in code today.

---

## 4. Technology stack

Derived from the actual manifests:

| Layer | Technology |
| --- | --- |
| Runtime | Node.js ≥ 20, pnpm 9 workspaces (`packageManager: pnpm@9.15.4`) |
| Language | TypeScript 5.7 (ESM), ESLint 8 |
| Backend | Express 4, Zod 3, jsonwebtoken, Helmet, CORS, Pino/Pino-HTTP |
| Data | PostgreSQL 16, Prisma 6 (`@prisma/client`) |
| Deployment engine | simple-git, dockerode, handlebars templates, tar-fs, port allocation |
| Routing | Traefik v3 via YAML file provider; `yaml` 2.9 Document API for lossless edits |
| Frontend | React 19, Vite 6, Tailwind CSS 4, TanStack React Query 5, React Router 7, axios |
| Tests | Node test scripts via `tsx` (e2e, regression, IDOR, routing round-trip, dev-auth gate) |
| CI | GitHub Actions — SHA-pinned actions; Docker-free quality job + Postgres integration job |

---

## 5. Current project status

**Works (verified by executed checks, 2026-10-26):**

- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm test:integration` — all exit 0.
- `test-api-regressions` 22/22, `repro-idor` 37/37, `repro-traefik-roundtrip` 28/28, dev-auth gate 5/5.
- Live API smoke against a locally started backend: 8/8.
- Live stack (Postgres + Traefik + deployed containers) healthy; routing config intact after repair.

**Incomplete:**

- All PULSE product capabilities from §2 (contract checks, lineage, pipelines) — planned only.
- Rollback flow: work-in-progress code exists but is deliberately uncommitted and its route is not registered (decision D8 still open).
- Rebrand to PULSE: the codebase still uses the previous identifiers in many places (roadmap Phase 1).
- No Prisma migration baseline yet — the database is schema-push managed.
- Security hardening items (rate limiting, CORS/CSP tightening, egress policy) are recorded, not implemented.

**Unverified / not claimed:**

- CI has not yet run on GitHub runners; the workflow is validated only as YAML + local equivalent commands.
- No performance, load, or external security-audit results exist. Any future benchmark numbers will be published only with reproducible commands.
- Deployment flows were exercised on this development machine only.

---

## 6. Prerequisites and local setup

**Prerequisites:** Node.js ≥ 20 · pnpm ≥ 9 · Docker (engine running) · PostgreSQL 16
(supplied by the Compose stack).

```bash
# 1. Install dependencies (also runs `prisma generate` via postinstall)
pnpm install

# 2. Create your local environment file (Windows PowerShell: Copy-Item .env.example .env)
cp .env.example .env
#    then edit .env — see section 7

# 3. Start infrastructure (PostgreSQL + Traefik)
pnpm infra:up          # = docker compose -f docker/docker-compose.yml up -d

# 4. Create/apply the schema on the empty local database
pnpm db:migrate        # = prisma migrate dev (no migration baseline is committed yet)

# 5. Run everything (backend :3001, frontend :5173, prisma watch)
pnpm dev
```

`scripts/setup.sh` (`pnpm setup`) automates steps 1–4 on bash environments and checks
the prerequisites first.

Health check: `GET http://localhost:3001/api/v1/health`.

---

## 7. Configuration

All configuration is read from environment variables; the annotated template is
[`.env.example`](.env.example). **Copy it to `.env` and supply your own values — never
put real credentials in `.env.example`, in code, or in a commit.**

| Group | Variables (names only) |
| --- | --- |
| Database | `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| Backend | `NODE_ENV`, `BACKEND_PORT`, `BACKEND_HOST` |
| Frontend | `VITE_API_URL` |
| Docker & routing | `DOCKER_SOCKET_PATH`, `DOCKER_NETWORK`, `DOCKER_IMAGE_PREFIX`, `DEPLOY_DOMAIN`, `TRAEFIK_DASHBOARD_PORT` |
| Port range | `PORT_RANGE_START`, `PORT_RANGE_END`, `WORKSPACE_DIR`, `BUILD_TIMEOUT_MS` |
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_TOKEN` |
| Auth | `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_URL`, `TOKEN_ENCRYPTION_KEY` |
| Dev login gate | `ENABLE_DEV_LOGIN` (fail-closed: only effective when `NODE_ENV=development`) |

`.env`, `.env.*` (except `.env.example`), and `*.log` are git-ignored. The dev login
endpoint returns 404 unless both `NODE_ENV=development` and `ENABLE_DEV_LOGIN=true`
(details in [`docs/DEV_AUTH.md`](docs/DEV_AUTH.md)).

---

## 8. Testing and quality checks

```bash
pnpm typecheck         # no external services required
pnpm lint              # no external services required
pnpm build             # no external services required

pnpm test              # e2e template checks + dev-auth gate + Traefik file round-trip
pnpm test:integration  # REQUIRES PostgreSQL (creates and drops a scratch DB)
```

- **No services needed:** `typecheck`, `lint`, `build`. `pnpm test` runs offline suites
  (Dockerfile-template assertions, fail-closed dev-auth scenarios, and a read-only
  round-trip over `docker/traefik/dynamic/routes.yml` — it never writes the file or
  restarts Traefik).
- **Requires a running PostgreSQL:** `pnpm test:integration` — prepares a scratch
  database (`ryme_phase01_test`), runs API-regression and cross-user authorization
  suites, then drops it; the live database is not touched. CI runs this job against a
  `postgres:16-alpine` service.
- **Requires a running backend on port 3001:** `pwsh tests/test-api.ps1` (HTTP smoke
  suite; starts nothing itself).

CI (`.github/workflows/ci.yml`) runs the quality job and the integration job on every
push and pull request, with all actions pinned to commit SHAs.

---

## 9. Security

- **Credentials:** secrets live only in `.env` (git-ignored) or your secret manager.
  `.env.example` documents variable names and non-secret defaults only.
- **Never commit:** `.env` files, logs, tokens/keys, database dumps or backups,
  personal data, or audit evidence containing customer information. The root
  `.gitignore` covers environment files, logs, build output, and key material
  (`*.pem`, `*.key`, `*.crt`).
- **Before every push:** review the full diff including untracked files and scan the
  intended files for secrets. If a secret is ever committed, treat it as compromised
  and rotate it — deleting the file later does not remove it from history.
- **Reporting:** this repository is private. Report suspected vulnerabilities privately
  to the repository owner (GitHub → Security advisory, or directly to the maintainer)
  rather than opening a public issue. A `SECURITY.md` with a formal policy is planned
  for roadmap Phase 1.9 and does not exist yet.
- Known security gaps are tracked with IDs (SEC-*) in
  [`docs/pulse/PULSE-03-security-risk-assessment.md`](docs/pulse/PULSE-03-security-risk-assessment.md)
  and [`docs/pulse/PULSE-08-security-remediation-plan.md`](docs/pulse/PULSE-08-security-remediation-plan.md);
  remediated items are listed with their regression tests.

---

## 10. Roadmap

Full detail with acceptance criteria: [`docs/pulse/PULSE-04-roadmap.md`](docs/pulse/PULSE-04-roadmap.md).
Decisions awaiting owner approval: [`docs/pulse/PULSE-07-decision-status.md`](docs/pulse/PULSE-07-decision-status.md).

| Phase | Goal | Status |
| --- | --- | --- |
| **Phase 0** — Stabilize the baseline | Green gates, dev-auth fail-closed, decisions logged | **Complete** (`PULSE-06`) |
| **Phase 0.1** — Data integrity, tenant isolation, routing | Schema drift repaired, owner scoping enforced, Traefik round-trip fixed | **Complete** (`PULSE-09`–`PULSE-12`) |
| **Phase 1** — Rebrand + public readiness + hardening | PULSE naming waves, rate limiting, CORS/CSP, CI maturity, repo hygiene | **Not started** (needs D2/D3/D7 approvals) |
| **Phase 2** — MVP "contract check + evidence" | OpenAPI ingest, contract validation, HTTP checks, run evidence, queue/worker | **Planned** (needs D12) |
| **Phase 3** — Data pipelines & quality | Containerized runs with limits, pipeline steps, quality rules, schema snapshots | **Planned** |
| **Phase 4** — Cross-system intelligence | Lineage, impact analysis, cross-correlation, evidence-grounded diagnostics | **Planned** |

Phase gates are order-dependent: `typecheck → lint → build → test → test:integration`
must be green before any commit, and proposed features are never described as done
until a recorded check proves it.

---

## 11. Contributing workflow

Every change follows the same sequence (also enforced as CI):

1. `git status` / `git diff` — inspect, including untracked files.
2. Run `pnpm typecheck && pnpm lint && pnpm build && pnpm test` (plus
   `pnpm test:integration` when the database is available).
3. Scan staged files for secrets and personal data.
4. Update documentation whenever behavior, configuration, or capabilities change.
5. Stage only the intended files — never unrelated work in progress.
6. Commit using [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat(api): …`, `fix(auth): …`, `test(routing): …`, `docs(readme): …`).
7. Push to `main` and verify the remote actually contains the commit.

---

## 12. License

No license has been selected. This repository is private and contains no `LICENSE`
file, so no open-source license is granted by its presence on GitHub — all rights are
reserved by the copyright holder until one is explicitly added (decision D7 in
`PULSE-07`). The `license` field in `package.json` predates this decision and does not
constitute a grant; it will be corrected when a license is chosen.
