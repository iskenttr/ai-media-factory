import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { TranslationProviderInput } from "@/lib/localization/contracts";

import { ArgosTranslateProvider } from "./argos-translation-provider";

const temporaryDirectories: string[] = [];
const input: TranslationProviderInput = {
  projectId: "project-1",
  contextSnapshotId: "snapshot-1",
  sourceLanguage: { code: "en", name: "English" },
  targetLanguage: { code: "tr", name: "Turkish" },
  segmentId: "segment-1",
  sourceText: "Hello",
  previousSegments: [],
  nextSegments: [],
  speakerId: "speaker-1",
  contentProfile: null,
  timingBudget: { startMs: 0, endMs: 1_000, durationMs: 1_000 },
  glossaryTerms: [],
  translationMode: "natural",
};
const processOptions = { timeoutMs: 5_000, killGraceMs: 50, maxOutputBytes: 1_024 };

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

async function executable(source: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "amf-argos-adapter-"));
  temporaryDirectories.push(directory);
  const executablePath = path.join(directory, "provider");
  await writeFile(executablePath, `#!${process.execPath}\n${source}\n`, "utf8");
  await chmod(executablePath, 0o755);
  return executablePath;
}

describe("ArgosTranslateProvider", () => {
  it("preserves the successful adapter contract", async () => {
    const command = await executable("process.stdin.resume(); process.stdin.on('end',()=>console.log(JSON.stringify({translatedText:'Merhaba',version:'fixture-v1'})))");
    const result = await new ArgosTranslateProvider(command, processOptions).translate(input);

    expect(result).toEqual(expect.objectContaining({
      availability: "available",
      translatedText: "Merhaba",
      providerVersion: "fixture-v1",
      failureReason: null,
      sourceSegmentId: "segment-1",
    }));
  });

  it("returns a stable non-secret failure reason", async () => {
    const command = await executable("process.stderr.write('secret-runtime-detail'); process.exit(3)");
    const result = await new ArgosTranslateProvider(command, processOptions).translate(input);

    expect(result.availability).toBe("unavailable");
    expect(result.failureReason).toBe("translation_provider_failed");
    expect(JSON.stringify(result)).not.toContain("secret-runtime-detail");
  });

  it("does not return provider-supplied error text from an invalid response", async () => {
    const command = await executable("process.stdin.resume(); process.stdin.on('end',()=>console.log(JSON.stringify({error:'secret-model-detail'})))");
    const result = await new ArgosTranslateProvider(command, processOptions).translate(input);

    expect(result.failureReason).toBe("translation_provider_invalid_response");
    expect(JSON.stringify(result)).not.toContain("secret-model-detail");
  });
});
