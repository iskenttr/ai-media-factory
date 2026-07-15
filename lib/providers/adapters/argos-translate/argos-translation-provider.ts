import { createHash } from "node:crypto";

import type { TranslationProviderInput, TranslationProviderResult } from "@/lib/localization/contracts";
import type { TranslationProvider } from "@/lib/providers/contracts/translation-provider";
import { serverConfig } from "@/lib/server/config";

import {
  ProviderProcessError,
  runBoundedProviderProcess,
  type ProviderProcessOptions,
} from "../provider-process";

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class ArgosTranslateProvider implements TranslationProvider {
  readonly id = "argos-translate";
  readonly version = "argos-translate-en-tr-v1";

  constructor(
    private readonly command: string,
    private readonly processOptions: ProviderProcessOptions = {
      timeoutMs: serverConfig.argosProcessTimeoutMs,
      killGraceMs: serverConfig.argosProcessKillGraceMs,
      maxOutputBytes: serverConfig.argosProcessMaxOutputBytes,
    },
  ) {}

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
      const rawOutput = await runBoundedProviderProcess(this.command, [], {
        sourceText: input.sourceText,
        sourceLanguage: input.sourceLanguage.code,
        targetLanguage: input.targetLanguage.code,
        context: { previous: input.previousSegments.map((segment) => segment.text), next: input.nextSegments.map((segment) => segment.text) },
      }, this.processOptions);
      let output: { translatedText?: string; version?: string };
      try {
        output = JSON.parse(rawOutput) as { translatedText?: string; version?: string };
      } catch {
        throw new Error("translation_provider_invalid_response");
      }
      if (!output.translatedText?.trim()) throw new Error("translation_provider_invalid_response");
      return {
        availability: "available", translatedText: output.translatedText.trim(), providerVersion: output.version || this.version,
        sourceSegmentId: input.segmentId, targetLanguage: input.targetLanguage, translationNotes: [], timingAssessment: null,
        failureReason: null, provenance: { contextSnapshotId: input.contextSnapshotId, inputFingerprint, resultFingerprint: fingerprint(output.translatedText.trim()) },
      };
    } catch (error) {
      return {
        availability: "unavailable", translatedText: null, providerVersion: this.version,
        sourceSegmentId: input.segmentId, targetLanguage: input.targetLanguage, translationNotes: [], timingAssessment: null,
        failureReason: error instanceof ProviderProcessError
          ? error.code
          : error instanceof Error && error.message === "translation_provider_invalid_response"
            ? error.message
            : "translation_provider_failed",
        provenance: { contextSnapshotId: input.contextSnapshotId, inputFingerprint, resultFingerprint: fingerprint("provider_failure") },
      };
    }
  }
}
