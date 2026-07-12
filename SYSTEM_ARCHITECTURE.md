# AI Media Factory System Architecture

## Purpose

AI Media Factory is a private-beta, single-node video-localization system. It accepts a video, derives a timestamped and speaker-attributed source transcript, localizes it into Turkish, renders subtitles, validates the result, and exposes preview/download endpoints. Production is immutable from engineering automation: changes are developed on feature branches, reviewed, and deployed only after explicit human approval.

## Runtime topology

```text
Tailscale HTTPS
      |
Next.js web (127.0.0.1:3000)
      |
SQLite + persistent media storage
      |
single-concurrency worker
  | analysis: FFmpeg -> Whisper -> pyannote
  | localization: Argos/provider adapter
  ` render: Subtitle Quality Engine -> libass/FFmpeg -> validation
```

Docker Compose runs `web` and `worker` from the same application image. The worker has no network namespace in production and executes at most one CPU-heavy job at a time. `/var/lib/ai-media-factory` holds SQLite, uploads, work products, renders, and backups. Models live in a separate read-only mount.

## Application layers

- `app/`: Next.js pages and HTTP APIs. Routes authenticate ownership and delegate to server services.
- `components/`: presentation only; it must not contain pipeline decisions.
- `lib/server/`: application orchestration, media processes, persistence, leases, and workers.
- `lib/providers/contracts/`: stable interfaces for speech, speaker, translation, and optional quality-assistant providers.
- `lib/providers/adapters/`: local Whisper, pyannote, Argos, and future Gemini adapters.
- `lib/subtitle-quality/`: deterministic timing, segmentation, layout, validation, repair, scoring, and diff logic.
- `worker/`: bounded single-concurrency scheduler.
- `deploy/`: Compose, health checks, and backup scripts.

## Data flow

1. Upload route creates an owner-scoped upload session and verifies the media.
2. Analysis worker probes media, extracts mono 16 kHz audio, runs speech/speaker providers, and persists events plus transcript segments.
3. Studio corrections are versioned; localization snapshots freeze all translation inputs.
4. Localization worker translates segments and stores immutable revisions with timing assessments.
5. Render worker loads active revisions and corrected timing/speaker metadata.
6. Subtitle Quality Engine produces normalized cues and a layout plan.
7. FFmpeg/libass renders a candidate; validators emit a quality report.
8. A bounded repair loop may regenerate the candidate. Only a passing artifact becomes downloadable.

## Safety invariants

- Never delete or migrate production data without explicit approval and a verified backup.
- Engineering automation never deploys, merges, changes IAM/networking/billing, or writes to production.
- Jobs use leases and idempotency keys; retries must not duplicate durable state.
- Provider credentials stay outside the repository and never enter reports or logs.
- Gemini is optional and advisory. Deterministic validation has final authority.
- Every loop has explicit attempt, time, and cost limits.

## Target evolution

Subtitle Engine V2 separates evidence acquisition, cue planning, layout, rendering, and validation. This makes provider upgrades replaceable and permits regression comparison without changing upload, studio, or download APIs.
