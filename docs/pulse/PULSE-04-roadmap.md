# PULSE — Phased Implementation Roadmap

**Status:** Draft for approval · **Date:** 2026-10-26

## Evidence vocabulary (used in every acceptance criterion)

| Label | Meaning |
| --- | --- |
| **Implemented** | Code exists and is statically readable |
| **Tested** | An automated check executed and passed; command + result recorded |
| **Partially verified** | Some checks pass; others unrun or failing |
| **Unverified** | Not executed (missing Docker/DB/CI or not attempted) |
| **Known failing** | Executed and failed; result recorded |

Baseline gates measured on 2026-10-26 `[RUN]`: `pnpm typecheck` **PASS** · `pnpm build` **PASS** ·
`test-e2e.mjs` (with `--env-file`) **PASS** · `pnpm lint` **FAIL** (1 error, 2 warnings) ·
Docker-dependent flows **Unverified** (daemon down).

---

## Phase 0 — Stabilize the baseline (before any PULSE feature work)

**Goal:** make the existing checks trustworthy gates and freeze current work safely.

| # | Work item | Acceptance criteria |
| --- | --- | --- |
| 0.1 | Record/preserve the 5 uncommitted files (rollback + log redaction) | Decision D8 answered; work either committed or stashed with a note; `git status` clean or explicitly documented |
| 0.2 | Fix the failing lint error | `pnpm lint` exits 0 (currently exit 1); the 2 remaining warnings fixed or explicitly accepted with a written reason |
| 0.3 | Wire the existing test into a script | Root/`backend` `test` script runs `test-e2e.mjs` with env loading; `pnpm test` exits 0 on a clean checkout with `.env` present |
| 0.4 | Commit a baseline Prisma migration | `prisma migrate deploy` succeeds against an empty database; `prisma migrate status` reports "no pending migrations" |
| 0.5 | Reproduce or refute the Traefik route-corruption defect (V5) | With Docker running: two consecutive deploys preserve all routers; if corruption reproduces, defect confirmed in writing with captured `routes.yml` diff |
| 0.6 | Evidence appendix for runtime flows | `tests/test-api.ps1` executed against a locally started stack with PASS/FAIL output recorded; failures logged as known issues |

**Exit criteria:** all four gates (`typecheck`, `build`, `lint`, `test`) green; baseline migration
committed; runtime behavior no longer "Unverified" for the API smoke path.

---

## Phase 1 — Rebrand + public readiness + core hardening

**Goal:** the repository reads as PULSE everywhere, passes a public-source checklist, and closes
the S1/S2 security gaps that don't depend on new product features.

| # | Work item | Acceptance criteria |
| --- | --- | --- |
| 1.1 | Branding Wave A (T1 cosmetic) per rebrand audit | `Select-String 'ryme'` over tracked files returns matches only in approved T3/T4 locations, listed in the audit |
| 1.2 | Branding Wave B (T2 user-visible) + favicon asset | `index.html` title/description/meta show PULSE; `/pulse.svg` exists and loads (no 404); Layout/Login/Dashboard copy matches approved terminology (D2) |
| 1.3 | Branding Wave C (T3 identifiers: package names, storage key, labels, network, image prefix) — atomic commits | `pnpm typecheck` + `pnpm build` + `pnpm test` PASS after each commit; compose files recreated successfully; rename table I1–I11 marked done in the audit |
| 1.4 | Authorization scoping (SEC-01) | Automated test proves user B cannot read/update/delete user A's project or trigger its runs; every repository query carries owner/tenant filter |
| 1.5 | Dev auth bypass removal or flag-gating (SEC-02) | In `NODE_ENV=production`, `POST /dev/login` returns 404 (test); docs no longer instruct enabling it publicly |
| 1.6 | Rate limiting (SEC-03) + CORS/CSP hardening (SEC-11) | Login and trigger endpoints return 429 under scripted abuse; CORS rejects unknown origins (test); security headers asserted in a test |
| 1.7 | Validation gaps (SEC-10, SEC-12) | Duplicate log route removed; `?step=INSTALL` accepted; schema/Prisma enum parity test passes |
| 1.8 | CI pipeline (SEC-25/26/28) | PR gate runs: typecheck, lint, unit tests, `pnpm audit`, secret scan (gitleaks); required-check status visible in repo |
| 1.9 | Public repo hygiene | `LICENSE` (per D7), `SECURITY.md`, `CONTRIBUTING.md`, root `.dockerignore`, `.env.example` placeholders verified, tracked stale runtime files removed (`ryme-test-app.yml`, `routes.yml`) |
| 1.10 | Unit-test floor for existing defenses | Tests for: git URL matrix, Zod schemas, auth middleware, error envelope, crypto round-trip (incl. non-hex key rejection) — all passing in CI |

