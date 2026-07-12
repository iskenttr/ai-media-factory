import type { SpeechSegment, SpeechWord } from "@/lib/analysis/observations";

import type { SpeakerTurn } from "./contracts";

export interface SpeakerAlignedSegment extends SpeechSegment { speakerId: string | null }

export function alignSegmentToSpeakers(segment: SpeechSegment, turns: SpeakerTurn[]): SpeakerAlignedSegment[] {
  if (!segment.words?.length || !turns.length) {
    const midpointMs = (segment.startSeconds + segment.endSeconds) * 500;
    const speakerId = turns.find((turn) => midpointMs >= turn.startMs && midpointMs < turn.endMs)?.speakerId ?? null;
    return [{ ...segment, speakerId }];
  }
  const groups: Array<{ speakerId: string | null; words: SpeechWord[] }> = [];
  for (const word of segment.words) {
    const midpointMs = (word.startSeconds + word.endSeconds) * 500;
    const speakerId = turns.find((turn) => midpointMs >= turn.startMs && midpointMs < turn.endMs)?.speakerId ?? null;
    const current = groups.at(-1);
    if (current?.speakerId === speakerId) current.words.push(word);
    else groups.push({ speakerId, words: [word] });
  }
  return groups.map((group) => ({
    speakerId: group.speakerId,
    startSeconds: group.words[0].startSeconds,
    endSeconds: group.words.at(-1)!.endSeconds,
    text: group.words.map((word) => word.text).join(" "),
    words: group.words,
  }));
}
