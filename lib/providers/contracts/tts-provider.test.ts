import { describe, expect, it } from "vitest";
import { validateVoiceProfileConsent, voiceProfileSchema } from "./tts-provider";

describe("TTS contracts and validation", () => {
  it("validates non-cloned voice profile without consent", () => {
    const profile = {
      profileId: "voice-1",
      name: "Standard Speaker",
      gender: "neutral" as const,
      locale: "en-US",
      tags: ["standard"],
      isCloned: false,
      consent: null,
    };
    expect(() => voiceProfileSchema.parse(profile)).not.toThrow();
    expect(() => validateVoiceProfileConsent(profile)).not.toThrow();
  });

  it("throws error for cloned voice profile without consent", () => {
    const profile = {
      profileId: "clone-1",
      name: "Cloned Speaker",
      gender: "female" as const,
      locale: "tr-TR",
      tags: ["cloned"],
      isCloned: true,
      consent: null,
    };
    expect(() => voiceProfileSchema.parse(profile)).not.toThrow();
    expect(() => validateVoiceProfileConsent(profile)).toThrow("voice_cloning_requires_explicit_consent");
  });

  it("throws error for cloned voice profile with incomplete consent", () => {
    const profile = {
      profileId: "clone-1",
      name: "Cloned Speaker",
      gender: "female" as const,
      locale: "tr-TR",
      tags: ["cloned"],
      isCloned: true,
      consent: {
        consentId: "",
        voiceActorName: "Actor Name",
        consentedAt: "2023-01-01T00:00:00Z",
        scope: "project" as const,
        expiresAt: null,
        traceableSourceUrl: "https://consent.example/provenance",
        signatureHash: "sig-hash",
      },
    };
    expect(() => validateVoiceProfileConsent(profile)).toThrow("incomplete_consent_record_for_cloned_voice");
  });

  it("accepts cloned voice profile with complete consent record", () => {
    const profile = {
      profileId: "clone-1",
      name: "Cloned Speaker",
      gender: "male" as const,
      locale: "tr-TR",
      tags: ["cloned"],
      isCloned: true,
      consent: {
        consentId: "consent-id-uuid",
        voiceActorName: "Actor Name",
        consentedAt: "2023-01-01T00:00:00Z",
        scope: "project" as const,
        expiresAt: null,
        traceableSourceUrl: "https://consent.example/provenance",
        signatureHash: "sig-hash",
      },
    };
    expect(() => voiceProfileSchema.parse(profile)).not.toThrow();
    expect(() => validateVoiceProfileConsent(profile)).not.toThrow();
  });
});
