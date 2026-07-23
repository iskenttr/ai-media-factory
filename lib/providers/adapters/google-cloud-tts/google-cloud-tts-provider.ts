import { createHash } from "node:crypto";

import { z } from "zod";

import {
  ttsSynthesisInputSchema,
  validateVoiceProfileConsent,
  type TtsProvider,
  type TtsSynthesisInput,
  type VoiceProfile,
} from "../../contracts/tts-provider";
import { reserveTtsSynthesis } from "../../tts-budget";

const metadataTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive().optional(),
});

const voicesResponseSchema = z.object({
  voices: z.array(z.object({
    languageCodes: z.array(z.string().min(2)).min(1),
    name: z.string().min(1),
    ssmlGender: z.enum(["SSML_VOICE_GENDER_UNSPECIFIED", "MALE", "FEMALE", "NEUTRAL"]),
    naturalSampleRateHertz: z.number().int().positive(),
  })),
});

const synthesisResponseSchema = z.object({
  audioContent: z.string().min(1),
});

type FetchImplementation = typeof fetch;

interface GoogleCloudTtsOptions {
  fetchImplementation?: FetchImplementation;
  metadataBaseUrl?: string;
  apiBaseUrl?: string;
  locales?: string[];
  accessTokenProvider?: () => Promise<string>;
  now?: () => Date;
  usageLedgerPath?: string;
  dailyCharacterLimit?: number;
  dailyCostLimitUsd?: number;
}

function gender(value: "SSML_VOICE_GENDER_UNSPECIFIED" | "MALE" | "FEMALE" | "NEUTRAL") {
  if (value === "MALE") return "male" as const;
  if (value === "FEMALE") return "female" as const;
  return "neutral" as const;
}

function voiceFamily(name: string) {
  if (name.includes("-Chirp3-HD-")) return "chirp3-hd";
  if (name.includes("-Wavenet-")) return "wavenet";
  if (name.includes("-Neural2-")) return "neural2";
  if (name.includes("-Studio-")) return "studio";
  if (name.includes("-Standard-")) return "standard";
  return "other";
}

function wavDurationMs(audio: Uint8Array) {
  const bytes = Buffer.from(audio);
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("tts_linear16_wav_invalid");
  }
  let offset = 12;
  let bytesPerSecond = 0;
  let dataBytes = 0;
  while (offset + 8 <= bytes.length) {
    const chunk = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (chunk === "fmt " && size >= 16 && start + size <= bytes.length) {
      bytesPerSecond = bytes.readUInt32LE(start + 8);
    } else if (chunk === "data" && start + size <= bytes.length) {
      dataBytes = size;
      break;
    }
    offset = start + size + (size % 2);
  }
  if (bytesPerSecond <= 0 || dataBytes <= 0) throw new Error("tts_linear16_wav_chunks_missing");
  return Math.max(1, Math.round((dataBytes / bytesPerSecond) * 1_000));
}

export class GoogleCloudTtsProvider implements TtsProvider {
  readonly id = "google-cloud-text-to-speech";
  readonly version = "rest-v1";
  private readonly fetchImplementation: FetchImplementation;
  private readonly metadataBaseUrl: string;
  private readonly apiBaseUrl: string;
  private readonly locales: string[];
  private readonly accessTokenProvider?: () => Promise<string>;
  private readonly now: () => Date;
  private readonly usageLedgerPath?: string;
  private readonly dailyCharacterLimit: number;
  private readonly dailyCostLimitUsd: number;
  private cachedToken: { value: string; expiresAt: number } | null = null;
  private cachedVoices: { value: VoiceProfile[]; expiresAt: number } | null = null;

  constructor(
    private readonly projectId: string,
    options: GoogleCloudTtsOptions = {},
  ) {
    if (!projectId.trim()) throw new Error("google_cloud_tts_project_required");
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.metadataBaseUrl = options.metadataBaseUrl ?? "http://metadata.google.internal/computeMetadata/v1";
    this.apiBaseUrl = options.apiBaseUrl ?? "https://texttospeech.googleapis.com/v1";
    this.locales = options.locales?.length ? options.locales : ["tr-TR"];
    this.accessTokenProvider = options.accessTokenProvider;
    this.now = options.now ?? (() => new Date());
    this.usageLedgerPath = options.usageLedgerPath;
    this.dailyCharacterLimit = options.dailyCharacterLimit ?? 100_000;
    this.dailyCostLimitUsd = options.dailyCostLimitUsd ?? 0.5;
  }

