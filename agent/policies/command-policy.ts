import path from "node:path";
import { assertWithinRoot } from "./path-policy";

export interface CommandRequest { argv: string[]; cwd: string; taskId: string; timeoutMs?: number }

/**
 * ALWAYS Forbidden Executables
 * These are blocked in ALL contexts (production and development).
 * These represent critical security risks.
 */
const ALWAYS_FORBIDDEN_EXECUTABLES = new Set([
  "sudo", "su", "ssh", "scp", "rsync", "curl", "wget", "gcloud", "docker", "podman", "kubectl", "terraform", "pulumi",
  "systemctl", "service", "mount", "umount", "nsenter", "chmod", "chown", "rm", "bash", "sh", "zsh", "fish",
  // Shell interpreters that could bypass restrictions
  "python", "python3", "perl", "ruby", "php", "python2",
  // Package managers that could modify system
  "apt", "apt-get", "yum", "dnf", "pacman", "brew",
  // Network tools
  "nc", "netcat", "nmap", "telnet",
  // File editing outside worktree
  "sed", "awk", "vi", "vim", "nano", "emacs", "ed",
]);

/**
 * Production Allowed Commands
 * Core commands allowed in production mode.
 */
const PRODUCTION_ALLOWED: Record<string, Set<string> | null> = {
  npm: new Set(["run", "test"]),
  node: null,
  ffmpeg: null,
  ffprobe: null,
  git: new Set(["status", "diff", "add", "commit", "rev-parse", "branch", "worktree", "log", "show", "ls-files"]),
};

/**
 * Development Allowed Commands
 * Additional commands allowed in development mode only.
 * These relaxations do NOT apply to production environments.
 * Per Development Runtime Policy v2.
 */
const DEVELOPMENT_ALLOWED: Record<string, Set<string> | null> = {
  npm: new Set(["run", "test", "install", "ci", "update", "build", "lint", "typecheck"]),
  node: null,
  ffmpeg: null,
  ffprobe: null,
  git: new Set([
    "status", "diff", "add", "commit", "rev-parse", "branch", "worktree", "log", "show", "ls-files",
    "switch",     // Switch branches
    "checkout",   // Checkout files/branches
    "merge",      // Merge branches (protected branch check)
    "rebase",     // Rebase (protected branch check)
    "fetch",      // Fetch from remote
    "pull",       // Pull from remote (protected branch check)
  ]),
};

/**
 * ALWAYS Forbidden Git Subcommands
 * These are blocked in ALL contexts regardless of environment.
 */
const ALWAYS_FORBIDDEN_GIT = new Set([
  "force-push", "push--force",  // Force push is always blocked (see push protection for regular push)
  "remote",                     // Remote management
  "config",                     // Git configuration (could modify safe.directory)
  "reset",                      // Reset can lose commits
  "clean",                      // Clean can delete files
  "tag",                        // Tag management
]);

/**
 * Production-Protected Git Branches
 * These branches can NEVER be the target of merge, push, or rebase operations.
 */
const PROTECTED_BRANCHES = new Set([
  "main", "master", "production", "release", "prod", "stable",
  "origin/main", "origin/master", "origin/production", "origin/release",
  "openhands/main", "openhands/master", "openhands/production",
]);

/**
 * Check if branch is protected for push/merge/rebase operations.
 */
function isProtectedBranch(branch: string): boolean {
  const lower = branch.toLowerCase();
  return Array.from(PROTECTED_BRANCHES).some((pb) => lower.includes(pb.toLowerCase()));
}

const secretPattern = /(token|password|secret|authorization|private[-_]?key)=/i;

/**
 * Protected branch operations: prevents merge/rebase/pull into protected branches
 */
function validateProtectedBranchOperation(args: string[], operation: string): void {
  // Find the branch argument for merge, rebase, pull
  const opIndex = args.indexOf(operation);
  if (opIndex >= 0 && args.length > opIndex + 1) {
    // For pull, the format is "git pull remote branch"
    // For merge/rebase, the format is "git merge/rebase branch"
    let targetBranch = args[opIndex + 1];
    // Skip remote for pull commands (the next arg is the remote, then the branch)
    if (operation === "pull" && args.length > opIndex + 2 && !args[opIndex + 1].startsWith("-")) {
      targetBranch = args[opIndex + 2] || args[opIndex + 1];
    }
    if (isProtectedBranch(targetBranch)) {
      throw new Error(`forbidden_protected_operation:${operation} on ${targetBranch} is not allowed`);
    }
  }
  // Also check -d (delete) and -D (force delete) flags
  const deleteMatch = args.findIndex((a) => a === "-d" || a === "-D");
  if (deleteMatch >= 0 && args.length > deleteMatch + 1) {
    const branchToDelete = args[deleteMatch + 1];
    if (isProtectedBranch(branchToDelete)) {
      throw new Error(`forbidden_protected_operation:deleting protected branch ${branchToDelete} is not allowed`);
    }
  }
}

