# Email Notification Setup

## Scope

The notification module produces task terminal notifications. Dry-run mode writes an email preview to disk without network access or credentials. SMTP delivery is optional and must not be enabled until development-only credentials and service isolation are installed.

Email does not control task acceptance. A notification failure must be recorded and retried only within a bounded notifier policy; it must not weaken tests or quality gates.

## Supported configuration

The current source supports:

```dotenv
EMAIL_PROVIDER=
EMAIL_DRY_RUN=
SMTP_HOST=
SMTP_PORT=
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_SECURE=
SMTP_STARTTLS=
EMAIL_FROM=
EMAIL_TO=
```

An `.env.example` may contain these names and non-secret explanations only. Do not put real values in the repository, task files, prompts, command arguments, reports, or Git history.

Behavior:

- Dry run is used unless `EMAIL_DRY_RUN=false` and `EMAIL_PROVIDER` is set.
- `EMAIL_PROVIDER=smtp` selects SMTP delivery.
- `SMTP_PORT` defaults to `587`.
- `SMTP_SECURE=true` starts with TLS.
- Otherwise STARTTLS is attempted unless `SMTP_STARTTLS=false`.
- Authentication occurs only when both username and password are supplied.
- `EMAIL_TO` may contain comma-separated recipients.

## Credential installation

SMTP credentials are deployment-time secrets. Install them through an administrator-owned mechanism such as a root-readable environment file with restrictive ownership or systemd credentials. The autonomous task sandbox must not receive them.

Minimum rules:

- use a development-only sender account;
- restrict recipients to approved addresses;
- grant no mailbox-reading or administrative permissions;
- prefer a revocable provider credential dedicated to this agent;
- keep credentials out of the repository and user shell history;
- prevent values from appearing in service status or diagnostic output;
- document rotation and revocation ownership.

Do not reuse production SMTP, Gmail, Cloud SDK, or user-account credentials.

## Dry-run procedure

1. Leave `EMAIL_DRY_RUN` unset or set it to a value other than `false`.
2. Leave `EMAIL_PROVIDER` unset if no provider is being tested.
3. Run a controlled sample task.
4. Confirm an `.eml` preview appears under `agent/reports/email-previews/`.
5. Confirm mode is restrictive and the preview contains no credentials or source media.
6. Confirm `notification-report.json` says `delivered: false` and `dryRun: true`.
7. Compare the preview with `completion-report.json`.

Do not describe dry-run success as delivered email.

## Delivery test

Actual delivery is tested only when approved credentials are available.

1. Install credentials outside Git.
2. Restrict the notifier process to the approved SMTP endpoint where practical.
3. Set `EMAIL_PROVIDER=smtp` and `EMAIL_DRY_RUN=false` in the protected service configuration.
4. Send one controlled migration-test notification to an approved recipient.
5. Verify TLS behavior, sender, recipient, subject, and body.
6. Verify `notification-report.json` records delivery without credentials.
7. Verify no SMTP authentication material appears in logs, process listings, artifacts, or email previews.
8. Return to dry-run mode until continuous-operation approval.

If credentials are absent, record delivery as `NOT_TESTED_CREDENTIALS_REQUIRED`; do not fabricate success.

## Required task content

Terminal task email includes:

- task ID and title;
- terminal status;
- branch and candidate commit hash;
- duration;
- changed files;
- test and render results;
- baseline and candidate quality scores;
- quality delta;
- critical errors;
- artifact location;
- recommended next task.

The current notifier uses this completion format for terminal processing. A daily-summary generator and systemd timer asset are implemented, but the timer was not installed or validated during this migration. Dedicated delivery routing for human approval and critical security events remains future work.

## Failure and privacy behavior

- SMTP errors must not include passwords or full authentication commands in retained output.
- Notifications must not attach source videos, transcripts, databases, patches containing secrets, or raw model prompts.
- Artifact locations should identify development-only paths and should not reveal signed URLs or credentials.
- Recipient addresses should be treated as configuration, not task input.
- A task cannot choose SMTP hosts, senders, or recipients.
- Notification retries must be bounded and must not re-run engineering work.

## Rotation and disablement

To disable delivery, remove `EMAIL_PROVIDER` or restore dry-run mode through the human administrator path. To rotate a credential, stop the notifier, replace the protected secret, run one delivery test, and revoke the old credential. The autonomous agent may not perform this operation.
