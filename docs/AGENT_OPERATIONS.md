# Engineering Agent Operations

## Scope

This guide covers development-agent operations only. None of these procedures authorize production access, deployment, service restart, database access, or use of production fixtures.

## Operator roles

- **Task author:** creates a bounded disabled task and defines measurable criteria.
- **Agent operator:** validates, enables, queues, monitors, and recovers tasks.
- **Human reviewer:** inspects candidate commits and evidence. Only the reviewer may choose to merge later.
- **Host administrator:** installs the dedicated identity, immutable policy copy, service unit, filesystem permissions, and credentials. Administrative installation is outside the autonomous loop.

## Before first operation

Do not start continuous operation until all of the following are true:

1. The repository is on the approved migration branch and the worktree is clean except for the reviewed migration change.
2. The agent source has passed lint, typecheck, unit tests, build, and security tests.
3. A dedicated service identity exists and is not in `sudo` or `docker` groups.
4. Runtime policy is installed as an administrator-owned read-only copy and its checksum is verified at startup.
5. The service cannot access production roots, home credentials, Cloud SDK user state, or `/var/run/docker.sock`.
6. The namespace sandbox fails closed and has passed the black-box isolation tests in `SECURITY_BOUNDARIES.md`.
7. Keyless Vertex authentication is configured for the model broker, or model tasks remain blocked.
8. Email remains in dry-run mode unless SMTP credentials are intentionally installed.
9. The initial task queue is disabled by default.
10. A recoverable Git bundle of the migration branch has been stored in the development artifact bucket or another approved private location.

Repository source alone does not satisfy these deployment checks.

## Local source commands

From the isolated development repository:

```sh
npm run agent:validate-task -- path/to/task.json
npm run agent:once
npm run agent:orchestrator
npm run agent:health
npm run benchmark:subtitle -- path/to/fixture.json
```

These commands describe the source interface. On the VM, prefer the installed service and its operator scripts after hardening. Do not run continuous mode from an unrestricted interactive shell and do not run it from the production checkout.

## Creating a task

1. Copy a reviewed task example into a temporary authoring location.
2. Choose a stable uppercase ID such as `SQV3-001`.
3. Set `enabled` to `false` while authoring.
4. Limit `allowed_paths` to the smallest possible repository paths.
5. Repeat sensitive task-specific paths in `forbidden_paths`; global policy remains authoritative even if omitted.
6. Define deterministic success criteria.
7. Set limits below or equal to the global caps.
8. Select only required artifact names.
9. Use `controlled_sample` for migration smoke validation, `gemini_patch` only when keyless model access is configured, or `approval_required` when no autonomous action is appropriate.
10. Validate the task before setting `enabled` to true.

Task objective text is untrusted data and cannot grant permission.

## Queue directories

The source queue uses:

```text
agent/tasks/queue/
agent/tasks/processing/
agent/tasks/completed/
agent/tasks/failed/
agent/tasks/blocked/
```

The orchestrator claims work by atomically renaming a JSON file from `queue` to `processing`. Disabled tasks are returned to the queue and do not execute. Malformed tasks move to `failed`.

Submit a task by validating it first, then atomically moving the complete JSON file into `queue`. Do not write a task progressively inside the live queue.

## Lifecycle observation

Each task run creates a timestamped artifact directory and updates:

- `task-status.json` for the current state;
- `implementation-plan.json` for the task plan;
- `security-report.json` for deterministic diff review;
- `test-report.json` and command stdout/stderr logs;
- `render-report.json`;
- quality and benchmark reports;
- `git-diff.patch`;
- `completion-report.json`;
- `notification-report.json`.

Global runtime evidence includes:

- `agent/state/heartbeat.json`;
- `agent/state/audit.jsonl`;
- `agent/state/model-usage.jsonl` when model calls occur;
- `agent/state/orchestrator.lock` while the process is running.

The audit log is hash-linked. Verify its chain before relying on it after an unexpected shutdown.

