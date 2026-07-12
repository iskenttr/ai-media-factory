import type { StudioSegment, StudioSuggestion } from "./contracts";

export interface SuggestionCandidate extends Omit<StudioSuggestion, "id" | "status"> {
  fingerprint: string;
}

function candidate(segment: StudioSegment, type: SuggestionCandidate["type"], confidence: SuggestionCandidate["confidence"], title: string, explanation: string): SuggestionCandidate {
  return { segmentId: segment.id, type, confidence, title, explanation, fingerprint: `${type}:${segment.id}:${segment.originalText}:${segment.startMs}:${segment.endMs}` };
}

export function deriveStudioSuggestions(segments: StudioSegment[]): SuggestionCandidate[] {
  const suggestions: SuggestionCandidate[] = [];
  for (const [index, segment] of segments.entries()) {
    const text = segment.originalText.trim();
    if (/\[(music|applause|laughter|inaudible)[^\]]*\]/i.test(text)) {
      suggestions.push(candidate(segment, "transcript_review", "high", "Review non-speech text", "This segment contains a non-speech marker. Confirm that it belongs in the localization transcript."));
    }
    if (/\b([\p{L}\p{N}']+)(?:\s+\1){2,}\b/iu.test(text)) {
      suggestions.push(candidate(segment, "transcript_review", "medium", "Review repeated wording", "A word repeats several times in this transcript segment. It may be intentional, but it is worth checking against the source video."));
    }
    if (!segment.speakerAssigned) {
      suggestions.push(candidate(segment, "speaker_review", "medium", "Confirm the speaker", "This transcript segment could not be matched to a diarized speaker range."));
    }
    const next = segments[index + 1];
    const trailingConnector = /\b(and|or|but|because|that|to|of|the)$/i.test(text);
    const interruptedEnding = /[-,:;…]$/.test(text);
    if (next && (trailingConnector || interruptedEnding) && /^[a-z]/.test(next.originalText.trim())) {
      suggestions.push(candidate(segment, "sentence_review", trailingConnector ? "medium" : "low", "Review sentence boundary", "This segment appears to end mid-sentence and the next segment continues the thought. Confirm the boundary against the source video."));
    }
    const overlapping = segments.slice(index + 1).find((other) => other.startMs < segment.endMs && other.speakerId !== segment.speakerId);
    if (overlapping) {
      suggestions.push(candidate(segment, "overlapping_speech", "high", "Review overlapping speech", "Two different speaker segments overlap in time. Confirm the speaker and timing before localization."));
    }
  }
  return suggestions;
}
