# PULSE — Security Remediation Plan

**Status:** Draft for approval · **Date:** 2026-10-26
Extends `PULSE-03-security-risk-assessment.md` with Phase 0 evidence. Evidence levels:
**[RUN]** executed · **[STATIC]** read from source · **[INFERRED]** unverified.

Priority: **P0** = fix before any multi-user/public exposure · **P1** = Phase 1 · **P2** = Phase 2+.

---

## 1. P0 — Dev authentication bypass (SEC-02) — **FIXED AND REGRESSION-TESTED**

**Finding (pre-fix) `[RUN]`:** the `/api/v1/dev` router was mounted unconditionally; gating lived
only inside the handler as `config.nodeEnv !== "development"`, and `config.nodeEnv` **defaults to
`"development"` when `NODE_ENV` is unset**. Pre-fix test run (`tests/test-dev-gate.mjs`, 1/5 pass):

| Scenario | Pre-fix result |
| --- | --- |
| `NODE_ENV` unset (misconfigured prod) | `POST /dev/login` → **400 (endpoint live = fail-open)**, `GET /dev/status` → 200 |
| `NODE_ENV=production` | login 404, but `/dev/status` still **200** |
| `NODE_ENV=development` without opt-in | login **400 (live)** |

**Fix applied (narrow, fail-closed):**
- `config/index.ts`: new `enableDevLogin` (`ENABLE_DEV_LOGIN === "true"`, default **false**).
- `dev.controller.ts`: exported `isDevLoginEnabled()` = `nodeEnv === "development" && enableDevLogin`.
- `app.ts`: `/api/v1/dev` mounted **only** when `isDevLoginEnabled()` → both endpoints 404 otherwise.
- `.env.example` documents the flag (=false); local `.env` sets `=true` to preserve the dev workflow;
  `docs/DEV_AUTH.md` updated with the upgrade note.

**Regression test:** `node tests/test-dev-gate.mjs` — **5/5 post-fix (exit 0)**, covering:
production, production+flag-forced (still disabled), NODE_ENV-unset, development-without-flag, and
development+flag (enabled). Assertions use empty request bodies so no external calls are made.

**Residual risk:** `NODE_ENV` defaulting to `development` in `config/index.ts` remains a latent
foot-gun for *other* dev-only behavior — recommend changing the default to `production` (fail-closed
platform-wide) in Phase 1; out of scope here because it could alter unrelated runtime behavior.
`GET /dev/status` is information-disclosure-only when enabled; acceptable while gated.

---

## 2. P0 — Missing resource authorization / IDOR (SEC-01) — **REPRODUCED; FIX NEEDS APPROVAL**

**Evidence `[RUN]`** — `tests/repro-idor.mjs` (read-only; attacker JWT signed in-memory, never
printed; boots the real Express app against the real DB):

| Check | Result |
| --- | --- |
| Unauthenticated `GET /projects` | 401 ✅ |
| Attacker `GET /projects` | **200, total 6** — lists other users' projects |
| Attacker `GET /projects/:id` | **200, `repositoryUrl` exposed** |
| Attacker `GET /deployments/:id/logs` | **200, 69 victim log entries** |

Exit 0 = vulnerability reproduced. Static trace confirms the gap spans all layers: routes use
`authenticate` only (`projects.routes.ts`, `deployments.routes.ts`); `req.userId` is consumed solely
by `/github/repos`, `/auth/me`, and import-owner stamping; `projects.repository.findAll` has **no
owner filter**; `create()` never sets `ownerId`; `deployments.repository.findById/findLogs` never
verify ownership. Writes/deletes/stop/deploy triggers share the same code path shape → same gap
( `[STATIC]`, not separately executed).

**Proposed fix (design — NOT implemented, approval required):**
1. Repository-layer ownership scoping: every project query takes `ownerId`; `findById`/`update`/
   `delete` become `findFirst({ where: { id, ownerId } })` → **404 on non-owned** (no existence
   leak); deployments resolve ownership **through `project.ownerId`**.
2. Deny-by-default helper `assertOwned(resource, userId)` used by controller/service; missing
   `ownerId` in the JWT context → 403.
3. `create()` and `importFromGithub` stamp `ownerId = req.userId`.

**Why approval is needed (prerequisite):** the live DB has **5 of 7 projects with
`owner_id = NULL`** `[RUN]`. A naive `ownerId = req.userId` filter makes those 5 projects
**invisible and unmanageable to everyone** — a functional regression and potential data orphaning.
Options: (a) backfill all null-owner rows to the sole existing user (1 user in DB, low risk, but a
data write), (b) treat null-owner as readable-by-all until migrated (weaker), or (c) migrate after
the D13 tenancy decision. **Recommendation: (a) with a documented one-time SQL backfill, executed
only with explicit approval; sequence after D13 so the scoping column (`ownerId` vs `tenant_id`) is
chosen once.**

**Regression tests to add with the fix:** attacker JWT (a) list excludes victim projects, (b) detail
→ 404, (c) logs → 404, (d) `PUT/DELETE /projects/:id` → 404, (e) `POST /:id/stop` → 404,
(f) owner still sees/edits own resources, (g) unowned row behavior matches the chosen backfill
policy. `tests/repro-idor.mjs` inverts to asserting **denial** (exit 1 today, exit 0 after fix).

**Residual risk until fixed:** any authenticated user can read **and mutate** all projects,
deployments, and logs. Dev-auth (§1) currently gates who can authenticate locally, but the OAuth
path is live → treat as blocking for multi-user use.

---

