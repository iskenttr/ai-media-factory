# Autonomous Engineering Workflow

The workflow is a bounded state machine: `plan -> build -> review -> test -> video QA -> architecture review -> approval gate`.

Each run records branch, base commit, objective, touched files, commands, test results, render fingerprints, quality metrics, retry count, and estimated AI usage. The same failure may be repaired at most five times. Production access, destructive data operations, credential/billing failures, or an unresolved regression stop the run.

## Authority boundaries

Allowed: feature branches, local files, isolated containers, tests/builds, fixture renders, logs, commits, pushes, and draft PR preparation.

Forbidden: main-branch writes, automatic merge/deploy, production mutations, user-data deletion, IAM/billing/network changes, secret logging, and unbounded AI/repair loops.

## Approval gate

A handoff must contain deterministic and optional AI scores separately, before/after subtitle and visual diffs, all test/build results, artifact hashes/paths, remaining defects, migration notes, and rollback instructions. A human decides whether to merge and deploy.
