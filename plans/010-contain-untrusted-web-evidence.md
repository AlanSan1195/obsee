# Plan 010: Prevent untrusted web evidence from steering OBS recommendations

> **Executor instructions**: Treat every search result and model-supplied URL as
> hostile data. Use exact hostname-boundary checks and deterministic output
> validation. Do not add exploit strings to production prompts or test logs;
> use neutral lookalike domains in unit tests. Update the plan status when done.
>
> **Drift check (run first)**: `git diff --stat ceb1be2..HEAD -- api/_lib/groq.ts api/_lib/web-sources.ts api/_lib/web-sources.test.ts api/web-search.ts api/web-search.test.ts api/audio-profile.ts api/console-profile.ts src/shared/validation.ts src/shared/validation.test.ts`
> Material drift in search selection or recommendation validation is a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `ceb1be2`, 2026-07-16

## Why this matters

The source allowlist uses substring matching, so a hostname that merely contains
a trusted brand can pass. The internal search path also accepts any untrusted
result with score `>=0.6` and inserts its raw text into the console prompt. That
lets external page content influence settings later written to a user's OBS and
can expose misleading source links. Strong source boundaries plus bounded,
explicitly untrusted prompt context reduce both prompt injection and phishing
risk.

## Current state

- `api/_lib/groq.ts:33-46` and `api/web-search.ts:5-18` duplicate a list mixing
  real root domains with unsafe fragments such as `support.` and `manual.`.
- `api/_lib/groq.ts:59-63` and `api/web-search.ts:20-26` trust a hostname when
  `domain.includes(trusted)`.
- `api/_lib/groq.ts:86-90` retains arbitrary non-trusted results with score
  `>=0.6`.
- `api/_lib/groq.ts:400-402,438-449` inserts selected result snippets into the
  console recommendation prompt.
- `api/_lib/groq.ts:255-260,454-458` overwrites Tavily-path response sources with
  the fetched URLs, which is a good pattern to preserve.
- `src/shared/validation.ts:48-55` accepts every syntactically valid HTTP(S)
  source URL; `ConsoleReport.tsx:120-128` and `AudioConfiguration.tsx:613-621`
  render those URLs with safe `rel="noreferrer"` but cannot establish trust.
- Output validators clamp many audio/console numbers, but core recommendation
  fields `encoder`, `recording_format`, and `recording_quality` are only checked
  as non-empty strings at `src/shared/validation.ts:490-518`.

Shared validators use named exports and colocated Vitest tests. API-specific
source policy belongs in `api/_lib/`; do not ship provider policy or secrets to
the browser.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Source tests | `pnpm test -- api/_lib/web-sources.test.ts api/web-search.test.ts` | all pass |
| Validation tests | `pnpm test -- src/shared/validation.test.ts` | all pass |
| API typecheck | `pnpm run typecheck:api` | exit 0 |
| Full baseline | `pnpm test && pnpm run typecheck && pnpm run lint` | exit 0 |

## Scope

**In scope**:

- `api/_lib/groq.ts`
- `api/_lib/web-sources.ts` (create)
- `api/_lib/web-sources.test.ts` (create)
- `api/web-search.ts`
- `api/web-search.test.ts` (create if endpoint behavior needs direct coverage)
- `api/audio-profile.ts`
- `api/console-profile.ts`
- `src/shared/validation.ts`
- `src/shared/validation.test.ts`

**Out of scope**:

- Adding another search provider.
- Allowing arbitrary community/retailer pages to influence applied settings.
- Rendering HTML from search results.
- Changing local fallback recommendation policy except where needed to reject an
  unsafe AI result.
- Automatically applying AI output without the current user review step.

## Git workflow

- Branch: `codex/trust-web-evidence`
- Commit message: `fix: limita fuentes web no confiables`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Centralize exact source-host policy

