# Plan 008: Reject cross-site and non-JSON AI requests before spending quota

> **Executor instructions**: Follow the plan exactly. Apply the shared request
> guard to every quota-bearing POST endpoint before rate limiting or provider
> calls. Preserve same-origin production, local Ollama, Vite proxy, and CLI smoke
> tests. Update the plan status when done unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat ceb1be2..HEAD -- api/_lib/http.ts api/_lib/http.test.ts api/recommendation.ts api/explanation.ts api/audio-profile.ts api/console-profile.ts api/web-search.ts .env.example scripts/local-api-plugin.ts scripts/test-ai-backend.mjs`
> Material drift in request parsing or proxy behavior is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `ceb1be2`, 2026-07-16

## Why this matters

The five public POST endpoints accept a JSON string even when sent with a simple
cross-origin content type, and none checks `Origin`. A hostile website can cause
visitors' browsers to send requests that consume the visitors' daily allowance
and the project's provider quota, even though the response is unreadable due to
CORS. Requiring JSON forces browser preflight, while an origin guard adds a
second same-site check before any rate-limit write or paid provider call.

## Current state

- `api/_lib/http.ts:20-41` — header access and `readBody`; no media-type or
  origin policy.
- `api/recommendation.ts:10-21` — method check, then rate limit, then body
  validation. The same sequence exists in `explanation.ts`, `audio-profile.ts`,
  `console-profile.ts`, and `web-search.ts`.
- `src/renderer/lib/ai-remote.ts:17-26` — legitimate browser requests send
  `Content-Type: application/json` and `X-OBSREC-Install-Id`.
- `vite.config.ts` proxies `/api` in remote mode with `changeOrigin: true`;
  development origins therefore need explicit, narrow handling.
- `scripts/test-ai-backend.mjs` sends JSON and also calls health without an
  `Origin` header.

HTTP helpers use named exports and plain result objects. Tests use Vitest beside
the code, as shown by `api/_lib/ai-provider.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm test -- api/_lib/http.test.ts` | all new cases pass |
| API typecheck | `pnpm run typecheck:api` | exit 0 |
| Full baseline | `pnpm test && pnpm run typecheck && pnpm run lint` | exit 0 |

## Scope

**In scope**:

- `api/_lib/http.ts`
- `api/_lib/http.test.ts` (create)
- `api/recommendation.ts`
- `api/explanation.ts`
- `api/audio-profile.ts`
- `api/console-profile.ts`
- `api/web-search.ts`
- `.env.example`
- `scripts/local-api-plugin.ts` and `scripts/test-ai-backend.mjs` only if needed
  to preserve documented local/smoke behavior

**Out of scope**:

- User authentication or accounts.
- Enabling wildcard CORS.
- Treating `Origin` as protection for non-browser clients; rate limiting remains
  required.
- Changing request or response business payloads.

## Git workflow

- Branch: `codex/protect-ai-request-boundary`
- Commit message: `fix: bloquea solicitudes cruzadas a la IA`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define one request-boundary guard

Add a named helper in `api/_lib/http.ts` that returns a discriminated result and
enforces, in this order:

1. method is POST, otherwise status 405;
2. `Content-Type` media type, case-insensitively and ignoring parameters, is
   exactly `application/json`, otherwise 415;
3. if `Origin` is present, it must equal an allowed origin; otherwise 403.

Allowed origins must include the canonical production origin and the documented
local Vite origins. Support an `OBSREC_ALLOWED_ORIGINS` comma-separated backend
environment variable for preview/custom domains. Parse each with `new URL`,
compare normalized origins exactly, and ignore invalid configured entries. Do
not use substring, suffix, regex-from-env, or reflected-origin matching. Requests
with no `Origin` remain allowed for the CLI smoke test and other non-browser
clients.

**Verify**: `pnpm test -- api/_lib/http.test.ts` → helper tests pass.

### Step 2: Guard every paid/quota-bearing endpoint first

Call the shared guard immediately after `Cache-Control: no-store` in all five
POST endpoints. On failure, return the helper's generic status/message without
calling `checkRateLimit`, parsing the body, Tavily, Groq, or Ollama. Remove the
now-duplicated method checks.

**Verify**: `rg -n "require.*Json|checkRateLimit" api/{recommendation,explanation,audio-profile,console-profile,web-search}.ts` → every file shows the guard before `checkRateLimit`.

### Step 3: Preserve supported environments

Document `OBSREC_ALLOWED_ORIGINS` in `.env.example` without a secret value.
Confirm `pnpm dev` same-origin local requests and `pnpm run dev:remote` proxy
requests use one of the explicit local origins. Adjust the proxy's forwarded
origin only if tests demonstrate it is necessary; never add `*`.

**Verify**: `pnpm run test:ai-backend` against the local Ollama server, when available, → health and non-paid smoke checks pass. If Ollama is unavailable, record this gate as not run rather than changing policy.

### Step 4: Run the full baseline

**Verify**: `pnpm test && pnpm run typecheck && pnpm run typecheck:api && pnpm run lint` → all pass.

## Test plan

Create `api/_lib/http.test.ts` covering:

- canonical same-origin JSON POST allowed;
- `application/json; charset=utf-8` allowed;
- configured preview origin allowed by exact match;
- `text/plain`, missing content type, and form content rejected with 415;
- hostile origin, prefix/suffix lookalikes, and malformed origin rejected with 403;
- missing Origin allowed for CLI clients;
- GET rejected with 405;
- a representative endpoint test/mocked invocation proving a rejected request
  does not call the rate limiter or provider.

## Done criteria

- [ ] All five endpoints share the same guard before any costly work.
- [ ] Cross-site `text/plain` requests receive 415 without rate-limit/provider calls.
- [ ] Unapproved browser origins receive 403.
- [ ] No wildcard/reflected CORS header exists.
- [ ] Local, canonical production, configured preview, and no-Origin CLI cases are covered.
- [ ] Full test/typecheck/lint baseline passes.

## STOP conditions

- Preview/custom domains cannot be represented as an explicit origin list.
- Vercel or Vite rewrites `Origin` in a way that cannot be tested deterministically.
- A legitimate shipped client sends a non-JSON POST.
- The change appears to require authentication or a public CORS API redesign.

## Maintenance notes

Add every future quota-bearing endpoint to this guard. Keep custom origins exact
and few; an origin check is browser abuse resistance, not authentication.
