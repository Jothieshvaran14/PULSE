# PULSE-14 — Phase 1 Plan: Controlled Rebrand and Engineering Hardening

**Date:** 2026-10-26 · **Baseline commit:** `c760100` · **Branch:** `main` (private)
**Companion documents:** `PULSE-15-rebrand-migration-map.md` (inventory + mappings) · `PULSE-16-phase-1-results.md` (outcomes)

---

## 1. Baseline record (verified before any change)

| Check | Result |
|---|---|
| `origin/main` | `c760100324d8c0f98b783fab5f2757697dc3f541` — matches expected baseline ✅ |
| Working tree | exactly the 3 deferred rollback files modified, nothing else ✅ |
| Repo visibility | `private: true` (GitHub API) ✅ |
| Git-history backup | `RYME-backups\ryme-git-pre-clean-history-20261026-090820\` present ✅ (untouched this phase) |
| Remote history | 7 commits, linear, no rewrite/force-push at any point ✅ |
| Baseline checks | `typecheck`/`lint`/`build`/`test`/`test:integration` — **all exit 0** ✅ |
| Last CI run | `40269781178` on `c760100` — success ✅ |
| Docker stack | running: `ryme-postgres`, `ryme-traefik`, 6 × `ryme-deploy-*` (recorded, not touched by rebrand) |

Legacy-identity inventory (read-only, this phase): **303 matches of `ryme` in 97 tracked files** (case-insensitive). Full classification in `PULSE-15`.

---

## 2. Decision resolution (each decision, options, recommendation, approval status)

Approval status legend: ✅ approved this phase (recorded prompt) · ⏳ recommendation only, **not** treated as approved.

### D2 — Terminology map (blocks Wave B copy)
- **Exact decision:** adopt Project→**Service**, Deployment→**Check/Pipeline Run**, deployment log→**Run event**, framework detection→**Artifact detection**, deploy→**Run check** as user-facing vocabulary.
- **Options:** (1) approve as proposed; (2) approve with amendments; (3) defer.
- **Consequences:** copy/UI wording only — **no API route, field, or table rename is implied**, so no compatibility break. Approving settles wording now; later tweaks are non-breaking.
- **Recommendation:** approve as proposed. **Implementation without approval? No** — Wave B copy would risk being re-done.
- **Status: ✅ APPROVED this phase** ("Approve map as proposed").

### D3 — Internal identifier renames (Wave C)
- **Exact decision:** which runtime identifier groups may be renamed in Phase 1.
- **Options:** (1) all groups (packages, imports, token key, Docker labels/prefix/network/container names, image prefix); (2) code-only groups now, Docker groups deferred; (3) defer all.
- **Consequences:** option 1 needs compose recreate + env updates for running containers; option 2 delivers package/import/token renames with zero Docker state disruption but leaves a mixed old/new identifier period for Docker labels; option 3 leaves everything legacy.
- **Recommendation:** all groups in atomic gated commits (original `PULSE-05` recommendation).
- **Status: ✅ APPROVED (subset)** — *"Approve code-only groups, defer Docker renames."*
  - **Approved now:** package names (`ryme`→`pulse`, `@ryme/*`→`@pulse/*`) + `--filter` strings + lockfile + import specifiers (I1/I2/I11, one atomic commit), `ryme_auth_token`→`pulse_auth_token` (I3; existing sessions re-login), logger service name `ryme-backend`→`pulse-backend` (code-only, no log pipeline exists).
  - **Deferred by owner:** Docker labels (I4), container name prefix (I5), Docker network (I6), infra container names (I7), image prefix (I9) — all require running-container/compose coordination in a later phase.
- **Implementation without approval? No** — answered above; only the approved subset executes.

### D3a — Database name/user defaults (`ryme` / password)
- **Options:** rename now (live data migration) vs keep until Phase 2.
- **Recommendation:** keep (live DB holds 55 deployments / 2359 logs; rename needs a documented migration).
- **Status: ⏳ recommendation stands as "keep"** — *no approval required to proceed*, because "keep" is the no-action default; it is **not** recorded as a decision. Renaming stays blocked.
- **Implementation without approval?** Keeping requires no implementation.

### D4 — Auth flow (GitHub OAuth UI vs PAT-only)
- **Options:** finish OAuth UI as primary (PAT behind explicit dev flag) vs stay PAT-only.
- **Recommendation:** OAuth primary; `ENABLE_DEV_LOGIN` fail-closed already shipped (SEC-02 half done).
- **Status: ⏳ open** — not asked this phase: it is feature work, not required by any Phase 1 wave, security quick win, or deliverable.
- **Implementation without approval? No** — OAuth UI will not be built in Phase 1.

### D5 — Frontend wiring to `@pulse/shared` types
- **Options:** wire (single source of truth) vs keep duplicated types.
- **Recommendation:** wire (compile-time drift detection).
- **Status: ⏳ open** — not asked: medium-effort refactor orthogonal to the approved rebrand scope; deferred with the rest of Phase 2 API work.
- **Implementation without approval? No** — not executed this phase.

### D8-residual — Rollback wiring (3 deferred files)
- **Exact decision:** whether to implement the rollback route (ownership, state validation, ordering fix, persistence, tests) in Phase 1.
- **Options:** (1) plan only this phase, implement next; (2) implement fully now; (3) drop the feature.
- **Recommendation:** plan only — keeps Phase 1 focused; the feature deserves its own reviewed unit.
- **Status: ✅ APPROVED** — *"Plan only this phase, implement next."* Files stay intact and uncommitted.
- **Implementation without approval? No.** Full implementation plan in §4; implementation is a future phase.

### D9 — Execution sandbox strength
- **Options:** Docker-only now vs gVisor/Firecracker/remote runner.
- **Recommendation:** defer to Phase 4 with evidence; keep the container-only rule now.
- **Status: ⏳ open** — not asked: no Phase 1 step depends on it (no user-derived code execution exists yet).
- **Implementation without approval?** No implementation needed to proceed.

### D10 — Legacy `projects/deployments/deployment_logs` tables
- **Options:** keep through Phase 0–2 vs remove immediately.
- **Recommendation:** keep (irreversible data loss otherwise; every repository query depends on them).
- **Status: ⏳ open** — not asked: "keep" is the current state; no action required to proceed safely.
- **Implementation without approval?** Removing is what needs approval — and will not happen.

### D11 — Removal list (dead modules: `dockerfile-generator`, `port-allocator`+`Port`, Swarm/K8s stubs, duplicate `docker.service`, `hosts-manager`, `docker/templates/*`, `useRepos.ts`)
- **Options:** approve per item (code-only vs DB model) vs defer.
- **Recommendation:** approve code-only items in Phase 1; `Port` DB model only alongside D10.
- **Status: ⏳ open** — *not* asked: cleanup is not required by any other Phase 1 requirement, and removals deserve an itemized per-file approval. Their legacy references are retained and documented in `PULSE-15`.
- **Implementation without approval? No** — no file on the removal list is touched this phase.

### D12 — MVP scope confirmation
- **Options:** confirm "Contract check + evidence" vs re-scope.
- **Recommendation:** confirm.
- **Status: ⏳ open** — not asked: affects Phase 2 planning only; nothing in Phase 1 depends on it.
- **Implementation without approval?** Nothing to implement (planning input).

### SEC-23 — Postgres published on host `5432`
- **Options:** bind to `127.0.0.1` vs leave all-interfaces.
- **Recommendation:** loopback bind (dev DB must stay reachable from host tooling; loopback preserves that).
- **Status: ✅ APPROVED** — *"Both"* (with SEC-24). Implementation proceeds; local `.env` untouched; compose recreate documented.
- **Risk:** none beyond needing `docker compose up -d` to apply; host-local connections unaffected.

### SEC-24 — Traefik dashboard exposed insecurely
- **Options:** disable `api.insecure` (no unauthenticated dashboard listener) vs loopback-only vs leave.
- **Recommendation:** disable `insecure` — the running container has **no host 8080 mapping at all** (verified this phase: `docker port ryme-traefik` → only 80/443), so the residual exposure is container-network-internal; disabling `insecure` removes even that.
- **Status: ✅ APPROVED** — *"Both."*
- **Consequence handled:** `scripts/repair-traefik-routes.mjs` verified via the insecure API *inside* the container; its verification step gets an explicit guidance message for the post-change state (see §5).

**Not treated as approved anywhere:** D4, D5, D9, D10, D11, D12, D3a, D7 (external identity — remains ⛔ not authorized), gitleaks/dependency-scan CI jobs (new proposals from `PULSE-13`, not requested this phase).

---

## 3. Wave plan (scope locked to approvals)

Inventory and per-reference classification: `PULSE-15-rebrand-migration-map.md`. Rule: **no blind search-and-replace**; every reference is classified before touching it.

### Wave A — cosmetic (T1; gate D1 already approved)
Comments, headers, log prefixes, test/postman titles, generated-Dockerfile template header, outgoing `User-Agent` strings. Files: `.env.example` (header only), `.gitignore`, `scripts/setup.sh` (header/log-prefix/banner only), `scripts/reset-db.sh`, `apps/backend/src/lib/errors.ts`, `git.service.ts`, `auth.service.ts` + `github.controller.ts` (UA header), `tests/generate-test-token.mjs` (titles only — the SEC-03 secret fix is a **separate** commit), `tests/verify-db.mjs` (titles only; the `Database 'ryme'` hint stays — D3a), `tests/test-api.ps1` (titles + `$env:TEMP\ryme_*`→`pulse_*`, write+cleanup patterns move together), `tests/test-dev-login.ps1`, `tests/postman_*.json`, `docker/traefik/traefik.yml` (header comment only), `docker/docker-compose.yml` (prose comments only), 24 × `templates/*/Dockerfile.hbs` header line.
**Not in Wave A:** any `@ryme/*` package string (→ Wave C1), any real Docker object name (→ deferred), historical `docs/pulse/*` records (→ retained).

### Wave B — user-facing identity + docs (gates D1 + D2 approved)
`apps/frontend/index.html` (title, description, favicon `/pulse.svg`) + new `apps/frontend/public/pulse.svg` asset (today the icon 404s — no `public/` dir), `Layout.tsx` wordmark, `LoginPage.tsx` (→ PULSE + tagline *Trust Every Flow.*), `DashboardPage.tsx` (→ "Overview of your reliability estate" per D2), `index.css` header comment (drop "Vercel-inspired"), `server.ts` startup banner, root `package.json` description, **README refresh** (stale claims corrected: CI *has* now run and is green; test counts 24/37/28; D8 split approved; Phase 1 row status), `docs/architecture.md` header banner (superseded by `PULSE-02`, retained as a design record — explains its retained legacy references).

### Wave C — code-only identifiers (D3 approved subset; one atomic commit per group)
- **C1 (I1+I2+I11):** package names `ryme`→`pulse`, `@ryme/*`→`@pulse/*` across 5 `package.json` files + all `--filter` strings (root scripts, `.github/workflows/ci.yml`) + 9 backend import specifiers + `test-dev-gate.mjs` comment; `pnpm install` to rewrite the lockfile. Gate: full 5-command sweep + CI.
- **C2 (I3):** `ryme_auth_token`→`pulse_auth_token` in `client.ts` + `AuthContext.tsx`, deduplicated into one exported constant. Migration: existing sessions invalidate (one re-login) — acceptable pre-release.
- **C3:** logger `service: "ryme-backend"`→`"pulse-backend"` (no log pipeline exists; verified).
- **Deferred (owner decision, D3):** Docker labels, `ryme-deploy-*` prefix, `ryme-network`, `ryme-postgres`/`ryme-traefik`, image prefix, `routes.yml` runtime names, stale `ryme-test-app.yml` deletion, scratch DB `ryme_phase01_test`. All documented in `PULSE-15` with their future migration steps.

### Security quick wins (separate commit(s), gates = approved SEC-23 + SEC-24 + existing SEC-03 recommendation)
1. **SEC-23:** compose `5432:5432` → `127.0.0.1:5432`.
2. **SEC-24:** `traefik.yml` `insecure: true`→`false` + repair-script verification guidance.
3. **SEC-03:** `generate-test-token.mjs` exits with an error if `JWT_SECRET` is unset (removes the literal fallback) — register's own Phase 1 recommendation; nothing imports the script (verified: only docs reference it).

No control or test is weakened; no new dependency is added.

### Commit/push discipline (per brief §6)
Per logical change: review diff → stage only intended files → relevant tests + `typecheck`/`lint`/`build`/`test`/`test:integration` → secret/personal-data/local-path scan of staged content → Conventional Commit → push only if all green → verify remote SHA + Actions run. Separate commits for rebrand / compatibility / security / rollback (rollback: none this phase). Stop on any failure, sensitive data, or unapproved dependency.

---

## 4. D8-residual — dedicated rollback implementation plan (plan only; not implemented)

**Status:** deferred files remain exactly as-is, uncommitted. Implementation begins only in its own reviewed unit.

1. **Authenticated ownership enforcement**
   Route `POST /api/v1/deployments/:id/rollback` registered in `deployments.routes.ts` behind `authenticate` + `requireDeploymentOwner` + `validate` (same chain as the existing detail route) — foreign/orphan/nonexistent ids all return the identical 404 (no existence oracle, per `PULSE-10`).
2. **Deployment-state validation and allowed transitions**
   Explicit state machine: rollback allowed only from `RUNNING` or `FAILED` → target must be a prior terminal-success `SUCCEEDED` deployment **of the same project**. Reject `PENDING`/`BUILDING`/`ROLLING_BACK` (409) and self-target. Orphaned `projectId` (null-owner) unreachable via ownership guard.
3. **Ordering and failure handling**
   Fix the current flaw (stop-then-hope): **(a)** inspect target container/image and confirm its config exists → **(b)** health-probe the *previous* container (or start it) and require healthy **before** → **(c)** stop/remove current → **(d)** repoint Traefik via the lossless `yaml` Document API → **(e)** verify routing + health; on any failure after (c), attempt restore of the original container and mark `FAILED` with reason. Every step logged; never leave zero healthy containers.
4. **Idempotency and concurrency**
   A deployment-scoped mutex (in-process lock keyed by deployment id) rejects concurrent rollbacks with 409; a rollback already performed to the same target returns the stored result (no double stop/restart). Re-rollback to the same `rolledBackFromId` is a no-op 200.
5. **`rolledBackFromId` + rollback-reason persistence**
   Write both fields (already in schema/live DB since D8 DB-sync): `rolledBackFromId` = id of the deployment rolled back *to*; `rollbackReason` = validated request body reason (required, max length via Zod). Status transition recorded atomically in one Prisma transaction with the audit row.
6. **Audit logging and secret redaction**
   Emit one structured audit event (actor id, deployment id, from/to, reason, outcome) through the existing Pino pipeline — inheriting the Phase 0.2 `Authorization: [REDACTED]` redaction; never log tokens, container env, or `.env` values. Regression assertion reuses the `childLog` probe pattern from `test-api-regressions [5]`.
7. **Tests**
   Unit: state-machine matrix (allowed/rejected transitions) + ordering logic (mocked health probes prove verify-never-stop). Integration: happy path (200, fields persisted, route repointed), ownership (401 no token; 404 for foreign/orphan/nonexistent), validation (400 missing/oversized reason), concurrency (409 double-fire), failure injection (target unhealthy → current container restored, status `FAILED`, reason set), idempotency (repeat call). Gate: full sweep + CI before push.

**Blocker to implementation:** owner's "plan only this phase" decision — implementation is explicitly deferred to the next unit of work.

---

## 5. Security quick-win evidence notes

- **SEC-23:** host port publish is the exposure (all interfaces). Loopback bind keeps `localhost:5432` working for Prisma, tests (CI uses its own service container — unaffected), and `docker exec ryme-postgres pg_isready` (unaffected).
- **SEC-24:** `docker port ryme-traefik` shows **no 8080 mapping** on the running container, so host exposure is already absent; residual risk = unauthenticated API reachable from other containers on `ryme-network`. `insecure: false` closes it. The repair script's in-container `wget localhost:8080` verification then reports a clear guidance message instead of a bare failure (script behavior documented in `PULSE-16`).
- **SEC-03:** literal `dev-secret-…` fallback removed; script fails closed with instructions. No test imports it (verified by `git grep`), so no gate depends on the fallback.

---

## 6. Deliverables

1. `docs/pulse/PULSE-14-phase-1-plan.md` — this document.
2. `docs/pulse/PULSE-15-rebrand-migration-map.md` — complete inventory + classification + mappings + retained-reference explanations.
3. `docs/pulse/PULSE-16-phase-1-results.md` — executed scope, tests, commits, CI, risks, next phase.
4. `docs/pulse/PULSE-07-decision-status.md` — updated with explicit approval status + evidence.

**Stop condition:** approved Phase 1 scope only; no visibility change; no broad feature development; await review.
