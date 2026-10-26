# PULSE — Traefik Integrity (D6)

**Phase:** 0.1 · **Date:** 2026-10-26 · **Status:** D6 approved; parser fixed, live file repaired
Covers: Step D of the Phase 0.1 brief — root cause, option comparison, parser
rewrite, round-trip evidence, and the approved live-repair sequence.

---

## 1. D6 decision (approved 2026-10-26)

**Keep Traefik; fix the routes YAML round-trip with a lossless parser, then repair
the live `routes.yml` under backup.** (Consistent with the `PULSE-05` D6 direction:
keep, one compose file, fix the round-trip; the "drop the file provider" alternative
was not chosen.) The live sequence approved and executed: **backup → additive repair
→ single restart → verification.**

## 2. Root cause (reproduced in Phase 0, fixed here)

`traefik-routing.service.ts` used a hand-rolled line parser that:

- **D-A** never flushed the *last* router when the `services:` section followed it;
- **D-B** never parsed `entryPoints` list items (always empty);
- **D-C** eroded routers on every read/write round-trip;
- silently dropped **any** field it did not know (`priority`, `middlewares`, `tls`,
  comments, sections outside `http.routers/services`).

Every deploy calls `addRoute` → read → rewrite → so each deployment could destroy
routing config. The live file's end state was the fingerprint of this bug: **6
services but only 2 routers** (`dashboard` + the last-written `stress-test-3`),
while **6 `ryme-deploy-*` containers were running** — five apps had no route.

## 3. Options compared (dependency decision)

| Option | Round-trip fidelity | Cost | Verdict |
| --- | --- | --- | --- |
| Repair hand-rolled parser | Low — would still need field-by-field knowledge forever; next unknown field gets dropped again | Moderate, recurring | Rejected: structurally lossy |
| Raw string splice (insert block text) | Medium for adds; removals/formatting still risky | Moderate, fragile | Rejected: second parser to maintain |
| **`yaml` Document API (`yaml@^2.9.1`)** | **High — parses/re-serializes the whole node tree; comments, quoting styles, unknown keys, nested maps/seqs preserved** | One small, focused dependency | **Chosen** |

Justification for the dependency (per the "no new deps without concrete
requirement" rule): the concrete requirement is *lossless preservation of arbitrary
Traefik configuration*, which a hand-rolled parser cannot meet. `yaml@2.9.1` was
added to **`@ryme/backend` only** (`pnpm add --filter @ryme/backend yaml`,
lockfile updated). It has no transitive runtime dependencies of note. Registry
reachability verified before install.

## 4. Parser changes

`apps/backend/src/services/traefik-routing.service.ts` rewritten:

- `parseRoutesYaml(content) → Document.Parsed` — `parseDocument`, **throws** on
  invalid YAML (fail-fast: a corrupt file is never silently overwritten by a lossy
  re-serialization).
- `generateRoutesYaml(doc) → string` — deterministic, trailing newline enforced.
- `addRoute` — `doc.setIn(["http","routers"| "services", name], …)` for **only** that
  entry; `removeRoute` — `doc.deleteIn(...)` for only that entry. `ensureHttp()`
  creates missing intermediate sections. ENOENT → bootstrap document with the
  dashboard router (same behavior as before).
- Public API (`addRoute`/`removeRoute`/`parseRoutesYaml`/`generateRoutesYaml`)
  unchanged → **orchestrator untouched**.
- Live `routes.yml` is only ever written by `addRoute`/`removeRoute` in production
  code paths; tests and the repair script parse/generate in memory unless explicitly
  applying.

## 5. Round-trip regression evidence

`tests/repro-traefik-roundtrip.mjs` (now a regression test, wired into `pnpm test`):

**28/28 assertions PASS, exit 0** — categories:

- multiple routers (4) all parsed, **last router retained** (D-A regression);
- `entryPoints` list items parsed (D-B regression);
- escaped/backticked rules preserved exactly (`Host(\`…\`)`);
- unknown fields preserved (`priority`, `middlewares`, `tls.certResolver`,
  `domains[].sans`);
- nested sequences and query-string URLs preserved;
- sections outside `routers/services` preserved (`http.middlewares`, top-level `tls`);
- **5 repeated round-trips: router count stable and full tree deep-equal** (D-C);
- comments (file-level and inline) survive;
- empty maps / empty document / null sections handled; `setIn` creates missing
  intermediate sections; `deleteIn` of a missing entry is a safe no-op;
- invalid YAML **throws** instead of corrupting;
- deterministic output for the same document;
- live file (read-only): parses, non-dashboard router retained, router/service
  counts stable, deep-equal round-trip.

## 6. Live repair (approved sequence, executed)

**Before (live `docker/traefik/dynamic/routes.yml`):** 2 routers (`dashboard`,
`stress-test-3`), 6 services, 6 deploy containers running.

1. **Dry run** (`scripts/repair-traefik-routes.mjs`, default mode) — printed the
   additive change set and verified `git status` on the file stayed clean.
   Script safety: only adds routers whose backing service URL points at a
   **currently running** container; never rewrites/deletes existing entries;
   reports anything it skips.
2. **Redacted diff shown to the owner and approved** before any write
   (`+25 lines, -0`): 5 routers added — `ryme-test-app`, `stress-test-1/2/4/5`,
   each `Host(\`<name>.localhost\`)`, `entryPoints: [web]`, service = existing
   same-named service → running container.
3. **Backup** — `..\RYME-backups\routes.yml.bak-2026-10-26T03-06-25-609Z`
   (byte-compared against the live file: *verified identical: true*).
4. **Write** — via the lossless Document path; restart Traefik **once**.
5. **Verification** (all PASS):
   - Traefik `/api/overview`: **9 routers, 9 services, 0 warnings, 0 errors**;
   - `/api/http/routers` lists all six `…@file` app routers plus `dashboard@file`
     (Traefik v3 returns an array — the script's verifier was corrected after its
     first pass parsed an object shape and falsely reported empty);
   - HTTP through Traefik (`Host:` header): `stress-test-1/4.localhost` → **200**,
     `ryme-test-app.localhost` → **200**, `traefik.localhost` → **302** (dashboard
     redirect) — each app serving its own build assets;
   - **Idempotence:** re-running the script exits `0` with
     "No missing routers — nothing to change" (no write, no restart).

**Rollback:** copy the backup over `docker/traefik/dynamic/routes.yml` and
`docker restart ryme-traefik`. Nothing else changed (no compose, static config,
or container changes).

## 7. Residual risks / follow-ups

- Windows bind-mounts do not propagate inotify → `docker restart ryme-traefik`
  after file changes remains required (pre-existing behavior, unchanged).
- `api.insecure: true` exposes the Traefik API/dashboard on :8080 inside the
  container — hardening candidate in the container-hardening phase (not now).
- Deploy-time `addRoute` restarts Traefik per change; batching restarts is a later
  performance item.
- Orphaned/stale entries are reported by the repair script but never deleted —
  cleanup policy is an owner decision, not automatic.