/**
 * Push validation: allows push to feature branches only (development mode)
 */
function validatePushTarget(args: string[], developmentMode: boolean): void {
  if (!developmentMode) {
    throw new Error("forbidden_git_subcommand:push is only allowed in development mode");
  }
  // Extract branch from push commands like "git push origin branch" or "git push -u origin branch"
  const originIndex = args.indexOf("origin");
  if (originIndex >= 0 && args.length > originIndex + 1) {
    const branch = args[originIndex + 1];
    if (isProtectedBranch(branch)) {
      throw new Error(`forbidden_push_target:push to ${branch} is not allowed`);
    }
  }
  // Check --delete flag for deleting remote branches
  if (args.includes("--delete")) {
    throw new Error("forbidden_git_subcommand:remote branch deletion is not allowed");
  }
}

function isSandboxArtifactPath(argument: string): boolean {
  const normalized = path.posix.normalize(argument);
  return normalized === "/artifacts" || normalized.startsWith("/artifacts/");
}

export function validateCommand(request: CommandRequest, worktree: string, artifacts: string, developmentMode = false) {
  if (!request.argv.length || request.argv.some((arg) => arg.includes("\0") || /[\r\n]/.test(arg))) throw new Error("invalid_command_argv");
  const executable = path.basename(request.argv[0]);
  
  // Check ALWAYS forbidden first (production + development)
  if (ALWAYS_FORBIDDEN_EXECUTABLES.has(executable)) throw new Error(`forbidden_executable:${executable}`);
  
  // Select command set based on mode
  const allowed = developmentMode ? DEVELOPMENT_ALLOWED : PRODUCTION_ALLOWED;
  if (!(executable in allowed)) throw new Error(`executable_not_allowlisted:${executable}`);
  
  assertWithinRoot(worktree, request.cwd);
  if (request.argv.some((arg) => secretPattern.test(arg))) throw new Error("secret_in_command_argv");
  if (request.argv.some((arg) => /^(--git-dir|--work-tree|-C|-c)$/.test(arg) || arg.startsWith("--git-dir=") || arg.startsWith("--work-tree="))) {
    throw new Error("git_context_override_forbidden");
  }
  if (executable === "git") {
    const subcommand = request.argv[1];
    // Check ALWAYS forbidden git subcommands
    if (ALWAYS_FORBIDDEN_GIT.has(subcommand)) throw new Error(`forbidden_git_subcommand:${subcommand}`);

    // Handle push specially: allowed in dev mode with branch protection, blocked in production
    if (subcommand === "push") {
      if (!developmentMode) {
        throw new Error("forbidden_git_subcommand:push is only allowed in development mode");
      }
      validatePushTarget(request.argv, developmentMode);
    } else {
      // In development mode, check against development allowed set
      const allowedGitCommands = developmentMode ? DEVELOPMENT_ALLOWED.git : PRODUCTION_ALLOWED.git;
      if (!subcommand || !allowedGitCommands?.has(subcommand)) {
        throw new Error(`forbidden_git_subcommand:${subcommand ?? "missing"}`);
      }

      // Validate protected branch operations
      if (developmentMode) {
        validateProtectedBranchOperation(request.argv, "merge");
        validateProtectedBranchOperation(request.argv, "rebase");
        validateProtectedBranchOperation(request.argv, "pull");
      } else {
        // In production, just check merge (other ops already blocked by ALWAYS_FORBIDDEN_GIT or not in allowed set)
        validateProtectedBranchOperation(request.argv, "merge");
      }
    }
  } else {
    const verbs = allowed[executable];
    if (verbs && !verbs.has(request.argv[1])) throw new Error(`forbidden_command_mode:${executable}:${request.argv[1] ?? "missing"}`);
  }
  for (const argument of request.argv.slice(1)) {
    if (!path.isAbsolute(argument)) continue;
    if (isSandboxArtifactPath(argument)) continue;
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
