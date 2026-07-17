# Plan 006: Keep local credentials private and untrackable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. Never print, copy, commit, or include a credential value in logs,
> diffs, commits, issues, or `plans/README.md`. If anything in the "STOP
> conditions" section occurs, stop and report — do not improvise. When done,
> update this plan's row in `plans/README.md` unless a reviewer maintains it.
>
> **Drift check (run first)**: `git diff --stat ceb1be2..HEAD -- .gitignore .env.example README.md package.json scripts/check-secret-hygiene.mjs`
> If an in-scope file changed, compare the current-state facts below with the
> live code. A material mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `ceb1be2`, 2026-07-16

## Why this matters

The ignored local `.env` contains multiple provider and datastore credential
types and currently has mode `0644`, so another local account that can traverse
the project path may read it. The ignore rules cover only a few exact names, so
a future `.env.production` or similar file could be staged accidentally. The
current secrets were not found in Git history during this audit; this plan
preserves that good state without exposing any values.

## Current state

- `.env` — ignored and untracked; contains credential types for AI, search, and
  rate-limit services; mode was `-rw-r--r--` during the audit.
- `.gitignore:7-11` — ignores `.env`, `.env.local`, `.env.ollama`, and
  `.env.ollama.local`, but not the full `.env*` family.
- `.env.example` — intentionally tracked and contains placeholder names only.
- `package.json:5-14` — has no local secret-hygiene verification command.
- `README.md` — correctly says backend keys must not enter frontend `VITE_*`
  variables, but does not state local file-permission or rotation practice.

Applicable conventions: scripts are ESM `.mjs` files under `scripts/`; use
plain Node APIs and exit non-zero on a failed invariant, following
`scripts/test-ai-backend.mjs` for messaging style. Never read secret values in
the checker; inspect only filenames, Git tracking state, and file modes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Check ignore | `git check-ignore -v .env .env.ollama` | both files reported as ignored |
| Check tracking | `git ls-files -- '.env*'` | only `.env.example` |
| Check mode | `stat -f '%Lp %N' .env` | `600 .env` on macOS |
| Project checks | `pnpm test && pnpm run typecheck && pnpm run typecheck:api && pnpm run lint` | exit 0; 127+ tests pass |

## Scope

**In scope**:

- `.gitignore`
- `.env.example`
- `README.md`
- `package.json`
- `scripts/check-secret-hygiene.mjs` (create)
- local filesystem mode of `.env` and any secret-bearing `.env.*.local` files

**Out of scope**:

- Printing or rewriting any credential value.
- Calling provider dashboards or rotating credentials without explicit operator
  authorization.
- Adding a `VITE_*` secret.
- Changing runtime provider selection or Vercel environment variables.

## Git workflow

- Branch: `codex/secure-local-secrets`
- Commit message: `chore: protege secretos locales`
- Do not push or open a PR unless instructed.
- The `chmod` change on ignored files is local operational state and must not be
  represented by adding those files to Git.

## Steps

### Step 1: Broaden environment-file ignore rules safely

Replace the exact secret-file list with an `.env*` rule and immediately
re-include `!.env.example`. Keep `.env.example` tracked. Confirm no other
tracked `.env*` file exists.

**Verify**: `git check-ignore -v .env .env.local .env.ollama .env.ollama.local .env.production` → every secret-capable name is ignored; `git check-ignore .env.example` exits non-zero.

### Step 2: Restrict local credential-file permissions

Run `chmod 600 .env` and apply the same mode only to existing secret-bearing
`.env.*.local` files. Do not change `.env.example`. Do not display file
contents. Document the `chmod 600` setup step and the rule that unused keys
must be revoked at their provider, not merely deleted locally.

The current `.env` has a credential type for a provider not referenced by
runtime code. Report that credential type to the operator as a rotation/removal
candidate without printing its value; do not revoke it yourself.

**Verify**: `stat -f '%Lp %N' .env` → `600 .env`; `git status --short -- .env` → no output.

### Step 3: Add a value-blind hygiene checker

Create `scripts/check-secret-hygiene.mjs` and expose it as
`pnpm run security:secrets`. It must:

1. invoke `git ls-files -- '.env*'` and fail unless the only result is
   `.env.example`;
2. check existing `.env` and `.env.*.local` files have no group/other permission
   bits on POSIX; skip the mode assertion on Windows with an explanatory line;
3. print filenames and corrective commands only — never file contents or
   environment values.

**Verify**: `pnpm run security:secrets` → exit 0 and a concise success message containing no secret value.

### Step 4: Run the full baseline

**Verify**: `pnpm test && pnpm run typecheck && pnpm run typecheck:api && pnpm run lint` → all commands exit 0.

## Test plan

- Manually copy the repo to a temporary directory, create an empty mode-0644
  `.env.local`, and confirm the checker exits non-zero without printing content.
- Change that empty file to mode 0600 and confirm the checker passes.
- Temporarily stage a value-free `.env.production` in the temporary copy and
  confirm the tracking check fails. Never perform these negative tests with the
  real credential file.

## Done criteria

- [ ] `git ls-files -- '.env*'` prints only `.env.example`.
- [ ] Existing local secret files have POSIX mode 0600.
- [ ] `pnpm run security:secrets` exits 0 and never reads or prints values.
- [ ] README documents permissions, `VITE_*` exposure, and provider-side rotation.
- [ ] The full test/typecheck/lint baseline passes.
- [ ] No local secret file is staged or committed.

## STOP conditions

- Any credential-bearing `.env*` file is already tracked or appears in Git
  history; stop and report the filename and credential type only, because
  provider-side rotation is then required.
- Completing the work appears to require displaying or copying a credential.
- The operator has not authorized provider-side revocation; do not perform it.
- The hygiene checker cannot be value-blind.

## Maintenance notes

Run `pnpm run security:secrets` before commits that touch environment setup.
Reviewers should reject any new real environment file even if its values look
like test credentials. Secret rotation remains an operator action.