  private async accessToken() {
    if (this.accessTokenProvider) return this.accessTokenProvider();
    const now = this.now().getTime();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) return this.cachedToken.value;
    const response = await this.fetchImplementation(
      `${this.metadataBaseUrl}/instance/service-accounts/default/token`,
      { headers: { "Metadata-Flavor": "Google" } },
    );
    if (!response.ok) throw new Error(`google_cloud_tts_metadata_token_failed:${response.status}`);
    const token = metadataTokenSchema.parse(await response.json());
    this.cachedToken = {
      value: token.access_token,
      expiresAt: now + Math.max(60, token.expires_in ?? 300) * 1_000,
    };
    return token.access_token;
  }

  private async authorizedFetch(path: string, init?: RequestInit) {
    const token = await this.accessToken();
    return this.fetchImplementation(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
        "x-goog-user-project": this.projectId,
        ...init?.headers,
      },
    });
  }

  async getVoiceProfiles() {
    const now = this.now().getTime();
    if (this.cachedVoices && this.cachedVoices.expiresAt > now) return this.cachedVoices.value;
    const profiles = new Map<string, VoiceProfile>();
    for (const locale of this.locales) {
      const response = await this.authorizedFetch(`/voices?languageCode=${encodeURIComponent(locale)}`);
      if (!response.ok) throw new Error(`google_cloud_tts_voices_failed:${response.status}`);
      const payload = voicesResponseSchema.parse(await response.json());
      for (const voice of payload.voices) {
        const profile = {
          profileId: voice.name,
          name: voice.name,
          gender: gender(voice.ssmlGender),
          locale: voice.languageCodes[0],
          tags: [
            "stock",
            `family:${voiceFamily(voice.name)}`,
            `sample-rate:${voice.naturalSampleRateHertz}`,
          ],
          isCloned: false,
          consent: null,
        } satisfies VoiceProfile;
        profiles.set(profile.profileId, profile);
      }
    }
    const value = [...profiles.values()].sort((left, right) => left.profileId.localeCompare(right.profileId));
    if (value.length === 0) throw new Error("google_cloud_tts_voice_inventory_empty");
    this.cachedVoices = { value, expiresAt: now + 5 * 60_000 };
    return value;
  }

  async getCapabilities() {
    const voices = await this.getVoiceProfiles();
    return {
      supportedLanguages: [...new Set(voices.map((voice) => voice.locale))].sort(),
      supportsVoiceCloning: false,
      supportsStreaming: false,
      supportsPitchControl: true,
      supportsSpeedControl: true,
      maxCharactersPerRequest: 4_500,
    };
  }

  async synthesize(rawInput: TtsSynthesisInput) {
    const input = ttsSynthesisInputSchema.parse(rawInput);
    if (!["wav", "pcm", undefined].includes(input.outputFormat)) {
      throw new Error(`google_cloud_tts_output_format_unsupported:${input.outputFormat}`);
    }
    if (Buffer.byteLength(input.text, "utf8") > 5_000) {
      throw new Error("google_cloud_tts_input_byte_limit_exceeded");
    }
    const voices = await this.getVoiceProfiles();
    const profile = voices.find((voice) => voice.profileId === input.voiceProfileId);
    if (!profile) throw new Error(`google_cloud_tts_voice_not_in_inventory:${input.voiceProfileId}`);
    validateVoiceProfileConsent(profile);
    if (this.usageLedgerPath) {
      await reserveTtsSynthesis({
        ledgerPath: this.usageLedgerPath,
        voiceProfileId: profile.profileId,
        text: input.text,
        dailyCharacterLimit: this.dailyCharacterLimit,
        dailyCostLimitUsd: this.dailyCostLimitUsd,
        now: this.now(),
      });
    }
    const response = await this.authorizedFetch("/text:synthesize", {
      method: "POST",
      body: JSON.stringify({
        input: { text: input.text },
        voice: {
          languageCode: profile.locale,
          name: profile.profileId,
        },
        audioConfig: {
          audioEncoding: "LINEAR16",
          ...(input.speed === undefined ? {} : { speakingRate: input.speed }),
          ...(input.pitch === undefined ? {} : { pitch: input.pitch }),
          ...(input.sampleRate === undefined ? {} : { sampleRateHertz: input.sampleRate }),
        },
      }),
    });
    if (!response.ok) {
      const message = (await response.text()).replace(/\s+/g, " ").slice(0, 300);
      throw new Error(`google_cloud_tts_synthesis_failed:${response.status}:${message}`);
    }
    const payload = synthesisResponseSchema.parse(await response.json());
    const audioBuffer = new Uint8Array(Buffer.from(payload.audioContent, "base64"));
    const generatedAt = this.now().toISOString();
    return {
      audioBuffer,
      durationMs: wavDurationMs(audioBuffer),
      provenance: {
        providerId: this.id,
        providerVersion: this.version,
        voiceProfileId: profile.profileId,
        inputHash: createHash("sha256").update(JSON.stringify({
          text: input.text,
          voiceProfileId: profile.profileId,
          speed: input.speed ?? 1,
          pitch: input.pitch ?? 0,
          outputFormat: "wav",
          sampleRate: input.sampleRate ?? null,
        })).digest("hex"),
        generatedAt,
      },
    };
  }
}