## 3. P1 — Confirmed vs unverified security concerns

### 3.1 Confirmed this phase `[RUN]`/`[STATIC]`

| ID | Finding | Evidence | Fix | Test | Residual |
| --- | --- | --- | --- | --- | --- |
| **Traefik route corruption** (SEC-32) | `parseRoutesYaml` drops the **last router** at EOF, never parses `entryPoints` list items, and erodes routers each round-trip → user routes silently vanish | `tests/repro-traefik-roundtrip.mjs` **exit 0**; live `routes.yml`: 6 services / 1 non-dashboard router | Rewrite parser as real YAML load/dump (or drop the file provider — D6); regenerate the live file | Golden-file round-trip test (parse→generate→parse must be lossless) + compose config validation | Live file already corrupted; corrupted routes persist until regenerated. **Fix deferred to D6 approval** |
| **Malformed JSON → 500** | body-parser `SyntaxError` reaches the error handler unmapped → `INTERNAL_SERVER_ERROR` instead of 400 | Server log `[RUN]`: `SyntaxError: Expected property name or '}' … json.js:92` | Map `err.type === 'entity.parse.failed'` → 400 `VALIDATION_ERROR` in `error-handler.ts` | Request with `{bad json` → 400 (not 500) | Client sees 500; log noise; low exploitability (DoS-shaped only) |
| **Duplicate unvalidated log route** (SEC-10) | `GET /deployments/:id/logs` registered twice (`deployments.routes.ts` wins over validated `logs.routes.ts`); shared enum drifts from Prisma | `[STATIC]` both route files | Delete the duplicate; align `deploymentLogQuerySchema` with Prisma enums | Assert invalid `limit` → 400 and valid `step=INSTALL` accepted | Invalid filters currently reach the DB layer unchecked |
| **Schema drift → runtime 500** | Prisma client selects `deployments.rolled_back_from_id`, absent from live DB | `[RUN]`: `GET /projects/:id/deployments` → 500, `PrismaClientKnownRequestError` | **D8 decision** → `db push` (additive) or revert schema; then baseline migration procedure in `PULSE-06` §4 | e2e covering deployment list/detail | Deployment-list endpoints broken **now**; any accidental destructive migration risks the 55/2359 rows |
| **Lint gate** (SEC-26) | Was 1 error | `[RUN]` | Fixed (`DeploymentDetailPage.tsx`); 2 warnings accepted with rationale (`PULSE-06` §4) | `pnpm lint` exit 0 | Warnings remain until D11/D4-driven refactors |
| **Hardcoded secret fallback** (SEC-03 source list) | `tests/generate-test-token.mjs` falls back to a literal `dev-secret…` | `[STATIC]` | Require `JWT_SECRET` — exit with error if unset (Phase 1) | Test fails when env missing | Only dangerous if a real environment lacks `JWT_SECRET` (config Zod makes this unlikely server-side) |

### 3.2 Unverified / static-only (no claim of pass or fail)

CORS reflects **any origin with credentials** (`middleware/cors.ts`) and **CSP is disabled**
(`app.ts` uses helmet without `contentSecurityPolicy`) — `[STATIC]`, plausible S2 but not
runtime-confirmed → **verify with an `Origin` probe test before fixing**; fix = restrict to
`FRONTEND_URL` + enable CSP. **No rate limiting** anywhere (SEC-03) `[STATIC]`. **Container CPU/
memory/PID limits absent** (SEC-13) and **no egress control** (SEC-14) `[STATIC]` — verify with
`docker inspect` on a running `ryme-deploy-*` container when the daemon is stable. **Dependency
scanning absent**: no CI, no `pnpm audit` job, no license check (SEC-25/28) `[RUN]` (absence).
**Secrets hygiene:** pattern scan found no credentials in tracked files or history `[RUN]` (per
`PULSE-03` §1); `.env` remains local/untracked and no secret values were printed in any Phase 0
artifact. Postgres on host `:5432` with default password and Traefik dashboard on `:8080`
`[STATIC]` — dev-only exposure, bind to localhost in Phase 1.

---

## 4. Prioritized action list

| # | Priority | Action | Needs approval? |
| --- | --- | --- | --- |
| 1 | **P0** | ~~Dev-auth fail-closed~~ — **done**, 5/5 regression | Done (Phase 0 brief) |
| 2 | **P0** | Ownership/tenant scoping per §2, **including null-owner backfill policy** | **Yes — D13 + backfill (a)** |
| 3 | **P0** | Resolve schema drift (D8) so deployment endpoints stop 500ing | **Yes — D8** |
| 4 | **P1** | Traefik parser rewrite or file-provider removal + regenerate `routes.yml` | **Yes — D6** |
| 5 | **P1** | Map malformed JSON → 400; remove duplicate log route; schema-enum parity | No (narrow, test-covered) |
| 6 | **P1** | CORS allowlist + CSP; rate limits; localhost-bind Postgres/Traefik dashboard | No, but CSP/CORS need runtime verification first |
| 7 | **P1** | CI gate (typecheck/lint/test) + `pnpm audit`/license/secret scanning | No (repo-internal only; no publish) |
| 8 | **P2** | Container resource limits + egress policy; backup/runbook; token-key validation (SEC-06) | Partly (infra behavior) |
| 9 | **P2** | SSRF defenses for the URL-check engine **before** M2 ships (SEC-08) | Scope approval at M2 planning |

**Not authorized this phase (and not done):** repository publication/visibility changes, remote or
history modification, secret values in docs/tests, weakened auth to ease testing.
