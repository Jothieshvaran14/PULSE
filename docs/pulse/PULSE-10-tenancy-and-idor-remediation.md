# PULSE — Tenancy and IDOR Remediation (D13)

**Phase:** 0.1 · **Date:** 2026-10-26 · **Status:** D13 approved and enforced
Covers: Step B (tenancy model, orphan policy) and Step C (IDOR enforcement +
regression tests) of the Phase 0.1 brief.

---

## 1. D13 decision (approved 2026-10-26)

**Model: single-tenant, multi-user MVP with strict owner scoping.**

- Any number of users may authenticate (GitHub OAuth / dev flag); each user sees and
  mutates **only** projects they own (`projects.owner_id = authenticated user`).
- **Orphaned records (owner_id IS NULL) are quarantined**: untouched in the database,
  invisible and inaccessible to *every* user — never auto-assigned to the first
  logged-in user, never exposed publicly. Recovery is an explicit future
  admin action, not this phase.
- `tenant_id` columns for the multi-tenant target architecture stay a **Phase 2.1**
  item per `PULSE-05` D13 (new PULSE tables get `tenant_id` from their first
  migration).

Rejected alternatives and why (recorded for the ledger):

| Option | Why not (now) |
| --- | --- |
| Single-user/local (reject all other logins) | The product already models multiple users; enforcement cost is identical, and rejecting logins adds UX/product decisions nobody approved |
| Multi-tenant with memberships now | Premature: no `tenants`/`memberships` tables exist; building them this phase = architecture change (out of scope) |
| Attribute orphans to the only existing user | Attribution is **not provable** (see §2) and the brief forbids assigning null-owner projects to the first logged-in user |
| Expose orphans to all users | Explicitly forbidden by the brief and equivalent to keeping the IDOR |

## 2. Orphan attribution evidence (read-only)

```
projects (live DB, unchanged before/after this phase):
  d684b252  ryme-test-app   owner f87d2998  2026-07-10   (49 deployments)
  5224143a  ryme            owner f87d2998  2026-07-10   (1)
  351c22ea  stress-test-3   owner NULL      2026-07-18   (1)
  be56ad30  stress-test-5   owner NULL      2026-07-18   (1)
  859aef19  stress-test-4   owner NULL      2026-07-18   (1)
  32429770  stress-test-2   owner NULL      2026-07-18   (1)
  1960a3cc  stress-test-1   owner NULL      2026-07-18   (1)
users: f87d2998 Jothieshvaran14 (2026-07-09) — the only user
```

The five `stress-test-*` rows were created 9 days after the account, share one
timestamp, and are clearly automated — but no column records who ran them.
Attribution is circumstantial only → **quarantine**, with `owner_id` left `NULL`.
Verified after enforcement: `SELECT COUNT(*) FILTER (WHERE owner_id IS NULL) = 5`
(no ownership data modified).

## 3. Routes audited (complete surface)

Every registration in `app.ts` + all `*.routes.ts`, classified:

| Route | Enforcement |
| --- | --- |
| `GET /api/v1/projects` | **Query-scoped** — `findAll(page, limit, ownerId)` filters `owner_id = caller` (also excludes NULL orphans) |
| `GET /projects/:id` | `requireProjectOwner` |
| `POST /projects` | Creates with `ownerId = req.userId` (was: no owner written at all) |
| `POST /projects/import` | Already set `ownerId = req.userId` (verified, unchanged) |
| `PUT /projects/:id` | `requireProjectOwner` (before body validation — foreign callers get 404, not validation feedback) |
| `DELETE /projects/:id` | `requireProjectOwner` |
| `POST /projects/:id/deploy` | `requireProjectOwner` |
| `GET /projects/:id/framework` | `requireProjectOwner` |
| `GET /projects/:id/deployments` | `requireProjectOwner` |
| `GET /deployments/:id` | `requireDeploymentOwner` (resolves via parent project) |
| `POST /deployments/:id/stop` | `requireDeploymentOwner` |
| `GET /deployments/:deploymentId/logs` | `requireDeploymentOwner` (runs before query validation) |
| `GET /github/repos` | **Self-scoped** — uses the caller's own decrypted token (`req.userId`), no object reference |
| `GET /auth/me`, `POST /auth/logout`, OAuth initiate/callback, `GET /health` | No object access — unchanged |
| `POST/GET /dev/*` | Dev-flag gated (Phase 0 fail-closed fix), unchanged |

No other route addresses a project/deployment/log by ID. `grep` for `req.params`
across controllers confirms no hidden ID paths.

## 4. Enforcement implementation

New file: **`apps/backend/src/middleware/ownership.ts`**

- `requireProjectOwner` — project must exist, have non-null `owner_id`, and equal
  `req.userId`; otherwise `next(NotFoundError)`.
