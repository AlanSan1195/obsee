# Plan 011: Enforce a header-based production CSP without unsafe inline scripts

> **Executor instructions**: Implement and verify the CSP as a response header.
> Preserve the localhost OBS WebSocket connection and SEO structured data. Do not
> deploy until the production bundle has been tested under the exact policy.
> Update this plan's row when done unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat ceb1be2..HEAD -- index.html vercel.json package.json scripts/check-csp.mjs vite.config.ts`
> Any new script/style/network origin is a STOP condition until its necessity is
> explained and explicitly allowed.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/010-contain-untrusted-web-evidence.md
- **Category**: security
- **Planned at**: commit `ceb1be2`, 2026-07-16

## Why this matters

The frontend has a meta CSP, but `script-src` permits all inline script and the
policy omits explicit `base-uri`, `object-src`, `form-action`, and
`frame-ancestors` controls. A response header is stronger and can protect the
document before HTML parsing. A strict script policy materially limits the
impact of a future HTML/script injection while retaining the app's deliberately
narrow connection to same-origin APIs and local OBS.

## Current state

- `index.html:6` — meta CSP includes `script-src 'self' 'unsafe-inline'` and
  localhost WebSocket targets.
- `index.html:35-59` — one legitimate inline JSON-LD data block is the reason a
  strict inline-script policy needs a hash or a verified alternative.
- `vercel.json:11-19` — sends nosniff, X-Frame-Options, and Referrer-Policy but no
  CSP header.
- `vite.config.ts:18-33` — production emits separate assets via
  `assetsInlineLimit: 0`; preserve this because it supports a strict CSP.
- No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or dynamic `Function` use was
  found in renderer source at the planned commit.

Scripts under `scripts/` are ESM `.mjs`; verification commands belong in
`package.json`. The app must continue connecting only to `'self'`,
`ws://localhost:*`, and `ws://127.0.0.1:*`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| CSP check | `pnpm run security:csp` | exit 0; hash and directives match |
| Build | `pnpm run build` | exit 0 |
| Source scan | `rg -n "dangerouslySetInnerHTML|innerHTML|eval\\(|new Function" src index.html` | no executable-code matches |
| Full baseline | `pnpm test && pnpm run typecheck && pnpm run typecheck:api && pnpm run lint` | all pass |

## Scope

**In scope**:

- `index.html`
- `vercel.json`
- `package.json`
- `scripts/check-csp.mjs` (create)
- `vite.config.ts` only if build output proves a required self-hosted asset is
  inlined despite `assetsInlineLimit: 0`

**Out of scope**:

- Adding third-party analytics, scripts, fonts, or CDNs.
- Expanding OBS connectivity to LAN IPs.
- `upgrade-insecure-requests`, because it may rewrite the required local
  `ws://` OBS connection.
- Replacing React styling or removing style attributes solely to eliminate
  `style-src 'unsafe-inline'`; script execution is the priority.

## Git workflow

- Branch: `codex/strict-production-csp`
- Commit message: `fix: aplica CSP estricta en produccion`
- Do not push, deploy, or open a PR unless instructed.

## Steps

### Step 1: Define the production header policy

Add a `Content-Security-Policy` response header for the app document in
`vercel.json`. At minimum include:

- `default-src 'self'`
- `script-src 'self'` plus only the exact SHA-256 hash needed by the current
  JSON-LD block, if browsers require it under CSP
- `style-src 'self' 'unsafe-inline'`
- `img-src 'self' data:`
- `font-src 'self'`
- `connect-src 'self' ws://localhost:* ws://127.0.0.1:*`
- `object-src 'none'`
- `base-uri 'none'`
- `form-action 'self'`
- `frame-ancestors 'none'`

Keep X-Frame-Options as legacy defense. Add a conservative Permissions-Policy
only after confirming `enumerateDevices` and any intended browser hardware
detection do not require the disabled feature; otherwise defer it explicitly.

**Verify**: `pnpm run security:csp` → required directives present and
`script-src` contains no `'unsafe-inline'`.

### Step 2: Remove the weaker meta policy and preserve JSON-LD

Remove the meta CSP after the header is in place. Keep JSON-LD semantics and SEO
content unchanged. Compute the CSP hash from the exact bytes browsers hash,
including whitespace inside the script element. Do not use a wildcard, nonce in
static HTML, or `'unsafe-inline'` to avoid maintaining the hash.

**Verify**: the CSP checker recomputes the inline block's SHA-256 and confirms the exact token appears in the header.

### Step 3: Add an automated drift checker

Create `scripts/check-csp.mjs` and `pnpm run security:csp`. It must parse
`vercel.json` and `index.html`, locate executable and JSON-LD inline scripts,
recompute required SHA-256 hashes, reject unexpected inline executable scripts,
reject `'unsafe-inline'` in `script-src`, and assert the required directives and
local OBS connect targets. It must fail if the meta CSP returns.

**Verify**: `pnpm run security:csp` exits 0; changing one character in a temporary copy of the JSON-LD block makes the checker fail.

### Step 4: Test the built site under the exact header

Run the production build, serve `dist/` with the exact Vercel headers (via
`vercel dev` if available or a minimal local header-capable server), and inspect
the browser console. Exercise initial render, same-origin API call, and localhost
OBS connection. No CSP violation may be dismissed without understanding it.

**Verify**: browser console has no CSP violation for app assets/API/OBS, and a deliberately injected inline test script in a disposable local copy is blocked. Remove the disposable change before continuing.

### Step 5: Run the full baseline

**Verify**: `pnpm run security:csp && pnpm run build && pnpm test && pnpm run typecheck && pnpm run typecheck:api && pnpm run lint` → all pass.

## Test plan

- Automated: directive presence, JSON-LD hash match, no meta CSP, no unexpected
  inline executable scripts, no unsafe inline script permission.
- Browser: render/assets, API fetch, OBS WebSocket, and console violation check.
- Negative test in disposable output: inline executable script is blocked.
- Regression: JSON-LD remains in built HTML and retains its schema fields.

## Done criteria

- [ ] Production sends CSP as an HTTP response header.
- [ ] `script-src` has no `'unsafe-inline'` and permits only self plus exact hashes.
- [ ] Local OBS and same-origin API connections still work.
- [ ] Required restrictive directives are present.
- [ ] Automated hash drift check passes.
- [ ] Build, tests, typechecks, and lint pass.

## STOP conditions

- Production requires a new third-party script/network origin.
- The built app creates an undocumented inline executable script.
- A strict policy blocks localhost OBS and the only proposed fix is broadening
  `connect-src` beyond the two loopback hostnames.
- JSON-LD cannot be preserved without unsafe inline execution; stop and compare
  a hash-based policy with a documented SEO-supported alternative.

## Maintenance notes

Any edit to inline JSON-LD must update the CSP hash through the checker. Review
new dependencies for runtime origins and inline code before relaxing policy; the
default answer should remain self-hosting.
