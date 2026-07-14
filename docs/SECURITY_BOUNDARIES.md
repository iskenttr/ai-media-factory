# Security Boundaries

## Safety model

Prompt instructions are not a security boundary. AI Media Factory uses layered deterministic controls so that a malicious task, repository prompt injection, model response, or changed test script cannot independently access production.

Security status in this document uses three terms:

- **Source-enforced:** implemented in repository code and suitable for automated tests.
- **Deployment-enforced:** requires administrator-owned users, files, service settings, or cloud permissions.
- **Unverified:** source or design exists, but target-VM evidence has not yet been recorded.

## Protected assets

The agent is never authorized to access:

- production checkout, files, databases, uploads, renders, models, configuration, or credentials;
- production buckets or user media;
- SSH credentials or interactive Cloud SDK configuration;
- Docker socket and production containers;
- IAM, billing, DNS, networking, firewall, deployment, or infrastructure control planes;
- Git remotes, protected branches, release tags, or production branches;
- installed policy, service, and constitution files;
- unrelated repositories and system services.

Known production roots include `/opt/ai-media-factory/current`, `/var/lib/ai-media-factory`, and `/etc/ai-media-factory`. The installed policy may add roots but may never remove these without human review.

## Task contract boundary — source-enforced

Tasks are strict JSON validated with Zod. The schema rejects:

- malformed IDs, priorities, criteria, limits, and execution modes;
- unknown fields;
- absolute, parent-traversing, or backslash-containing repository globs;
- excessive arrays and values above global caps;
- allowed paths overlapping global forbidden paths.

Tasks default to disabled. Task authority cannot override global policy.

Limitation: safe glob support is deliberately small. Only exact paths and trailing `/**` prefix globs are interpreted by path enforcement. Operators should not assume arbitrary shell-style glob semantics.

## Path boundary — source-enforced

Candidate files are normalized and checked against:

1. global forbidden paths;
2. task forbidden paths;
3. task allowed paths.

Command working directories must resolve beneath the task worktree. Absolute command arguments must resolve beneath the worktree or task artifact directory.

Current globally forbidden repository areas include `deploy`, `production`, `secrets`, `storage`, `.git`, `.env`, `.gemini`, `agent/policies`, and this constitution.

Required additional validation before continuous operation:

- symlink and magic-link escape tests;
- hard-link write tests;
- file mode, submodule, rename, and non-UTF-8 filename tests;
- time-of-check/time-of-use tests;
- canonical path checks for newly created files.

The current source uses path resolution and diff-path validation but does not yet use kernel `openat2` containment. Treat advanced link-race resistance as unverified.

## Command boundary — source-enforced

The command policy accepts an argument array, rejects NUL and newline characters, extracts the executable basename, applies an executable/subcommand allowlist, rejects secret-like inline assignments, blocks Git context overrides, bounds timeouts, and creates a minimal environment.

Explicitly forbidden executable categories include privilege escalation, shells, SSH tools, external transfer tools, cloud and infrastructure administration, container control, service control, mounts, identity and permission changes, and destructive deletion.

Git push, remotes, configuration, merge, rebase, reset, clean, fetch, pull, tags, checkout, context overrides, and work-tree overrides are denied to command requests. The trusted Git gateway has a separate smaller operation set.

Limitations requiring tests or tightening:

- `node`, `ffmpeg`, and `ffprobe` are broad executable entries and are safe only because they run inside the namespace sandbox;
- `npm` scripts can execute arbitrary task-modified code and must never run outside that sandbox;
- raw FFmpeg protocols and filters should be regression-tested even though the sandbox has no network and only limited files;
- command logs currently record translated arguments; secret-bearing commands are rejected, but output redaction requires validation;
- output file size is not yet visibly capped in the current implementation.

## Sandbox boundary — source-enforced, deployment unverified

The executor invokes `/usr/bin/unshare` with new user, mount, PID, and network namespaces. Its trusted entrypoint:

- creates a task-scoped tmpfs root;
- read-only binds `/usr`, `/bin`, `/lib`, optional `/lib64`, selected `/etc` files, TLS certificates, device files, and shared `node_modules`;
- read-write binds only the task worktree and artifact directory;
- mounts isolated `/tmp` and restricted `/proc`;
- enters a chroot;
- clears the environment;
- applies `no_new_privileges` and an empty capability bounding set;
- executes with no shell.

The task network namespace has no host network configuration. The old host root is not present in the chroot.

This design must fail closed. Direct host execution is forbidden when namespace or mount setup fails.

