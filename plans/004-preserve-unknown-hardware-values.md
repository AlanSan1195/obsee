# Plan 004: Preserve unknown hardware values instead of fabricating measurements

> **Executor instructions**: Execute exactly this plan, running each gate. Stop
> on a scope or contract surprise. The reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 7b438e7..HEAD -- src/shared/types.ts src/shared/validation.ts src/shared/validation.test.ts src/renderer/lib/system-info.ts src/renderer/lib/system-info.test.ts api/_lib/groq.ts`
> Completed plans 001–003 are expected in the two system-info files.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/003-confirm-cpu-core-count.md`
- **Category**: bug
- **Planned at**: commit `7b438e7`, 2026-07-15

## Why this matters

The browser cannot read CPU frequency or discrete VRAM reliably. Current code
fabricates 3 GHz to satisfy validation and encodes unknown VRAM as 0 MB, then tells
Groq the GPU has `0MB VRAM`. Unknown data must remain unknown so the AI cannot
interpret a placeholder as a weak machine.

## Current state

At `system-info.ts:126-135`:

```ts
cpu: { model: overrides.cpuModel, cores: hints.cores, speed: 3 },
gpu: { model: hints.gpu.model, vram: 0, vendor: hints.gpu.vendor, hasNvenc: hints.gpu.hasNvenc },
```

`validation.ts:267-295` requires positive CPU speed but accepts any numeric VRAM.
`api/_lib/groq.ts:123-128` interpolates `${systemInfo.gpu.vram}MB VRAM` literally.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Validation tests | `pnpm test -- src/shared/validation.test.ts` | exit 0 |
| Acquisition tests | `pnpm test -- src/renderer/lib/system-info.test.ts` | exit 0 |
| Full gate | `pnpm test && pnpm run typecheck && pnpm run typecheck:api && pnpm run lint` | all exit 0 |

## Scope

**In scope**:
- `src/shared/types.ts`
- `src/shared/validation.ts`
- `src/shared/validation.test.ts`
- `src/renderer/lib/system-info.ts`
- `src/renderer/lib/system-info.test.ts`
- `api/_lib/groq.ts`

**Out of scope**:
- Adding CPU-frequency or VRAM inputs.
- Inferring Apple unified-memory allocation.
- Changing recommendation response validation or OBS application.
- GPU model correction UI.

## Git workflow

- Branch: `codex/accurate-hardware-detection`
- Commit: `fix: representar hardware desconocido`.
- Do not push, merge, or open a PR.

## Steps

### Step 1: Make unavailable measurements optional

Change `SystemInfo.cpu.speed` and `SystemInfo.gpu.vram` to optional numbers. In
`validateSystemInfo`, accept omission; when present, require finite positive speed
and finite non-negative VRAM. Preserve all other fields and return omission rather
than manufacturing a default.

**Verify**: validation tests cover omitted values, valid present values, and reject
negative/NaN/wrong-type values.

### Step 2: Stop creating placeholders

Remove `speed: 3` and `vram: 0` from `getSystemInfo()`. Do not replace them with
other guesses. Update acquisition tests so absence is asserted explicitly.

**Verify**: `rg -n "speed: 3|vram: 0" src/renderer/lib/system-info.ts` → no matches.

### Step 3: Render unknown values honestly in prompts

Centralize short prompt-formatting helpers in `api/_lib/groq.ts` if useful. When
VRAM is absent, say `VRAM desconocida` (for Apple, it is acceptable to add
`memoria unificada/no separada`). Do not emit `undefinedMB` or `0MB`. CPU speed is
currently unused in prompts and should remain omitted rather than guessed. Apply
the same honest formatting to every prompt that mentions VRAM.

**Verify**: `rg -n "undefinedMB|0MB VRAM" api src` → no matches in production prompt code.

## Test plan

Expand validation and acquisition tests only. Existing Groq transport has no unit
seam; do not introduce network tests. Typecheck:api is the prompt integration gate.

## Done criteria

- [ ] Final hardware omits unavailable CPU speed and VRAM.
- [ ] Validation distinguishes omitted from invalid measurements.
- [ ] Groq never receives `0MB VRAM` for an unknown value.
- [ ] All focused/full tests, both typechecks, and lint pass.
- [ ] Only in-scope files changed.

## STOP conditions

- Optional fields break an unlisted runtime consumer that requires measured values.
- The fix requires changing recommendation response contracts.
- Verification fails twice.

## Maintenance notes

Optional means unavailable, not zero. Future native detection may populate these
fields, but it must not reintroduce nominal constants merely to satisfy schemas.

