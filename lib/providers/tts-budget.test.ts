// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { reserveTtsSynthesis } from "./tts-budget";

describe("TTS daily reservation", () => {
  it("reserves real characters and refuses a projected overage before synthesis", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "amf-tts-budget-"));
    const ledgerPath = path.join(root, "usage.jsonl");
    try {
      const status = await reserveTtsSynthesis({
        ledgerPath,
        voiceProfileId: "tr-TR-Wavenet-A",
        text: "Merhaba",
        dailyCharacterLimit: 10,
        dailyCostLimitUsd: 1,
        now: new Date("2026-07-24T00:00:00Z"),
      });
      expect(status).toMatchObject({ usedCharacters: 7, characterLimit: 10 });
      await expect(reserveTtsSynthesis({
        ledgerPath,
        voiceProfileId: "tr-TR-Wavenet-A",
        text: "dünya",
        dailyCharacterLimit: 10,
        dailyCostLimitUsd: 1,
        now: new Date("2026-07-24T00:01:00Z"),
      })).rejects.toThrow("daily_tts_character_limit_exhausted");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
