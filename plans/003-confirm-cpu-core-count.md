# Plan 003: Require an editable confirmed CPU core count

> **Executor instructions**: Follow every step and verification. Stop instead of
> broadening scope. The reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7b438e7..HEAD -- src/renderer/lib/system-info.ts src/renderer/lib/system-info.test.ts src/renderer/components/HardwareForm.tsx README.md docs/apuntes.md`
> Completed plans 001–002 are expected; confirm their behavior matches their done criteria.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/002-require-confirmed-ram.md`
- **Category**: bug
- **Planned at**: commit `7b438e7`, 2026-07-15

## Why this matters

`navigator.hardwareConcurrency` reports logical processors potentially available
to the browser and may be lower than the installed CPU. A Mac mini with 10 CPU
cores can therefore be displayed and submitted as 6. The browser value must be
an estimated hint, while the recommendation uses an editable, user-confirmed count.

## Current state

- `system-info.ts:109` sets `cores: navigator.hardwareConcurrency || 4`.
- `HardwareForm.tsx:45-48` renders it read-only as `hilos cpu`.
- `system-info.ts:127-130` copies that value to `SystemInfo.cpu.cores`; no override exists.
- `AnalyzeButton.tsx:58-60` obtains hardware locally before calling AI, so no AI
  detection should be added.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm test -- src/renderer/lib/system-info.test.ts` | exit 0 |
| Full gate | `pnpm test && pnpm run typecheck && pnpm run typecheck:api && pnpm run lint` | all exit 0 |

## Scope

**In scope**:
- `src/renderer/lib/system-info.ts`
- `src/renderer/lib/system-info.test.ts`
- `src/renderer/components/HardwareForm.tsx`
- `README.md`
- `docs/apuntes.md`

**Out of scope**:
- Renaming the shared `SystemInfo.cpu.cores` API.
- Looking up CPU specifications with AI/Tavily.
- GPU manual fallback.
- Recommendation thresholds (plan 005).

## Git workflow

- Branch: `codex/accurate-hardware-detection`
- Commit: `fix: confirmar nucleos de cpu`.
- Do not push, merge, or open a PR.

## Steps

### Step 1: Persist a validated CPU core override

Extend the versioned `HardwareOverrides` record with optional `cpuCores`. Load it
only when finite, positive, integer, and within a defensible workstation range
(1–256). Save it with the other confirmed fields.

**Verify**: tests cover valid 10, fractional/zero/negative rejection, and reload.

### Step 2: Add an editable required CPU-count field

Add a numeric form control labeled `Núcleos CPU` (or equally clear Spanish).
Initialize only from confirmed storage, not from `hardwareConcurrency`. Display
the browser value separately as `estimación del navegador: 6 procesadores lógicos`
with wording that it may be lower than the installed count. Preserve the existing
CPU-model and RAM controls and styling conventions.

**Verify**: code inspection plus `pnpm run typecheck`; no DOM dependency is added.

### Step 3: Assemble only confirmed CPU capacity

`getSystemInfo()` must require `cpuModel`, `cpuCores`, and `ramGb`. Use
`overrides.cpuCores` for `SystemInfo.cpu.cores`; never use the browser hint as the
final value and remove the invented fallback `4` from final assembly. Keep the
browser hint available only for display.

Expected M4 regression case: browser hint 6 + confirmed cores 10 produces final
`SystemInfo.cpu.cores === 10`.

**Verify**: focused test asserts this exact case.

### Step 4: Correct product wording and docs

Explain that CPU model, core count, and RAM require confirmation; GPU model is a
WebGL inference. Change `docs/apuntes.md` reliability from `Exacta` to an estimated
browser concurrency hint.

**Verify**: `rg -n "Exacta|hardwareConcurrency|Núcleos CPU|estim" README.md docs/apuntes.md src/renderer/components/HardwareForm.tsx` shows no exactness claim.

## Test plan

Update acquisition tests for validation/persistence and the 6→10 override. Keep a
test that `detectHardwareHints()` reports 6 as a hint; replace any test asserting
that final `SystemInfo` must use 6.

## Done criteria

- [ ] CPU count is editable and required for analysis.
- [ ] Browser 6 + confirmed 10 sends 10 to `SystemInfo`.
- [ ] No final path uses a fallback count of 4.
- [ ] Focused/full tests, both typechecks, and lint pass.
- [ ] Only in-scope files changed.

## STOP conditions

- Implementing the field requires changing the public AI request shape.
- The previous RAM schema is absent or incompatible.
- Verification fails twice.

## Maintenance notes

The shared field remains named `cores` for compatibility, but it now represents a
user-confirmed physical count. Any future rename to logical processors is a separate
contract migration and must update recommendation policy simultaneously.

