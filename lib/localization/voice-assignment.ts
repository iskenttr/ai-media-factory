import { createHash } from "node:crypto";

export const APPROVED_VOICES_BY_LANGUAGE: Record<string, string[]> = {
  tr: ["tr_male_1", "tr_female_1", "tr_neutral_1", "tr_neutral_2"],
  en: ["en_male_1", "en_female_1", "en_neutral_1", "en_neutral_2"],
  es: ["es_male_1", "es_female_1", "es_neutral_1", "es_neutral_2"],
  default: ["default_voice_1", "default_ballad_2", "default_comms_3", "default_speech_4"],
};

export function getApprovedVoices(languageCode?: string): string[] {
  if (!languageCode) return APPROVED_VOICES_BY_LANGUAGE.default;
  const code = languageCode.toLowerCase();
  return APPROVED_VOICES_BY_LANGUAGE[code] ?? APPROVED_VOICES_BY_LANGUAGE.default;
}

/**
 * Deterministically assigns an approved voice to a speaker label.
 * Honors explicit user overrides.
 * Does not infer identity, gender, age, or other biometric traits.
 */
export function assignVoiceToSpeaker(
  speakerId: string,
  targetLanguageCode: string | undefined,
  userOverrides: Record<string, string> = {}
): string {
  if (userOverrides[speakerId]) {
    return userOverrides[speakerId];
  }
  const approvedVoices = getApprovedVoices(targetLanguageCode);
  const hash = createHash("sha256").update(speakerId).digest("hex");
  const index = parseInt(hash.slice(0, 8), 16) % approvedVoices.length;
  return approvedVoices[index];
}
