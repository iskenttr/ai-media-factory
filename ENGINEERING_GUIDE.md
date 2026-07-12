# AI Media Factory Engineering Guide

## Non-negotiable workflow

1. Work only in an isolated checkout on a `codex/*` feature branch.
2. Confirm `git status` and preserve unrelated/user changes.
3. Never use production as a development environment.
4. Keep secrets in runtime configuration; log only provider name, request fingerprint, bounded usage, latency, and status.
5. Run `npm run check` before handoff.
6. For subtitle changes, run fixture-enabled integration tests and visually inspect transition frames.
7. Commit intentionally; prepare a PR when a remote exists. Never merge or deploy automatically.

## Definition of done

- Lint, typecheck, unit/integration tests, and production build pass.
- New behavior is covered by deterministic tests.
- Quality reports contain no overlap, bounds, duration, Unicode, or A/V errors.
- Vertical and horizontal profiles are exercised.
- Every repair loop is bounded to five attempts.
- Output is visually inspected; generated artifacts stay outside git.
- Known limitations and any unverified claim are reported explicitly.

## Module rules

- Keep pure calculations in `lib/subtitle-quality`; they must be testable without FFmpeg.
- Keep process execution and file I/O behind server adapters.
- Providers implement contracts and return structured results; provider-specific payloads do not leak into core logic.
- Store writes remain transactional and additive. Avoid destructive schema changes.
- UI changes are out of scope for engine work unless explicitly requested.

## Autonomous engineering roles

- Planner: audits scope, invariants, evidence, cost, and stop conditions.
- Builder: implements the smallest safe change on a feature branch.
- Reviewer: checks diff, security, compatibility, and failure behavior.
- Tester: runs automated suites and captures reproducible commands/results.
- Video QA: renders fixtures, samples every cue/transition, and records metrics.
- Architecture Reviewer: prevents provider coupling, unbounded loops, and production mutations.

These are workflow stages, not independent authorities. The approval gate remains human.

## Stop conditions

Stop and report when production access is required, data loss is possible, credentials/billing/permissions fail, a secret may be exposed, or five safe repair attempts cannot produce a passing result.

## Useful commands

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run check
git diff --check
```

Large media, models, frame samples, reports, and visual diffs belong under ignored `storage/`, `work/`, `quality-reports/`, or `visual-diffs/` paths.
