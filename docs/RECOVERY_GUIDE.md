# Engineering Agent Recovery Guide

## Recovery principles

Recovery applies only to the development agent. Do not inspect, stop, restart, copy, modify, or use production as part of recovery.

The priorities are:

1. prevent duplicate execution;
2. preserve task evidence and candidate work;
3. restore the trusted control plane from a verified source;
4. resume only after the cause is understood;
5. avoid destructive cleanup.

Never use `git reset --hard`, force-push, broad `rm -rf`, production backups, or production service commands to recover the agent.

## Evidence to preserve

Before changing recovery state, preserve:

- migration branch name and commit;
- task JSON from queue, processing, blocked, failed, or completed;
- task worktree and branch;
- task artifact directory;
- command stdout/stderr logs;
- `task-status.json` and completion report;
- audit log, heartbeat, lock file, and model-usage log;
- service logs and service definition checksum;
- immutable policy manifest and installed policy checksum;
- a verified Git bundle containing candidate branches.

Copies must remain inside approved development-artifact locations. Never include credentials, runtime environment files, user media, or production data.

## Normal stop

Use only the installed development-agent stop command recorded in `FINAL_MIGRATION_REPORT.md`. Confirm:

- no new task is claimed;
- the orchestrator process exits;
- no sandbox child remains;
- the task worktree and artifacts still exist;
- the production service was not addressed.

The autonomous loop itself cannot stop or restart its host service.

## Stale lock

The source orchestrator creates `agent/state/orchestrator.lock` exclusively and stores its PID.

Recovery procedure:

1. Stop the development-agent service through the human operator path.
2. Confirm the recorded PID does not belong to a live orchestrator.
3. Confirm no sandbox child or active task command remains.
4. Preserve the lock file and heartbeat in the incident artifact directory.
5. Move the stale lock to a task-scoped quarantine name rather than deleting unrelated files.
6. Start the development-agent service once.
7. Confirm only one orchestrator owns the new lock.

Do not remove a lock merely because the heartbeat is old. PID reuse and a wedged child must be ruled out.

## Interrupted task

When a task remains in `processing` after an unexpected stop:

1. Do not return it immediately to the queue.
2. Inspect the audit chain, last state, command logs, and worktree status.
3. If a command may still be active, keep the task quarantined.
4. If the last operation was patching or staging, compare the worktree, index, and recorded patch through the trusted Git gateway.
5. Write a recovery decision report.
6. Resume only from a transition allowed by the state machine, or terminate as `FAILED`/`BLOCKED` and author a new task.

The current file queue does not implement a durable database lease. Automated interrupted-task replay must therefore remain disabled until restart behavior is tested and duplicate execution is excluded.

## Sandbox setup failure

If `unshare`, mount, chroot, capability drop, or network isolation fails:

1. Mark the command and task failed.
2. Preserve stderr and the sandbox setup path.
3. Do not execute the command on the host.
4. Confirm no task process remains.
5. Quarantine the task until the host administrator repairs sandbox support.

Temporary sandbox roots are task-scoped under artifacts. Cleanup must validate the exact generated directory before removing it. Never accept a task-provided cleanup root.

## Policy checksum or ownership failure

If the installed policy checksum, ownership, or mode differs from the approved release:

1. Do not start the orchestrator.
2. Treat the event as a critical security incident.
3. Preserve the observed manifest, checksums, owner, mode, and service logs.
4. Restore the control-plane package from a verified migration bundle or approved commit.
5. Reinstall it through the human administrator path.
6. Re-run all command, path, sandbox, and service security tests.

Do not copy policy from an unreviewed task worktree.

## Git recovery

Accepted work remains on a local `agent/...` branch. The development repository currently has no remote, so preserve it with a verified bundle before invasive Git maintenance.

Safe recovery actions include:

- `git status`, `git diff`, `git show`, and `git fsck` by a human operator;
- creating a bundle that explicitly includes the migration and candidate branches;
- cloning the bundle into a new isolated recovery directory;
- comparing commit and artifact hashes.

Do not alter `.git/config`, add an unapproved remote, force-push, rewrite history, delete the candidate branch, or remove its worktree until recovery is complete.

If a candidate commit is incorrect, preserve it and create a new human-reviewed corrective commit or revert. Do not conceal it with history rewriting.

## State and audit recovery

The audit log is SHA-256 hash-linked. Recovery validation should:

1. parse each JSONL entry;
2. confirm its `previousHash` equals the prior entry's `hash`;
3. recompute every hash from the canonical stored payload;
4. compare the last known hash with any external task summary;
5. flag truncation, malformed lines, or chain discontinuity.

A hash chain is tamper-evident only while file ownership prevents the task identity from rewriting it. If ownership was not hardened, report the audit as untrusted.

## Credential or secret incident

If a credential appears in a prompt, patch, log, artifact, email preview, or commit:

1. Stop the development agent.
2. Do not print or forward the value.
3. Record only the file, line category, hash, and credential type.
4. Quarantine affected artifacts with restrictive permissions.
5. Notify the human security owner.
6. Revoke or rotate the credential outside the agent workflow.
7. Remove the value through a human-reviewed history and artifact remediation process.
8. Re-run the secret scan before resuming.

The agent cannot rotate IAM or SMTP credentials autonomously.

## Model or billing incident

On unexpected model routing, missing keyless authentication, permission errors, reported usage anomalies, or budget threshold breach:

1. Stop new model calls for the task.
2. Preserve model name, location, request count, duration, and reported usage without credentials.
3. Mark the task blocked.
4. Continue only deterministic safe work that does not change the task outcome, or stop entirely if the model is required.
5. Require a human to repair authentication or budget configuration.

Do not switch to an API key, interactive user credentials, a stronger model, or another project as a workaround.

## Rollback of the migration

Rollback means disabling the development agent and reverting its development-only files. It never means deploying an old production version.

1. Stop and disable only the development-agent service.
2. Preserve branches, worktrees, queue, reports, logs, and a verified bundle.
3. Remove or quarantine development-agent credentials through the human administrator path.
4. Revert the migration commit on a new human-controlled branch, or check out the prior development commit in a separate recovery clone.
5. Do not delete candidate branches until reviewed.
6. Confirm the original development branch remains recoverable.
7. Record the rollback reason and remaining state.

Exact installed unit, state, log, and policy paths must be filled into `FINAL_MIGRATION_REPORT.md` after deployment.