## Start, stop, and health

### Source-mode development

Use `npm run agent:once` for a single queue poll during development. Continuous `npm run agent:orchestrator` polls without calling Gemini while idle.

Stop source mode with a normal `SIGTERM` or `SIGINT`. Do not kill task subprocesses individually unless performing documented recovery.

### Installed service

The migration must install reviewed start, stop, and health scripts or a hardened systemd service. Expected operator actions are:

```text
start:  start only the development-agent unit
stop:   stop only the development-agent unit
health: verify service process, heartbeat age, lock, queue and last terminal report
logs:   inspect only development-agent logs
```

Exact unit names and commands must be recorded in `FINAL_MIGRATION_REPORT.md` after installation. They are intentionally not claimed here before deployment.

The autonomous execution loop itself is forbidden from invoking `systemctl`, `service`, `sudo`, or the operator scripts.

## Idle behavior and concurrency

Only one orchestrator may hold the lock. A second instance must fail without processing a task. The continuous loop writes a heartbeat, checks the queue, and sleeps for the configured poll interval when no enabled task exists.

Idle operation must generate zero Gemini requests. Model usage is checked per task before every call.

The current source lock records a PID in an exclusive file and probes stale PIDs. Deployment validation must test stale-lock recovery and PID-reuse behavior. A production-grade installation should pair the file lock with a service-level single instance and durable task lease.

## Review and acceptance

An `ACCEPTED` task means the autonomous development criteria passed; it does not mean the change is merged, deployed, or production-approved.

Before accepting a candidate for human review, verify:

- branch and base commit;
- exact changed file list;
- diff limits and secret scan;
- independent Security and QA reports;
- required unit, integration, render, and benchmark evidence;
- deterministic score, critical errors, quality delta, and regression count;
- model usage and retry reasons;
- artifact hashes where required;
- no production, Git remote, or configuration access;
- candidate commit exists only on its task branch.

## Failure handling

- **REJECTED:** engineering evidence did not satisfy the task, but the run completed safely.
- **FAILED:** an unexpected technical error prevented completion.
- **BLOCKED:** credentials, permissions, unsupported capability, or another external dependency is required.
- **BLOCKED_REQUIRES_HUMAN_APPROVAL:** the task requests production or another human-only action.

Never weaken a gate to turn a failure into acceptance. Preserve the worktree, logs, task file, and artifacts for diagnosis.

## Cost controls

For every model-enabled task:

- enforce the task's model-call limit;
- enforce total execution and render limits;
- record requested and actual model name and region;
- record reported usage when available;
- record why a retry occurred;
- stop on model-routing mismatch, permission error, unexpected billing, or budget exhaustion;
- never send full videos when text, timestamps, metadata, or selected frames are sufficient.

The broker records calls, reported usage, and a conservative estimated cost. It refuses new calls after the configured daily request or estimated-cost limit. Provider billing is authoritative: the local estimate is a safety brake, not an invoice or a replacement for Cloud Billing alerts. Content-fingerprint caching and automatic budget-alert ingestion remain future work.

On Compute Engine the broker obtains keyless Vertex ADC from the metadata server. The service account must be dedicated and limited to Vertex inference and log writing. The orchestrator service therefore needs metadata-server access; generated commands do not inherit credentials and execute inside an independent `unshare --net` namespace with an empty environment.

## Daily operations checklist

1. Confirm the development-agent service is healthy.
2. Confirm the heartbeat is fresh and only one lock exists.
3. Review blocked, failed, and security-event reports.
4. Review model usage and configured budget limits.
5. Confirm queue tasks are intentional and enabled.
6. Preserve accepted branches and artifacts.
7. Verify log rotation and available development storage.
8. Confirm no remote push, merge, deployment, or production operation occurred.
9. Generate the executive summary only from recorded evidence.

Daily summary generation is a required target capability. It remains unimplemented until a tested scheduler and report generator are recorded in the final migration report.
