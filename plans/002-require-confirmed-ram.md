# Plan 002: Require explicitly confirmed RAM

> **Executor instructions**: Follow every step and verification. Stop on any
> STOP condition. The reviewing advisor maintains the plan index.
>
> **Drift check (run first)**: `git diff --stat 7b438e7..HEAD -- src/renderer/lib/system-info.ts src/renderer/lib/system-info.test.ts src/renderer/components/HardwareForm.tsx README.md docs/apuntes.md`
> Changes produced by completed plan 001 are expected only in the new test file.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-characterize-hardware-acquisition.md`
- **Category**: bug
- **Planned at**: commit `7b438e7`, 2026-07-15

## Why this matters

Chrome's `navigator.deviceMemory` is privacy-capped, commonly at 8 GB. The form
currently initializes its RAM select from that hint and immediately persists it,
so a 16–64 GB machine can silently become an 8 GB machine in recommendation
inputs. RAM must remain empty until explicitly selected by the user.

## Current state

- `system-info.ts:112-113` correctly comments that `deviceMemory` is capped but
  exposes it as `ramGbHint`.
- `HardwareForm.tsx:16-27` initializes `ramGb` from that hint, then its mount
  effect saves it into `obsrec-hardware`.
- `docs/apuntes.md:106-112` says the hint is useless for recommendations and RAM
  is requested manually, which contradicts the implementation.

```ts
const [ramGb, setRamGb] = useState(String(initial.ramGb ?? hints.ramGbHint ?? ''));
useEffect(() => {
  saveHardwareOverrides({ cpuModel: cpuModel.trim() || undefined, ramGb: ... });
}, [cpuModel, ramGb]);
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests | `pnpm test -- src/renderer/lib/system-info.test.ts` | exit 0 |
| Full gate | `pnpm test && pnpm run typecheck && pnpm run lint` | all exit 0 |

## Scope

**In scope**:
- `src/renderer/lib/system-info.ts`
- `src/renderer/lib/system-info.test.ts`
- `src/renderer/components/HardwareForm.tsx`
- `README.md`
- `docs/apuntes.md`

**Out of scope**:
- CPU core confirmation (plan 003).
- Shared `SystemInfo` shape and AI prompts (plan 004).
- New dependencies or component-test infrastructure.

## Git workflow

- Branch: `codex/accurate-hardware-detection`
- Commit: `fix: requerir confirmacion de ram`.
- Do not push, merge, or open a PR.

## Steps

### Step 1: Separate legacy storage from confirmed RAM

Add a storage schema version to the serialized hardware record. `saveHardwareOverrides`
must write the new version. `loadHardwareOverrides` may preserve a valid legacy
CPU model, but must discard legacy `ramGb` because the code cannot know whether
it was user-selected or silently derived from `deviceMemory`. A new-version RAM
value remains valid after reload.

**Verify**: focused tests cover legacy RAM rejection and new-version RAM retention.

### Step 2: Stop selecting RAM from the browser hint

Initialize the RAM select only from a confirmed stored value. Leave it empty for
new/legacy users. The hint may be displayed as explicitly unverified explanatory
text, but must never be submitted or persisted until the user changes the select.
Keep existing RAM sizes and support for a previously confirmed non-standard size.

**Verify**: `rg "initial\.ramGb.*ramGbHint|ramGbHint.*initial\.ramGb" src/renderer/components/HardwareForm.tsx` → no match.

### Step 3: Align documentation

State that `deviceMemory` is only a privacy-limited hint and that users must
confirm RAM. Do not claim automatic, exact RAM detection.

**Verify**: `rg -n "deviceMemory|RAM" README.md docs/apuntes.md` shows the corrected explanation.

## Test plan

Update `system-info.test.ts` to assert versioned persistence, legacy RAM
invalidation, valid confirmed RAM retention, and that missing confirmed RAM still
causes `getSystemInfo()` to throw. Preserve GPU/concurrency characterization.

## Done criteria

- [ ] An 8 GB browser hint is not persisted or returned as confirmed RAM.
- [ ] Legacy ambiguous RAM is invalidated once; confirmed versioned RAM reloads.
- [ ] Focused/full tests, typecheck, and lint pass.
- [ ] Only in-scope files changed.

## STOP conditions

- Safe legacy invalidation requires guessing whether an old RAM value was manual.
- The implementation begins treating `deviceMemory` as authoritative elsewhere.
- Verification fails twice.

## Maintenance notes

Any future storage migration must preserve the distinction between a browser hint
and user confirmation. Never silently promote fingerprinting APIs to inventory.