**Exit criteria:** `pnpm lint` PASS · CI green on a PR · SEC-01/02/03/06/10/11/12 remediated with
tests · branding waves A–C complete · public-hygiene checklist signed off.

---

## Phase 2 — PULSE MVP: "Contract check + evidence"

**Goal:** the smallest coherent PULSE release (§10 of `PULSE-02-target-architecture.md`).

Scope: M1 (OpenAPI ingest + response validation) + M2 (single HTTP check with latency/error
metrics) + M6 (run events/artifacts) + M9 (queue/worker) + M10 (health/metrics).

| # | Work item | Acceptance criteria |
| --- | --- | --- |
| 2.1 | Baseline PULSE schema (new tables; legacy tables untouched per ADR-006) | Forward migration + rollback tested on empty DB; legacy `projects/deployments` data still readable |
| 2.2 | Job queue + worker (M9) | Test: enqueue → claim → run → terminal state; duplicate idempotency key returns same job; kill worker mid-job → job re-queued/expired by lease recovery; bounded concurrency respected |
| 2.3 | Spec ingest (M1) | Upload OpenAPI 3.x → parsed, versioned, normalized; invalid spec → 400 with pointer-level errors; size cap enforced |
| 2.4 | Contract validation | Fixture responses validated against spec; violations reported with JSON Pointer paths; pass/fail stored on the run |
| 2.5 | HTTP check execution (M2) | Run records status code, latency, error rate over N iterations; thresholds evaluated; SSRF guard rejects private/metadata targets (SEC-08 test) |
| 2.6 | Evidence trail (M6) | Every run exposes an append-only event list with timings and redacted artifacts; failed runs retain logs (no premature cleanup) |
| 2.7 | Frontend surfaces | Service list, check definition, run history with trend, run detail with events — using existing shell/components; error states + empty states present; `pnpm lint`/`typecheck` PASS |
| 2.8 | End-to-end acceptance scenario | Scripted: create service → upload spec → define check → run → view evidence → second run compared → regression flagged |

**Exit criteria:** scenario 2.8 passes end-to-end on a clean setup (`scripts/setup.sh` → dev run) with
recorded output; all Phase 0/1 gates remain green.

---

## Phase 3 — Data pipeline execution & quality (M3 + M4)

| # | Work item | Acceptance criteria |
| --- | --- | --- |
| 3.1 | Containerized execution with limits (SEC-13/14) | Test: CPU/mem/pid caps enforced (stress fixture killed); no Docker socket in container; egress policy blocks metadata IP; timeout → SIGTERM → SIGKILL → container removed |
| 3.2 | Pipeline definition + run steps | Multi-step pipeline executes; per-step status/duration/output manifest stored; failure marks step + run FAILED with retained evidence |
| 3.3 | Quality rules + schema snapshots | Rule set evaluates against outputs; schema snapshot diff classifies breaking vs additive; regression vs previous run surfaced |
| 3.4 | Concurrency & cancellation | One active run per pipeline enforced; cancel mid-run reaches CANCELLED with resources released |
| 3.5 | Load/soak smoke | Documented concurrency profile (e.g., N parallel runs) with recorded resource usage; no deadlocks or leaked containers after soak |

**Exit criteria:** 3.1–3.4 automated tests green in CI; soak report recorded; no container leaks
after the run suite (`docker ps` empty of orphans).

---

## Phase 4 — Cross-system intelligence (M5 + M7) & advanced controls

| # | Work item | Acceptance criteria |
| --- | --- | --- |
| 4.1 | Lineage ingestion + impact queries | Edge graph built from run events; "what breaks if this field changes" returns correct impacted consumers on a fixture dataset |
| 4.2 | Cross-correlation view | A shared failure surfaces linked API-check and pipeline-run events in one time window |
| 4.3 | Evidence-grounded diagnostics (AI) | Every suggestion cites stored run evidence (IDs/paths); no-evidence → no-suggestion test; redaction verified |
| 4.4 | Sandbox evaluation (D9) | Written decision record comparing Docker vs stronger isolation, with test results; arbitrary-code execution gated behind it |
| 4.5 | Backup/restore runbook (SEC-29) | Restore procedure executed once against a seeded DB with verified row counts |

**Exit criteria:** each item has a passing test or a written, evidence-linked decision record.

---

## Cross-cutting rules for all phases

1. **Gate before merge:** `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm test` all green in CI.
2. **No claims without evidence:** statuses in release notes use the evidence vocabulary above.
3. **No destructive change without approval:** schema drops, history rewrite, public push, and
   legacy-module removal require the corresponding decision in `PULSE-05` to be marked approved.
4. **Security regressions are blockers:** a failing SEC-* test blocks release; tests are never
   weakened to go green.
5. **Preserve uncommitted work:** no reset/checkout over dirty trees.
