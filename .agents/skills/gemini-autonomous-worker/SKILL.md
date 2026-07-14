---
name: gemini-autonomous-worker
description: Run bounded autonomous software-engineering tasks with Gemini CLI through Vertex AI on Google Compute Engine. Use when AI Media Factory needs background issue-to-branch implementation, structured patch generation, repair, test evidence, token/cost accounting, or a draft-PR-ready handoff while preserving isolated worktrees, human approval, and production boundaries.
---

# Gemini Autonomous Worker

Use Gemini CLI as an untrusted proposal worker. Keep Git preparation, patch application, tests, security review, commit, push, and acceptance under the deterministic orchestrator.

## Prove the execution boundary

1. Read `AUTONOMOUS_ENGINEERING.md`, `ENGINEERING_GUIDE.md`, `GEMINI.md`, and `docs/AI_MEDIA_FACTORY_CONSTITUTION.md`.
2. Verify the environment is development-only and the task does not request production, IAM, billing, network, credential, merge, or deployment changes.
3. Verify Gemini CLI runs on Compute Engine with metadata-server ADC from the dedicated service account. Never create or load a service-account JSON key.
4. Unset `GOOGLE_API_KEY` and `GEMINI_API_KEY`. Set only `GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT`, and `GOOGLE_CLOUD_LOCATION`.
5. Stop if the requested and actual model families differ or usage metadata is unavailable.

## Prepare Git before every worker

1. Resolve and fetch the canonical private remote immediately before creating work.
2. Resolve the remote default branch and record its SHA.
3. Classify the source ref as trusted or untrusted. Do not materialize contributor-controlled refs outside the approved review sandbox.
4. Create an isolated worktree and `agent/<task-id>-<slug>` branch from the fetched base SHA.
5. Verify the worktree initial `HEAD` equals the recorded base SHA. Never run the worker in the primary checkout.
6. Record remote, base branch, base SHA, worktree, branch, task limits, and allowed paths in the audit log.

## Invoke Gemini safely

- Use headless JSON output and a hard process timeout.
- Use `--approval-mode plan` so Gemini may inspect but cannot edit or execute mutating tools.
- Require a strict response containing `plan`, unified `patch`, and `rationale`.
- Stream stdout and stderr to mode-`0600` artifacts, then parse usage statistics from the outer Gemini JSON response.
- Allow one Gemini process at a time. Bound calls, input/output tokens, wall time, iterations, render attempts, and estimated daily cost.
- Treat exit code `53` as a turn-limit failure and `429`/`RESOURCE_EXHAUSTED` as bounded retry candidates. Never retry credential, policy, or secret failures.
- Do not enable YOLO, auto-edit, arbitrary MCP servers, extensions, or raw output.

## Validate before accepting

1. Apply the proposed patch through the path and diff policies; never let Gemini write directly.
2. Reject unknown, binary, deleted, renamed, mode-changed, symlinked, submodule, secret-bearing, production, or policy files unless the task contract explicitly and safely permits them.
3. Run focused tests, deterministic QA, render/visual checks when applicable, then `npm run check` and `git diff --check`.
4. Run independent security and architecture reviews after tests.
5. Commit only the reviewed file list. Do not merge or deploy.
6. Immediately before push, fetch the canonical remote and prove the base remains an ancestor. Never force-push.
7. Produce a completion report with branch, commit, commands, results, render evidence, artifact hashes, model/token/cost usage, defects, and rollback instructions.

## Stop conditions

Stop and preserve the worktree and artifacts when production access is required, a secret may be exposed, billing or credentials fail, model identity is unexpected, the same failure reaches five attempts, the daily limit is reached, the canonical base cannot be proven, or a regression remains.
