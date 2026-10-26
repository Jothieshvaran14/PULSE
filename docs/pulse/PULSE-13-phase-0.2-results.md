# PULSE-13 — Phase 0.2 Results: CI Verification and Safe WIP Reconciliation

**Date:** 2026-10-26
**Repository:** https://github.com/Jothieshvaran14/PULSE (branch `main`, **private** — verified via API this phase)
**Phase baseline:** `a31ce44` → **Phase head:** `7c85ff1` (4 commits pushed fast-forward, no history rewrite, no force-push)
**Product:** PULSE — API & Data Reliability Intelligence. *Trust Every Flow.*

---

## 1. GitHub Actions status (runner results, reported separately from local)

| Run ID | Commit | Result | Duration | Notes |
|---|---|---|---|---|
| `40265850774` | `a31ce44` (baseline) | **FAILURE** | 1m14s | Real reproducible workflow defect — see §1.1 |
| `40268341782` | `a7297cb` | **SUCCESS** | 1m7s | First run with the fix |
| `40268838473` | `ed58e81` | **SUCCESS** | 1m7s | |
| `40269624867` | `7c85ff1` | **SUCCESS** | 1m5s | headSha verified = `7c85ff1162c30457c84f700015bf6c3099829c7a` |

Workflow: `CI` (`.github/workflows/ci.yml`), event `push` to `main`, runs on **GitHub-hosted `ubuntu-latest` runners**. Actions enabled (`"enabled":true,"allowed_actions":"all"`). Two jobs per run: `quality` (typecheck/lint/build/test, Docker-free) and `integration` (isolated ephemeral `postgres:16-alpine` service).

### 1.1 The one CI failure found and how it was fixed

- **Symptom:** integration job exit 1 — `Error: JWT_SECRET missing or too short for fixture signing` (`tests/helpers/fixtures.mjs` `signJwt()`).
- **Root cause:** the job sets `DATABASE_URL`, and `tests/helpers/test-db.mjs` loads the developer's untracked `.env` **only when `DATABASE_URL` is absent** — so on the runner (no `.env` at all) `JWT_SECRET`/`TOKEN_ENCRYPTION_KEY` were never supplied. The `quality` job passed because it copies `.env.example` → `.env`.
- **Reproduced locally with identical env shape** (env-only, `.env` hidden): exit 1, byte-identical error — confirming it was a workflow defect, not flaky or test-related.
- **Fix (`a7297cb`):** explicit **CI-only, deliberately non-sensitive** `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` values in the integration job env, documented in-file as test values (58 and 47 chars; both exceed the 32-char minimum). **No test was weakened and no failure was hidden** — the same suite that failed now passes unmodified.
- **Verified locally under CI-equivalent env before pushing:** `pnpm test:integration` exit 0, both suites `ALL ASSERTIONS PASSED`.

Workflow is otherwise unchanged: no production credentials, permissions `contents: read`, actions pinned to full commit SHAs.

---

## 2. WIP-file disposition and D8 status

### 2.1 Baseline preservation

- `origin/main` verified = `a31ce44` before any change.
- All 5 WIP files untouched at phase start; **never** deleted, reset, stashed, overwritten, or auto-restored.
- Local Git-history backup `C:\Users\jothi\Desktop\RYME-backups\ryme-git-pre-clean-history-20261026-090820\` verified present at phase start (and untouched: no `git reflog expire`, no `git gc`, no backup deletion this phase).

### 2.2 Per-file analysis and disposition

D8's WIP disposition required explicit authorization. I presented three options; the owner chose **"Split: commit 2, defer rollback"** (recorded decision, Phase 0.2).

| File | Diff | Purpose | Needed for the deployment-list 500s? | Disposition |
|---|---|---|---|---|
| `packages/db/prisma/schema.prisma` | +7 | 3 nullable rollback columns, self-FK, 2 `ROLLBACK` enum values — **exactly the additive DDL already applied to the live DB** in Phase 0.1 (owner-approved: backup + additive DDL; `prisma migrate diff` empty) | The 500s were *caused* by this drift; D8's DB-sync already fixed the DB side. Committing **changes no database** | ✅ **Committed** `c87f5a4` |
| `apps/backend/src/middleware/request-logger.ts` | +21 | SEC-21: redact `Authorization` header in access logs; 4xx→warn, 5xx→error | No — independent security fix | ✅ **Committed** `7c85ff1` (with new test) |
| `tests/test-api-regressions.mjs` | +35 | (added this phase) automated SEC-21 redaction assertions | — | ✅ **Committed** `7c85ff1` |
| `apps/backend/src/features/deployments/deployments.controller.ts` | +16 | `rollback()` handler | No | ⏸️ **Deferred, still uncommitted** |
| `apps/backend/src/features/deployments/deployments.service.ts` | +10 | `rollback()` → orchestrator | No | ⏸️ **Deferred, still uncommitted** |
| `apps/backend/src/services/deployment-orchestrator.ts` | +93 | Container stop/repoint/health-check rollback flow | No | ⏸️ **Deferred, still uncommitted** |

**Why the 3 rollback files were deferred (not discarded):** the rollback **route is not registered** — they are dead code today. Two known defects must be fixed before they land: (1) **order-of-operations flaw** — it stops/removes the current container *before* verifying the previous one is healthy, so a failed rollback leaves the service down; (2) it never writes `rolledBackFromId`/`rollbackReason`, so the schema fields stay unused. There is also zero test coverage, and ownership guards would need to be wired on the route.

**Working tree at phase end — exactly the 3 deferred files, nothing else:**
```
 M apps/backend/src/features/deployments/deployments.controller.ts
 M apps/backend/src/features/deployments/deployments.service.ts
 M apps/backend/src/services/deployment-orchestrator.ts
