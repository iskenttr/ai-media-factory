# Technical Debt Report

This report identifies and prioritizes technical debt within the AI Media Factory codebase based on the defined System Architecture. Each item is structured with risk, expected value, bounded scope, and specific verification recommendations. 

---

## 1. Single-Concurrency Worker Resource Exhaustion

- **Priority**: High
- **Category**: Infrastructure & Scaling
- **Risk**: 
  - A single long-running or corrupted video localization job can permanently block the queue because the single-concurrency scheduler lacks isolated time-budgets or resource boundaries.
  - Subtitle Quality Engine CPU spikes during complex layouts can crash the entire worker process, taking down unrelated queued jobs without an automated recovery path.
- **Expected Value**:
  - Graceful job interruption and fail-safe recovery.
  - Predictable maximum execution cost and elimination of queue starvation.
- **Bounded Scope**:
  - **Target Files**: `worker/` directory scheduler execution loops.
  - **Constraints**: No multi-concurrency capability or multi-node scale-out may be added. Must preserve single-concurrency queue safety.
- **Verification Recommendations**:
  - Implement a synthetic test fixture that simulates a hung Whisper/FFmpeg task.
  - Verify the scheduler kills the subprocess precisely at the threshold limit and marks the job status as `FAILED` with an error event.

---

## 2. Lack of Contract Sanitization at Provider Adapter Boundaries

- **Priority**: Medium-High
- **Category**: Architecture & Security
- **Risk**:
  - Raw payloads returned by Whisper, pyannote, and translation engines (e.g., Argos) are passed directly to downstream storage and processing layers without strict contract enforcement.
  - Unexpected API structure changes can corrupt downstream SQLite records, leading to render failures in the Subtitle Quality Engine.
- **Expected Value**:
  - Strict validation of provider outputs at the adapter boundary, keeping the application core isolated from model and vendor drifts.
- **Bounded Scope**:
  - **Target Files**: `lib/providers/adapters/` and `lib/providers/contracts/`.
  - **Constraints**: Do not touch authentication patterns or external environment variable configurations.
- **Verification Recommendations**:
  - Write mock adapters returning malformed metadata payloads.
  - Assert that the adapter validation layer intercepts invalid fields, blocks downstream storage operations, and emits schema-validation errors.

---

## 3. SQLite Concurrent Write Contention under Studio Corrections

- **Priority**: Medium
- **Category**: Persistence
- **Risk**:
  - Multiple concurrent studio editor correction sessions may cause `database is locked` errors during SQLite writes.
  - The system relies on single-concurrency workers but does not prevent simultaneous edits from the web UI to active localization snapshots.
- **Expected Value**:
  - Optimistic locking or persistent write queueing for studio actions, maintaining low-latency write paths.
- **Bounded Scope**:
  - **Target Files**: `lib/server/` persistence layer.
  - **Constraints**: No database migration or migration to another engine (such as PostgreSQL) is authorized.
- **Verification Recommendations**:
  - Run a highly-concurrent write stress test against the correction endpoints.
  - Verify that transaction retry mechanisms avoid deadlocks and preserve the correct version history.

---

## 4. Subtitle V2 Timing Overlap Edge Cases

- **Priority**: Medium
- **Category**: Subtitle Quality Engine
- **Risk**:
  - The Subtitle Quality Engine depends on deterministic checks for line length, overlapping cues, and minimum gap parameters.
  - Unvalidated manual user adjustments to timeline cues in the web UI can bypass structural layout sanity rules, leading to garbled or overlapping rendered outputs via FFmpeg/libass.
- **Expected Value**:
  - Total integrity of rendered ASS styles and video tracks, regardless of input corrections.
- **Bounded Scope**:
  - **Target Files**: `lib/subtitle-quality/` layout and validation layers.
  - **Constraints**: No modification to user correction storage format.
- **Verification Recommendations**:
  - Create unit tests with overlapping cue sequences.
  - Verify the Subtitle Quality Engine automatically resolves or flags timing overlaps prior to invoking FFmpeg pipelines.

