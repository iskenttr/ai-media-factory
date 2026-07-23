import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderSmokeArtifact } from "./render-analysis-agent";
import { executeSandboxedCommand } from "../workers/command-executor";

vi.mock("../workers/command-executor", () => ({
  executeSandboxedCommand: vi.fn(),
}));

describe("renderSmokeArtifact", () => {
  it("uses sandbox-visible /artifacts paths for both ffmpeg commands", async () => {
    const artifacts = await mkdtemp(path.join(os.tmpdir(), "amf-render-paths-"));
    const stderrPath = path.join(artifacts, "stderr.log");
    await writeFile(stderrPath, "");

    try {
      const mockExecute = vi.mocked(executeSandboxedCommand);
      mockExecute.mockResolvedValue({
        argv: [],
        exitCode: 0,
        signal: null,
        durationMs: 10,
        stdoutPath: path.join(artifacts, "stdout.log"),
        stderrPath,
        timedOut: false,
        outputLimitExceeded: false,
        sandboxed: true,
      });

      const task = { task_id: "TEST-RENDER-PATHS" } as Parameters<typeof renderSmokeArtifact>[1];
      await renderSmokeArtifact("/root", task, "/worktree", artifacts);

      expect(mockExecute).toHaveBeenCalledTimes(2);
      expect(mockExecute.mock.calls[0][3].argv).toContain("/artifacts/output.mp4");
      expect(mockExecute.mock.calls[1][3].argv).toContain("/artifacts/output.mp4");
      expect(mockExecute.mock.calls[1][3].argv).toContain("/artifacts/sampled-frames/frame-001.png");
    } finally {
      await rm(artifacts, { recursive: true, force: true });
    }
  });
});