```

### 2.3 D8 status

- **DB-sync sub-decision:** ✅ **Approved and executed earlier** (Phase 0.1, owner: "backup + additive DDL"). Backup `RYME-backups\ryme_pre_d8_2026-10-26.dump` (45 TOC entries); `prisma migrate diff` empty; probe 5/5 `200` (was 2×500); row counts unchanged (55 deployments / 2359 logs).
- **WIP disposition:** ✅ **Approved this phase** — split (commit schema + redaction; defer rollback). No DB change was required by this decision.
- **Still open under D8:** rollback-route wiring (ownership guard, verify-before-stop ordering, `rolledBackFromId`/`rollbackReason` population, tests) → deferred to a dedicated task. Residual: no Prisma migration baseline yet (Phase 2 item).

---

## 3. Security status — re-verified against actual code, not the prior report

### Fixed / verified this phase
| Area | Evidence (actual code) | Tests |
|---|---|---|
| **Project ownership & IDOR, incl. orphans** | `projects.routes.ts`: `requireProjectOwner` on 6 routes (L26/45/53/60/66 + GET); `deployments.routes.ts`: `requireDeploymentOwner` on both routes (L14/24); `projects.repository.ts` `ownerFilter = { status: { not: "DELETED" }, ownerId }` — excludes quarantined orphans (`owner_id IS NULL`) on both list and detail | `repro-idor` **37 PASS** |
| **Malformed JSON → correct status** | `error-handler.ts` handles `SyntaxError`/`entity.parse.failed` → 400; oversized body → 413, body never echoed | `test-api-regressions` #1/#2 PASS |
| **Duplicate / insufficiently validated log routes** | Single validated route serves `GET /deployments/:id/logs` (1 registration); `logs.routes.ts` uses `authenticate` + `requireDeploymentOwner` + `validate`; enum parity with Prisma (`step=INSTALL` accepted) | `test-api-regressions` #3 PASS, 24 assertions |
| **Deployment-list 500s (schema drift)** | Schema ↔ live DB aligned; endpoints succeed against an aligned DB | `test-api-regressions` #4 PASS |
| **Request-log JWT leakage (SEC-21)** | `request-logger.ts` serializes `Authorization` as `[REDACTED]` | **New** `[5] Request-log redaction` asserts marker present **and** raw JWT absent. **Control run with stock pino-http serializers proved the token would otherwise leak** (`DEFAULT_SERIALIZER_LEAKS_TOKEN: true`) — the assertion is meaningful |
| **Traefik route integrity** | `traefik-routing.service.ts` uses `parseDocument` from `yaml` (safe parser, no truncation) | Traefik round-trip **28/28**, 34 PASS lines in `pnpm test` |
| **`ryme_dev_password` placeholder (SEC-23, §5 of brief)** | `.env.example` (DATABASE_URL + POSTGRES_PASSWORD) and `docker-compose.yml` fallback now use `change_me_local_dev_password` with a "local-only placeholder, NOT a credential" comment. `setup.sh` copies `.env.example`, so setup stays consistent. **Local `.env`, running containers, and the live DB are untouched.** SEC-23 register row updated (`ed58e81`) | Grep confirms no `ryme_dev_password` remains in any config file |

**Historical-record refs intentionally left (dated audit rows, not live config):** `PULSE-01:106`, `PULSE-05:12`, `PULSE-07:24` — these are dated audit/decision records of what existed at audit time.

### Still open (not in scope to fix this phase)
| ID | Issue | Blocker / next step |
|---|---|---|
| SEC-23 | Postgres published on host `5432` | Bind to `127.0.0.1` — needs your approval (compose change) |
| SEC-24 | Traefik dashboard exposed insecurely on `:8080` (`insecure: true`) | Bind to localhost / disable in non-dev — needs approval |
| forwardAuth | Traefik-level authentication for the dashboard/API path | Requires D6 routing decision |
| name oracle | Deployment/project name existence leak via error responses | Minor (S3); schedule in Phase 1 |
| SEC-03 | `tests/generate-test-token.mjs` hardcoded `dev-secret` fallback | Make `JWT_SECRET` required (fail hard) — Phase 1 |
| SEC-06/13/14 | Container resource limits, memory/PID caps, egress policy | Infra change — Phase 1 approval |
| SEC-08 | SSRF defenses for URL-check engine | Scope approval at M2 planning |
| SEC-25/28 | No dependency-scan / license-check CI job | Add to `ci.yml` — Phase 1 |
| SEC-10 residue | Traefik `routes.yml` parse→generate historical erosion | Fix deferred to **D6** approval |
| SEC-21 residual | Pre-commit secret scanning (gitleaks) not yet added | Phase 1 |

### Blocked
None this phase. No test failures, no sensitive-data exposure, no unrelated work encountered.

---

## 4. Tests run — exit statuses and evidence

**Local results** (Windows dev machine — reported separately from §1 runner results):

| Command | Exit | Evidence |
|---|---|---|
| `pnpm typecheck` | **0** | run twice (pre-commit + pre-push sweep), both 0 |
| `pnpm lint` | **0** | idem |
| `pnpm build` | **0** | idem |
| `pnpm test` | **0** | `5/5 scenarios passed`; `ALL ASSERTIONS PASSED`; 34 PASS lines (Traefik 28/28 + e2e) |
| `pnpm test:integration` | **0** | two suites, both `ALL ASSERTIONS PASSED`; segment 0: **24 PASS** (was 22, +2 redaction), segment 1: **37 PASS**; scratch DB `ryme_phase01_test` prepared and dropped each run — live DB untouched |
| `repro-idor` | **0** | 37 PASS |

**Runner results** (GitHub-hosted): 3 of 4 runs green; the single failure was the reproduced-and-fixed `JWT_SECRET` env gap (§1.1), not a test regression.

**Control experiment** (evidence the new test is not vacuous): stock `pino-http` serializers with an `Authorization: Bearer CONTROL_TOKEN_SHOULD_LEAK` header → `DEFAULT_SERIALIZER_LEAKS_TOKEN: true`. Our redacted logger passes the assertion where stock would fail.

---

## 5. Files changed and commit hashes (pushed)

All pushed fast-forward to `origin/main`; each push verified via `git ls-remote` + a green CI run:

| Commit | Message | Files |
|---|---|---|
| `a7297cb` | `ci: provide ci-only signing values to the integration job` | `.github/workflows/ci.yml` |
| `ed58e81` | `chore(config): use a non-sensitive placeholder in the local env template` | `.env.example`, `docker/docker-compose.yml`, `docs/pulse/PULSE-03-security-risk-assessment.md` |
| `c87f5a4` | `chore(db): track the additive rollback schema already on the live database` | `packages/db/prisma/schema.prisma` |
| `7c85ff1` | `fix(security): redact authorization headers from request logs` | `apps/backend/src/middleware/request-logger.ts`, `tests/test-api-regressions.mjs` |

**Pre-push hygiene (applied to every push):** full 5-command sweep all exit 0 → secret/PII/path scan of the exact diff clean (tokens, private keys, JWTs, personal emails, `C:\Users\...` paths, `ryme_dev_password`) → only intended files staged → Conventional Commit → push → remote SHA + CI run verified. No history rewrite, no force-push, visibility unchanged (re-verified `private` this phase).

---

## 6. Remaining approval requests

Still **open** (recommendation only — nothing actioned without your word):

| ID | Decision | Recommendation |
|---|---|---|
| **D2** | Terminology map (Project→Service, Deployment→Check/Pipeline Run, …) | Approve early — API fields settle late = breaking changes |
| **D3** | T3 identifier renames as atomic commits (`@ryme/*`→`@pulse/*`, Docker labels, lockfile) | Approve in Phase 1 Wave C |
| **D3a** | DB name/user defaults | Keep until Phase 2 (live DB has real data) |
| **D4** | Auth: finish GitHub OAuth UI vs PAT-only | OAuth primary; PAT behind explicit dev flag |
| **D5** | Frontend wiring to `@pulse/shared` types | Wire it (compile-time contract drift detection) |
| **D9** | Execution sandbox strength | Defer to Phase 4 with evidence; keep container-only rule |
| **D10** | Legacy RYME tables during transition | Keep through Phase 0–2; remove after MVP cutover |
| **D11** | Removal list (`PULSE-00` §3) | Approve code-only items in Phase 1 |
| **D12** | MVP scope ("Contract check + evidence") | Confirm |
| **D8 (residual)** | Rollback-route wiring task | Approve as a dedicated task (fix verify-before-stop ordering, wire ownership, populate rollback fields, add tests) |

**New approvals created this phase:** SEC-23 localhost bind; SEC-24 dashboard exposure; gitleaks pre-commit job; dependency/license CI job (SEC-25/28).

---

## 7. Recommended next phase

**Phase 1 — Rebrand execution (Wave A/B/C),** specifically:
1. **Wave A/B** — terminology map (D2) and code-level renames (D3) as atomic, individually gated commits.
2. **Deferred rollback task (D8 residual)** — wire the route behind `authenticate` + `requireDeploymentOwner`, fix the stop-before-verify ordering flaw, populate `rolledBackFromId`/`rollbackReason`, add happy-path/failure/ownership tests. This would clear the final 3 files from the working tree.
3. **Quick security wins** — SEC-23 localhost bind, SEC-24 dashboard, gitleaks + dependency-scan CI jobs.

This phase is complete. **Stopping here and awaiting your review** — no rebrand or feature work started.
