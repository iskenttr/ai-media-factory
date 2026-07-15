import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { appendAudit } from "../orchestrator/audit-log";
import { sanitizedEnvironment, validateCommand, type CommandRequest } from "../policies/command-policy";
import { isDevelopmentMode } from "../tasks/schema";

export interface CommandResult {
  argv: string[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
  timedOut: boolean;
  outputLimitExceeded: boolean;
  sandboxed: boolean;
}

/**
 * Error patterns that indicate sandbox creation is not permitted.
 * These are specific uid_map and namespace-related permission errors.
 */
const SANDBOX_PERMISSION_ERROR_PATTERNS = [
  /unshare.*Operation not permitted/i,
  /write failed.*uid_map/i,
  /cannot allocate uid/i,
  /setgroups.*Operation not permitted/i,
  /unshare.*Permission denied/i,
];

/**
 * Check if stderr indicates a sandbox permission error.
 * Exported for testing.
 */
export function isSandboxPermissionError(stderr: string): boolean {
  return SANDBOX_PERMISSION_ERROR_PATTERNS.some((pattern) => pattern.test(stderr));
}

/**
 * Execute a command with sandbox isolation.
 * In development mode, falls back to direct execution if sandbox is not permitted.
 * In production mode, fails on any sandbox error.
 */
export async function executeSandboxedCommand(root: string, worktree: string, artifacts: string, request: CommandRequest): Promise<CommandResult> {
  const developmentMode = isDevelopmentMode();
  const validated = validateCommand(request, worktree, artifacts, developmentMode);
  const commandLogDirectory = path.join(root, "logs", request.taskId, "commands");
  await mkdir(commandLogDirectory, { recursive: true });
  const commandId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const stdoutPath = path.join(commandLogDirectory, `${commandId}.stdout.log`);
  const stderrPath = path.join(commandLogDirectory, `${commandId}.stderr.log`);
  const stdout = createWriteStream(stdoutPath, { flags: "wx", mode: 0o600 });
  const stderr = createWriteStream(stderrPath, { flags: "wx", mode: 0o600 });
  const entrypoint = path.join(root, "agent/workers/namespace-entrypoint.ts");
  const sandboxRoot = path.join("/tmp", "amf-agent-sandboxes", `${request.taskId}-${commandId}`);
  const argv = [validated.executable, ...validated.args];
  const started = Date.now();
  let timedOut = false;
  let outputLimitExceeded = false;
  let fallbackActivated = false;

  // Try sandbox execution first
  const sandboxResult = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; stderr: string }>((resolve, reject) => {
    const child = spawn("/usr/bin/unshare", [
      "--user", "--map-root-user", "--mount", "--pid", "--fork", "--net",
      "--", process.execPath, entrypoint,
      "--root", sandboxRoot, "--worktree", worktree, "--artifacts", artifacts, "--", ...argv,
    ], {
      cwd: worktree,
      env: sanitizedEnvironment({ AMF_AGENT_REPOSITORY_ROOT: root }),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"] as const,
    });
    let outputBytes = 0;
    let stderrContent = "";
    const record = (stream: NodeJS.ReadableStream, destination: NodeJS.WritableStream) => stream.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 10 * 1024 * 1024) {
        outputLimitExceeded = true;
        child.kill("SIGTERM");
        return;
      }
      destination.write(chunk);
    });
    record(child.stdout, stdout);
    child.stderr.on("data", (chunk: Buffer) => {
      stderrContent += chunk.toString();
      outputBytes += chunk.length;
      if (outputBytes > 10 * 1024 * 1024) {
        outputLimitExceeded = true;
        child.kill("SIGTERM");
        return;
      }
      stderr.write(chunk);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, validated.timeoutMs);
    timer.unref();
    child.once("error", (err) => {
      clearTimeout(timer);
      if (developmentMode && isSandboxPermissionError(err.message + stderrContent)) {
        // Fall back to direct execution in development mode for permission errors
        fallbackActivated = true;
        resolve({ exitCode: 1, signal: null, stderr: err.message + stderrContent });
      } else {
        reject(err);
      }
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal, stderr: stderrContent });
    });
  });

  // Check if sandbox succeeded
  const sandboxFailed = sandboxResult.exitCode !== 0 || sandboxResult.signal !== null;
  
  if (sandboxFailed && developmentMode && isSandboxPermissionError(sandboxResult.stderr)) {
    // Fall back to direct execution for permission errors in development mode
    fallbackActivated = true;
    stdout.end();
    stderr.end();
    await rm(sandboxRoot, { recursive: true, force: true }).catch(() => {});
  } else if (sandboxFailed) {
    // Sandbox failed with non-permission error - clean up and fail
    stdout.end();
    stderr.end();
    await rm(sandboxRoot, { recursive: true, force: true }).catch(() => {});
    const output: CommandResult = { argv, ...sandboxResult, durationMs: Date.now() - started, stdoutPath, stderrPath, timedOut, outputLimitExceeded, sandboxed: true };
    await appendAudit(root, {
      timestamp: new Date().toISOString(), taskId: request.taskId, category: "command", event: "sandbox_command_finished",
      detail: { argv, cwd: request.cwd, exitCode: output.exitCode, signal: output.signal, durationMs: output.durationMs, stdoutPath, stderrPath, timedOut, outputLimitExceeded, sandboxed: true },
    });
    return output;
  } else {
    // Sandbox succeeded
    stdout.end();
    stderr.end();
    await rm(sandboxRoot, { recursive: true, force: true }).catch(() => {});
    const output: CommandResult = { argv, ...sandboxResult, durationMs: Date.now() - started, stdoutPath, stderrPath, timedOut, outputLimitExceeded, sandboxed: true };
    await appendAudit(root, {
      timestamp: new Date().toISOString(), taskId: request.taskId, category: "command", event: "sandbox_command_finished",
      detail: { argv, cwd: request.cwd, exitCode: output.exitCode, signal: output.signal, durationMs: output.durationMs, stdoutPath, stderrPath, timedOut, outputLimitExceeded, sandboxed: true },
    });
    return output;
  }

  // Fallback: Direct execution without sandbox (development mode only)
  const fallbackResult = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const child = spawn(validated.executable, validated.args, {
      cwd: request.cwd || worktree,
      env: sanitizedEnvironment({ AMF_AGENT_REPOSITORY_ROOT: root }),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"] as const,
    });
    let outputBytes = 0;
    const record = (stream: NodeJS.ReadableStream, destination: NodeJS.WritableStream) => stream.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 10 * 1024 * 1024) {
        outputLimitExceeded = true;
        child.kill("SIGTERM");
        return;
      }
      destination.write(chunk);
    });
    record(child.stdout, stdout);
    record(child.stderr, stderr);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, validated.timeoutMs);
    timer.unref();
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal });
    });
  });
  stdout.end();
  stderr.end();

  const output: CommandResult = { argv, ...fallbackResult, durationMs: Date.now() - started, stdoutPath, stderrPath, timedOut, outputLimitExceeded, sandboxed: false };
  await appendAudit(root, {
    timestamp: new Date().toISOString(), taskId: request.taskId, category: "command", event: "sandbox_command_finished",
    detail: { argv, cwd: request.cwd, exitCode: output.exitCode, signal: output.signal, durationMs: output.durationMs, stdoutPath, stderrPath, timedOut, outputLimitExceeded, sandboxed: false, fallback: fallbackActivated },
  });
  return output;
}
