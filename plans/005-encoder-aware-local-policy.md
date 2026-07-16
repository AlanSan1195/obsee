# Plan 005: Make the local video ceiling encoder-aware

> **Executor instructions**: Follow the plan and gates exactly. Stop on a policy
> ambiguity outside the stated matrix. The reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 7b438e7..HEAD -- src/shared/localRecommendation.ts src/shared/localRecommendation.test.ts`
> These files should not have changed in plans 001–004.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/004-preserve-unknown-hardware-values.md`
- **Category**: bug
- **Planned at**: commit `7b438e7`, 2026-07-15

## Why this matters

The deterministic fallback selects Apple VT/NVENC/QSV/AMD hardware encoding, but
its resolution/FPS ceiling ignores that capability and requires at least eight CPU
cores. This can downgrade capable hardware to 720p30. CPU capacity should remain
the gate for x264, while known hardware encoders can support the existing 1080p60
profile when RAM is sufficient.

## Current state

`localRecommendation.ts:21-38` currently uses:

```ts
const { cpu, ram } = request.systemInfo;
const canUse1080p60 = cpu.cores >= 8 && ram.total >= 16;
```

`getEncoder()` at lines 3–13 already deterministically returns `nvenc`,
`apple vt h264`, `qsv`, `amd`, or `x264`. Existing tests at
`localRecommendation.test.ts:80-101` cover low CPU and encoder selection
separately, not their interaction.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm test -- src/shared/localRecommendation.test.ts` | exit 0 |
| Full gate | `pnpm test && pnpm run typecheck && pnpm run typecheck:api && pnpm run lint` | all exit 0 |

## Scope

**In scope**:
- `src/shared/localRecommendation.ts`
- `src/shared/localRecommendation.test.ts`

**Out of scope**:
- AI/Groq semantic guardrails.
- New resolutions, bitrates, or platform policies beyond the existing profiles.
- Benchmarking or model-specific performance tables.
- Treating unknown GPU vendors as hardware-encoder capable.

## Git workflow

- Branch: `codex/accurate-hardware-detection`
- Commit: `fix: considerar encoder de hardware`.
- Do not push, merge, or open a PR.

## Steps

### Step 1: Define the explicit capability policy

Derive the selected encoder once and pass/consult it when computing the video
profile. Preserve the existing RAM requirement. The exact policy is:

- `ram.total < 16` → existing 720p30 profile.
- Known hardware encoder (`nvenc`, `apple vt h264`, `qsv`, `amd`) plus RAM ≥16 → existing 1080p60 profile, regardless of CPU core count.
- `x264` plus RAM ≥16 → 1080p60 only when confirmed `cpu.cores >= 8`.
- Unknown GPU continues to select x264 and therefore uses the CPU threshold.

Do not alter bitrate, recording-quality, or OBS-baseline comparison rules.

**Verify**: typecheck passes after refactoring; encoder remains computed consistently.

### Step 2: Add the regression matrix

Add tests for Apple/6 cores/16 GB → 1080p60; NVIDIA/6/16 → 1080p60;
Intel/6/16 → 1080p60; AMD/6/16 → 1080p60; unknown/x264/6/16 →
720p30; x264/8/16 → 1080p60; Apple/10/8 → 720p30. Retain existing
baseline and platform assertions.

**Verify**: focused tests pass and each matrix row asserts resolution and FPS.

## Test plan

Use the existing `makeRequest` helper and table-driven `it.each` if it improves
clarity. Do not weaken the existing low-resource tests; make their GPU/encoder
assumptions explicit where necessary.

## Done criteria

- [ ] The policy matrix above is implemented exactly.
- [ ] All matrix rows have meaningful assertions.
- [ ] Existing bitrate/baseline behavior remains covered and unchanged.
- [ ] Focused/full tests, both typechecks, and lint pass.
- [ ] Only the two in-scope files changed.

## STOP conditions

- Existing tests reveal a deliberate policy that contradicts the stated matrix.
- Supporting known hardware encoders requires model-specific guesses.
- Verification fails twice.

## Maintenance notes

If future code learns actual OBS encoder availability, prefer that observed
capability over GPU-vendor inference. Keep x264 conservative because it consumes
CPU directly.

