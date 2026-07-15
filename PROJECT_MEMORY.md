# Project Memory

## Repository

- Project: AI Media Factory
- Purpose: AI-powered video localization, transcription, translation, dubbing, subtitle quality control, human review, and export.
- Local workspace: `/Users/can/Documents/AI MARKET FACTORY`
- GitHub repository: `https://github.com/iskenttr/ai-media-factory`
- Visibility: Private
- Remote: `origin`
- Default branch: `main`

## Autonomous Engineering

- Workflow: `plan -> build -> review -> test -> video QA -> architecture review -> human approval`
- Repair attempts are bounded to five for the same failure.
- Automatic merge and deployment are forbidden; final approval belongs to a human.
- Primary rules: `AUTONOMOUS_ENGINEERING.md` and `ENGINEERING_GUIDE.md`.

## Project Skill

- Skill name: `ai-media-autonomous-engineering`
- Repository path: `.agents/skills/ai-media-autonomous-engineering/SKILL.md`
- Personal Codex path: `~/.codex/skills/ai-media-autonomous-engineering/SKILL.md`
- Explicit invocation: `$ai-media-autonomous-engineering`

## Last Verified State

- Published commit: `537198d` (merged: 3 PRs on openhands/autonomous-integration)
- Validation at publication: lint passed, typecheck passed, 62 tests passed, 3 tests skipped, and the Next.js production build passed.
- Temporary `.codex-*` work directories, migration bundles, patches, generated media, secrets, `.env` files, and `node_modules` are not part of the published repository.

## Autonomous Engineering Progress (2026-07-15)

### Merged PRs on `openhands/autonomous-integration`:

1. **PR #36**: feat: add structured error classification system
   - Added 35+ typed error codes across 5 domains
   - Added ErrorSeverity and ErrorCategory enums
   - Added domain-specific error classes and factory functions
   - 28 unit tests added

2. **PR #37**: feat: enhance health endpoint with provider checks
   - Enhanced `/api/health` with database and provider checks
   - Added latency measurement and status levels (ok/degraded/unavailable)
   - Provider availability reporting (speech, speakers, translation)

3. **PR #38**: feat: add configurable language-specific timing rates
   - Added `timingRates` configuration per language
   - Added `getSpeakingRate()` helper function
   - Turkish default: 140 WPM, configurable via `AMF_TIMING_RATE_TR`
   - Default fallback: 150 WPM for unknown languages

### Test Suite Status
- Total tests: 159 (154 passing, 2 pre-existing FFmpeg failures, 3 skipped)

## Retrieval Note

When the user asks for the GitHub address, autonomous workflow, skill, branch, clone command, or last publication status, read this file before answering.
