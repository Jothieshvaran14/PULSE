# PULSE — Decision Status (D1–D13)

**Status:** Update to `PULSE-05-decisions-for-approval.md` · **Date:** 2026-10-26 (amended in Phase 0.1)
This log records what the owner has **actually confirmed** in the Phase 0 brief and what remains
**open**. No approval is inferred; no open item has been actioned.

Legend: ✅ approved · ⛔ not authorized · ⏳ open (recommendation only).

> **Phase 0.1 amendment (2026-10-26):** D6, D13, and the D8 DB-sync sub-decision were
> explicitly approved by the owner through a recorded approval prompt (each with the
> evidence, recommended option, risks, and exact approval scope restated) and have been
> executed within exactly that scope. All three rows below now separate the
> **owner-approved** part from the still-open part. Everything else is unchanged;
> agent recommendations in "Recorded choice" remain recommendations unless the Status
> column says ✅.

---

| ID | Decision | Status | Recorded choice / recommendation | Reversible? | Risks if wrong |
| --- | --- | --- | --- | --- | --- |
| **D1** | Product identity: **PULSE — API & Data Reliability Intelligence**, tagline **"Trust Every Flow."**; engineering-focused visual direction | ✅ **Approved** (explicit in Phase 0 brief) | Proceed with rebrand waves A–B per `PULSE-01` §3/§6 in a later phase | Yes (naming only; do in atomic commits) | Low — cosmetic. Avoid renaming identifiers until D3 |
| **D2** | Terminology map (Project→Service, Deployment→Check/Pipeline Run, log→Run event, framework detection→Artifact detection, deploy→Run check) | ⏳ **Open** | **Approve.** Rationale: entity naming settles API fields and UI copy early; wording tweaks later don't require rework. Consequence: temporary dual vocabulary during transition | Yes (copy-level) | Medium if delayed: API field renames become breaking changes after Phase 2 |
| **D3** | T3 identifier renames as atomic commits (`@ryme/*`→`@pulse/*`, `ryme_auth_token`, Docker labels/containers/network, image prefix, lockfile) | ⏳ **Open** | **Approve all, in Phase 1 Wave C**, each commit gated by typecheck/build/test. Consequence: coordinated local-container rename; running containers/volumes must be recreated | Partially — code renames easy to revert pre-push; **Docker/network renames require local state migration** | Medium: mixed old/new identifiers break scripts; pnpm lockfile churn conflicts with other work |
| **D3a** | DB name/user defaults (`ryme` / `ryme_dev_password`) | ⏳ **Open** | **Keep until Phase 2.** Renaming requires data migration; live DB holds 55 deployments / 2359 logs | No (data migration) | High if done now: data loss risk on rename; zero user benefit pre-rebrand |
| **D4** | Auth flow: finish GitHub OAuth UI vs PAT-only dev login | ⏳ **Open** | **OAuth primary; PAT retained only behind explicit dev flag.** Phase 0 already implemented the fail-closed flag (`ENABLE_DEV_LOGIN`, see `PULSE-08` §1) — this is the SEC-02 half; the OAuth-UI half needs your go-ahead | Yes | Medium: OAuth UI work is non-trivial; PAT-only cannot ship publicly |
| **D5** | Frontend wiring to `@pulse/shared` types (today duplicated) | ⏳ **Open** | **Wire it** — single source of truth for API contracts; medium effort, catches drift at compile time | Yes | Low. Doing it late increases divergence cost |
| **D6** | Keep Traefik? (ADR-005) | ✅ **Approved** (owner, Phase 0.1 — "keep; fix round-trip"; live repair approved separately after diff review) | **Executed:** lossless `yaml`-Document parser in `traefik-routing.service.ts` (comparison of alternatives in `PULSE-11` §3); 28/28 round-trip assertions PASS; live `routes.yml` repaired additively (+5 routers, backup `RYME-backups\routes.yml.bak-2026-10-26T03-06-25-609Z`, one restart, 9 routers/0 errors verified) | Yes (code); live file recoverable from the backup | Residual: `api.insecure` dashboard exposure + per-deploy restarts deferred to hardening phase |
| **D7** | External identity: repo rename/transfer, LICENSE holder/year, history emails, public description, **publication** | ⛔ **Not authorized** (owner confirms intent to publish, but explicitly: no publication, visibility, remote, or history changes in this phase) | **Do nothing.** Also blocks LICENSE (SEC-27) and CI public-repo steps | n/a (no action) | Acting now = irreversible-ish (visibility/history); License name wrong = legal rework |
| **D8** | The 5 uncommitted files (rollback endpoint/service/orchestrator, schema rollback fields, log redaction) + DB/schema drift | ⏳ **Open → DB-sync sub-decision ✅ Approved** (owner, Phase 0.1: "backup + additive DDL") | **Executed:** `pg_dump` backup (`RYME-backups\ryme_pre_d8_2026-10-26.dump`, 45 TOC entries) → exact additive DDL (2 enum values, 3 nullable columns, 1 FK) → `prisma migrate diff` now **empty**; probe 5/5 `200` (was 2×500); row counts identical (55 deployments / 2359 logs). **Still open:** WIP disposition (a)/(b)/(c) — committing and rollback-route wiring are prohibited/unapproved this phase (`PULSE-09` §8) | Yes pre-commit; DDL inverse documented (`PULSE-09` §7); enum values cannot be dropped (documented limitation) | Residual: no Prisma migration baseline yet (Phase 2 item); rollback route still unregistered |
| **D9** | Execution sandbox: Docker-only vs stronger isolation (gVisor/Firecracker/remote runner) | ⏳ **Open** | **Defer to Phase 4 with evidence**, keep the "container-only, no host execution" rule now | Yes (defer) | Under-deciding risks SEC-19 exposure when arbitrary-code pipelines arrive; over-building now costs time |
| **D10** | Legacy RYME domain: keep `projects/deployments/deployment_logs` tables during transition vs remove immediately (ADR-006) | ⏳ **Open** | **Keep through Phase 0–2; remove after MVP cutover.** DB contains real data (55 deployments, 2359 logs) | n/a (keep = no action) | Removing now = irreversible data loss, breaks every repository query |
| **D11** | Removal list (`PULSE-00` §3): dead `dockerfile-generator`, `port-allocator`+`Port` model, Swarm/K8s stubs, duplicate `docker.service`, `hosts-manager`, legacy `docker/templates/*`, unused `useRepos.ts` | ⏳ **Open** | **Approve code-only items in Phase 1**; `Port` DB model only alongside D10. `useRepos.ts` removal also resolves lint warning `useRepos.ts:35` | Yes for code; DB table drop is irreversible | Low for code items; dropping `Port` early breaks port display queries |
| **D12** | MVP scope: "Contract check + evidence" (OpenAPI ingest + HTTP check + run history) as first release | ⏳ **Open** | **Confirm** — shortest path exercising jobs, evidence storage, and auth end-to-end | Yes (scope is phase-gated) | Re-scoping later reorders the roadmap; cost is planning churn, not rework |
| **D13** | Multi-tenancy in v1: single-user self-hosted vs `tenant_id` now | ✅ **Approved** (owner, Phase 0.1: "owner-scoping + quarantine orphans") | **Model: single-tenant, multi-user MVP with strict owner scoping** on every project/deployment/log route (query-scoped lists; identical 404 for foreign/orphan/nonexistent — no existence oracle). The 5 null-owner `stress-test-*` projects are **quarantined**: untouched (`owner_id` still NULL), inaccessible to every user, never auto-assigned. `tenant_id` for new PULSE tables stays a Phase 2.1 item per `PULSE-05` | Enforcement is code (revertible); ownership data **not modified** | Residual: global project-name `@unique` allows a 409 name oracle; app hostnames still reachable on localhost (forwardAuth later) — both recorded in `PULSE-10` §7 |

