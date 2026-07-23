import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

interface TtsUsageEntry {
  timestamp: string;
  voiceProfileId: string;
  characters: number;
  reservedCostUsd: number;
}

async function readEntries(ledgerPath: string) {
  try {
    return (await readFile(ledgerPath, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line) as TtsUsageEntry;
        } catch {
          throw new Error(`tts_usage_ledger_invalid:line_${index + 1}`);
        }
      });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function pricePerMillionCharacters(voiceProfileId: string) {
  if (voiceProfileId.includes("-Studio-")) return 160;
  if (voiceProfileId.includes("-Chirp3-HD-")) return 30;
  if (voiceProfileId.includes("-Neural2-")) return 16;
  return 4;
}

export async function reserveTtsSynthesis(input: {
  ledgerPath: string;
  voiceProfileId: string;
  text: string;
  dailyCharacterLimit: number;
  dailyCostLimitUsd: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const date = now.toISOString().slice(0, 10);
  const entries = (await readEntries(input.ledgerPath))
    .filter((entry) => entry.timestamp.startsWith(date));
  const usedCharacters = entries.reduce((sum, entry) => sum + entry.characters, 0);
  const usedCostUsd = entries.reduce((sum, entry) => sum + entry.reservedCostUsd, 0);
  const characters = [...input.text].length;
  const reservedCostUsd = characters * pricePerMillionCharacters(input.voiceProfileId) / 1_000_000;
  if (usedCharacters + characters > input.dailyCharacterLimit) {
    throw new Error("daily_tts_character_limit_exhausted");
  }
  if (usedCostUsd + reservedCostUsd > input.dailyCostLimitUsd + Number.EPSILON) {
    throw new Error("daily_tts_cost_limit_exhausted");
  }
  const entry: TtsUsageEntry = {
    timestamp: now.toISOString(),
    voiceProfileId: input.voiceProfileId,
    characters,
    reservedCostUsd,
  };
  await mkdir(path.dirname(input.ledgerPath), { recursive: true });
  await appendFile(input.ledgerPath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  return {
    date,
    usedCharacters: usedCharacters + characters,
    characterLimit: input.dailyCharacterLimit,
    usedCostUsd: usedCostUsd + reservedCostUsd,
    costLimitUsd: input.dailyCostLimitUsd,
    reservedCostUsd,
  };
}
