import type { ContentProfileInput, ContentProfileProvider } from "../../contracts/content-profile-provider";

interface Rule {
  type: "interview" | "podcast" | "tutorial" | "presentation" | "reaction" | "product_demo" | "other";
  patterns: RegExp[];
  minimumMatches: number;
  evidence: string;
}

const rules: Rule[] = [
  { type: "podcast", patterns: [/\bpodcast\b/i, /\bthis episode\b/i, /\bwelcome (back )?to the show\b/i], minimumMatches: 1, evidence: "The transcript explicitly uses podcast or episode framing." },
  { type: "interview", patterns: [/\binterview\b/i, /\bour guest\b/i, /\bjoining (me|us) today\b/i], minimumMatches: 1, evidence: "The transcript explicitly introduces an interview or guest." },
  { type: "tutorial", patterns: [/\bhow to\b/i, /\bstep (one|two|three|\d+)\b/i, /\bfirst,? (you|we)\b/i, /\bnext,? (you|we)\b/i], minimumMatches: 2, evidence: "The transcript contains multiple explicit step-by-step instructional markers." },
  { type: "presentation", patterns: [/\bthis presentation\b/i, /\bon this slide\b/i, /\bnext slide\b/i, /\btoday'?s agenda\b/i], minimumMatches: 1, evidence: "The transcript explicitly references a presentation, slide, or agenda." },
  { type: "reaction", patterns: [/\bmy reaction\b/i, /\breacting to\b/i, /\breaction video\b/i], minimumMatches: 1, evidence: "The transcript explicitly frames the content as a reaction." },
  { type: "product_demo", patterns: [/\bproduct demo\b/i, /\bdemonstrate this (product|feature)\b/i, /\blet me show you this feature\b/i], minimumMatches: 1, evidence: "The transcript explicitly introduces a product or feature demonstration." },
  { type: "other", patterns: [/\bdocumentary\b/i, /\bnews report\b/i, /\baudiobook\b/i], minimumMatches: 1, evidence: "The transcript explicitly identifies a valid content format outside the supported profiles." },
];

function unavailable(reason: "insufficient_speech" | "insufficient_evidence", limitation: string) {
  return {
    availability: "unavailable" as const,
    reason,
    evidence: [],
    providerVersion: "deterministic-evidence-v1",
    limitations: [limitation],
  };
}

function structuralInterviewEvidence(input: ContentProfileInput) {
  if (input.speakers.availability !== "available" || input.speakers.speakerCount < 2) return null;
  const questionCount = input.speech.segments.filter((segment) => /\?|\b(how|what|why|when|where|who|could|would|do|did|are|is)\b/i.test(segment.text)).length;
  if (questionCount === 0) return null;
  return "Timestamped speech contains a question and speaker analysis found multiple anonymous speakers.";
}

export class DeterministicContentProfileProvider implements ContentProfileProvider {
  readonly id = "deterministic-evidence";
  readonly version = "deterministic-evidence-v1";

  async analyze(input: ContentProfileInput) {
    const transcript = input.speech.transcript.trim();
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;
    if (wordCount < 40 || input.speech.segments.length === 0) {
      return unavailable("insufficient_speech", "There is not enough transcript evidence to classify the content structure.");
    }

    const matches = rules.map((rule) => ({
      rule,
      count: rule.patterns.filter((pattern) => pattern.test(transcript)).length,
    })).filter(({ rule, count }) => count >= rule.minimumMatches);
    const structuralEvidence = structuralInterviewEvidence(input);
    if (matches.length > 1 || (matches.length === 0 && !structuralEvidence)) {
      return unavailable(
        "insufficient_evidence",
        matches.length === 0
          ? "No content type had enough explicit evidence."
          : "The transcript contains conflicting content-type evidence.",
      );
    }

    const rule = matches[0]?.rule ?? {
      type: "interview" as const,
      evidence: structuralEvidence!,
    };
    const dialogueStructure = input.speakers.availability === "available"
      ? input.speakers.speakerCount === 1 ? "single_speaker" as const : "multi_speaker" as const
      : "unknown" as const;
    const instructionalMarkers = /\b(how to|step |first,|next,)\b/i.test(transcript);
    const promotionalMarkers = /\b(buy|subscribe|offer|customer|feature|benefit)\b/i.test(transcript);
    const conversationalMarkers = /[?]/.test(transcript) || dialogueStructure === "multi_speaker";
    const deliveryStyle = instructionalMarkers
      ? "instructional" as const
      : promotionalMarkers
        ? "promotional" as const
        : conversationalMarkers
          ? "conversational" as const
          : "narrative" as const;

    const evidence = [rule.evidence];
    if (input.speakers.availability === "available") {
      evidence.push(`Speaker analysis found ${input.speakers.speakerCount} anonymous speaker${input.speakers.speakerCount === 1 ? "" : "s"}.`);
    }
    if (input.pacing.availability === "available") {
      evidence.push(`Timestamped speech supports a ${input.pacing.assessment} pacing assessment.`);
    }
    if (input.speechQuality.availability === "available") {
      evidence.push(`Measured source speech quality is ${input.speechQuality.assessment}.`);
    }

    return {
      availability: "available" as const,
      profile: {
        primaryType: rule.type,
        dialogueStructure,
        deliveryStyle,
        visualDependency: "unknown" as const,
      },
      evidence,
      providerVersion: this.version,
      limitations: [
        "This transparent rules provider uses transcript and audio structure only.",
        "Visual dependency remains unknown because no visual model is used.",
      ],
    };
  }
}
