import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("analysis work directory isolation", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    delete process.env.AMF_STORAGE_DIR;
    vi.resetModules();
  });

  it("isolates two executions of the same job attempt during cleanup", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-workdir-"));
    process.env.AMF_STORAGE_DIR = directory;
    vi.resetModules();
    const [{ workDirectory }, { removeWorkDirectory }] = await Promise.all([
      import("./config"),
      import("./media"),
    ]);
    const staleDirectory = workDirectory(
      "job-123",
      2,
      "11111111-1111-4111-8111-111111111111",
    );
    const currentDirectory = workDirectory(
      "job-123",
      2,
      "22222222-2222-4222-8222-222222222222",
    );
    const currentArtifact = path.join(currentDirectory, "analysis-audio.wav");
    await Promise.all([
      mkdir(staleDirectory, { recursive: true }),
      mkdir(currentDirectory, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(staleDirectory, "analysis-audio.wav"), "stale"),
      writeFile(currentArtifact, "current"),
    ]);

    await removeWorkDirectory(staleDirectory);

    await expect(access(staleDirectory)).rejects.toThrow();
    await expect(access(currentArtifact)).resolves.toBeUndefined();
    expect(path.dirname(staleDirectory)).toBe(path.dirname(currentDirectory));
    expect(staleDirectory).not.toBe(currentDirectory);
  });

  it("rejects traversal and invalid attempt components", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "amf-workdir-"));
    process.env.AMF_STORAGE_DIR = directory;
    vi.resetModules();
    const { workDirectory } = await import("./config");

    expect(() => workDirectory("../job", 1, "execution-1")).toThrow("invalid_work_directory_segment");
    expect(() => workDirectory("job-1", 1, "../execution")).toThrow("invalid_work_directory_segment");
    expect(() => workDirectory("job-1", 0, "execution-1")).toThrow("invalid_work_directory_attempt");
  });
});
