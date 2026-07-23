import { z } from "zod";

export const consentRecordSchema = z.object({
  consentId: z.string().min(1),
  voiceActorName: z.string().min(1),
  consentedAt: z.string(),
  scope: z.enum(["project", "unrestricted", "time_bounded"]),
  expiresAt: z.string().nullable(),
  traceableSourceUrl: z.string().min(1),
  signatureHash: z.string().min(1),
});

export const voiceProfileSchema = z.object({
  profileId: z.string().min(1),
  name: z.string().min(1),
  gender: z.enum(["male", "female", "neutral"]),
  locale: z.string().min(2),
  tags: z.array(z.string()),
  isCloned: z.boolean(),
  consent: consentRecordSchema.nullable(),
});

export const ttsProviderCapabilitiesSchema = z.object({
  supportedLanguages: z.array(z.string()),
  supportsVoiceCloning: z.boolean(),
  supportsStreaming: z.boolean(),
  supportsPitchControl: z.boolean(),
  supportsSpeedControl: z.boolean(),
  maxCharactersPerRequest: z.number().int().positive(),
});

export const ttsProvenanceSchema = z.object({
  providerId: z.string().min(1),
  providerVersion: z.string().min(1),
  voiceProfileId: z.string().min(1),
  inputHash: z.string().min(1),
  generatedAt: z.string(),
});

export const ttsSynthesisInputSchema = z.object({
  text: z.string().min(1),
  voiceProfileId: z.string().min(1),
  speed: z.number().min(0.25).max(4.0).optional(),
  pitch: z.number().min(-20).max(20).optional(),
  outputFormat: z.enum(["mp3", "wav", "pcm", "ogg"]).optional(),
  sampleRate: z.number().int().positive().optional(),
});

export const ttsSynthesisResultSchema = z.object({
  audioBuffer: z.instanceof(Uint8Array),
  durationMs: z.number().int().positive(),
  provenance: ttsProvenanceSchema,
});

export type ConsentRecord = z.infer<typeof consentRecordSchema>;
export type VoiceProfile = z.infer<typeof voiceProfileSchema>;
export type TtsProviderCapabilities = z.infer<typeof ttsProviderCapabilitiesSchema>;
export type TtsProvenance = z.infer<typeof ttsProvenanceSchema>;
export type TtsSynthesisInput = z.infer<typeof ttsSynthesisInputSchema>;
export type TtsSynthesisResult = z.infer<typeof ttsSynthesisResultSchema>;

export interface TtsProvider {
  readonly id: string;
  readonly version: string;
  getCapabilities(): Promise<TtsProviderCapabilities>;
  getVoiceProfiles(): Promise<VoiceProfile[]>;
  synthesize(input: TtsSynthesisInput): Promise<TtsSynthesisResult>;
}

export function validateVoiceProfileConsent(profile: VoiceProfile): void {
  if (profile.isCloned) {
    if (!profile.consent) {
      throw new Error("voice_cloning_requires_explicit_consent");
    }
    if (!profile.consent.consentId || !profile.consent.traceableSourceUrl || !profile.consent.signatureHash) {
      throw new Error("incomplete_consent_record_for_cloned_voice");
    }
  }
}
