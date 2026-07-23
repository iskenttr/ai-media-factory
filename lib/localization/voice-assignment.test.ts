import { describe, expect, it } from "vitest";
import { assignVoiceToSpeaker, getApprovedVoices } from "./voice-assignment";

describe("Voice Assignment", () => {
  it("assigns same voice to same speakerId across different calls", () => {
    const voice1 = assignVoiceToSpeaker("speaker_1", "tr");
    const voice2 = assignVoiceToSpeaker("speaker_1", "tr");
    expect(voice1).toBe(voice2);
  });

  it("assigns different voice to different speakerId based on hashing", () => {
    const voice1 = assignVoiceToSpeaker("speaker_1", "en");
    const voice2 = assignVoiceToSpeaker("speaker_2", "en");
    const approved = getApprovedVoices("en");
    expect(approved).toContain(voice1);
    expect(approved).toContain(voice2);
  });

  it("honors explicit user overrides", () => {
    const overrides = { speaker_1: "user_custom_voice" };
    const voice = assignVoiceToSpeaker("speaker_1", "tr", overrides);
    expect(voice).toBe("user_custom_voice");
  });

  it("falls back to default approved voices for unconfigured languages", () => {
    const voice = assignVoiceToSpeaker("speaker_1", "unknown_lang");
    const approved = getApprovedVoices("unknown_lang");
    expect(approved).toContain(voice);
  });
});
