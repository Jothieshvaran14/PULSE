# PULSE — Decisions Requiring Approval

**Status:** Open · **Date:** 2026-10-26
No item below has been actioned. Reply with approve/modify/reject per ID (e.g. "D1 approve, D3a
keep DB name").

| ID | Decision | Options | Recommendation | Blocks |
| --- | --- | --- | --- | --- |
| **D1** | Approve product identity: **PULSE — API & Data Reliability Intelligence**, tagline **"Trust Every Flow."**, visual direction (engineering-focused, maroon-free palette TBD) | Approve / propose alternate | Approve as stated in the brief | Rebrand waves A–B (`PULSE-01` §3, §6) |
| **D2** | Approve the terminology map: Project→**Service**, Deployment→**Check/Pipeline Run**, Deployment log→**Run event**, Framework detection→**Artifact detection**, Deploy→**Run check** | Approve / amend per term | Approve; wording can be tuned without re-work if the entity names settle now | UI copy, API field naming in Phase 2 |
| **D3** | Approve T3 identifier renames as atomic commits: `@ryme/*`→`@pulse/*`, `ryme_auth_token`→`pulse_auth_token`, `ryme.*` Docker labels, `ryme-deploy-*`→`pulse-run-*`, `ryme-network`→`pulse-network`, `ryme-postgres/traefik`→`pulse-*`, image prefix, lockfile | Approve all / approve subset | Approve all in Phase 1 Wave C; each commit gated by typecheck/build/test | Rebrand wave C |
| **D3a** | Database name/user defaults (`ryme` / `ryme_dev_password`) | Rename now (requires DB migration) vs **keep until Phase 2** | **Keep** — avoids data migration risk; rename only with a documented migration | `.env.example`, compose |
| **D4** | Auth flow for PULSE: finish GitHub OAuth UI (currently backend-complete but unlinked) vs keep PAT-only dev login | OAuth as primary, PAT dev-only, remove `/dev/login` from prod | OAuth primary; PAT retained only behind explicit dev flag | SEC-02 remediation, login page |
| **D5** | Wire the frontend to `@pulse/shared` types (today it duplicates them) | Wire / keep duplicated | Wire — single source of truth for API contracts; medium effort | Phase 2 API work |
| **D6** | Keep Traefik? (ADR-005) | Keep for PULSE UI/API exposure vs remove (reverse proxy optional) | Keep, but **one compose file**, fix the routes YAML round-trip or drop the file provider; user-app routing (`hosts-manager`, `traefik-routing`) removed | Phase 0 V5 test, X4/X5 removal |
| **D7** | External identity: rename/transfer `Ryme-Labs/Ryme-dash`, LICENSE holder name/year, commit-history emails (noreply masking vs accept attribution), public repo description | Explicit instruction required | Do nothing until you decide; never rewrite history | T4 actions, `LICENSE`, publication |
| **D8** | Uncommitted work (5 files: rollback endpoint/service/orchestrator, schema rollback fields + `ROLLBACK` enums, log redaction) — note the rollback **route is not registered** | (a) commit as-is with a TODO, (b) finish wiring the route first, (c) stash | **(b) finish wiring + commit**, since schema fields are already in the working tree; otherwise (a) | Phase 0.1 |
| **D9** | Execution sandbox for user-derived code: Docker-only vs stronger isolation (gVisor/Firecracker/remote runner) | Defer to Phase 4 with evidence | Defer, but keep the "container-only, no host execution" rule now | Phase 4.4 |
| **D10** | Legacy RYME domain: keep `projects/deployments/deployment_logs` tables and code during transition (ADR-006) vs remove immediately | Keep during Phase 0–2, remove after MVP cutover | Keep — no destructive migration early; removal is Phase 2+ with approval | X-list execution |
| **D11** | Removal list approval (`PULSE-00` §3 REPLACE/REMOVE): dead `dockerfile-generator`, `port-allocator` + `Port` model, Swarm/K8s stubs, duplicate `docker.service`, `hosts-manager`, legacy `docker/templates/*`, unused `useRepos.ts` | Approve per item | Approve code-only items in Phase 1; DB model (`Port`) only with D10 | Phase 1 cleanup |
| **D12** | MVP scope confirmation: "Contract check + evidence" (OpenAPI ingest + HTTP check + run history) as the first release | Confirm / re-scope | Confirm — shortest path exercising jobs, evidence, auth | Phase 2 planning |
| **D13** | Multi-tenancy in v1: single-user self-hosted vs tenant model now | Single-user first (SEC-20 deferred, documented) vs build `tenant_id` in Phase 2 schema | Build `tenant_id` into **new** PULSE tables from the first migration (cheap now, expensive later); membership/roles UI can wait | Phase 2.1 schema |

---

### Explicitly out of scope for this pass (already enforced)

- No module removal, no schema change, no new infrastructure, no auth behavior change, no core
  architecture replacement, no Git history rewrite, no push/publish/visibility change.
- The 5 uncommitted files were left untouched.
