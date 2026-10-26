# PULSE — Target Architecture

**Status:** Draft for approval · **Date:** 2026-10-26
**Positioning:** PULSE — API & Data Reliability Intelligence · *Trust Every Flow.*

This document defines PULSE's module boundaries, data flows, job model, and trust model as they
relate to the **existing** implementation. It is deliberately incremental: nothing here requires
discarding working infrastructure identified in `PULSE-00-repository-audit-and-reuse-plan.md`.

---

## 1. Shape: modular monolith + isolated workers

**Decision: modular monolith** (single Express API + single Postgres) **with execution isolated in
containers run by a dedicated worker process.**

Justification from the repository:

- The existing codebase is already one Express app with feature folders
  (`apps/backend/src/features/*`) and a single Prisma client — a modular monolith is the smallest
  change that adds boundaries, not a new distributed system.
- All heavy work today is *already* asynchronous fire-and-forget
  (`void orchestrator.deploy(id)`), so introducing a worker process formalizes existing behavior
  rather than inventing new infrastructure.
- PULSE's workload is I/O-bound (HTTP checks, spec parsing) plus container-scoped compute
  (pipeline execution) — a queue + worker model fits; a service mesh does not.
- No repository evidence justifies microservices: no independent scaling need, no team boundaries,
  no heterogeneous datastores.

**Rejected alternatives:** microservices (premature; adds distributed failure modes to a codebase
with zero integration tests); serverless/managed-only (PULSE must be self-hostable).

---

## 2. Module boundaries

Ten modules, each owning its schema tables and exposing a narrow service interface. Modules
communicate through service interfaces in-process and through events on a job queue — never by
reaching into another module's tables.

### M1 — Contract management & validation
- **Owns:** `api_specs`, `contracts`, `contract_versions`.
- **Responsibility:** ingest OpenAPI (3.x, and 2.0 via conversion) / GraphQL SDL / JSON Schema; parse
  and normalize; store immutable versions; validate request/response payloads against a selected
  contract version; report violations with JSON Pointer paths.
- **Sync:** parse/validate API calls. **Async:** bulk re-validation of stored examples.
- **Maps from existing:** Zod validation middleware pattern (`middleware/validate.ts`) is the
  *pattern* for request validation; the actual payload validator is new (a spec-driven validator —
  **REPLACE** of nothing existing).

### M2 — API performance testing & regression analysis
- **Owns:** `check_definitions`, `check_runs`, `run_metrics`.
- **Responsibility:** execute HTTP check scenarios (status, schema, latency, throughput, error-rate
  budgets); aggregate per-run metrics; compare against previous runs/baselines; flag regressions
  against thresholds and SLOs.
- **Async:** all executions are jobs.
- **Maps from existing:** `DeploymentOrchestrator` state machine → `CheckRun` lifecycle; Git-based
  clone logic is **not** needed here (target URLs + specs, not repos).

### M3 — Data pipeline definitions & execution
- **Owns:** `pipelines`, `pipeline_runs`, `run_steps`.
- **Responsibility:** define pipelines (source → transforms → sink) declaratively; execute their
  steps as **containerized jobs** with resource limits; capture per-step status, duration, output
  manifests.
- **Async:** all executions are jobs; strictly one active run per pipeline (advisory lock).
- **Maps from existing:** container build/run/inspect/log plumbing from
  `engine/docker-deployment-engine.ts` (**REUSE**); host-side `command-executor` becomes the
  *in-container* entrypoint only, never for untrusted code on the host.

### M4 — Data quality & schema evolution
- **Owns:** `quality_rules`, `schema_snapshots`, `quality_results`.
- **Responsibility:** declarative rules (nullability, ranges, uniqueness, freshness, distributions);
  schema snapshots per dataset with diff/compatibility classification (additive vs breaking);
  pass/fail results attached to runs.
- **Async:** evaluation against large outputs runs as a job; small evaluations may run inline.

### M5 — Lineage & dependency mapping
- **Owns:** `lineage_edges`, `artifacts`.
- **Responsibility:** record producer/consumer edges between APIs, endpoints, datasets, and
  pipelines; expose traversal (impact queries: "what breaks if this schema field changes?").
- **Derived data only** — built from events emitted by M1–M4, never hand-edited as source of truth.

### M6 — Run history, artifacts & evidence
- **Owns:** `runs` (shared envelope), `run_events`, `artifacts` blobs (metadata; blobs in
  object/local storage, not Postgres).
- **Responsibility:** one append-only evidence trail per run: structured events (successor of
  `deployment_logs`), timings, exit codes, payload excerpts (redacted), retention policy.
- **Reuse:** `deployment_logs` write path + `LogLevel`/step enums pattern.

