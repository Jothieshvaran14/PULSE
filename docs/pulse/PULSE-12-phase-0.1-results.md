# PULSE — Phase 0.1 Results: Data Integrity, Tenant Isolation, Routing Stabilization

**Phase:** 0.1 · **Date:** 2026-10-26 · **Status:** Complete (code + docs)
**Scope:** Steps A–E of the Phase 0.1 brief. No branding, module removal, schema drop,
remote/visibility/history rewrite, or architecture migration was performed.

Evidence levels: **[RUN]** executed this phase · **[STATIC]** read from source.

Companion documents: `PULSE-09` (Step A — data integrity/D8), `PULSE-10` (Steps B+C —
tenancy/IDOR/D13), `PULSE-11` (Step D — Traefik/D6), this file (Step E — consolidated
results, deferred items, next-phase recommendation).

---

## 1. Files changed in Phase 0.1

Grouped by step. Nothing in this table overlaps the 5 pre-existing uncommitted files
(§1.3), which were left byte-identical.

### 1.1 Phase 0.1 changes (Steps A–E)

| Step | File | Change |
| --- | --- | --- |
| B/C (D13) | `apps/backend/src/middleware/ownership.ts` | **New** — `requireProjectOwner`, `requireDeploymentOwner`; identical 404 for foreign, orphan, and nonexistent IDs |
| B/C (D13) | `apps/backend/src/features/projects/projects.routes.ts` | Every `/:id` route guarded by `requireProjectOwner` |
| B/C (D13) | `apps/backend/src/features/projects/projects.repository.ts` | `findAll(page, limit, ownerId)` list scoping; `create` persists `ownerId` |
| B/C (D13) | `apps/backend/src/features/projects/projects.controller.ts`, `projects.service.ts` | Owner id plumbed through list/create |
| B/C (D13) | `apps/backend/src/features/deployments/deployments.routes.ts` | `requireDeploymentOwner` on `GET /:id`, `POST /:id/stop`; duplicate unvalidated `GET /:id/logs` de-registered (SEC-10) |
| B/C (D13) | `apps/backend/src/features/logs/{logs.routes,logs.controller,logs.service,logs.repository}.ts` | **Untracked before this phase** (mis-ignored, see §1.2) — validated `deploymentLogQuerySchema` route + ownership guard |
| D (D6) | `apps/backend/src/services/traefik-routing.service.ts` | Rewritten on the `yaml` Document API — lossless parse/generate round-trip |
| D (D6) | `apps/backend/package.json`, `pnpm-lock.yaml` | Added `yaml@^2.9.1` (backend only) |
| D (D6) | `docker/traefik/dynamic/routes.yml` | Approved live repair: **+25/−0** (5 routers restored; `dashboard` retained) |
| D (D6) | `scripts/repair-traefik-routes.mjs` | **New** — dry-run by default; `--apply` = backup → write → restart → verify |
| D (D6) | `tests/repro-traefik-roundtrip.mjs` | **New** — 28 read-only round-trip assertions (fixture + live file) |
| E | `.github/workflows/ci.yml` | **New** — `quality` job (typecheck/lint/build/unit) + `integration` job (Postgres 16 service); all actions SHA-pinned |
| E | `package.json` (root) | `test`, `test:integration`, `test:repro` scripts |
| E | `tests/test-api-regressions.mjs`, `tests/probe-drift.mjs`, `tests/helpers/*` | **New** — scratch-DB regression suite, `prisma migrate diff` drift probe, shared harness/fixtures |
| E | `apps/backend/src/middleware/validate.ts`, `error-handler.ts` | Dual-package-hazard fix: duck-typed `ZodError` detection + defensive 400 branch |
| E | `packages/shared/src/validation/deployment.ts` | `INSTALL` accepted in `deploymentLogQuerySchema` (SEC-10 parity) |
| E | `tests/test-api.ps1` | Smoke-script repairs (encoding, JSON body via file, fail exit code) |

### 1.2 Repository hygiene fixed while staging (GitHub integration task)

| File | Change |
| --- | --- |
| `.gitignore` | `logs/` → `/logs/` (root-anchored). The old pattern silently ignored `apps/backend/src/features/logs/`, so files imported by `app.ts` were untracked and would not build from a fresh clone. Added `.env.*` with `!.env.example`. |

### 1.3 Pre-existing uncommitted files — preserved, never staged

`deployments.controller.ts` (+16), `deployments.service.ts` (+10), `request-logger.ts`
(+21), `deployment-orchestrator.ts` (+93), `packages/db/prisma/schema.prisma` (+7):
rollback WIP + log redaction. Unmodified by this phase; D8 WIP disposition stays open
(§6).

### 1.4 Phase 0 carry-over in the same working tree (committed together, not Phase 0.1 work)

`config/index.ts` + `features/dev/dev.controller.ts` + `app.ts` (fail-closed
`ENABLE_DEV_LOGIN` gate), `docs/DEV_AUTH.md`, `.env.example` (documented default),
`tests/test-dev-gate.mjs` + `tests/helpers/dev-gate-harness.mjs`, and
`apps/frontend/src/pages/DeploymentDetailPage.tsx` (the single lint-error fix from
`PULSE-06` §2). All documented in `PULSE-06`; none is new work from this phase.

---

## 2. Owner approvals relied on

No approval was inferred. Each execution below is bounded by an explicit approval
recorded in `PULSE-07`:

| ID | Approval given | Scope granted | Executed within scope |
| --- | --- | --- | --- |
| **D8** (DB-sync sub-decision) | "Backup + additive DDL" | Backup first, apply only the exact additive drift, verify | `pg_dump` backup → exact DDL → `prisma migrate diff` empty → probe 5/5 → counts unchanged |
| **D13** | "Owner-scoping + quarantine orphans" | Enforce owner scoping; never modify orphan ownership | Scoping middleware + query filters; 5 `stress-test-*` rows left `owner_id IS NULL` |
| **D6** | Keep Traefik + fix round-trip; live repair approved after diff review | Additive repair of live `routes.yml`, one restart | Parser rewrite; backup → **+25/−0** write → one restart → 9 routers / 0 errors |

Still open (not actioned): D2, D3, D3a, D4, D5, D7, D8-WIP disposition, D9, D10, D11,
D12 — see `PULSE-07`.

---

## 3. Verification results (all **[RUN]** 2026-10-26)

| Command | Result |
| --- | --- |
| `pnpm typecheck` | **exit 0** (db, shared, frontend, backend) |
| `pnpm lint` | **exit 0** (0 errors; the 2 accepted warnings documented in `PULSE-06` §4) |
| `pnpm build` | **exit 0** |
| `pnpm test` | **exit 0** — backend e2e **PASS**; dev-gate **5/5 scenarios**; Traefik round-trip **28/28 assertions**, `ALL ASSERTIONS PASSED` |
| `pnpm test:integration` | **exit 0** — `test-api-regressions` **22/22**; `repro-idor` **37/37** (59 total), `ALL ASSERTIONS PASSED`; scratch DB `ryme_phase01_test` dropped afterwards (live DB untouched) |
| `tests/test-api.ps1` (live stack) | **8/8 PASS**, exit 0 (server started on :3001 and stopped; port closed afterwards) |
| `scripts/repair-traefik-routes.mjs` (idempotent re-run) | exit 0, no changes needed |
| Live HTTP probe after D8/D6 | 5/5 `200`; routing 200/200/200/302 |
| `prisma migrate diff` (live URL vs schema) | empty (`-- This is an empty migration.`) |

Post-phase live DB state: **55 deployments / 2359 logs / 7 projects / 1 user** — identical
to the pre-phase counts; 2 projects owned, 5 quarantined.

---

## 4. Data integrity outcome (Step A, D8)

- Drift was purely additive (2 enum values, 3 nullable columns, 1 FK) and is now applied;
  schema and live database agree (empty `prisma migrate diff`).
- Backup: `..\RYME-backups\ryme_pre_d8_2026-10-26.dump`
  (111,269 B, 45 TOC entries) + schema SQL. Restore runbook and inverse DDL in
  `PULSE-09` §7.
- The 5 rollback-WIP files were never edited, so the WIP diff still applies cleanly.
- Residual: no Prisma migration history yet (§6).

---

## 5. Tenant isolation outcome (Steps B+C, D13)

- Model: **single-tenant, multi-user** with strict owner scoping on every project,
  deployment, and log route (`PULSE-10` §1).
- Foreign / orphan / nonexistent IDs all return the **same 404 code** — no existence
  oracle on reads or mutations.
- Orphans quarantined, not reassigned: `owner_id` verified still `NULL` after the run.
- Regression evidence: `repro-idor` 37/37 and `test-api-regressions` 22/22, including
  "victim resource untouched after attack attempt" and "orphan owner_id still NULL".
- Residuals recorded in `PULSE-10` §7: global project-name `@unique` allows a 409 name
  oracle; app hostnames remain reachable on localhost until forwardAuth lands.

---

## 6. Deferred items (recorded, not blockers)

All are deliberate deferrals, each needs a decision or a later phase:

1. **Prisma migration baseline** — repo has no `prisma/migrations/`; adopting
   `prisma migrate` is a process change scoped as a Phase 2 item (`PULSE-09` §8).
2. **Security hardening not yet done:** rate limiting, CORS/CSP tightening, egress
   policy, container CPU/mem/pid limits, forwardAuth on app hostnames
   (roadmap Phase 1.6 / 3.1).
3. **Traefik residual risk:** `api.insecure: true` dashboard exposure and one Traefik
   restart per deploy (`PULSE-11`).
4. **Global project-name uniqueness** → 409 name oracle (`PULSE-10` §7).
5. **Rollback WIP disposition (a)/(b)/(c)** — committing those 5 files and wiring the
   rollback route require explicit commit authorization, which this phase did not have.

---

## 7. Remaining risks

| Risk | Severity | Mitigation / status |
| --- | --- | --- |
| Rollback route unwired while WIP code sits uncommitted | Low | Controller export is unreferenced; nothing can trigger it |
| Orphaned projects invisible to all users | Accepted | Deliberate quarantine; recovery is an explicit future admin action |
| Enum `ADD VALUE` not reversible | Low | Documented limitation; labels are inert without matching schema |
| Ownership enforced in app layer only (no DB-level RLS) | Medium | Recorded for Phase 2.1 (`tenant_id` + optional RLS) |
| CI `integration` job not yet exercised on GitHub runners | Medium | Workflow YAML validated locally; first real run happens on the first push |

---

## 8. Recommendation for the next phase

1. **Phase 1 (rebrand + public readiness)** per `PULSE-04`: branding waves A–C behind
   D2/D3 approvals, SEC-03 rate limiting, SEC-11 CORS/CSP, then `SECURITY.md` /
   `CONTRIBUTING.md` / `LICENSE` (D7) — publication itself stays unauthorized.
2. **Establish the Prisma migration baseline** as the first Phase 2 item so schema
   changes stop relying on `db push`.
3. **Resolve D8-WIP disposition** (commit / stash / discard the 5 files) before any
   work touches deployments again — it blocks clean diffs.
4. Keep the gate order used here: `typecheck → lint → build → test → test:integration`
   must all be green before any commit, and this order is what CI enforces.