- `requireDeploymentOwner` — resolves `deployment → project.ownerId`; the same rule.
  Deployment and log IDs therefore cannot be used to reach across users (or into
  quarantined data).
- **No existence oracle:** foreign, orphan, and nonexistent IDs all produce the
  identical 404 envelope (`PROJECT_NOT_FOUND` / `DEPLOYMENT_NOT_FOUND`), asserted by
  test (§6).
- Missing `owner_id` is never treated as permission: `!ownerId → deny`.

Query layer: `projectsRepository.findAll` takes `ownerId` and applies
`{ status: { not: "DELETED" }, ownerId }` to both `findMany` and `count`.

Create path: `projectsController.create → projectsService.create(data, req.userId) →
repository` now persists `owner_id` (previously omitted — new projects would have
become orphans and been invisible to their own creator).

**Background jobs / internal calls** (deployment orchestrator, traefik routing,
port allocator, template services) intentionally carry **no** ownership checks: they
execute on behalf of an already-authorized request or a system trigger and address
records by internal ID. Adding checks there would risk breaking legitimate execution
(Step C.6) — and no HTTP path reaches them without passing a guard first.

## 5. Duplicate log route (SEC-10) — consolidation proof

- Before: `GET /:id/logs` existed **twice** — an unvalidated registration in
  `deployments.routes.ts` (mounted at `app.ts:60`, matched first) and the validated
  one in `logs.routes.ts` (`app.ts:61`, unreachable for that URL).
- After: only the validated route remains; the dead duplicates of
  `GET /projects/:id/deployments` and `POST /projects/:id/deploy` in `logs.routes.ts`
  (unreachable — `/api/v1/projects` mounts earlier) were removed with their unused
  imports.
- **Proof the validated handler now serves:** integration assertion
  `meta.pagination` present (validated response shape) — PASS. Auth: 401 without
  token. Input validation: `step=NOT_A_STEP`/`limit=9999`/`limit=abc` → 400.
- `deploymentsController.getLogs` became unreferenced; the file is a preserved
  user-work file, so it was left untouched (cleanup candidate, `PULSE-09` §8).

## 6. Regression evidence (isolated fixtures, scratch DB)

`tests/repro-idor.mjs` — rewritten from reproduction script to regression test.
Fixtures: `pulse-fx-victim`, `pulse-fx-attacker`, victim/attacker/orphan projects,
1 deployment + 4 logs — all inside the guarded scratch DB (`ryme_phase01_test`),
created and dropped per run; live DB never written.

**Result: 44/44 assertions PASS, exit 0** (run via `pnpm test:integration`), covering:

1. **List scoping** — attacker's list excludes victim + orphan; victim's list excludes
   attacker + orphan; both see their own; anonymous → 401.
2. **Detail** — attacker → 404 on victim project, body contains no `repositoryUrl`;
   nonexistent UUID → 404 with *identical* error code (no oracle); orphan → 404 for
   authenticated users, `orphan.git` never exposed; owner → 200 with own URL.
3. **Nested deployments** — list/detail by attacker → 404; orphan's deployments → 404;
   nonexistent deployment → identical 404 code; owner → 200.
4. **Logs** — attacker → 404, log content absent from body; owner → 200 with all 4
   rows; anonymous → 401.
5. **Mutations** — attacker's `stop`/`PUT`/`DELETE`/`deploy`/`framework` all → 404;
   victim's deployment still `RUNNING` and project still `ACTIVE`/`main` afterwards;
   owner's `PUT` on own project → 200 (legit write intact).
6. **Quarantine integrity** — orphan `owner_id` still `NULL`, status `ACTIVE`.

Companion suite `tests/test-api-regressions.mjs` (22/22 PASS) additionally proves
owner access to `GET /projects/:id/deployments` + `GET /deployments/:id` against an
aligned schema and unchanged 401 behavior.

**Live probe after enforcement:** `tests/probe-drift.mjs` → 5/5 `200`, exit 0
(the single user owns both real projects; the 5 orphans are simply no longer
returned).

## 7. Residual risks / recorded follow-ups (out of Phase 0.1 scope)

- **Global project-name uniqueness** (`name @unique`) lets a 409 response reveal that
  *some* user owns a name. Fixing properly = composite `@@unique([name, ownerId])`
  (data migration → Phase 2.1).
- **Deployed apps of quarantined projects remain reachable by hostname on localhost**
  (`stress-test-*.localhost` through Traefik). API-level quarantine ≠ app-level;
  a Traefik `forwardAuth` hook is a later hardening item.
- **No admin recovery UI** for orphans — recovery today = deliberate DBA action.
- **12 `ryme-test-app` deployments show `status = RUNNING` with no live container**
  (pre-existing data-hygiene issue; observed while mapping containers, not touched).
- Frontend now receives a shorter project list (orphans hidden) — no code change was
  needed; hiding data server-side is the point.
