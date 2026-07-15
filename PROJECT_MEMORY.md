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
- Level 2 runtime proof: `MIGRATION-SMOKE-001` was accepted at score 97 with 0 critical errors and automatically pushed commit `8016c7e126838bd961be95f4bd7cfbfa5bc33e37` without force. Draft PR: `https://github.com/iskenttr/ai-media-factory/pull/7`.
- Accepted technical-debt report: commit `9d6b65730300fc37f8523a834322e84453676724`; draft PR: `https://github.com/iskenttr/ai-media-factory/pull/6`.
- On 2026-07-15 the user authorized **Autonomous Engineering Mode** for the higher-level CTO/Codex workflow on `codex/agent-v2`: build and prioritize its own backlog, require focused tests plus lint, typecheck, full tests, and build, abandon or revert failed feature branches, and automatically merge independently reviewed safe PRs into `codex/agent-v2`. Risky PRs still require human approval. The sandboxed GCE agent itself remains Level 2 and cannot merge.
- Permanent boundaries remain unchanged: never write to `main`, never access or mutate production, never force-push, never expose secrets, and never change IAM, billing, or networking autonomously.
- Prioritized work and merge-risk classifications are recorded in `docs/AUTONOMOUS_BACKLOG.md`.

## Project Skill

- Skill name: `ai-media-autonomous-engineering`
- Repository path: `.agents/skills/ai-media-autonomous-engineering/SKILL.md`
- Personal Codex path: `~/.codex/skills/ai-media-autonomous-engineering/SKILL.md`
- Explicit invocation: `$ai-media-autonomous-engineering`

## Last Verified State

- Autonomous Agent V2 branch: `codex/agent-v2`
- Agent V2 draft PR: `https://github.com/iskenttr/ai-media-factory/pull/1`
- Last verified Agent V2 commit: `f3f31fc4598d3340c68e41c206fa0677e192d88a`.
- Human-approved reliability merges on 2026-07-15: render lease renewal and stale-worker protection in PR `#8` (`e2f4f4a4c3d34dbd2b626ecd12a31d72d568651e`), plus race-safe idempotent upload verification in PR `#9` (`f3f31fc4598d3340c68e41c206fa0677e192d88a`). Both were merged only into `codex/agent-v2`; `main` and production were not changed.
- Validation after combining PRs `#8` and `#9`: lint passed, typecheck passed, 182 tests passed, 3 tests skipped, and the Next.js production build passed. The focused store and video-render-worker suite passed 17/17 tests.
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
- On 2026-07-15 the active development VM was updated to Agent V2 commit `f3f31fc4598d3340c68e41c206fa0677e192d88a`; the systemd service and application heartbeat were healthy, and both the queue and processing directories were empty.
- Automatic merge, deployment, production access, force-push, and secret access remain forbidden. Accepted candidate branches require human review.

## Retrieval Note

When the user asks for the GitHub address, autonomous workflow, skill, branch, clone command, or last publication status, read this file before answering.