---

### Approvals required before the next phase starts

1. ~~**D8**~~ — ✅ DB-sync sub-decision approved and executed (Phase 0.1). The WIP
   disposition (a)/(b)/(c) is still open but requires **commit authorization**, which
   no phase currently has.
2. ~~**D6**~~ — ✅ approved and executed (Phase 0.1), including the live-file repair.
3. ~~**D13 + D8**~~ — ✅ tenancy model + orphan quarantine approved and enforced
   (Phase 0.1); the SEC-01 authorization fix is implemented and regression-tested.
4. **D4** — OAuth UI completion.
5. **D2/D3/D3a** — terminology and identifier rename scope (Phase 1 rebrand waves).
6. **D12** — MVP scope confirmation for Phase 2 planning.

### Explicitly not done in Phase 0

No approval was assumed, no destructive/remote/history/visibility operation was performed, and no
decision above has been actioned beyond D1 (recorded) and the pre-authorized narrow dev-auth fix
(documented in `PULSE-08` §1).

### Explicitly not done in Phase 0.1

Beyond the three owner approvals above (D8 DB-sync, D13 model + quarantine, D6 live
repair): no commits, pushes, remote/history/visibility changes; no global rebranding or
identifier renames; no module removals; no `migrate reset`/drops/record deletion; no
broad `db push` against the live database; the 5 pre-existing uncommitted files were
left unmodified; CORS/CSP/rate-limit/egress/container hardening were recorded as later
items only (`PULSE-12` §6).
