---
name: ai-media-autonomous-engineering
description: Run bounded, auditable engineering work for the AI Media Factory repository through planning, implementation, review, automated testing, video/subtitle QA, architecture review, and a human approval gate. Use when Codex changes, diagnoses, reviews, or validates this project's localization pipeline, autonomous roles, providers, workers, subtitle engine, media rendering, or release evidence.
---

# AI Media Autonomous Engineering

Treat autonomous roles as stages in one bounded workflow, not as independent authorities. Keep merge and deployment decisions with the human.

## Establish project rules

1. Locate the repository root containing `AUTONOMOUS_ENGINEERING.md` and `package.json`.
2. Read `AUTONOMOUS_ENGINEERING.md` and `ENGINEERING_GUIDE.md` completely before changing files.
3. Read only the additional domain references needed for the task:
   - Subtitle or render work: `SUBTITLE_ENGINE.md` and `QUALITY_PIPELINE.md`.
   - Provider, worker, storage, or boundary changes: `SYSTEM_ARCHITECTURE.md`.
   - Product or UI behavior: the relevant files under `docs/`.
4. Inspect `git status`, the current branch, and the affected code/tests. Preserve unrelated user changes.
5. For implementation work, use an isolated checkout on a `codex/*` feature branch. Do not write to the main branch.

## Run the bounded workflow

Maintain these stages in order. For a read-only diagnosis or review, perform only the applicable stages and do not mutate files.

### 1. Plan

- State the objective, user-visible outcome, invariants, affected modules, evidence needed, and stop conditions.
- Prefer the smallest safe change. Separate deterministic checks from optional AI judgments.
- Identify whether subtitle fixtures, horizontal/vertical profiles, provider integration tests, or render inspection are required.

### 2. Build

- Keep pure subtitle calculations in `lib/subtitle-quality` and process/file I/O behind server adapters.
- Keep provider payloads behind contracts. Preserve transactional, additive store writes.
- Add deterministic tests with behavior changes.
- Never expose secrets or use production as a development environment.

### 3. Review

- Inspect the complete diff for correctness, security, compatibility, failure behavior, and accidental scope growth.
- Check for provider coupling, unbounded loops, destructive operations, hidden language status, and removed human correction points.
- Fix findings only when the user requested implementation; otherwise report them with precise evidence.

### 4. Test

- Run focused tests first, then `npm run check` before implementation handoff.
- Run `git diff --check`.
- Record exact commands and results. Do not claim a check passed unless it ran successfully.

### 5. Video QA

- For subtitle, timing, dubbing, or render changes, run fixture-enabled integration tests.
- Exercise horizontal and vertical profiles, inspect cue transition frames, and verify overlap, bounds, duration, Unicode, and A/V integrity.
- Keep generated media and reports in ignored artifact directories. Record artifact paths and hashes.

### 6. Architecture review

- Confirm module boundaries, bounded retries, provider isolation, transactional writes, and absence of production mutations.
- Reject an implementation that weakens the approval gate or makes generated output unauditable.

### 7. Approval handoff

Report:

- objective and changed files;
- deterministic results and optional AI scores separately;
- test/build commands and outcomes;
- before/after subtitle or visual evidence when applicable;
- artifact paths/hashes;
- remaining defects and unverified claims;
- migration and rollback notes.

Do not merge or deploy automatically. A human decides whether to merge and deploy.

## Bound repair attempts

Count repair attempts by recurring failure signature. Stop after five safe attempts on the same failure. Stop immediately and report when production access is required, data loss is possible, credentials/billing/permissions fail, a secret may be exposed, or an unresolved regression remains.

## Communicate stage changes

Give concise progress updates when moving between material stages. State which project rule caused a pause, stop, expanded test run, or request for human approval.
