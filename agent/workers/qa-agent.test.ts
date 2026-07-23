import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapWorktreeDependencies } from "./qa-agent";

describe("bootstrapWorktreeDependencies", () => {
  it("reuses repository dependencies instead of running npm install in generated worktrees", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "amf-shared-dependencies-"));
    const worktree = path.join(root, "worktrees", "TASK-001");

    try {
      await mkdir(path.join(root, "node_modules"), { recursive: true });
      await mkdir(worktree, { recursive: true });

      await expect(
        bootstrapWorktreeDependencies(root, worktree, "TASK-001"),
      ).resolves.toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
