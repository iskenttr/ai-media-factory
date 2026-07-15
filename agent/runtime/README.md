# Agent runtime assets

These files are operator-installed assets for the development VM. Installation, enabling, starting, and stopping the system service remain human-controlled actions; the autonomous execution loop cannot invoke `systemctl` or edit these files.

- `ai-media-factory-agent.service` runs the bounded queue worker as the unprivileged development user and makes known production paths plus the Docker socket inaccessible.
- `start-agent.sh` refuses root, production mode, `main`, `master`, and detached HEAD before starting the queue loop.
- `health-check.sh` validates the heartbeat and live PID.
- `stop-agent.sh` is an operator convenience wrapper; it is not callable by the agent command policy.
- `agent.env.example` contains safe non-secret defaults and empty credential fields. The installer creates `/etc/ai-media-factory-agent/agent.env` with administrator ownership; supply development-only credentials there, never in Git.
- `ai-media-factory-agent.logrotate` bounds command logs. The hash-chained audit log is intentionally not rotated automatically.
- `ai-media-factory-agent-summary.service` and `.timer` prepare a daily executive summary without model calls.
- `install-agent-service.sh` is a human-only root installer. It writes a root-owned checksum manifest and is not callable from the autonomous command policy.

The unit is not installed by merely committing these assets. Follow `docs/AGENT_OPERATIONS.md` and obtain human approval for service installation or VM-level changes.