### M7 — Cross-module impact analysis
- **Owns:** no tables (reads M1/M3/M5 via interfaces).
- **Responsibility:** correlate failures across check runs and pipeline runs on shared time windows
  and shared dependencies; produce impact previews. Phase 4+; the AI-assisted diagnostics surface
  consumes **only** stored evidence from M6 (grounding requirement).

### M8 — AuthN / AuthZ / tenant isolation
- **Owns:** `users`, `tenants`, `memberships`, `api_tokens`.
- **Responsibility:** identity (existing GitHub OAuth + JWT), roles (owner/member/viewer),
  **mandatory tenant scoping on every query**, token scoping for machine access.
- **Maps from existing:** `features/auth` **ADAPT**; the critical gap today is *absence of
  authorization* (queries never filter `ownerId`) — see `PULSE-03`.

### M9 — Shared execution infrastructure & jobs
- **Owns:** `jobs`, `job_attempts`.
- **Responsibility:** bounded queue, worker loop, retries with backoff, timeouts, cancellation,
  idempotency keys, dead-letter state; the **only** component allowed to start containers.
- **Maps from existing:** `DeploymentOrchestrator` + `command-executor` + docker engine, refactored
  behind a queue (**ADAPT**, effort H in the reuse matrix).

### M10 — Observability, audit & administration
- **Owns:** `audit_logs`; reads all `*_events`.
- **Responsibility:** structured logs (pino), health endpoints (existing `/health` pattern),
  metrics endpoint, audit trail of who-did-what, admin/settings surface (replaces the empty
  `SettingsPage`).

---

## 3. Data ownership & schema boundaries

| Concern | Rule |
| --- | --- |
| Table ownership | Each table belongs to exactly one module; cross-module reads go through that module's service interface. |
| Existing tables | `users` → M8; `projects`/`deployments`/`deployment_logs` are **legacy RYME domain** — retained untouched during Phase 0–1, then superseded by new PULSE tables (no destructive migration in early phases). |
| Referential integrity | Cascade only where evidence supports it (today: `deployment → logs` cascade works); otherwise `Restrict` to prevent orphaned evidence. |
| Migration discipline | Baseline migration committed first (currently **missing** `[RUN]`), then forward-only migrations per phase, each reversible. |
| Tenancy | Every PULSE table carries `tenant_id`; every query includes it (enforced in the repository layer + tested). |

---

## 4. Synchronous vs asynchronous

| Operation | Mode | Rationale |
| --- | --- | --- |
| Spec upload → parse/validate structure | **Sync** (≤ 2 s, size-capped) | Immediate feedback; small payload |
| Single request/response validation | **Sync** | Interactive debugging |
| Check runs (HTTP scenarios) | **Async job** | Seconds–minutes; must survive restarts |
| Pipeline execution | **Async job** | Container lifecycle, unbounded duration |
| Bulk re-validation / baseline rebuild | **Async job** | Fan-out |
| Lineage recomputation | **Async, debounced** | Derived from events |
| Reads (lists, reports, diffs) | **Sync** | Standard CRUD |

---

## 5. Job lifecycle (M9)

```
QUEUED → CLAIMED → RUNNING → SUCCEEDED
                       ├────→ FAILED ──(retries < max)──→ QUEUED
                       ├────→ FAILED (terminal, → DEAD_LETTER after max attempts)
                       └────→ CANCELLED (user request or timeout)
```

- **States persisted** in `jobs` (successor of `DeploymentStatus` transitions); every transition
  writes an event to M6 (successor of `deployment_logs`).
- **Idempotency:** `idempotency_key = (module, definition_id, trigger, logical_timestamp)`; re-firing
  the same key returns the existing job. Today's check-then-act race in `triggerDeploy` is the
  anti-pattern this replaces.
- **Retries:** bounded (default 2) with exponential backoff, only for *transient* classes
  (network, container-start). Validation/build failures are terminal.
