// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { VoiceProfile } from "@/lib/providers/contracts/tts-provider";

import { assignVoicesToSpeakers } from "./voice-assignment";

const voices: VoiceProfile[] = [
  {
    profileId: "tr-TR-Standard-A",
    name: "tr-TR-Standard-A",
    gender: "female",
    locale: "tr-TR",
    tags: ["stock", "family:standard"],
    isCloned: false,
    consent: null,
  },
  {
    profileId: "tr-TR-Wavenet-B",
    name: "tr-TR-Wavenet-B",
    gender: "male",
    locale: "tr-TR",
    tags: ["stock", "family:wavenet"],
    isCloned: false,
    consent: null,
  },
];

describe("speaker-aware voice assignment", () => {
  it("maps each normalized speaker deterministically to real inventory voices", () => {
    const result = assignVoicesToSpeakers({
      speakerIds: ["speaker_2", "speaker_1", "speaker_2"],
      targetLocale: "tr-TR",
      voices,
    });
    expect(result).toEqual([
      expect.objectContaining({
        speakerId: "speaker_1",
        voiceProfileId: "tr-TR-Wavenet-B",
        selection: "inventory_default",
      }),
      expect.objectContaining({
        speakerId: "speaker_2",
        voiceProfileId: "tr-TR-Standard-A",
        selection: "inventory_default",
      }),
    ]);
  });

  it("accepts only an override that resolves inside the provider inventory", () => {
    expect(assignVoicesToSpeakers({
      speakerIds: ["speaker_1"],
      targetLocale: "tr-TR",
      voices,
      overrides: { speaker_1: "tr-TR-Standard-A" },
    })[0]).toMatchObject({
      voiceProfileId: "tr-TR-Standard-A",
      selection: "validated_override",
    });
    expect(() => assignVoicesToSpeakers({
      speakerIds: ["speaker_1"],
      targetLocale: "tr-TR",
      voices,
      overrides: { speaker_1: "tr_male_1" },
    })).toThrow("override_not_in_inventory");
  });

  it("rejects placeholder speaker identities and locale mismatches", () => {
    expect(() => assignVoicesToSpeakers({
      speakerIds: ["Speaker One"],
      targetLocale: "tr-TR",
      voices,
    })).toThrow("invalid_speaker");
    expect(() => assignVoicesToSpeakers({
      speakerIds: ["speaker_1"],
      targetLocale: "de-DE",
      voices,
    })).toThrow("inventory_empty");
  });
});
