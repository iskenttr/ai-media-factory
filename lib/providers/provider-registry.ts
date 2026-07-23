import { access } from "node:fs/promises";

import type { SpeechAnalysisProvider } from "./contracts/speech-analysis-provider";
import type { SpeakerAnalysisProvider } from "./contracts/speaker-analysis-provider";
import type { ContentProfileProvider } from "./contracts/content-profile-provider";
import type { TranslationProvider } from "./contracts/translation-provider";
import type { TtsProvider } from "./contracts/tts-provider";
import { WhisperCppSpeechProvider } from "./adapters/whisper-cpp/whisper-cpp-provider";
import { PyannoteCommunitySpeakerProvider } from "./adapters/pyannote-community-1/pyannote-speaker-provider";
import { DeterministicContentProfileProvider } from "./adapters/deterministic-content-profile/deterministic-content-profile-provider";
import { ArgosTranslateProvider } from "./adapters/argos-translate/argos-translation-provider";
import { GoogleCloudTtsProvider } from "./adapters/google-cloud-tts/google-cloud-tts-provider";
import { SherpaOnnxSpeakerProvider } from "./adapters/sherpa-onnx/sherpa-speaker-provider";

export interface ProviderRegistry {
  speech(): Promise<SpeechAnalysisProvider | null>;
  speakers(): Promise<SpeakerAnalysisProvider | null>;
  contentProfile(): ContentProfileProvider;
  translation(): Promise<TranslationProvider | null>;
  tts(): Promise<TtsProvider | null>;
}

export class LocalProviderRegistry implements ProviderRegistry {
  constructor(
    private readonly whisperBinary: string | undefined,
    private readonly whisperModel: string | undefined,
    private readonly pythonBinary: string | undefined = undefined,
    private readonly pyannoteModel: string | undefined = undefined,
    private readonly whisperDisableGpu = process.env.WHISPER_CPP_NO_GPU === "1",
    private readonly argosTranslateCommand = process.env.ARGOS_TRANSLATE_COMMAND,
    private readonly googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT,
    private readonly ttsProvider = process.env.AMF_TTS_PROVIDER,
  ) {}

  async speech() {
    if (!this.whisperBinary || !this.whisperModel) return null;
    try {
      await Promise.all([access(this.whisperBinary), access(this.whisperModel)]);
      return new WhisperCppSpeechProvider(this.whisperBinary, this.whisperModel, this.whisperDisableGpu);
    } catch {
      return null;
    }
  }

  async speakers() {
    if (this.pythonBinary && this.pyannoteModel) {
      try {
        await Promise.all([access(this.pythonBinary), access(this.pyannoteModel)]);
        return new PyannoteCommunitySpeakerProvider(this.pythonBinary, this.pyannoteModel);
      } catch {
        // Continue to the ungated local ONNX fallback.
      }
    }
    const sherpaPython = process.env.SHERPA_ONNX_PYTHON;
    const sherpaSegmentation = process.env.SHERPA_ONNX_SEGMENTATION_MODEL;
    const sherpaEmbedding = process.env.SHERPA_ONNX_EMBEDDING_MODEL;
    const sherpaRunner = process.env.SHERPA_ONNX_RUNNER;
    if (!sherpaPython || !sherpaSegmentation || !sherpaEmbedding) return null;
    try {
      await Promise.all([
        access(sherpaPython),
        access(sherpaSegmentation),
        access(sherpaEmbedding),
        ...(sherpaRunner ? [access(sherpaRunner)] : []),
      ]);
      return new SherpaOnnxSpeakerProvider(
        sherpaPython,
        sherpaSegmentation,
        sherpaEmbedding,
        sherpaRunner,
      );
    } catch {
      return null;
    }
  }

  contentProfile() {
    return new DeterministicContentProfileProvider();
  }

  async translation() {
    if (!this.argosTranslateCommand) return null;
    try {
      await access(this.argosTranslateCommand);
      return new ArgosTranslateProvider(this.argosTranslateCommand);
    } catch {
      return null;
    }
  }

  async tts() {
    if (this.ttsProvider !== "google-cloud" || !this.googleCloudProject) return null;
    return new GoogleCloudTtsProvider(this.googleCloudProject, {
      locales: (process.env.AMF_TTS_LOCALES ?? "tr-TR")
        .split(",")
        .map((locale) => locale.trim())
        .filter(Boolean),
      usageLedgerPath: process.env.AMF_TTS_USAGE_LEDGER,
      dailyCharacterLimit: Number(process.env.AMF_TTS_DAILY_CHARACTER_LIMIT ?? 100_000),
      dailyCostLimitUsd: Number(process.env.AMF_TTS_DAILY_COST_LIMIT_USD ?? 0.5),
    });
  }
}
