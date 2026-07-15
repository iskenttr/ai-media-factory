// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateCommand } from "./command-policy";

const worktree = "/tmp/amf-worktree";
const artifacts = "/tmp/amf-artifacts";
const request = (argv: string[]) => ({ argv, cwd: worktree, taskId: "SAFE-001" });

describe("command policy", () => {
  it("allows bounded test commands", () => expect(validateCommand(request(["npm", "test", "--", "--run", "agent"]), worktree, artifacts).executable).toBe("npm"));
  it.each([["sudo", "true"], ["ssh", "host"], ["gcloud", "compute", "instances", "list"], ["docker", "ps"], ["bash", "-c", "id"]])("rejects forbidden executable %s", (...argv) => {
    expect(() => validateCommand(request(argv), worktree, artifacts)).toThrow("forbidden_executable");
  });
  it.each([["git", "push"], ["git", "remote", "-v"], ["git", "config", "user.name"], ["git", "reset", "--hard"]])("rejects unsafe Git request", (...argv) => {
    expect(() => validateCommand(request(argv), worktree, artifacts)).toThrow("forbidden_git_subcommand");
  });
  it("rejects context overrides and host paths", () => {
    expect(() => validateCommand(request(["git", "status", "--git-dir=/tmp/other"]), worktree, artifacts)).toThrow("git_context_override_forbidden");
    expect(() => validateCommand(request(["ffprobe", "/etc/passwd"]), worktree, artifacts)).toThrow("absolute_path_forbidden");
  });
  it("rejects credentials in argv", () => expect(() => validateCommand(request(["node", "x.js", "token=abcdefghijklmnop"]), worktree, artifacts)).toThrow("secret_in_command_argv"));
});
