import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runBoundedProviderProcess } from "./provider-process";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

const options = { timeoutMs: 2_000, killGraceMs: 50, maxOutputBytes: 128 };

describe("runBoundedProviderProcess", () => {
  it("preserves successful provider output and writes JSON input", async () => {
    const output = await runBoundedProviderProcess(process.execPath, [
      "-e",
      "let body=''; process.stdin.on('data',c=>body+=c); process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(body))))",
    ], { sourceText: "hello" }, options);

    expect(JSON.parse(output)).toEqual({ sourceText: "hello" });
  });

  it("caps output and returns a stable failure code", async () => {
    const promise = runBoundedProviderProcess(process.execPath, [
      "-e",
      "process.stdout.write('x'.repeat(4096)); setInterval(()=>{},1000)",
    ], {}, { ...options, maxOutputBytes: 32 });

    await expect(promise).rejects.toEqual(expect.objectContaining({
      code: "translation_provider_output_limit_exceeded",
      message: "translation_provider_output_limit_exceeded",
    }));
  });

  it("does not expose raw child stderr", async () => {
    const promise = runBoundedProviderProcess(process.execPath, [
      "-e",
      "process.stderr.write('secret-provider-detail'); process.exit(9)",
    ], {}, options);

    const error = await promise.catch((reason: unknown) => reason);
    expect(error).toEqual(expect.objectContaining({ code: "translation_provider_failed" }));
    expect(String(error)).not.toContain("secret-provider-detail");
  });

  it("uses speech-provider codes without changing translation defaults", async () => {
    const speechFailure = runBoundedProviderProcess(process.execPath, [
      "-e",
      "process.stderr.write('private-model-path'); process.exit(4)",
    ], undefined, { ...options, errorPrefix: "speech_provider", inputMode: "ignore" });
    await expect(speechFailure).rejects.toEqual(expect.objectContaining({ code: "speech_provider_failed" }));

    const translationFailure = runBoundedProviderProcess(process.execPath, [
      "-e",
      "process.exit(4)",
    ], {}, options);
    await expect(translationFailure).rejects.toEqual(expect.objectContaining({ code: "translation_provider_failed" }));
  });

  it("escalates an ignored SIGTERM to SIGKILL after the grace period", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "amf-provider-process-"));
    temporaryDirectories.push(directory);
    const markerPath = path.join(directory, "sigterm-received");
    const startedAt = Date.now();
    const promise = runBoundedProviderProcess(process.execPath, [
      "-e",
      `const fs=require('node:fs'); process.on('SIGTERM',()=>fs.writeFileSync(${JSON.stringify(markerPath)},'yes')); setInterval(()=>{},1000);`,
    ], {}, { timeoutMs: 500, killGraceMs: 100, maxOutputBytes: 128 });

    await expect(promise).rejects.toEqual(expect.objectContaining({ code: "translation_provider_timeout" }));
    expect(await readFile(markerPath, "utf8")).toBe("yes");
    expect(Date.now() - startedAt).toBeLessThan(1_500);
  });
});
