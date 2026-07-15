import path from "node:path";
import { assertWithinRoot } from "./path-policy";

export interface CommandRequest { argv: string[]; cwd: string; taskId: string; timeoutMs?: number }

const forbiddenExecutables = new Set([
  "sudo", "su", "ssh", "scp", "rsync", "curl", "wget", "gcloud", "docker", "podman", "kubectl", "terraform", "pulumi",
  "systemctl", "service", "mount", "umount", "nsenter", "chmod", "chown", "rm", "bash", "sh", "zsh", "fish",
]);

const allowed: Record<string, Set<string> | null> = {
  npm: new Set(["run", "test"]),
  node: null,
  ffmpeg: null,
  ffprobe: null,
  git: new Set(["status", "diff", "add", "commit", "rev-parse", "branch", "worktree", "log", "show", "ls-files"]),
};

const forbiddenGit = new Set(["push", "remote", "config", "merge", "rebase", "reset", "clean", "fetch", "pull", "tag", "checkout"]);
const secretPattern = /(token|password|secret|authorization|private[-_]?key)=/i;

export function validateCommand(request: CommandRequest, worktree: string, artifacts: string) {
  if (!request.argv.length || request.argv.some((arg) => arg.includes("\0") || /[\r\n]/.test(arg))) throw new Error("invalid_command_argv");
  const executable = path.basename(request.argv[0]);
  if (forbiddenExecutables.has(executable)) throw new Error(`forbidden_executable:${executable}`);
  if (!(executable in allowed)) throw new Error(`executable_not_allowlisted:${executable}`);
  assertWithinRoot(worktree, request.cwd);
  if (request.argv.some((arg) => secretPattern.test(arg))) throw new Error("secret_in_command_argv");
  if (request.argv.some((arg) => /^(--git-dir|--work-tree|-C|-c)$/.test(arg) || arg.startsWith("--git-dir=") || arg.startsWith("--work-tree="))) {
    throw new Error("git_context_override_forbidden");
  }
  if (executable === "git") {
    const subcommand = request.argv[1];
    if (!subcommand || forbiddenGit.has(subcommand) || !allowed.git?.has(subcommand)) throw new Error(`forbidden_git_subcommand:${subcommand ?? "missing"}`);
  } else {
    const verbs = allowed[executable];
    if (verbs && !verbs.has(request.argv[1])) throw new Error(`forbidden_command_mode:${executable}:${request.argv[1] ?? "missing"}`);
  }
  for (const argument of request.argv.slice(1)) {
    if (!path.isAbsolute(argument)) continue;
    const inWorktree = path.resolve(argument).startsWith(`${path.resolve(worktree)}${path.sep}`);
    const inArtifacts = path.resolve(argument).startsWith(`${path.resolve(artifacts)}${path.sep}`) || path.resolve(argument) === path.resolve(artifacts);
    if (!inWorktree && !inArtifacts) throw new Error(`absolute_path_forbidden:${argument}`);
  }
  return { executable, args: request.argv.slice(1), timeoutMs: Math.min(request.timeoutMs ?? 15 * 60_000, 15 * 60_000) };
}

export function sanitizedEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: "/tmp/amf-agent-home",
    TMPDIR: "/tmp",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    CI: "1",
    NODE_ENV: "test" as const,
    ...extra,
  };
}
