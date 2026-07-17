# Plan 007: Remove all high-severity dependency advisories

> **Executor instructions**: Follow this plan step by step and run every
> verification gate. Prefer patched versions from direct dependencies; use
> narrowly scoped `pnpm.overrides` only when the parent package cannot yet
> resolve a patched transitive version. Do not silence the audit. Update this
> plan's row in `plans/README.md` when done unless a reviewer maintains it.
>
> **Drift check (run first)**: `git diff --stat ceb1be2..HEAD -- package.json pnpm-lock.yaml vite.config.ts .github/workflows/security.yml`
> A material mismatch in the dependency graph is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `ceb1be2`, 2026-07-16

## Why this matters

`pnpm audit --audit-level high` currently exits 1 with three high-severity
advisories. They cover the local Vite development server, the WebSocket stack
under the OBS client, and multipart handling under the old Groq SDK. The latter
two have limited reachability in today's code paths, but leaving known vulnerable
versions in the production graph makes future usage changes unsafe and leaves no
clean security gate.

## Current state

- `package.json:16-36` — direct versions include `groq-sdk ^0.5.0`,
  `obs-websocket-js ^5.0.8`, `vite ^5.4.0`, and `vitest ^3.2.6`.
- `pnpm-lock.yaml:965` — `form-data@4.0.5`; patched at `>=4.0.6`.
- `pnpm-lock.yaml:1562` — `ws@8.20.1`; patched at `>=8.21.0`.
- `pnpm-lock.yaml:1475` — `vite@5.4.21`; the reported Windows path-bypass
  advisory is patched at `>=6.4.3`.
- Audit path evidence: `groq-sdk > @types/node-fetch > form-data` and
  `obs-websocket-js > isomorphic-ws/ws`.
- There is no pull-request dependency-audit workflow. The existing
  `.github/workflows/release.yml` is a stale desktop release workflow and is
  explicitly out of scope.

Project verification is already healthy: 10 Vitest files / 127 tests,
frontend and API typechecks, and ESLint all passed at the planned commit.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Audit | `pnpm audit --audit-level high` | exit 0; no high/critical advisories |
| Dependency paths | `pnpm why form-data ws vite` | every resolved vulnerable package is at or above its patched minimum |
| Build | `pnpm run build` | exit 0; `dist/` produced |
| Baseline | `pnpm test && pnpm run typecheck && pnpm run typecheck:api && pnpm run lint` | all exit 0 |

## Scope

**In scope**:

- `package.json`
- `pnpm-lock.yaml`
- `vite.config.ts` only if the minimum patched Vite migration requires a real
  configuration adjustment
- `.github/workflows/security.yml` (create)

**Out of scope**:

- Feature changes.
- Rewriting the Groq or OBS integrations.
- `.github/workflows/release.yml`; its obsolete desktop commands are a separate
  maintenance issue.
- Broad major-version upgrades beyond what is required to reach patched versions.

## Git workflow

- Branch: `codex/patch-security-dependencies`
- Commit message: `chore: actualiza dependencias vulnerables`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Upgrade direct parents to compatible patched releases

Update the direct packages that own the vulnerable paths. Ensure Vite resolves
to at least `6.4.3`, `ws` to at least `8.21.0`, and `form-data` to at least
`4.0.6`. Prefer current compatible releases of `groq-sdk` and
`obs-websocket-js`; read their official migration notes before accepting a
major bump.

If current parent releases still pin a vulnerable transitive version, add only
exactly targeted `pnpm.overrides` entries for `ws` and/or `form-data`, with a
comment in the commit body explaining which parent still requires the override.
Do not add unused direct runtime dependencies just to manipulate the lockfile.

**Verify**: `pnpm why form-data ws vite` → no resolved version below the three patched minimums.

### Step 2: Reconcile build-tool compatibility

Run the build and tests. Change `vite.config.ts` only for a documented breaking
change in the chosen patched Vite release. Preserve `assetsInlineLimit: 0`, the
Ollama plugin behavior, aliases, relative `base`, and `/api` proxy behavior.

**Verify**: `pnpm run build && pnpm test` → build succeeds and all 127+ tests pass.

### Step 3: Add a continuous audit gate

Create `.github/workflows/security.yml` for pull requests, pushes to the default
branch, and a weekly schedule. Use Node 22 and pnpm 10, install with
`--frozen-lockfile`, and run `pnpm audit --audit-level high`. Set workflow
permissions to `contents: read`. Do not add third-party actions beyond the
official checkout, Node setup, and pnpm setup actions already used by the repo.

**Verify**: parse the YAML with an available YAML parser or `pnpm exec prettier --check .github/workflows/security.yml` if Prettier is already available; do not install a formatter solely for this check.

### Step 4: Run all security and project gates

**Verify**: `pnpm audit --audit-level high && pnpm test && pnpm run typecheck && pnpm run typecheck:api && pnpm run lint && pnpm run build` → every command exits 0.

## Test plan

- Existing OBS helper/component tests must remain green after the WebSocket
  dependency update.
- Existing API provider tests must remain green after the Groq SDK update.
- Build once in production mode to exercise Vite's resolver and browser bundle.
- Inspect the production bundle or Vite dependency report to confirm Node's
  `ws` implementation is not accidentally bundled for the browser path.

## Done criteria

- [ ] `pnpm audit --audit-level high` exits 0.
- [ ] `form-data >=4.0.6`, `ws >=8.21.0`, and `vite >=6.4.3` resolve in the lockfile.
- [ ] No audit suppression or broad override was added.
- [ ] The weekly/PR audit workflow exists with read-only permissions.
- [ ] Test, typecheck, lint, and production build gates pass.
- [ ] Only in-scope files changed.

## STOP conditions

- A parent upgrade requires changing the public Groq/OBS integration API rather
  than a mechanical migration.
- The minimum Vite security upgrade requires a second unrelated major migration.
- The only way to make the audit pass is to suppress an advisory or add a broad
  wildcard override.
- Any security gate still reports a high or critical advisory after two focused
  upgrade attempts.

## Maintenance notes

Treat overrides as temporary: remove each when the parent dependency resolves a
patched transitive release. Review the scheduled workflow when pnpm or Node's
supported version changes.
