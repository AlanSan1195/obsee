# Plan 001: Characterize browser hardware acquisition

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report; do not improvise. The reviewing
> advisor maintains `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7b438e7..HEAD -- src/renderer/lib/system-info.ts src/renderer/lib/system-info.test.ts`
> If `system-info.ts` differs from the excerpts below, stop and report.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `7b438e7`, 2026-07-15

## Why this matters

The browser acquisition layer has no direct tests, even though it parses WebGL,
browser globals, and persisted user data. The observed Mac mini M4 mismatch
originates here. Characterization tests must make the current boundaries visible
before later plans change their semantics.

## Current state

- `src/renderer/lib/system-info.ts` owns GPU parsing, OS parsing, browser hints,
  localStorage overrides, and final `SystemInfo` construction.
- No `system-info.test.ts` exists. Existing Vitest tests use the Node environment
  and named imports; follow `src/shared/localRecommendation.test.ts` for style.
- Current acquisition at `system-info.ts:104-114` is:

```ts
const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
const gpu = detectGpu();
return {
  gpu,
  cores: navigator.hardwareConcurrency || 4,
  cpuModelHint: gpu.vendor === 'Apple' && /Apple M\d/i.test(gpu.model) ? gpu.model : undefined,
  ramGbHint: typeof deviceMemory === 'number' && deviceMemory > 0 ? deviceMemory : undefined,
  os: detectOS(),
};
```

Repo conventions: TypeScript, two spaces, single quotes, semicolons, named
exports, colocated `*.test.ts`, and Vitest `describe`/`it`/`expect`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm test -- src/renderer/lib/system-info.test.ts` | exit 0; new tests pass |
| Full tests | `pnpm test` | exit 0; all tests pass |
| Typecheck | `pnpm run typecheck` | exit 0; no errors |
| Lint | `pnpm run lint` | exit 0; no errors |

## Scope

**In scope**:
- `src/renderer/lib/system-info.test.ts` (create)

**Out of scope**:
- All production code.
- DOM testing libraries or package changes; mock only the minimal globals used.
- Recommendation policy tests; those belong to plan 005.

## Git workflow

- Branch: `codex/accurate-hardware-detection`
- Commit this plan as one focused commit, e.g. `test: caracterizar deteccion de hardware`.
- Do not push, merge, or open a PR.

## Steps

### Step 1: Build isolated browser-global test helpers

Create `system-info.test.ts`. Save and restore property descriptors for
`globalThis.navigator`, `globalThis.document`, and `globalThis.localStorage` in
`beforeEach`/`afterEach`. Implement a minimal fake WebGL context supporting
`getExtension()` and `getParameter()`; do not add jsdom.

**Verify**: `pnpm run typecheck` → exit 0.

### Step 2: Characterize GPU and hint acquisition

Add meaningful assertions for:

- ANGLE string `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`
  produces model `Apple M4`, vendor `Apple`, and no NVENC.
- Missing WebGL produces model/vendor `Unknown`.
- `hardwareConcurrency: 6` remains the reported hint `6`.
- falsy/missing concurrency uses the current fallback `4`.
- `deviceMemory: 8` becomes `ramGbHint: 8`.
- Apple GPU produces `cpuModelHint: 'Apple M4'`.

**Verify**: `pnpm test -- src/renderer/lib/system-info.test.ts` → all cases pass.

### Step 3: Characterize persistence and final assembly

Test valid override loading, malformed JSON fallback, whitespace trimming, and
`getSystemInfo()` throwing when CPU model or RAM is missing. Assert current final
assembly uses stored CPU/RAM plus browser-reported concurrency. These assertions
may be intentionally updated by plans 002–004.

**Verify**: `pnpm test` → all existing tests plus new acquisition tests pass.

## Test plan

This plan is entirely test-focused. Each test must assert a returned value or
error message; tests that only assert a mock was called are insufficient.

## Done criteria

- [ ] `src/renderer/lib/system-info.test.ts` exists with the listed cases.
- [ ] `pnpm test -- src/renderer/lib/system-info.test.ts` exits 0.
- [ ] `pnpm test`, `pnpm run typecheck`, and `pnpm run lint` exit 0.
- [ ] `git diff --name-only` lists only the in-scope test file.

## STOP conditions

- `system-info.ts` has drifted from commit `7b438e7`.
- Browser globals cannot be safely restored between tests without adding a DOM dependency.
- A focused verification fails twice after a reasonable test-only correction.

## Maintenance notes

Keep mocks local and restore descriptors so later tests cannot inherit a fake
browser. Plans 002–004 deliberately update some characterized expectations as
the hardware contract becomes more truthful.

