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
 */
const DEVELOPMENT_ALLOWED: Record<string, Set<string> | null> = {
  npm: new Set(["run", "test", "install", "build", "lint", "typecheck"]),
  node: null,
  ffmpeg: null,
  ffprobe: null,
  git: new Set([
    "status", "diff", "add", "commit", "rev-parse", "branch", "worktree", "log", "show", "ls-files",
    "switch",    // Switch branches (development only)
    "checkout",  // Checkout files/branches (development only)
    "merge",     // Merge branches (development only, see MERGE_PROTECTED_BRANCHES)
  ]),
};

/**
 * ALWAYS Forbidden Git Subcommands
 * These are blocked in ALL contexts regardless of environment.
 */
const ALWAYS_FORBIDDEN_GIT = new Set([
  "push", "force-push", "push--force",  // Direct push to remote
  "remote",                                  // Remote management
  "config",                                  // Git configuration (could modify safe.directory)
  "rebase",                                  // Rebase can rewrite history
  "reset",                                   // Reset can lose commits
  "clean",                                   // Clean can delete files
  "fetch",                                   // Fetch from remote
  "pull",                                    // Pull from remote
  "tag",                                     // Tag management
]);

/**
 * Production-Protected Git Branches
 * These branches can NEVER be the target of merge operations.
 */
const MERGE_PROTECTED_BRANCHES = new Set([
  "main", "master", "production", "release", "prod", "stable",
  "origin/main", "origin/master", "origin/production", "origin/release",
]);

const secretPattern = /(token|password|secret|authorization|private[-_]?key)=/i;

/**
 * Merge target protection: prevents merging into protected branches
 */
function validateMergeTarget(args: string[]): void {
  const mergeIndex = args.indexOf("merge");
  if (mergeIndex >= 0 && args.length > mergeIndex + 1) {
    const targetBranch = args[mergeIndex + 1];
    for (const protectedBranch of MERGE_PROTECTED_BRANCHES) {
      if (targetBranch.includes(protectedBranch)) {
        throw new Error(`forbidden_merge_target:merging into ${protectedBranch} is not allowed`);
      }
    }
  }
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
    
    // In development mode, check against development allowed set
    const allowedGitCommands = developmentMode ? DEVELOPMENT_ALLOWED.git : PRODUCTION_ALLOWED.git;
    if (!subcommand || !allowedGitCommands?.has(subcommand)) throw new Error(`forbidden_git_subcommand:${subcommand ?? "missing"}`);
    
    // Validate merge targets (production + development)
    validateMergeTarget(request.argv);
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