Target-VM black-box validation must prove that sandboxed code cannot:

- stat or read any production root;
- read the orchestrator process environment or `/proc/1/environ`;
- read SSH or GCloud user state;
- open `/var/run/docker.sock`;
- reach `169.254.169.254`, DNS, an IP address, Vertex, SMTP, or the public internet;
- mount another host path, enter another namespace, use ptrace, create a privileged device, or acquire capabilities;
- write anywhere except `/workspace`, `/artifacts`, and isolated `/tmp`;
- mutate the installed policy, service unit, base repository, Git common directory, fixtures, or shared dependencies.

No claim of operational isolation should be made before these tests pass on the target VM.

## Git boundary — source-enforced, ownership unverified

The Git gateway refuses remote, configuration, integration, destructive-history, and release operations. It creates a task branch/worktree, inspects the candidate, applies a checked patch, stages an exact file list, and commits after acceptance.

Security review checks path scope, changed-file count, diff-line count, and common secret patterns.

Required validation includes:

- `.git/config` checksum unchanged before and after a full task;
- no remote operation attempted;
- exact base commit and branch format;
- unrelated worktree changes remain untouched;
- rename, deletion, binary patch, submodule, mode-change, and unusual-status parsing;
- candidate commit contains exactly the independently reviewed diff;
- generated code cannot reach the common Git directory from the sandbox.

The development repository currently has no configured remote. Accepted commits therefore remain local until a human creates an approved private remote workflow.

## Review separation — logical, not yet identity-separated

The Engineering Agent produces a plan and patch. QA executes tests through the sandbox. Security applies deterministic diff and path rules. The orchestrator decides acceptance.

The current roles are separate modules in one process. This prevents the Engineering function from directly calling acceptance logic through its declared interface, but it is not operating-system or cryptographic separation. Installed policy ownership, restricted write paths, and independently persisted review evidence are required for a stronger boundary.

## Authentication and network boundary — deployment-enforced

The execution sandbox receives no cloud or email credentials and has no network.

The Gemini broker requires an explicitly configured absolute command and constructs a new environment for Vertex settings. It must use keyless authentication. It must not read interactive user GCloud configuration or expose credentials to task code.

The shared VM does not automatically provide safe direct ADC for the dedicated engineering service account. A verified solution is required, such as:

- a separate development-agent VM attached to the dedicated service account; or
- a trusted keyless broker whose own service identity has only Vertex, Logging, and development-artifact access.

Attaching a new service account to the shared production VM, granting token-creation privileges, installing a service-account key, or broadening IAM is not an autonomous fallback.

Email credentials, when used, belong only to the notifier. Dry-run mode requires none.

## Host service boundary — deployment-enforced

The installed service should use a dedicated OS identity with no `sudo` or Docker membership and an administrator-owned unit with:

- `NoNewPrivileges=true`;
- protected home, kernel, control-group, clock, and device settings;
- empty capability and ambient-capability sets;
- an administrator-owned, non-writable source tree and Git configuration, with only Git metadata, state, logs, task queues, worktrees, and artifacts delegated to the service identity;
- production, credential, GCloud, SSH, and Docker-socket paths marked inaccessible;
- single-instance locking and restart limits;
- administrator-owned immutable policy and configuration.

`ProtectSystem=strict` and `ProtectKernelModules` are intentionally not used by the orchestrator unit: both create locked mounts beneath paths that the nested user/mount namespace must bind into its fail-closed chroot (`/usr` includes the module tree). The same sandbox probe passes under `PrivateTmp`, `ProtectHome`, `PrivateDevices`, `NoNewPrivileges`, `ProtectKernelTunables`, `ProtectKernelLogs`, `ProtectControlGroups`, an empty capability bounding set, and the inaccessible-path controls. The unprivileged service account cannot load host modules, and source immutability is enforced with root ownership and file modes.

The sandbox does not mount the host `/dev` tree. It creates four explicit, read-only device binds for `/dev/null`, `/dev/zero`, `/dev/random`, and `/dev/urandom`; all other device paths remain absent.

## Security event behavior

Any production request, forbidden path, forbidden command, secret in a diff, sandbox setup failure, policy checksum mismatch, credential exposure, unexpected cloud permission, or attempt to alter a security boundary must:

1. stop the affected task;
2. prevent commit;
3. preserve logs and the worktree;
4. write a security and completion report;
5. move to a blocked or failed terminal state;
6. prepare the configured notification;
7. avoid an alternate route.

Security failures are not repairable by model retries.
