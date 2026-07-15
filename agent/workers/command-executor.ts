import { spawn, execSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
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
 * Check if sandbox features are available (unshare syscall)
 * Returns true if running on Google Compute Engine or container without privileges
 */
let sandboxAvailable: boolean | null = null;

export function isSandboxAvailable(): boolean {
  if (sandboxAvailable !== null) return sandboxAvailable;
  
  try {
    // Try to run unshare to check if it's available and works
    execSync("/usr/bin/unshare --user --map-root-user echo test 2>&1", { 
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"]
    });
    sandboxAvailable = true;
  } catch (error) {
    // Sandbox is not available (GCE container, unprivileged container, etc.)
    sandboxAvailable = false;
  }
  return sandboxAvailable;
}

/**
 * Execute a command with sandbox if available, otherwise fall back to direct execution.
 * On Google Compute Engine, sandbox features are typically not available due to
 * namespace restrictions, but the GCE metadata service provides authentication.
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
  
  const translate = (value: string) => {
    if (!path.isAbsolute(value)) return value;
    const worktreeRoot = path.resolve(worktree);
    const artifactRoot = path.resolve(artifacts);
    const resolved = path.resolve(value);
    if (resolved === worktreeRoot) return "/workspace";
    if (resolved.startsWith(`${worktreeRoot}${path.sep}`)) return `/workspace/${path.relative(worktreeRoot, resolved).split(path.sep).join("/")}`;
    if (resolved === artifactRoot) return "/artifacts";
    if (resolved.startsWith(`${artifactRoot}${path.sep}`)) return `/artifacts/${path.relative(artifactRoot, resolved).split(path.sep).join("/")}`;
    return value;
  };
  const argv = [validated.executable, ...validated.args.map(translate)];
  const started = Date.now();
  let timedOut = false;
  let outputLimitExceeded = false;
  let sandboxed = false;
  
  // Check if sandbox is available
  if (isSandboxAvailable()) {
    try {
      const result = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
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
        child.once("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
          clearTimeout(timer);
          resolve({ exitCode, signal });
        });
      });
      stdout.end();
      stderr.end();
      await rm(sandboxRoot, { recursive: true, force: true }).catch(() => {});
      
      const output: CommandResult = { argv, ...result, durationMs: Date.now() - started, stdoutPath, stderrPath, timedOut, outputLimitExceeded, sandboxed: true };
      await appendAudit(root, {
        timestamp: new Date().toISOString(), taskId: request.taskId, category: "command", event: "sandbox_command_finished",
        detail: { argv, cwd: request.cwd, exitCode: output.exitCode, signal: output.signal, durationMs: output.durationMs, stdoutPath, stderrPath, timedOut, outputLimitExceeded, sandboxed: true },
      });
      return output;
    } catch (error) {
      // Fall through to direct execution if sandbox fails
      stdout.end();
      stderr.end();
      await rm(sandboxRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
  
  // Fallback: Direct execution without sandbox (for GCE and unprivileged containers)
  // Commands are still validated by validateCommand(), just not isolated
  sandboxed = false;
  const result = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
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
    child.once("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer);
      resolve({ exitCode, signal });
    });
  });
  stdout.end();
  stderr.end();
  
  const output: CommandResult = { argv, ...result, durationMs: Date.now() - started, stdoutPath, stderrPath, timedOut, outputLimitExceeded, sandboxed: false };
  await appendAudit(root, {
    timestamp: new Date().toISOString(), taskId: request.taskId, category: "command", event: "sandbox_command_finished",
    detail: { argv, cwd: request.cwd, exitCode: output.exitCode, signal: output.signal, durationMs: output.durationMs, stdoutPath, stderrPath, timedOut, outputLimitExceeded, sandboxed: false, fallback: true },
  });
  return output;
}