Create `api/_lib/web-sources.ts` with a reviewed set of actual root domains, not
fragments. A host is trusted only when it equals a root or ends with
`.${root}`. Normalize via `new URL`, lowercase hostname, remove a single trailing
dot, accept HTTPS only for user-facing evidence, and reject credentials,
non-default ports, IP literals, localhost, and malformed URLs.

Remove generic fragments (`support.`, `manual.`, etc.). Manufacturer subdomains
remain valid through root-boundary matching. Export small named helpers used by
both search paths.

**Verify**: tests accept `support.playstation.com` for an approved root and reject neutral lookalikes such as `playstation.com.example.test`, `example-playstation.com`, HTTP, credentials, and localhost.

### Step 2: Select only trusted evidence

Replace both duplicated allowlists with the shared helper. Remove the
score-only `relevant` fallback: a relevance score is not a trust decision. For
unknown hardware with no reviewed official domain, return no external evidence
and use the existing conservative/model fallback rather than presenting an
untrusted page as verified.

Keep the number of results bounded. Truncate each result snippet and the total
joined context to documented limits before it reaches a prompt.

**Verify**: source/endpoint tests prove no untrusted URL or content is returned or selected regardless of relevance score.

### Step 3: Mark search content as untrusted data in prompts

Place bounded snippets inside explicit data delimiters and add a system-level
instruction that text inside those delimiters is evidence only and must not
override instructions, request tools, or choose settings outside allowed policy.
Do not interpolate search content into a system message. Preserve fetched URLs
as backend-owned metadata and overwrite model-supplied source arrays on every
search path, including the Groq search-model fallback.

**Verify**: unit tests/mocks show model-provided source URLs are discarded and only backend-selected trusted URLs reach the API response.

### Step 4: Add semantic output guardrails before OBS use

Replace non-empty-string checks for AI-controlled encoder, recording format, and
recording quality with explicit application-supported allowlists or mappings.
Derive the encoder set from existing OBS mappings rather than creating a second
contradictory list. Reject unknown values so endpoint handlers use the existing
local fallback/error path; do not silently coerce an unknown model value into an
OBS profile write.

Retain current numeric clamps and the user-visible review step.

**Verify**: `pnpm test -- src/shared/validation.test.ts` → tests reject unknown encoder/format/quality and accept every value emitted by local recommendation fixtures.

### Step 5: Run the full baseline

**Verify**: `pnpm test && pnpm run typecheck && pnpm run typecheck:api && pnpm run lint` → all pass.

## Test plan

- Host-boundary tests: exact root, approved subdomain, prefix lookalike, suffix
  lookalike, userinfo, port, IP literal, localhost, HTTP, malformed URL.
- Search selection tests: high-score untrusted result rejected; trusted result
  retained; oversized content truncated; result count bounded.
- Source provenance tests: Tavily/backend URL wins; model-invented URL removed.
- Semantic validation tests: supported values accepted, unknown strings rejected,
  local recommendation outputs remain accepted.
- Endpoint regression: invalid AI output returns existing safe 502/fallback
  behavior and is never passed to OBS.

## Done criteria

- [ ] No hostname trust decision uses `includes` or unanchored substring matching.
- [ ] Score alone never admits a source.
- [ ] Search content and counts are bounded before prompting.
- [ ] Only backend-selected trusted HTTPS URLs are returned as sources.
- [ ] AI output cannot introduce unsupported encoder/format/quality strings.
- [ ] All focused and full verification gates pass.

## STOP conditions

- Product requirements demand community or retailer evidence without a reviewed
  domain policy; stop for a maintainer trust decision.
- Existing local recommendations emit values outside the proposed semantic
  allowlists; reconcile the canonical mapping before changing validation.
- A provider API cannot distinguish fetched sources from model-generated text.
- Safe behavior would require silently applying an unrecognized OBS setting.

## Maintenance notes

Adding a trusted root is a security-policy change and needs review plus boundary
tests. Search relevance and source trust must remain separate concepts. Future
AI features should carry source provenance as structured metadata, never only as
text inside a prompt.
