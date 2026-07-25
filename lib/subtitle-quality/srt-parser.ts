import type { QualityCue } from "./engine";

/**
 * Parses an SRT timestamp string (HH:MM:SS,mmm or HH:MM:SS.mmm) to milliseconds.
 * Rejects malformed or out-of-range timestamps.
 */
export function parseSrtTimestamp(timestamp: string): number {
  const trimmed = timestamp.trim();
  // Regex matches: HH:MM:SS,mmm or HH:MM:SS.mmm
  // Hours can be 2 or more digits (some players output more digits for hours).
  // Minutes and seconds are exactly 2 digits. Milliseconds are exactly 3 digits.
  const match = /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(trimmed);
  if (!match) {
    throw new Error(`Malformed SRT timestamp: "${timestamp}"`);
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const milliseconds = parseInt(match[4], 10);

  if (minutes >= 60) {
    throw new Error(`Invalid minutes in SRT timestamp (must be 0-59): "${timestamp}"`);
  }
  if (seconds >= 60) {
    throw new Error(`Invalid seconds in SRT timestamp (must be 0-59): "${timestamp}"`);
  }

  return ((hours * 3600 + minutes * 60 + seconds) * 1000) + milliseconds;
}

/**
 * Parses full SRT content into QualityCue objects.
 */
export function parseSrt(srtContent: string): QualityCue[] {
  const normalized = srtContent.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const blocks = normalized.split(/\n\s*\n/);
  const cues: QualityCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) continue;

    if (!/^\d+$/.test(lines[0])) {
      throw new Error(`Missing or invalid sequence number: "${lines[0]}"`);
    }

    if (lines.length < 2) {
      throw new Error(`Missing timestamp line in block: "${block}"`);
    }

    const timestampLine = lines[1];
    const parts = timestampLine.split("-->");
    if (parts.length !== 2) {
      throw new Error(`Invalid timestamp line: "${timestampLine}"`);
    }

    const startMs = parseSrtTimestamp(parts[0]);
    const endMs = parseSrtTimestamp(parts[1]);
    const text = lines.slice(2).join("\n");

    cues.push({
      startMs,
      endMs,
      text,
    });
  }

  return cues;
}
