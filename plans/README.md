# Implementation Plans

Generated and reconciled by the improve skill on 2026-07-16. Plans 001–005 are
the completed hardware-accuracy batch. Plans 006–011 are the security batch
created from a standard, security-focused audit at commit `ceb1be2`. Execute in
the order below unless dependencies say otherwise. Each executor must read the
assigned plan fully, honor its STOP conditions, and update only its status row
unless a reviewing advisor maintains the index.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Characterize browser hardware acquisition | P1 | S | — | DONE |
| 002 | Require explicitly confirmed RAM | P1 | S | 001 | DONE |
| 003 | Require an editable confirmed CPU core count | P1 | M | 002 | DONE |
| 004 | Preserve unknown CPU speed and GPU memory honestly | P1 | M | 003 | DONE |
| 005 | Make the local video ceiling encoder-aware | P2 | M | 004 | DONE |
| 006 | Keep local credentials private and untrackable | P1 | S | — | BLOCKED — local `.env` is 0600, but broad ignore rules, automated checks, and documentation remain unimplemented |
| 007 | Remove all high-severity dependency advisories | P1 | M | — | DONE — merged into `main` at commit `690c8c0`; last successful audit reported only one low advisory |
| 008 | Reject cross-site and non-JSON AI requests | P1 | M | — | DONE — shared request guard covers all five quota-bearing endpoints; included in the passing 191-test suite |
| 009 | Fail closed without distributed rate limiting | P1 | M | — | DONE — production requires Upstash; local memory fallback is explicit and tested |
| 010 | Prevent untrusted web evidence from steering OBS | P1 | M | — | DONE — exact host policy, bounded prompt evidence, verified source provenance, and OBS output allowlists; 191 tests pass |
| 011 | Enforce a strict header-based production CSP | P2 | M | 010 | DONE — strict response header and JSON-LD hash checker verified against the production bundle and local browser |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) |
REJECTED (with one-line rationale).

## Dependency notes

- 001 establishes acquisition-layer tests before changing browser and storage behavior.
- 002 invalidates silently persisted legacy RAM before 003 extends the same persisted record.
- 003 ensures recommendations use user-confirmed CPU capacity before 004 changes the shared hardware contract.
- 004 removes fabricated measurements before 005 adjusts decisions made from the remaining trustworthy fields.
- 006 is partially applied: the current local secret file is mode 0600. The
  tracked prevention work is still pending: broad `.env*` ignore rules, a
  secret-hygiene check, and setup/revocation documentation.
- 007 is independent but should land before enabling its scheduled audit gate.
- 008 and 009 now protect the request boundary and shared quota layer together.
- 010 preserves the current user review step and local fallbacks while enforcing
  exact web-source provenance and semantic AI output validation.
- 011 now enforces the browser policy after external source URLs and prompt
  provenance became deterministic in 010.

## Reconciliation on 2026-07-16

- Plans 001–005 remain present in the implementation and their focused tests
  are part of the passing 191-test suite.
- Plan 006 has only its local file-permission action applied; it is not complete.
- Plan 007 is merged into `main`. The dependency pins and security workflow are
  present. A live audit rerun was unavailable during this reconciliation because
  the npm registry could not be resolved; the immediately preceding successful
  audit reported one low advisory and no high advisories.
- Plans 008–011 were completed after this reconciliation.

## Deferred findings

- Editable GPU fallback when WebGL returns `Unknown`: valid product/correctness
  work, but outside this security-focused batch.
- Hardware-string request bounds: core system-info strings remain unbounded in
  `validateSystemInfo`; plan 010 bounds web content and output semantics first.
  Add strict hardware string lengths in a follow-up if provider telemetry shows
  oversized or adversarial requests.
- Stale `.github/workflows/release.yml`: it references removed desktop build
  scripts. This is real CI debt but does not run on pull requests and was not
  selected over the evidenced security risks.
- Full authentication: the app intentionally exposes a public, free AI service.
  Same-site request controls plus distributed rate limiting are proportionate
  now; reassess accounts/API keys if abuse persists.
- Continuous runtime monitoring/alerting is not implemented by these plans. Add
  provider-cost, 429, and fail-closed telemetry only with a privacy-preserving
  logging design that excludes raw hardware, IPs, and install identifiers.

## Findings considered and rejected

- Inferring exact M4 CPU/GPU core counts from the string `Apple M4`: rejected because the browser string does not identify the exact SKU and Apple chips have multiple core configurations. User confirmation is safer.
- Asking the LLM or Tavily to discover the installed hardware: rejected because a model-name lookup cannot distinguish the installed SKU and would turn local inventory into an unverifiable inference.
- OBS password persistence: rejected as a finding. The Zustand store is not
  persisted and `backup-store.ts` excludes both the WebSocket password and
  stream key.
- Direct DOM XSS: rejected as a current finding. No `dangerouslySetInnerHTML`,
  `innerHTML`, `eval`, or dynamic `Function` use was found, and React renders AI
  text as text. Plan 011 remains defense in depth.
- Source-link tab takeover: rejected. Both source-link renderers use
  `target="_blank"` with `rel="noreferrer"`; source trust itself remains valid
  and is covered by plan 010.
- Treating every dependency advisory as directly exploitable: rejected. The
  current Groq path does not construct multipart fields from user filenames and
  the browser build uses the browser OBS export. Plan 007 still removes the
  vulnerable graph because reachability can change and the Vite advisory affects
  the developer server directly.
- Forcing OBS host to loopback only: not selected. The advanced UI intentionally
  exposes host/port and the current CSP allows WebSockets only to localhost and
  127.0.0.1 in production. Revisit only if LAN OBS support becomes a requirement.
