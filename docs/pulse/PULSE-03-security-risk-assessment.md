# PULSE — Security & Public-Repository Risk Assessment

**Status:** Draft for review · **Date:** 2026-10-26 · **Classification:** findings only; no
remediation applied in this pass except where explicitly noted.

Evidence levels: **[RUN]** executed this pass · **[STATIC]** read from source · **[INFERRED]**
reasoned, unverified. Docker was unavailable, so nothing runtime-dependent was exercised.

---

## 1. Public-repository hygiene (scan results)

| Check | Result | Evidence |
| --- | --- | --- |
| Credentials in tracked files | **None found** (placeholders only: `ghp_xxxx…`, `user@example.com`) | pattern scan over 191 tracked files `[RUN]` |
| Credentials in reachable Git history | **None found** (`git log -p --all` for PAT/JWT/private-key patterns → only the placeholder) | `[RUN]` |
| `.env` / `.env.test` / `server.log` committed? | **No** — ignored via `.gitignore:15,18,31`, not in `git ls-files` | `[RUN]` |
| Personal paths (`C:\Users\…`) in tracked files | **None** | `[RUN]` |
| Personal emails in commit history | **Yes** — 2 identities, 4 aliases (`karthikw7755@…`, `Jothieshvaran.Thangavel@…`) | `git log --format='%an <%ae>'` `[RUN]` |
| Hardcoded secret fallback | **Yes** — `tests/generate-test-token.mjs` signs with `process.env.JWT_SECRET \|\| "dev-secret-at-least-32-characters-long!!"` | `[STATIC]` |
| `LICENSE` file | **Missing** (root `package.json` declares MIT) | `Test-Path` → `False` `[RUN]` |
| `.dockerignore` (repo root) | **Missing** | `Test-Path` → `False` `[RUN]` |
| `SECURITY.md` / `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` | **Missing** | `[RUN]` |
| CI workflows | **Missing** (`.github/` does not exist) | `[RUN]` |
| Dependency vulnerability / license scanning | **None configured** | `[RUN]` (no config files) |
| Debug/dev endpoints present in source | **Yes** — `POST /api/v1/dev/login` (PAT login), `GET /api/v1/dev/status` | `[STATIC]` |
| Stale runtime artifacts tracked in git | **Yes** — `docker/traefik/dynamic/ryme-test-app.yml`, `routes.yml` (test/stress-test routes) | `[STATIC]` |
| Private repo references | Remote is `Ryme-Labs/Ryme-dash` — ownership/rename is an owner decision (D7) | `[RUN]` |

**Verdict:** no leaked secrets discovered, but the repo is **not publication-ready**: missing
license, missing CI, a live auth bypass path, personal data in history, and product/branding
inconsistency.

---

## 2. Risk register

Severity: **S1** critical · **S2** high · **S3** medium · **S4** low/informational.

### 2.1 Authentication & authorization

| ID | Risk | Severity | Evidence | Remediation | Phase |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | **No resource-level authorization.** `req.userId` is used only for `/github/repos`, `/auth/me`, and import-owner stamping; project/deployment queries never filter `ownerId` → any authenticated user can read/modify/delete/deploy any project | S1 | `[STATIC]` repository/service queries | Ownership + tenant scope in repository layer; deny-by-default helper; tests for cross-tenant access | 1 |
| SEC-02 | **Dev PAT login bypass** (`POST /dev/login`) gated only by `NODE_ENV` checked *inside the handler*, and `GET /dev/status` is always reachable | S1 | `[STATIC]` `features/dev/dev.routes.ts` + controller | Remove before public exposure; or mount only when an explicit `ENABLE_DEV_AUTH=true` flag is set *and* `NODE_ENV=development`; add production-mode 404 test | 0/1 |
| SEC-03 | **No rate limiting** anywhere (login, OAuth, deploy/check triggers, list endpoints) | S2 | `[STATIC]` no rate-limit middleware in `app.ts` | Per-route + per-tenant limits (e.g. token bucket in Postgres or `express-rate-limit` for edge) | 1 |
| SEC-04 | OAuth CSRF state stored in **per-process in-memory Map** — breaks on restart/multi-instance; comment acknowledges "use Redis" | S2 | `[STATIC]` `auth.service.ts` | DB- or cookie-signed state; single-use + TTL (TTL exists: 10 min) | 1 |
| SEC-05 | JWT `logout` is a no-op; no revocation/refresh strategy; 24 h hard expiry | S3 | `[STATIC]` | Document as accepted for MVP; add token versioning with tenant/user revocation | 2 |
| SEC-06 | `TOKEN_ENCRYPTION_KEY` parsed as hex and **silently truncated** if non-hex → weaker key material | S2 | `[STATIC]` `lib/crypto.ts` | Validate length (≥32 bytes) and fail fast; config test | 1 |

