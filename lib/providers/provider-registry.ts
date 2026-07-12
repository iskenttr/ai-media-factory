import { access } from "node:fs/promises";

import type { SpeechAnalysisProvider } from "./contracts/speech-analysis-provider";
import type { SpeakerAnalysisProvider } from "./contracts/speaker-analysis-provider";
import type { ContentProfileProvider } from "./contracts/content-profile-provider";
import type { TranslationProvider } from "./contracts/translation-provider";
import { WhisperCppSpeechProvider } from "./adapters/whisper-cpp/whisper-cpp-provider";
import { PyannoteCommunitySpeakerProvider } from "./adapters/pyannote-community-1/pyannote-speaker-provider";
import { DeterministicContentProfileProvider } from "./adapters/deterministic-content-profile/deterministic-content-profile-provider";
import { ArgosTranslateProvider } from "./adapters/argos-translate/argos-translation-provider";

export interface ProviderRegistry {
  speech(): Promise<SpeechAnalysisProvider | null>;
  speakers(): Promise<SpeakerAnalysisProvider | null>;
  contentProfile(): ContentProfileProvider;
  translation(): Promise<TranslationProvider | null>;
}

export class LocalProviderRegistry implements ProviderRegistry {
  constructor(
    private readonly whisperBinary: string | undefined,
    private readonly whisperModel: string | undefined,
    private readonly pythonBinary: string | undefined = undefined,
    private readonly pyannoteModel: string | undefined = undefined,
    private readonly whisperDisableGpu = process.env.WHISPER_CPP_NO_GPU === "1",
    private readonly argosTranslateCommand = process.env.ARGOS_TRANSLATE_COMMAND,
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
    if (!this.pythonBinary || !this.pyannoteModel) return null;
    try {
      await Promise.all([access(this.pythonBinary), access(this.pyannoteModel)]);
      return new PyannoteCommunitySpeakerProvider(this.pythonBinary, this.pyannoteModel);
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
}
