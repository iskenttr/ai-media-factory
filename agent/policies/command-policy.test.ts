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
  it("allows the sandbox artifact mount but rejects traversal outside it", () => {
    expect(validateCommand(request(["ffprobe", "/artifacts/output.mp4"]), worktree, artifacts).args).toEqual(["/artifacts/output.mp4"]);
    expect(validateCommand(request(["ffprobe", "/artifacts"]), worktree, artifacts).args).toEqual(["/artifacts"]);
    expect(() => validateCommand(request(["ffprobe", "/artifacts/../etc/passwd"]), worktree, artifacts)).toThrow("absolute_path_forbidden");
    expect(() => validateCommand(request(["ffprobe", "/artifacts-escape/output.mp4"]), worktree, artifacts)).toThrow("absolute_path_forbidden");
  });
});

describe("development mode (policy v2)", () => {
  it("allows npm install, ci, update in development mode", () => {
    const devRequest = () => ({ argv: [], cwd: worktree, taskId: "DEV-001" });
    expect(validateCommand({ ...devRequest(), argv: ["npm", "install"] }, worktree, artifacts, true).executable).toBe("npm");
    expect(validateCommand({ ...devRequest(), argv: ["npm", "ci"] }, worktree, artifacts, true).executable).toBe("npm");
    expect(validateCommand({ ...devRequest(), argv: ["npm", "update"] }, worktree, artifacts, true).executable).toBe("npm");
  });

  it("allows git switch, checkout, merge, rebase, fetch, pull in development mode", () => {
    const devRequest = () => ({ argv: [], cwd: worktree, taskId: "DEV-002" });
    expect(validateCommand({ ...devRequest(), argv: ["git", "switch", "feature/test"] }, worktree, artifacts, true).executable).toBe("git");
    expect(validateCommand({ ...devRequest(), argv: ["git", "checkout", "feature/test"] }, worktree, artifacts, true).executable).toBe("git");
    expect(validateCommand({ ...devRequest(), argv: ["git", "merge", "feature/test"] }, worktree, artifacts, true).executable).toBe("git");
    expect(validateCommand({ ...devRequest(), argv: ["git", "rebase", "feature/base"] }, worktree, artifacts, true).executable).toBe("git");
    expect(validateCommand({ ...devRequest(), argv: ["git", "fetch", "origin"] }, worktree, artifacts, true).executable).toBe("git");
    expect(validateCommand({ ...devRequest(), argv: ["git", "pull", "origin", "feature/test"] }, worktree, artifacts, true).executable).toBe("git");
  });

  it("allows git push to feature branches in development mode", () => {
    const devRequest = () => ({ argv: [], cwd: worktree, taskId: "DEV-003" });
    expect(validateCommand({ ...devRequest(), argv: ["git", "push", "origin", "feature/test"] }, worktree, artifacts, true).executable).toBe("git");
    expect(validateCommand({ ...devRequest(), argv: ["git", "push", "-u", "origin", "feat/my-branch"] }, worktree, artifacts, true).executable).toBe("git");
  });

  it("blocks push to protected branches in development mode", () => {
    const devRequest = () => ({ argv: [], cwd: worktree, taskId: "DEV-004" });
    expect(() => validateCommand({ ...devRequest(), argv: ["git", "push", "origin", "main"] }, worktree, artifacts, true)).toThrow("forbidden_push_target");
    expect(() => validateCommand({ ...devRequest(), argv: ["git", "push", "origin", "master"] }, worktree, artifacts, true)).toThrow("forbidden_push_target");
    expect(() => validateCommand({ ...devRequest(), argv: ["git", "push", "origin", "production"] }, worktree, artifacts, true)).toThrow("forbidden_push_target");
    expect(() => validateCommand({ ...devRequest(), argv: ["git", "push", "origin", "origin/main"] }, worktree, artifacts, true)).toThrow("forbidden_push_target");
  });

  it("blocks merge/rebase/pull into protected branches in development mode", () => {
    const devRequest = () => ({ argv: [], cwd: worktree, taskId: "DEV-005" });
    expect(() => validateCommand({ ...devRequest(), argv: ["git", "merge", "main"] }, worktree, artifacts, true)).toThrow("forbidden_protected_operation");
    expect(() => validateCommand({ ...devRequest(), argv: ["git", "rebase", "origin/main"] }, worktree, artifacts, true)).toThrow("forbidden_protected_operation");
    expect(() => validateCommand({ ...devRequest(), argv: ["git", "pull", "origin", "production"] }, worktree, artifacts, true)).toThrow("forbidden_protected_operation");
  });

  it("blocks push in production mode", () => {
    expect(() => validateCommand(request(["git", "push", "origin", "feature/test"]), worktree, artifacts, false)).toThrow("forbidden_git_subcommand");
  });
});
