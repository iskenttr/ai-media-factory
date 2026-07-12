import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

import type { TranslationProviderInput, TranslationProviderResult } from "@/lib/localization/contracts";
import type { TranslationProvider } from "@/lib/providers/contracts/translation-provider";

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function run(command: string, input: unknown) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, [], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { error += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(error || `translation_provider_exit_${code}`)));
    child.stdin.end(JSON.stringify(input));
  });
}

export class ArgosTranslateProvider implements TranslationProvider {
  readonly id = "argos-translate";
  readonly version = "argos-translate-en-tr-v1";

  constructor(private readonly command: string) {}

  async translate(input: TranslationProviderInput): Promise<TranslationProviderResult> {
    const inputFingerprint = fingerprint({
      sourceLanguage: input.sourceLanguage.code,
      targetLanguage: input.targetLanguage.code,
      sourceText: input.sourceText,
      previousSegments: input.previousSegments.map((segment) => segment.text),
      nextSegments: input.nextSegments.map((segment) => segment.text),
    });
    if (input.sourceLanguage.code !== "en" || input.targetLanguage.code !== "tr") {
      return {
        availability: "unavailable", translatedText: null, providerVersion: this.version,
        sourceSegmentId: input.segmentId, targetLanguage: input.targetLanguage, translationNotes: [], timingAssessment: null,
        failureReason: "unsupported_language_pair", provenance: { contextSnapshotId: input.contextSnapshotId, inputFingerprint, resultFingerprint: fingerprint("unavailable") },
      };
    }
    try {
      const output = JSON.parse(await run(this.command, {
        sourceText: input.sourceText,
        sourceLanguage: input.sourceLanguage.code,
        targetLanguage: input.targetLanguage.code,
        context: { previous: input.previousSegments.map((segment) => segment.text), next: input.nextSegments.map((segment) => segment.text) },
      })) as { translatedText?: string; error?: string; version?: string };
      if (!output.translatedText?.trim()) throw new Error(output.error || "empty_translation_result");
      return {
        availability: "available", translatedText: output.translatedText.trim(), providerVersion: output.version || this.version,
        sourceSegmentId: input.segmentId, targetLanguage: input.targetLanguage, translationNotes: [], timingAssessment: null,
        failureReason: null, provenance: { contextSnapshotId: input.contextSnapshotId, inputFingerprint, resultFingerprint: fingerprint(output.translatedText.trim()) },
      };
    } catch (error) {
      return {
        availability: "unavailable", translatedText: null, providerVersion: this.version,
        sourceSegmentId: input.segmentId, targetLanguage: input.targetLanguage, translationNotes: [], timingAssessment: null,
        failureReason: error instanceof Error ? error.message : "provider_failure",
        provenance: { contextSnapshotId: input.contextSnapshotId, inputFingerprint, resultFingerprint: fingerprint("provider_failure") },
      };
    }
  }
}
