# Autonomous Engineering Agent Architecture

## Purpose

The system turns structured development tasks into isolated, reviewable candidate commits without granting production authority. It separates planning, implementation, execution, evaluation, security review, Git mutation, model access, and notification so that a model response alone cannot cross a safety boundary.

## Trust zones

### Human control plane

Humans author or approve tasks, install the service and immutable policies, provide development-only authentication, review candidate commits, and decide whether anything is merged or deployed. Production authority remains here and is never delegated to the agent.

### Trusted orchestrator

The orchestrator owns lifecycle state, queue claims, limits, audit records, task-specific artifact directories, and final decisions. It interprets model output as untrusted data.

The orchestrator is responsible for:

- validating a strict task contract;
- detecting obvious production requests;
- resolving an exact base commit;
- creating a branch and worktree through the Git gateway;
- invoking the Engineering role;
- requiring QA and Security evidence;
- controlling render and evaluation stages;
- applying repair stop rules;
- committing only an accepted file set;
- generating terminal reports and notifications.

### Model broker

The model broker is the only component intended to call Gemini. It receives bounded context, obtains a short-lived access token from the Compute Engine metadata server, calls Vertex `generateContent` without a tools field, requires schema-constrained JSON, limits calls, records reported usage, and saves the raw response as a restricted artifact.

The broker does not execute model-proposed commands. A returned patch is parsed, path-checked, and applied through the Git gateway.

### Execution sandbox

Tests and task commands run in a new user, mount, PID, and network namespace. The sandbox constructs a small chroot containing read-only host binaries and libraries, read-only shared dependencies, a writable worktree and artifact directory, isolated `/tmp`, and a restricted `/proc`. It drops capabilities and enables `no_new_privileges` before executing the command.

The network namespace has no configured external network. Failure to create the sandbox is a hard failure.

### Git gateway

The Git gateway is a trusted, non-model API. It creates `agent/<task-id>-<slug>` branches and `worktrees/<task-id>` worktrees, obtains status and diffs, applies validated patches, stages an exact approved path list, and creates a candidate commit.

Push, remote configuration, pull, fetch, merge, rebase, reset, clean, and tags are refused.

### Evaluators and independent roles

- **Engineering Agent:** creates a plan and a task-scoped patch. It cannot accept its own result.
- **QA Agent:** runs declared tests inside the sandbox and reports command evidence.
- **Security Agent:** checks the changed file list, diff size, allowed paths, and secret patterns.
- **Subtitle Quality Agent:** evaluates deterministic Subtitle Quality V3 metrics.
- **Render Analysis Agent:** produces render-test evidence without granting renderer control to a model.
- **Orchestrator:** combines independent evidence and makes the lifecycle decision.

The current source uses deterministic QA and Security modules rather than separate operating-system processes. They are logically independent but are not yet cryptographically or identity-separated. Deployment hardening should run review roles under distinct capability boundaries or preserve independently signed evidence.

## Component map

```text
agent/
  orchestrator/   queue claim, lifecycle, lock, audit, reporting
  workers/        engineering, QA, Security, Git and model brokers
  evaluators/     subtitle, render and benchmark evidence
  policies/       command, path, diff and immutable-policy manifest
  notifications/  dry-run and SMTP completion notification
  tasks/          strict task schema and runtime queue directories
  state/          runtime heartbeat, lock, audit and usage records
  reports/        email previews and future aggregate reports

lib/subtitle-quality/v3/
  deterministic contracts, ASS parsing, evaluation, comparison and repair

benchmarks/
  fixture manifests, human-approved golden references and results

artifacts/<task-id>/<run>/
  plans, patches, tests, render evidence, quality and completion reports

logs/<task-id>/commands/
  bounded stdout and stderr files

worktrees/<task-id>/
  isolated Git worktree for the task branch
```

Runtime directories are ignored by Git. A production deployment should move mutable state and logs to administrator-owned locations such as `/var/lib/amf-engineering-agent` and `/var/log/amf-engineering-agent`, or explicitly harden the repository runtime directories with equivalent ownership and access controls.

## Task data flow

```text
disabled or enabled JSON task
  -> strict schema and global safety validation
  -> atomic queue claim
  -> exact base commit resolution
  -> isolated agent branch and worktree
  -> controlled implementation or model-generated unified diff
  -> path and patch validation
  -> independent Security review
  -> sandboxed QA commands
  -> render stage
  -> deterministic quality and benchmark evaluation
  -> bounded repair decision, or terminal decision
  -> exact-path staging and candidate commit when accepted
  -> completion report and email preview/delivery
```

## Task contract

Tasks are strict JSON documents. Unknown fields are rejected. Important fields include:

- `task_id`, title, priority, and objective;
- `enabled`, which defaults to false;
- allowed and forbidden repository paths;
- unit, integration, render, critical-error, quality-delta, and regression criteria;
- limits for iterations, files, diff lines, render attempts, model calls, and execution time;
- required artifact names;
- sandbox test commands;
- one execution mode: controlled sample, model patch, or approval required.

Task paths are relative, cannot include parent traversal or backslashes, and cannot overlap globally forbidden roots. A task can only reduce authority.

Current source-level global maxima are:

- 6 iterations;
- 25 changed files;
- 2,500 changed diff lines;
- 4 render attempts;
- 12 model calls;
- 1,000,000 task-declared model tokens, narrowed by the 200,000 runtime default;
- 7,200,000 milliseconds execution time.

## Lifecycle

The deterministic state machine permits:

```text
QUEUED
  -> ANALYZING
  -> PLANNED
  -> IMPLEMENTING
  -> TESTING
  -> RENDERING
  -> EVALUATING
      -> ACCEPTED
      -> REJECTED
      -> BLOCKED
      -> FAILED
      -> REPAIRING -> IMPLEMENTING
```

`BLOCKED_REQUIRES_HUMAN_APPROVAL` is a distinct terminal state for production or approval-bound work. Terminal states cannot transition further.

Every transition is written to a SHA-256 hash-linked JSONL audit log. The hash chain supports tamper evidence only when the log file is protected by deployment-time ownership; source code alone cannot prevent an account that owns the file from rewriting it.

## Git design

- Base commit is resolved before task work starts.
- Branch name is derived from validated task ID and title.
- Worktree location is deterministic.
- The patch is inspected before staging.
- Only the approved path list is staged.
- Successful work remains a local candidate commit for human review.
- No remote operation is part of the autonomous lifecycle.

The current development repository has no configured remote. Recovery therefore depends on preserving local branches, reports, and verified bundles until a human configures an approved private remote.

## Subtitle Quality V3 foundation

The V3 library is deterministic and intended to report:

- cue duration;
- characters per second;
- line count and maximum line length;
- overlaps and gaps;
- invalid timestamps and empty events;
- speaker-change consistency;
- ASS parse validity;
- video-duration overflow;
- safe-area metadata;
- critical error count and overall score;
- baseline-versus-candidate regressions;
- repair eligibility.

Model scoring may be retained as advisory metadata, but it is not a substitute for these rules.

## Deployment boundary

The repository currently contains source-level controls. A continuous secure service additionally requires:

- a dedicated non-sudo, non-Docker OS identity;
- an administrator-owned installed policy copy;
- a hardened service unit and log rotation;
- explicit read/write and inaccessible paths;
- keyless Vertex authentication available only to the model broker;
- SMTP credentials available only to the notifier, if delivery is enabled;
- sandbox black-box validation on the target VM;
- restart, lock, stale-state, and recovery tests.

Until those actions are completed, the architecture is not an assertion that the agent is safely operating continuously.
