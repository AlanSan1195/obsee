# Plan 009: Fail closed when distributed rate limiting is unavailable

> **Executor instructions**: Follow this plan in order. Production Groq/Tavily
> traffic must never silently fall back to an instance-local counter. Preserve
> unlimited local Ollama behavior. Do not log tokens, IP addresses, or install
> identifiers. Update the status row when done unless a reviewer maintains it.
>
> **Drift check (run first)**: `git diff --stat ceb1be2..HEAD -- api/_lib/rate-limit.ts api/_lib/rate-limit.test.ts api/health.ts .env.example README.md`
> Material drift in rate-limit storage or provider selection is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `ceb1be2`, 2026-07-16
- **Implemented**: working tree on `main`, 2026-07-16

## Why this matters

When Upstash configuration is absent, production requests fall back to a module
`Map`. Serverless instances do not share that map and cold starts reset it, so
the advertised daily limit can be bypassed through scale-out. An invalid
`OBSREC_AI_DAILY_LIMIT` also becomes `NaN`, making the comparison ineffective.
This protects project quota/cost and preserves availability for normal users.

## Current state

- `api/_lib/rate-limit.ts:5-6` — limit parsed once with `Number(...)` and an
  instance-local `Map` exists.
- `api/_lib/rate-limit.ts:22-25` — missing Upstash URL/token returns `null`.
- `api/_lib/rate-limit.ts:61-64` — `null` silently selects the memory counter.
- `api/_lib/rate-limit.ts:67-70` — Ollama correctly bypasses remote rate limits.
- `api/_lib/rate-limit.ts:72-79` — raw client header and IP become datastore keys
  without format/length normalization.
- `api/_lib/rate-limit.ts:97-102` — actual datastore failures fail closed.
- `api/health.ts:8-15` — publicly reveals provider and configuration booleans.
- There are no rate-limit unit tests.

Use Vitest with `vi.stubEnv`, `vi.stubGlobal('fetch', ...)`, and
`vi.resetModules`, following `api/_lib/ai-provider.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm test -- api/_lib/rate-limit.test.ts` | all new cases pass |
| API typecheck | `pnpm run typecheck:api` | exit 0 |
| Full baseline | `pnpm test && pnpm run typecheck && pnpm run lint` | exit 0 |

## Scope

**In scope**:

- `api/_lib/rate-limit.ts`
- `api/_lib/rate-limit.test.ts` (create)
- `api/health.ts`
- `.env.example`
- `README.md`

**Out of scope**:

- User accounts, billing, CAPTCHA, or a new database.
- Increasing the default daily limit.
- Logging raw IP/install identifiers.
- Replacing Upstash with another vendor.

## Git workflow

- Branch: `codex/distributed-rate-limit`
- Commit message: `fix: exige limite distribuido en produccion`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Make configuration parsing safe

Move daily-limit parsing behind a tested helper. Accept only a positive finite
integer within a documented conservative maximum; otherwise use the default 20
and emit no sensitive data. Normalize the install ID to the UUID format produced
by `crypto.randomUUID()`; use the existing missing-ID bucket for absent/invalid
values. Bound and normalize the trusted platform IP string before using it as a
key. Never place an arbitrary full header into an Upstash key.

**Verify**: `pnpm test -- api/_lib/rate-limit.test.ts` → invalid limit and identifier tests pass.

### Step 2: Require Upstash for remote providers

For Groq/Tavily-backed production traffic, missing Upstash URL/token must return
the same fail-closed result used for datastore errors. Retain the memory counter
only behind an explicit `OBSREC_ALLOW_MEMORY_RATE_LIMIT=true` opt-in and only
when not running on Vercel/production. Ollama remains unlimited because it is a
local developer provider and creates no remote project cost.

Do not infer production solely from an unset `NODE_ENV`; treat Vercel presence as
production. A production process must ignore the memory opt-in.

**Verify**: focused tests prove missing Upstash denies Groq in production, allows explicit local development fallback, and still allows Ollama.

### Step 3: Minimize public health information

Change the public health response to stable liveness fields only, such as
`{ ok: true, service: 'obsrec-ai' }`. Configuration validation belongs in logs
or deployment checks, not the unauthenticated response. Update the smoke script
if it currently asserts removed fields.

**Verify**: `rg -n "groqConfigured|ollamaConfigured|rateLimitConfigured|provider" api/health.ts` → no matches.

### Step 4: Document deployment requirements

Document that production deployment requires both Upstash variables and that
memory fallback is local-only, explicit, and unsafe for serverless production.
Add the non-secret opt-in name to `.env.example` with the safe default `false`.

**Verify**: `rg -n "UPSTASH|OBSREC_ALLOW_MEMORY_RATE_LIMIT" README.md .env.example` → requirements and safe default are present.

### Step 5: Run the full baseline

**Verify**: `pnpm test && pnpm run typecheck && pnpm run typecheck:api && pnpm run lint` → all pass.

## Test plan

Create `api/_lib/rate-limit.test.ts` covering:

- Ollama bypasses remote storage;
- production Groq with missing URL, missing token, or both fails closed;
- Upstash fetch failure and malformed response fail closed;
- explicit non-production memory fallback enforces the limit;
- production ignores the memory-fallback opt-in;
- invalid/zero/negative/huge daily limit uses the safe default;
- valid UUID remains distinct while malformed/oversized install IDs collapse to
  the missing bucket;
- Upstash requests never expose token or identifier in thrown/user messages.

## Done criteria

- [x] Production remote-provider traffic cannot use the in-memory limiter.
- [x] Invalid limit configuration cannot disable enforcement.
- [x] Rate-limit keys contain bounded normalized identifiers.
- [x] Health no longer exposes provider/configuration state.
- [x] Local Ollama behavior remains unchanged.
- [x] Focused and full verification gates pass.

## STOP conditions

- Production intentionally runs without a shared datastore and the operator is
  unwilling to accept fail-closed behavior.
- Vercel runtime detection cannot be made deterministic from documented env.
- Existing clients rely on health configuration fields.
- Upstash pipeline semantics differ from the assumptions in current code; stop
  and verify official documentation before altering commands.

## Maintenance notes

Monitor 429 and fail-closed rates without logging raw client identifiers. If the
service later gains accounts, replace install IDs with authenticated subject IDs
rather than layering another client-controlled header onto this design.
