# PULSE — Phase 0 Results: Baseline Stabilization and Decision Resolution

**Status:** Complete · **Date:** 2026-10-26 · **Scope:** investigation, decision logging, one
narrow security fix (dev-auth), baseline check stabilization. No branding, module removal, schema
change, remote/visibility/history operation, or architecture migration was performed.

Evidence levels: **[RUN]** executed this pass · **[STATIC]** read from source · **[INFERRED]**
reasoned, not executed.

---

## 1. Working baseline (preserved, not disturbed)

| Check | Result `[RUN]` |
| --- | --- |
| Branch / remote | `main` · `origin = https://github.com/Ryme-Labs/Ryme-dash.git` (untouched) |
| Pre-existing uncommitted work | **5 files preserved with original diffs**: `deployments.controller.ts` (+16), `deployments.service.ts` (+10), `request-logger.ts` (+21), `deployment-orchestrator.ts` (+93), `packages/db/prisma/schema.prisma` (+7) — rollback WIP + log redaction |
| Audit docs `PULSE-00`…`PULSE-05` + `README.md` | Present and unmodified |
| Destructive git operations | **None** — no reset/stash/commit/push/branch/remote/visibility change |

All Phase 0 agent-created changes are separable from pre-existing work (listed in §2); nothing was
merged into the 5-file diff.

## 2. Actions performed — files changed

**Code (narrow, scoped):**

| File | Change |
| --- | --- |
| `apps/backend/src/config/index.ts` | New `enableDevLogin` boolean config (`ENABLE_DEV_LOGIN === "true"`, default false) |
| `apps/backend/src/features/dev/dev.controller.ts` | New exported `isDevLoginEnabled()` — fail-closed: `nodeEnv === "development" && enableDevLogin`; `login` and `status` both gated by it |
| `apps/backend/src/app.ts` | `/api/v1/dev` routes **conditionally mounted** only when `isDevLoginEnabled()` |
| `apps/frontend/src/pages/DeploymentDetailPage.tsx` | Fixed the single lint **error**: redeploy mutation guards `projectId` instead of `deployment?.projectId!` (runtime guard, not `!`) |

**Test harness / scripts:**

| File | Change |
| --- | --- |
| `tests/test-dev-gate.mjs` + `tests/helpers/dev-gate-harness.mjs` | New: 5-scenario dev-auth fail-closed regression test (spawns the real app per scenario) |
| `tests/repro-idor.mjs` | New: read-only cross-user access reproduction (signs an attacker JWT in-memory; token never printed) |
| `tests/repro-traefik-roundtrip.mjs` | New: read-only parse/generate round-trip reproduction (never writes `routes.yml`, never restarts Traefik) |
| `tests/test-api.ps1` | Repaired: 15 non-ASCII em-dashes → ASCII (UTF-8-no-BOM decoded as ANSI by PowerShell 5.1 broke parsing); body 4 now sent via `@file` (PS 5.1 strips embedded quotes from native args → malformed JSON); added `exit 1` on failure |
| `package.json` (root) | `"test"` → backend e2e + dev-gate; `"test:repro"` → dev-gate |
| `apps/backend/package.json` | `"test": "tsx --env-file=../../.env test-e2e.mjs"` |

**Docs / env:**

| File | Change |
| --- | --- |
| `.env.example` | Documented `ENABLE_DEV_LOGIN=false` (fail-closed default) |
| `.env` (untracked, local) | Appended `ENABLE_DEV_LOGIN=true` so the existing dev workflow keeps working; no other values touched, none printed |
| `docs/DEV_AUTH.md` | Documented the opt-in flag, 404 behavior, and upgrade note |

## 3. Commands executed and actual results