### 2.2 Input handling & injection

| ID | Risk | Severity | Evidence | Remediation | Phase |
| --- | --- | --- | --- | --- | --- |
| SEC-07 | Command execution: `spawn(shell:false)` + metacharacter denylist + env whitelist — **good baseline**, but denylist is over-broad (rejects `(`, `)`, `$`, `{`, `}`) and Windows `cmd.exe /c` reintroduces shell semantics | S2 | `[STATIC]` `command-executor.ts`, `deployment-orchestrator.ts:92` | Move to explicit argv arrays/allowlists; never route user strings through `cmd.exe`; containerize user-derived commands | 1–2 |
| SEC-08 | **SSRF surface grows with PULSE**: API checks will call arbitrary user-supplied URLs (unlike today's GitHub-only allowlist) | S1 (future) | `[INFERRED]` from M2 design | Validate scheme/host; resolve-then-connect pinning; block private ranges, link-local, metadata IPs; DNS-rebinding defense; egress policy at container level | 2 (pre-release of M2) |
| SEC-09 | Git URL validation is regex `https://github.com/owner/repo(.git)` + path containment + token scrubbing — **strong**; not runtime-tested | S3 | `[STATIC]` `git.service.ts` | Add unit test matrix (ssh, file://, IP literal, `..`, userinfo tricks) | 1 |
| SEC-10 | Request validation: Zod on most routes, but `GET /deployments/:id/logs` (unvalidated duplicate route) wins over the validated one | S2 | `[STATIC]` duplicate registration in `deployments.routes.ts` vs `logs.routes.ts` | Delete duplicate; add validation tests; also `deploymentLogQuerySchema` rejects valid `step=INSTALL` values | 1 |
| SEC-11 | Body size limit 1 MB, `helmet` present but **CSP disabled**; CORS reflects **any origin with credentials** | S2 | `[STATIC]` `app.ts`, `middleware/cors.ts` | Restrict CORS to `FRONTEND_URL`; enable CSP; tests | 0/1 |
| SEC-12 | `deploymentLogQuerySchema` / Prisma enum drift (`INSTALL`, `ROLLBACK` missing) → 400s on valid filters | S3 | `[STATIC]` `packages/shared/src/validation/deployment.ts` | Align shared enums with Prisma enum; test parity | 1 |

### 2.3 Execution isolation (when container execution is reused)

| ID | Risk | Severity | Evidence | Remediation | Phase |
| --- | --- | --- | --- | --- | --- |
| SEC-13 | Containers are created **without CPU/memory/PID limits** | S2 | `[STATIC]` `docker-deployment-engine.ts` `createContainer` opts | `NanoCpus`, `Memory`, `PidsLimit`, `Ulimits`; verify with a stress fixture | 2 |
| SEC-14 | No egress control for execution containers; no explicit metadata-endpoint blocking | S2 | `[STATIC]` no network policy in engine/compose | Dedicated bridge + firewall/allowlist; documented metadata-IP block; test | 2 |
| SEC-15 | `ryme-network` is **never created in code** (`ensureNetwork()` exists but is unused); compose defines it only in one of two compose files | S3 | `[STATIC]` `docker.service.ts`, compose files | Create/verify network at startup; single compose source of truth | 1 |
| SEC-16 | Docker socket is mounted in Traefik (operator-installed, ro) — acceptable but must be documented; **must never** be mounted into user workloads | S3 | `[STATIC]` `docker-compose.yml` | Document trust assumption; assert in compose lint | 1 |
| SEC-17 | Host-side toolchain execution (`pip`, `npm`, `mvn`, `cargo` on the host) pollutes the trusted environment and runs untrusted build scripts outside containers | S2 | `[STATIC]` orchestrator INSTALL/BUILD steps | Move installs/builds into container build stages (also fixes the `dist`-exclusion defect) | 2 |
| SEC-18 | Windows `hosts` file editing requires elevation and trusts local DNS mapping | S3 | `[STATIC]` `hosts-manager.ts` | REMOVE candidate (X4) — PULSE doesn't serve `*.localhost` apps | 1 |
| SEC-19 | Ordinary Docker ≠ hostile-workload sandbox | S1 (if running arbitrary user code) | `[INFERRED]`, industry-standard | Document limitation; evaluate gVisor/Firecracker/remote runners before enabling arbitrary-code pipelines (D9) | 4 |

### 2.4 Data, secrets & tenancy

| ID | Risk | Severity | Evidence | Remediation | Phase |
| --- | --- | --- | --- | --- | --- |
| SEC-20 | No tenant model at all (single implicit user space) | S1 for multi-tenant claims | `[STATIC]` schema | Add `tenant_id` + membership before any multi-user claim (ADR-006/M8) | 2 |
| SEC-21 | GitHub tokens encrypted at rest (AES-256-GCM) — **good**; token also redacted from git errors and logs (uncommitted change) | S4 (positive) | `[STATIC]` + `[RUN] git diff` | Commit the redaction work | 0 |
| SEC-22 | Local `.env` holds real dev secrets; correctly gitignored | S3 | `[RUN]` | Keep; add pre-commit secret scan (gitleaks) so it stays that way | 1 |
| SEC-23 | Postgres published on host `5432` with a template default password (Phase 0.2: template now uses the non-sensitive `change_me_local_dev_password` placeholder; the local `.env` value is unchanged) | S3 (dev) | `[STATIC]` compose + `[RUN]` Phase 0.2 template edit | Bind to `127.0.0.1`; use non-default creds for any shared environment (still open) | 1 |
| SEC-24 | Traefik dashboard exposed insecurely on `:8080` | S3 | `[STATIC]` `traefik.yml` `insecure: true` | Bind to localhost / disable in non-dev | 1 |

### 2.5 Software supply chain & operational readiness

| ID | Risk | Severity | Evidence | Remediation | Phase |
| --- | --- | --- | --- | --- | --- |
| SEC-25 | **No CI** → no automated gate for typecheck/lint/test/dependency audit | S2 | `[RUN]` | Add minimal CI first (typecheck + lint + unit tests), then dependency/license/secret scanning | 1 |
| SEC-26 | `pnpm lint` currently **fails** (1 error, 2 warnings) → a gate would be red on day one | S3 | `[RUN]` | Fix the error (`DeploymentDetailPage.tsx:83`) before enabling the gate | 0 |
| SEC-27 | No LICENSE file though MIT is declared | S2 (legal) | `[RUN]` | Add LICENSE after owner confirms holder name/year (D7) | 1 |
| SEC-28 | No dependency vulnerability scanning, no lockfile audit in CI | S2 | `[RUN]` | `pnpm audit` + OSV scanner + license check in CI | 1 |
| SEC-29 | No backup/restore or disaster-recovery procedure documented | S3 | `[RUN]` absence | Document pg_dump/restore runbook; test restore once | 3 |
| SEC-30 | No performance/stress/soak testing of any kind | S3 | `[RUN]` absence | Add load profile for check runner in Phase 3 | 3 |
| SEC-31 | Error handling double standard: frontend swallows API errors (axios rejects with plain object) → users see generic failures | S3 | `[STATIC]` `client.ts` + `LoginPage.tsx` | Normalize to `Error`; add `onError` to mutations; add error boundary | 1 |
| SEC-32 | Two compose files, two Traefik versions, inconsistent mounts → unpredictable routing behavior; route file corruption suspected | S2 | `[STATIC]` + live `routes.yml` (6 services / 1 router) | Single compose source; fix YAML round-trip; reproduction test (V5) | 1 |

---

## 3. Mapping to standards (orientation only — **no compliance claimed**)

| Standard | Relevant items | Status |
| --- | --- | --- |
| OWASP ASVS v4 (V1–V5 architecture, auth, validation, crypto, logging) | SEC-01–07, 10–12, 20–22 | Gaps documented; not assessed against full checklist |
| OWASP API Security Top 10 | BOLA → SEC-01; BFLA → SEC-01/02; rate limiting → SEC-03; SSRF → SEC-08; inventory → SEC-25 | Gaps identified; no certification claimed |
| NIST SSDF (SP 800-218) | PO/PO.1 (design docs — this set), PS/PS.3 (dependency review → SEC-28), PW/PW.4 (code review), RV/RV.1 (vuln response → missing SECURITY.md) | Partial; CI/scan work in Phase 1 |
| OpenTelemetry | M10 observability direction (traces/metrics) | Not implemented; structured logs exist via pino |

---

## 4. Honest status summary

- **Implemented and statically verified:** GitHub-only clone validation, env-var whitelist in child
  processes, Zod fail-fast config, error envelope, token encryption, request-log redaction (pending
  commit), pino structured logging.
- **Implemented, unverified at runtime:** everything Docker-, DB-, and HTTP-flow-dependent (daemon
  unavailable this pass).
- **Known failing:** `pnpm lint` (frontend).
- **Known defective by static reading (not runtime-reproduced):** Traefik routes YAML round-trip
  corruption; `.dockerignore` excluding `dist` with non-multi-stage templates; invalid `COPY … ||
  true` in the Next.js template; duplicate log route; enum drift; missing ownership checks.
- **Missing entirely:** CI, LICENSE, migrations, rate limiting, tenant isolation, resource limits on
  containers, egress control, backup/runbook docs, meaningful automated tests.
