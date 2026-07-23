// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { GoogleCloudTtsProvider } from "./google-cloud-tts-provider";

function linear16Wav(durationMs: number, sampleRate = 16_000) {
  const samples = Math.round((durationMs / 1_000) * sampleRate);
  const dataBytes = samples * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataBytes, 40);
  return wav;
}

function voiceInventory() {
  return {
    voices: [{
      languageCodes: ["tr-TR"],
      name: "tr-TR-Wavenet-A",
      ssmlGender: "FEMALE",
      naturalSampleRateHertz: 24_000,
    }],
  };
}

describe("GoogleCloudTtsProvider", () => {
  it("uses live inventory identities and returns measured LINEAR16 duration", async () => {
    const wav = linear16Wav(750);
    const fetchImplementation = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const value = String(url);
      if (value.includes("/voices?")) return Response.json(voiceInventory());
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer short-lived-token",
        "x-goog-user-project": "test-project",
      });
      const body = JSON.parse(String(init?.body)) as {
        voice: { name: string };
        audioConfig: { audioEncoding: string; speakingRate: number };
      };
      expect(body.voice.name).toBe("tr-TR-Wavenet-A");
      expect(body.audioConfig).toMatchObject({ audioEncoding: "LINEAR16", speakingRate: 1.05 });
      return Response.json({ audioContent: wav.toString("base64") });
    });
    const provider = new GoogleCloudTtsProvider("test-project", {
      fetchImplementation: fetchImplementation as typeof fetch,
      accessTokenProvider: async () => "short-lived-token",
      now: () => new Date("2026-07-24T00:00:00Z"),
    });

    const profiles = await provider.getVoiceProfiles();
    expect(profiles).toEqual([expect.objectContaining({
      profileId: "tr-TR-Wavenet-A",
      locale: "tr-TR",
      isCloned: false,
      consent: null,
    })]);
    const result = await provider.synthesize({
      text: "Merhaba dunya",
      voiceProfileId: "tr-TR-Wavenet-A",
      speed: 1.05,
      outputFormat: "wav",
    });
    expect(result.durationMs).toBe(750);
    expect(result.provenance).toMatchObject({
      providerId: "google-cloud-text-to-speech",
      voiceProfileId: "tr-TR-Wavenet-A",
      generatedAt: "2026-07-24T00:00:00.000Z",
    });
    expect(result.provenance.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("rejects arbitrary voice names and oversized UTF-8 input before synthesis", async () => {
    const fetchImplementation = vi.fn(async () => Response.json(voiceInventory()));
    const provider = new GoogleCloudTtsProvider("test-project", {
      fetchImplementation: fetchImplementation as typeof fetch,
      accessTokenProvider: async () => "short-lived-token",
    });
    await expect(provider.synthesize({
      text: "Merhaba",
      voiceProfileId: "tr_male_1",
      outputFormat: "wav",
    })).rejects.toThrow("voice_not_in_inventory");
    await expect(provider.synthesize({
      text: "ş".repeat(2_501),
      voiceProfileId: "tr-TR-Wavenet-A",
      outputFormat: "wav",
    })).rejects.toThrow("input_byte_limit_exceeded");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
