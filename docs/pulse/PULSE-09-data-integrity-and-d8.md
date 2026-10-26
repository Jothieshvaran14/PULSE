# PULSE — Data Integrity and D8 Resolution

**Phase:** 0.1 · **Date:** 2026-10-26 · **Status:** D8 approved and executed
Covers: Step A of the Phase 0.1 brief — rollback-WIP attribution, exact schema drift,
failure map, reconciliation, backup/recovery, and verification.

---

## 1. What belongs to whom (rollback WIP vs Phase 0)

The five pre-existing uncommitted files were inspected before any change; none were
modified by this phase:

| File (uncommitted, pre-existing) | Belongs to | Phase 0.1 action |
| --- | --- | --- |
| `packages/db/prisma/schema.prisma` | Rollback WIP (3 nullable `deployments` columns, `RollbackHistory` relation, `ROLLBACK` values in `DeploymentStatus`/`DeploymentStep`) | **Untouched** — source of the drift, preserved as-is |
| `apps/backend/src/features/deployments/deployments.controller.ts` | Rollback WIP (`rollbackDeployment` handler) | Untouched (route remains **not registered** — see §7) |
| `apps/backend/src/features/deployments/deployments.service.ts` | Rollback WIP | Untouched |
| `apps/backend/src/services/deployment-orchestrator.ts` | Rollback WIP (rollback execution path) | Untouched |
| `apps/backend/src/middleware/request-logger.ts` | Rollback WIP (log redaction) | Untouched |

Phase 0.1 changes live in different files (see `PULSE-12` §1) and never altered the
rollback WIP's semantics.

## 2. Exact schema drift (evidence)

Established with `prisma migrate diff --from-url <live> --to-schema-datamodel prisma/schema.prisma --script`
(read-only; **not** inferred from the absence of `_prisma_migrations`):

```sql
-- AlterEnum
ALTER TYPE "DeploymentStatus" ADD VALUE 'ROLLBACK';
-- AlterEnum
ALTER TYPE "DeploymentStep" ADD VALUE 'ROLLBACK';
-- AlterTable
ALTER TABLE "deployments" ADD COLUMN "rollback_reason" TEXT,
ADD COLUMN "rollback_timestamp" TIMESTAMP(3),
ADD COLUMN "rolled_back_from_id" TEXT;
-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_rolled_back_from_id_fkey"
FOREIGN KEY ("rolled_back_from_id") REFERENCES "deployments"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
```

**The drift is purely additive**: 2 enum values, 3 nullable columns, 1 FK. No column
type change, no renames, no drops, no data rewrite. The Prisma client is generated
from the working-tree schema, so every `SELECT` on `deployments` includes the new
columns — which the live table lacked.

## 3. Failure map (live DB, before)

`tests/probe-drift.mjs` (GET-only, boots the real app in-process):

| Endpoint | Before | Error |
| --- | --- | --- |
| `GET /projects` | 200 | — |
| `GET /projects/:id` | 200 | — |
| `GET /projects/:id/deployments` | **500** | `P2022` — column `deployments.rolled_back_from_id` does not exist |
| `GET /deployments/:id` | **500** | `P2022` (same column) |
| `GET /deployments/:id/logs` | 200 | — |

This is the complete, precise cause of the "deployment-list HTTP 500s" recorded in
`PULSE-06` §5.2.

## 4. Data value

Assumed valuable per the brief; confirmed present and stable:

| Table | Rows before DDL | Rows after DDL |
| --- | --- | --- |
| `deployments` | 55 | 55 |
| `deployment_logs` | 2,359 | 2,359 |
| `projects` | 7 | 7 |
| `users` | 1 | 1 |

The 3 new columns are `NULL` for all 55 rows (`nonnull_rollback_rows = 0`) — no row
was written, rewritten, or deleted.

## 5. D8 approval and execution

Recorded decision (Phase 0.1, 2026-10-26): **backup + additive DDL** (owner-approved;
see `PULSE-07` D8).

Sequence executed, in order:

1. **Backup** — `pg_dump -Fc` of the whole database + a schema-only SQL dump:
   - `..\RYME-backups\ryme_pre_d8_2026-10-26.dump` (111,269 bytes,
     45 TOC entries, gzip — `pg_restore --list` verified readable)
   - `..\RYME-backups\ryme_pre_d8_schema_2026-10-26.sql` (10,115 bytes)
2. **DDL** — the six statements from §2, piped to `psql -v ON_ERROR_STOP=1` → **exit 0**
   (4 statements, 4 × `ALTER TYPE`/`ALTER TABLE` confirmations).
3. **Verification** — see §6.

No `migrate reset`, no `db push` against the live database, no drops, no record
deletion at any point.

## 6. Verification (after)

| Check | Command | Result |
| --- | --- | --- |
| Schema now matches datamodel | `prisma migrate diff --from-url <live> --to-schema-datamodel … --script` | **PASS** — output: `-- This is an empty migration.` (exit 0) |
| Failure map cleared | `node … tests/probe-drift.mjs` | **PASS** — 5/5 endpoints `200`, exit 0 |
| Data intact | row counts before/after | **PASS** — identical (§4) |
| Aligned-schema behavior (independent proof) | `pnpm test:integration` — fresh scratch DB via `prisma db push` | **PASS** — `GET /projects/:id/deployments` and `GET /deployments/:id` return 200 against an aligned schema (22/22 assertions) |

## 7. Recovery plan and limitations

**Restore (full):**

```powershell
docker cp ..\RYME-backups\ryme_pre_d8_2026-10-26.dump ryme-postgres:/tmp/bk.dump
docker exec ryme-postgres pg_restore -U ryme -d ryme --clean --if-exists /tmp/bk.dump
```

(Requires the backend to be stopped first; `--clean` rebuilds objects from the dump.)

**Inverse DDL (partial rollback of the alignment only):**

```sql
ALTER TABLE "deployments" DROP CONSTRAINT "deployments_rolled_back_from_id_fkey";
ALTER TABLE "deployments" DROP COLUMN "rolled_back_from_id",
                           DROP COLUMN "rollback_timestamp",
                           DROP COLUMN "rollback_reason";
```

**Known limitation:** `ALTER TYPE … ADD VALUE` has no inverse — the two `ROLLBACK`
enum values cannot be removed without recreating the enum type (which requires
dropping/re-adding dependent columns). Acceptable risk: unreferenced enum labels are
inert, and the Prisma schema (the type's source of truth) contains them.

## 8. Forward-only migration status

- The repo has **no Prisma migration history** (no `prisma/migrations/`, no
  `_prisma_migrations` table); the live DB has always been `db push`-managed.
- A forward-only `prisma migrate` baseline is **feasible now** (schema and DB are
  aligned again: empty diff) but was **not** started this phase — adopting a
  migration workflow is a process decision recorded as a Phase 2 item in
  `PULSE-12` §6, not a blocker.
- Rollback WIP disposition options (a)/(b)/(c) from `PULSE-05` D8 remain **open**:
  committing is prohibited in this phase, and wiring the rollback route was not part
  of the approved D8 scope. `deployments.controller.getLogs` is currently unreferenced
  (its route was consolidated — `PULSE-10` §5) and was deliberately left untouched in
  the preserved user file.
