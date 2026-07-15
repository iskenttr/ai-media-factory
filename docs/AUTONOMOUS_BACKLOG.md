# Autonomous Product Engineering Backlog

This backlog governs development work on `codex/agent-v2`. Production, `main`,
production data, deployment, IAM, billing, networking, and secrets are outside
the autonomous scope.

## Delivery policy

- Every implementation uses an isolated `codex/*` branch and a small PR.
- Focused tests run first. `git diff --check` and `npm run check` must pass before acceptance.
- A failed candidate is abandoned or reverted on its feature branch; it is never merged partially.
- A safe PR may be merged automatically into `codex/agent-v2` after deterministic checks and independent review.
- A risky PR waits for human approval. Risky work includes deployment or trust-boundary changes, destructive or non-additive data changes, authentication/authorization changes, new external providers or credentials, material cost changes, and changes that alter publish approval or output acceptance policy.
- `main` and production always require separate explicit human approval.

## Prioritized backlog

| Priority | Work item | Status | User value | Acceptance evidence | Merge class |
| --- | --- | --- | --- | --- | --- |
| P0 | Make concurrent upload PUTs contention-safe | Completed in PR #10 | Prevents a valid video upload from being failed by a duplicate request | Two concurrent PUTs produce one job; duplicate returns `409`; replay returns the same job | Safe |
| P0 | Fence analysis workers after lease loss | Completed in PR #13 | Prevents stale workers from overwriting a reclaimed analysis result | Old owner cannot renew, complete, fail, or emit terminal events after reclaim | Safe |
| P0 | Fence localization and regeneration workers | In progress | Prevents stale translation results and terminal-state corruption | Old owner cannot persist results or terminal state after reclaim | Safe |
| P0 | Make translation result persistence transactional | Completed in PR #15 | Prevents permanently partial translation records after interruption or races | Failure injection rolls back; replay heals; concurrent writers create one active revision | Safe |
| P0 | Bound media/provider subprocesses | Media completed in PR #14; providers in progress | Prevents one malformed video or provider from blocking the only worker | Output caps, timeout, TERM/KILL escalation, cleanup, and next-job progress tests | Safe |
| P1 | Add fair round-robin worker scheduling | Completed in PR #12 | Prevents localization and render starvation while retaining single concurrency | Every busy stage runs within two cycles; single-stage throughput is unchanged | Safe |
| P1 | Make expensive queue creation idempotent | Pending | Avoids duplicate localization, regeneration, and render cost | Concurrent requests produce one durable active job ID | Safe |
| P1 | Repair upload orphan-file handling | In progress | Protects disk capacity and reliable retries | DB failure after rename removes only that request's final path | Safe |
| P1 | Reduce SSE idle polling and heavy ownership reads | Pending | Improves web responsiveness as active users grow | At least 70% fewer idle queries with active-event p95 below one second | Safe |
| P1 | Recover partial localization to completed state | Pending | Lets users render after repairing the last failed segment | Last successful repair recomputes completion exactly once | Safe |
| P1 | Add explicit localization approval fingerprint | Waiting for human approval | Ensures only reviewed revisions can be rendered/exported | Approval enables render; any active revision edit invalidates approval | Risky: approval policy |
| P1 | Remove worker access to the Docker socket | Waiting for human approval | Removes a host-root-equivalent trust path | Providers run without the socket and worker cannot access Docker daemon | Risky: deployment architecture |
| P2 | Add owner quotas and bounded media limits | Waiting for product-limit approval | Protects disk and CPU from anonymous abuse | Pending-session/byte quotas plus duration, pixel, stream, and timeout rejection tests | Risky: product limits |
| P2 | Batch Argos translation calls | Waiting for provider-contract approval | Reduces container startup overhead on long transcripts | Equivalent output with spawn count reduced from N to `ceil(N/batchSize)` | Risky: provider contract |
| P2 | Reduce render process count and lock duration | Pending | Improves render throughput without weakening quality gates | Same quality evidence with fewer FFmpeg launches and short SQLite write lock | Safe when behavior-neutral |

## Selection rule

Choose the highest-priority unblocked safe item with the smallest reviewable
scope. After each accepted merge, update this file and `PROJECT_MEMORY.md`,
verify the development runtime, then select the next item. Never use production
as test evidence.
