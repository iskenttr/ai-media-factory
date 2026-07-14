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
- Human-approved autonomy level: **Level 2**. Accepted candidate commits may be automatically pushed, without force, only to their matching `agent/<task-id>-...` branch on the fixed `origin` remote.
- Still forbidden: automatic merge, protected-branch writes, production deployment/access, secret access, IAM/billing/network mutation, destructive cleanup, and unbounded model spend.

## Project Skill

- Skill name: `ai-media-autonomous-engineering`
- Repository path: `.agents/skills/ai-media-autonomous-engineering/SKILL.md`
- Personal Codex path: `~/.codex/skills/ai-media-autonomous-engineering/SKILL.md`
- Explicit invocation: `$ai-media-autonomous-engineering`

## Last Verified State

- Autonomous Agent V2 branch: `codex/agent-v2`
- Agent V2 draft PR: `https://github.com/iskenttr/ai-media-factory/pull/1`
- Last verified Agent V2 commit: `d5331ab59438601143da4c1f4024d554dfe1e790`
- Validation at publication: lint passed, typecheck passed, 159 tests passed, 3 tests skipped, and the Next.js production build passed.
- First accepted autonomous task: `RESEARCH-TTS-010`; candidate commit `923b74ec41b97ebf0188407bd198b24d72a0f2c6`; score 97; critical errors 0.
- First autonomous candidate draft PR: `https://github.com/iskenttr/ai-media-factory/pull/2`
- Fresh Vertex research batch accepted `RESEARCH-DIARIZATION-001`, `RESEARCH-DUBBING-001`, and `RESEARCH-SUBTITLE-QUALITY-001`; draft PRs are `#4`, `#5`, and `#3` respectively. Each used one model call, scored 97, and reported 0 critical errors.
- `RESEARCH-FFMPEG-001` failed closed with `model_patch_has_no_files`; no candidate commit or PR was created. Its model response and audit evidence remain on the VM for a bounded retry.
- Temporary `.codex-*` work directories, migration bundles, patches, generated media, secrets, `.env` files, and `node_modules` are not part of the published repository.

## Google Compute Engine Runtime

- Google Cloud project: `open-claw-502114`
- Active development VM: `amf-agent-v2` in `europe-central2-a`, machine type `e2-standard-4`.
- Dedicated service account: `amf-engineering-agent@open-claw-502114.iam.gserviceaccount.com` with Vertex AI user and log writer roles only.
- The broker uses keyless metadata-server credentials and calls Vertex AI `generateContent` directly with no model tools.
- Default local safety brakes: 50 model calls/day and USD 5/day estimated model spend; Cloud Billing budget alerts are configured at USD 25/month.
- The legacy `openclaw-atlas` VM is stopped. Its disk, pre-migration snapshot, repository bundle, patch, and untracked-file archive are retained for recovery.
- Automatic merge, deployment, production access, force-push, and secret access remain forbidden. Accepted candidate branches require human review.

## Retrieval Note

When the user asks for the GitHub address, autonomous workflow, skill, branch, clone command, or last publication status, read this file before answering.