- **Cancellation:** cooperative — worker polls a cancel flag, then SIGTERM → 5 s → SIGKILL
  (reuses `command-executor`'s kill ladder), then container remove.
- **Timeouts:** per-job `timeout_ms` (reuses `BUILD_TIMEOUT_MS` pattern, per module default).
- **Recovery:** on boot, jobs stuck in `CLAIMED/RUNNING` beyond a lease window are re-queued or
  marked `FAILED` (successor of `cleanupStaleDeployments()`).
- **Concurrency limits:** global, per-tenant, and per-module caps (see §7).

---

## 6. Failure handling principles

1. **Structured errors only** — keep the existing envelope
   `{success:false, error:{code,message,statusCode,details}, meta:{timestamp}}`.
2. **Operational vs bug:** operational errors surface; unexpected errors log fully, return generic
   500 (existing `error-handler.ts` behavior — REUSE).
3. **Evidence before cleanup:** on failure, capture logs/artifacts *before* deleting workdirs
   (today the workspace is deleted even on failure paths — must change so failures are debuggable).
4. **No silent swallow:** today's `void orchestrator.deploy()` and mutations without `onError` are
   explicit anti-patterns; every async entrypoint must resolve to a recorded terminal state.

---

## 7. Trust boundaries & resource isolation

```
[Browser] ──TLS──> [API : trustworthy] ──> [Postgres | object store]
                          │
                          │ enqueue only (no container runtime in API process)
                          v
                   [Worker : semi-trusted] ──docker API──> [Execution containers : UNTRUSTED]
                                                               │
                                                               └─ egress: allowlist only
```

| Control | Requirement |
| --- | --- |
| Process isolation | Imported/user code **never** executes in the API or worker process. Container-only. |
| Container limits | `NanoCpus`, `Memory`, `PidsLimit`, `Ulimits`, `ReadonlyRootfs` where feasible, `AutoRemove` on completion, stop grace period. |
| Docker socket | API/worker hold socket access; **containers must never mount `/var/run/docker.sock`** (today Traefik does — acceptable because Traefik is operator-installed, not user code; documented as a trust assumption). |
| Network | Execution containers join an isolated bridge network **without** Docker API access; egress restricted (default-deny + allowlist); explicitly block link-local metadata endpoints (`169.254.169.254`). |
| Secrets | Never injected into execution containers; the existing env-var whitelist in `command-executor` is the seed of this policy (REUSE, extend to Docker `Env`). |
| Multi-tenant isolation | Tenant ID in every query; per-tenant rate limits and concurrency caps; artifact paths namespaced by tenant. |
| URL validation | Keep GitHub-only allowlist for clones (existing SSRF defense); API check targets validated against private-IP/metadata ranges + DNS rebinding mitigation (resolve-then-connect pinning). |

**Honesty requirement:** ordinary Docker containers are *not* a complete sandbox against hostile
workloads. PULSE must document this and gate any "run arbitrary pipeline code" feature behind a
stronger sandbox evaluation (gVisor/Firecracker/remote runner) — tracked as a Phase 4 decision (D9).

---

## 8. API contracts & versioning

- Keep `/api/v1` prefix; add `/api/v1` surface stability guarantees: additive changes only within
  `v1`; breaking changes → `/api/v2`.
- Every endpoint: Zod request/response schema in `@pulse/shared` (today backend-only — wiring the
  frontend to shared types is decision D5).
- Machine API tokens (scoped, revocable) in M8 for CI use — distinct from user JWTs.
- Generate OpenAPI document from the Zod schemas (serves both docs and M1's own dogfooding).

---

## 9. Architecture decision records (ADR index)

| ADR | Decision | Status | Rationale summary |
| --- | --- | --- | --- |
| ADR-001 | Modular monolith + isolated workers | Proposed | Matches existing structure; no evidence for distribution |
| ADR-002 | Postgres + Prisma retained as sole datastore | Proposed | Already working `[RUN]` typecheck/build; queues can be Postgres-backed initially (SKIP: Redis until proven necessary) |
| ADR-003 | Postgres-backed queue before external broker | Proposed | Zero new infra; bounded concurrency via `SELECT … FOR UPDATE SKIP LOCKED`; revisit at scale threshold (documented trigger) |
| ADR-004 | Containerized execution only for user-derived workloads | Proposed | Existing dockerode engine reused; host `command-executor` restricted to platform-owned tooling |
| ADR-005 | Traefik retained **only** for exposing the PULSE UI/API, not user apps | Proposed | Removes app-routing bug surface (X4/X5); needs owner confirmation (D6) |
| ADR-006 | Legacy `projects/deployments` tables preserved (not dropped) during transition | Proposed | Avoid destructive migration; supersede with PULSE tables; drop only after cutover |
| ADR-007 | Keep GitHub as sole VCS source in v1 | Proposed | Existing validation logic is GitHub-specific and strong; broaden later with explicit SSRF review |
| ADR-008 | Evidence store: append-only events + content-addressed artifacts | Proposed | Trust requirement for future AI diagnostics (no evidence, no claim) |

---

## 10. Smallest coherent PULSE release (MVP)

**MVP = "Contract check + evidence":** ingest an OpenAPI spec → define an HTTP check against an
endpoint → run it on a schedule/manual trigger → validate response against the contract → store
latency/error/schema results with an evidence trail → view history and a pass/fail trend.

Covers M1 (partial), M2 (partial), M6 (core), M8 (with real authorization), M9 (single queue),
M10 (health/logs). **Excludes** pipelines, lineage, AI diagnostics — which is why the roadmap
stages them (see `PULSE-04-roadmap.md`).

Why this slice: it is the shortest path that exercises every reused infrastructure piece
(async jobs, container-free HTTP execution first, evidence storage, auth) while producing a
feature that is genuinely useful on day one and matches PULSE's stated identity.
