import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MediaProcessError, runBoundedMediaProcess } from "./media";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("runBoundedMediaProcess", () => {
  it("preserves bounded stdout and stderr for a successful process", async () => {
    const result = await runBoundedMediaProcess(process.execPath, [
      "-e",
      "process.stdout.write('probe-json'); process.stderr.write('diagnostic')",
    ], { stage: "media_probe", timeoutMs: 1_000, maxOutputBytes: 64 });

    expect(result).toEqual({ stdout: "probe-json", stderr: "diagnostic" });
  });

  it("stops output growth at the configured cap and returns a stable code", async () => {
    const promise = runBoundedMediaProcess(process.execPath, [
      "-e",
      "process.stdout.write('x'.repeat(4096)); setInterval(() => {}, 1000)",
    ], { stage: "media_probe", timeoutMs: 2_000, killGraceMs: 50, maxOutputBytes: 32 });

    await expect(promise).rejects.toEqual(expect.objectContaining({
      name: "MediaProcessError",
      code: "media_probe_output_limit_exceeded",
      message: "media_probe_output_limit_exceeded",
    }));
  });

  it("does not expose child stderr when a process fails", async () => {
    const promise = runBoundedMediaProcess(process.execPath, [
      "-e",
      "process.stderr.write('secret-provider-detail'); process.exit(7)",
    ], { stage: "audio_extraction", timeoutMs: 1_000, maxOutputBytes: 128 });

    const error = await promise.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(MediaProcessError);
    expect(error).toEqual(expect.objectContaining({ code: "audio_extraction_failed" }));
    expect(String(error)).not.toContain("secret-provider-detail");
  });

  it("escalates from SIGTERM to SIGKILL after the bounded grace period", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "amf-media-process-"));
    temporaryDirectories.push(directory);
    const markerPath = path.join(directory, "sigterm-received");
    const startedAt = Date.now();
    const promise = runBoundedMediaProcess(process.execPath, [
      "-e",
      `const fs=require('node:fs'); process.on('SIGTERM',()=>fs.writeFileSync(${JSON.stringify(markerPath)},'yes')); setInterval(()=>{},1000);`,
    ], { stage: "audio_signal_assessment", timeoutMs: 500, killGraceMs: 100, maxOutputBytes: 128 });

    await expect(promise).rejects.toEqual(expect.objectContaining({ code: "audio_signal_assessment_timeout" }));
    expect(await readFile(markerPath, "utf8")).toBe("yes");
    expect(Date.now() - startedAt).toBeLessThan(1_500);
  });

  it("clears the timeout after successful completion", async () => {
    const startedAt = Date.now();
    await runBoundedMediaProcess(process.execPath, ["-e", "process.stdout.write('done')"], {
      stage: "media_probe",
      timeoutMs: 1_000,
      killGraceMs: 500,
      maxOutputBytes: 32,
    });

    expect(Date.now() - startedAt).toBeLessThan(900);
  });
});
