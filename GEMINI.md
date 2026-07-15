# AI Media Factory — Gemini Engineering Instructions

## Product and architecture

AI Media Factory is a private-beta video localization platform. Next.js serves owner-scoped upload, studio, preview, and download APIs. SQLite stores durable jobs/events/transcripts/localizations. A single-concurrency worker runs FFmpeg, whisper.cpp, pyannote, Argos Translate, and the deterministic Subtitle Quality Engine. See `SYSTEM_ARCHITECTURE.md`, `SUBTITLE_ENGINE.md`, and `QUALITY_PIPELINE.md` before changing pipeline code.

## Production safety

- Work only in `/opt/ai-media-factory-dev` on a feature branch.
- Never modify, restart, redeploy, inspect, or write `/opt/ai-media-factory/current`.
- Never access production databases, uploads, renders, models, credentials, containers, or user files.
- Never change IAM, billing, networking, firewall rules, public access, or production services.
- Never merge or deploy automatically. Never push directly to `main`.
- Stop on possible data loss, missing credentials, permission/billing failure, public exposure, or production access requirements.

## Development workflow

1. Inspect repository status and current branch.
2. Create `codex/<task>` from clean `main`.
3. Write a bounded plan and preserve unrelated changes.
4. Implement deterministic behavior before AI assistance.
5. Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
6. Run the exact subtitle fixture render and inspect its quality report plus every cue transition.
7. Repair safely up to five attempts; stop instead of weakening hard quality rules.
8. Review security, diff, regressions, secrets, and artifacts.
9. Commit, push the feature branch, prepare a pull request, and wait for human approval.

Use `npm run agent:gate` for the bounded branch-safe verification gate. Each command has a 15-minute timeout.

## Subtitle quality standard

- Cue boundaries follow aligned spoken words and detected speech.
- Speaker changes and meaningful pauses create hard boundaries.
- No overlap, stale text, clipping, or invented content.
- Maximum two balanced lines with natural Turkish phrasing.
- Enforce reading speed, duration, positive gaps, Unicode NFC, safe areas, and measured text bounds.
- Use responsive vertical/horizontal typography and collision-aware placement.
- Preserve A/V duration within 20 ms for the acceptance fixture.
- Deterministic hard failures must be zero and deterministic score must be at least 90.

## Gemini boundary and cost controls

Gemini is advisory only. It may review Turkish, semantic splits, selected placement frames, typography, and structured quality reports. It must never control timestamps, geometry, rendering, validation, deployment, or acceptance.

- Use Vertex AI with Application Default Credentials; never use unofficial/shared API keys.
- Default model: `gemini-2.5-flash`; use the configured Vertex location.
- Send source snippets, cue metadata, timestamps, and at most eight selected frames—not complete videos.
- Cache by content fingerprint, record estimated usage, and stop at the configured daily threshold.
- Never print tokens, credentials, raw authorization headers, or sensitive media.

## Coding conventions and tests

- Keep pure algorithms in `lib/subtitle-quality` and provider-specific I/O behind contracts/adapters.
- Use strict TypeScript, structured errors, additive migrations, transactions, leases, and idempotency.
- Do not redesign the UI or add unrelated product features.
- Add tests for timing, overlap, speaker alignment, Turkish/Unicode, reading speed, font fitting, safe areas, bounds, ASS/FFmpeg rendering, vertical/horizontal profiles, repair limits, subtitle diff, and visual diff.
- Keep secrets, databases, uploads, models, renders, storage, logs, and quality artifacts out of Git.

## Approval gate

The final report must include branch/commits, commands/results, deterministic and AI scores separately, before/after metrics, artifact hashes/paths, cost usage, remaining limitations, rollback instructions, and exact resume commands. A human must approve merge and deployment.