| Command | Result |
| --- | --- |
| `pnpm typecheck` | **exit 0** (db, shared, frontend, backend) |
| `pnpm build` | **exit 0** (frontend 394.19 kB bundle, backend `tsc`) |
| `pnpm lint` | **exit 0** — 0 errors, **2 accepted warnings** (see §4) |
| `pnpm test` | **exit 0** — `test-e2e.mjs` PASS + dev-gate **5/5** |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tests\test-api.ps1` (live server `:3001`) | **8/8 PASS, exit 0** (was 7/8, then parse-broken) |
| `node tests\test-dev-gate.mjs` **pre-fix** | **1/5** — with `NODE_ENV` unset, `POST /dev/login` returned **400 (live)**, i.e. fail-open; `/dev/status` reachable in production |
| `node tests\test-dev-gate.mjs` **post-fix** | **5/5, exit 0** (prod/flag-forced/unset/development-unset all 404; development+flag enabled) |
| `node apps\backend\node_modules\tsx\dist\cli.mjs --env-file=.env tests\repro-idor.mjs` | **exit 0 — vulnerability reproduced**: anon → 401 ✓; attacker `GET /projects` → **200, total 6**; `GET /projects/:id` → **200, `repositoryUrl` exposed**; `GET /deployments/:id/logs` → **200, 69 log entries** |
| `npx tsx tests/repro-traefik-roundtrip.mjs` (from `apps/backend`) | **exit 0 — all three defects reproduced**: D-A last router dropped on first read (live file: `stress-test-3` lost), D-B `entryPoints` list items lost on parse, D-C router count erodes every round-trip (3→1→0); services stay stable — matches live `routes.yml` (6 services / 1 non-dashboard router) |
| `docker info` | Daemon **flaky** (see §5): down → up (29.6.1) → crashed → relaunched → up. Docker-dependent claims re-verified at time of writing |
| DB inspection (read-only `psql`) | `_prisma_migrations` **absent** (schema created via `db push`); tables: users=1, projects=7 (5 null-owner), deployments=55 (18 RUNNING / 30 FAILED / 7 STOPPED), deployment_logs=2359; `DeploymentStatus` enum has **no `ROLLBACK`** label; **no rollback columns**; **no stuck deployments** (boot-time cleanup UPDATE matched 0 rows) |

## 4. Baseline check investigation

- **Frontend lint error (SEC-26):** fixed as above — clear, scoped, no existing work overwritten.
- **Two remaining warnings — accepted, not suppressed:**
  - `useRepos.ts:35` `exhaustive-deps` — dead code pending removal decision (**X6/D11**); adding the dependency or deleting the file now would pre-empt an open decision.
  - `AuthCallbackPage.tsx:43` `exhaustive-deps` — adding `navigate/searchParams/setAuth` risks **double-firing the OAuth callback** exchange; correct fix is a refactor, deferred.
- **`test-e2e.mjs`:** configured as `tsx --env-file=../../.env test-e2e.mjs` (needs real env); safely exposed as `pnpm --filter @ryme/backend test`, chained at root as `pnpm test`. No new dependencies introduced.
- **Prisma migrations:** genuinely absent — live DB has **no `_prisma_migrations` table** and was created with `db push`, and it **drifts behind the working-tree schema** (no rollback columns, no `ROLLBACK` enum value, while the uncommitted `schema.prisma` adds both). **No baseline migration was generated.** Documented procedure for a later, authorized pass: `prisma migrate diff --from-empty --to-schema-datamodel packages/db/prisma/schema.prisma --script` as `0_init`, then reconcile against live state with `prisma migrate resolve` — requires D8 + explicit approval because the DB holds real data.
- **Traefik route corruption:** reproduced **without touching live state** (§3). Fix deferred — designing the corrected parser is recorded in `PULSE-08` (needs approval per D6).

## 5. Environment limitations and unresolved issues

1. **Docker Desktop is unstable on this host.** It crashed twice mid-session (WSL `docker-desktop`
   stopped) and was relaunched manually. Every Docker-dependent claim above was re-verified after
   the last relaunch, but the daemon may drop again — re-verify before relying on it.
2. **Schema drift causes runtime 500s `[RUN]`:** `GET /projects/:id/deployments` (and any query
   selecting all `Deployment` columns) fails with
   `The column deployments.rolled_back_from_id does not exist in the current database` because the
   Prisma client is generated from the uncommitted schema while the live DB predates it. Blocking
   deployment-list endpoints until D8/`db push` is resolved. **Not fixed in Phase 0** (schema
   change prohibited).
3. **Malformed JSON → 500, not 400 `[RUN]`:** body-parser `SyntaxError`
   (`Expected property name or '}' in JSON at position 1`) reaches the error handler unmapped →
   `INTERNAL_SERVER_ERROR`. Client error, should be 400. Documented; fix deferred (see `PULSE-08`).
4. **IDOR/missing authorization fully reproduced, fix NOT implemented:** cross-user list, detail,
   and log reads all succeed (§3). Implementation deferred — the design must decide how to handle
   **5 of 7 existing projects with `owner_id = NULL`** (see `PULSE-08` §2; needs approval).
5. **Duplicate unvalidated `GET /deployments/:id/logs` route** (SEC-10) confirmed present in
   `deployments.routes.ts`; removal deferred.
6. **OAuth callback test (`test-api.ps1` #4)** now exercises the real 403 path; the underlying
   in-memory `pendingStates` Map limitation (SEC-04) remains.
7. **Security scan items** (CORS/CSP/rate limits/limits/egress/secrets/deps): reviewed statically;
   confirmed vs unverified split recorded in `PULSE-08` §3. No secrets were printed anywhere; no
   credential values appear in this or any other Phase 0 document.

## 6. Exit criteria

| Criterion | Status |
| --- | --- |
| Pre-existing work preserved | ✅ 5 files untouched, separable |
| Decisions accurately recorded | ✅ `PULSE-07` |
| Auth findings investigated | ✅ both S1s reproduced with runnable evidence; dev-auth narrowly fixed |
| Baseline checks documented & reproducible | ✅ typecheck/build/lint/test/smoke all exit 0 with exact outputs above |
| DB migration + Traefik issues verified or limited | ✅ both reproduced/verified; migration blocked by data-state (documented procedure) |
| Remaining blockers identified | ✅ §5 + `PULSE-08` |
| No unauthorized remote/history/visibility/destructive ops | ✅ none performed |
