import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalysisEventType, AnyAnalysisEvent } from "@/lib/analysis/contracts";

import { AnalysisScreen } from "./AnalysisScreen";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

class TestEventSource extends EventTarget {
  static instances: TestEventSource[] = [];

  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(public readonly url: string) {
    super();
    TestEventSource.instances.push(this);
  }

  close() {}

  emit(event: AnyAnalysisEvent) {
    this.dispatchEvent(new MessageEvent(event.type, { data: JSON.stringify(event) }));
  }
}

function event<T extends AnalysisEventType>(
  type: T,
  payload: Extract<AnyAnalysisEvent, { type: T }>["payload"],
  sequence: number,
) {
  return {
    schemaVersion: 1,
    eventId: `event-${sequence}`,
    jobId: "job-1",
    uploadId: "upload-1",
    attempt: 1,
    sequence,
    type,
    occurredAt: "2026-07-11T10:00:00.000Z",
    payload,
  } as Extract<AnyAnalysisEvent, { type: T }>;
}

describe("AnalysisScreen", () => {
  beforeEach(() => {
    TestEventSource.instances = [];
    vi.stubGlobal("EventSource", TestEventSource);
    push.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reveals the approved completion state only from persisted events", () => {
    render(<AnalysisScreen jobId="job-1" />);

    expect(screen.getByText("I’m getting to know your video.")).toBeInTheDocument();
    expect(screen.queryByText("Your video is understood.")).not.toBeInTheDocument();

    const source = TestEventSource.instances[0];
    const events: AnyAnalysisEvent[] = [
      event("upload_received", {
        fileName: "source.mp4",
        sizeBytes: 1024,
        mimeType: "video/mp4",
        sha256: "a".repeat(64),
      }, 1),
      event("speaker_analysis_completed", {
        availability: "available",
        speakerCount: 2,
        segments: [
          { speakerId: "speaker_1", start: 0, end: 1 },
          { speakerId: "speaker_2", start: 1, end: 2 },
        ],
        providerVersion: "test-speaker-v1",
        limitations: [],
      }, 2),
      event("pacing_analysis_completed", {
        availability: "available",
        assessment: "clear",
        wordsPerMinute: 132,
        speakingRatio: 0.7,
      }, 3),
      event("speech_quality_assessed", {
        availability: "available",
        assessment: "strong",
        meanVolumeDb: -20,
        peakVolumeDb: -4,
        silenceRatio: 0.1,
      }, 4),
      event("content_profile_completed", {
        availability: "available",
        profile: {
          primaryType: "interview",
          dialogueStructure: "multi_speaker",
          deliveryStyle: "conversational",
          visualDependency: "medium",
        },
        evidence: ["Explicit interview framing."],
        providerVersion: "test-content-v1",
        limitations: [],
      }, 5),
      event("analysis_completed", {
        readiness: "ready",
        sourceEventIds: ["event-1", "event-2", "event-3", "event-4", "event-5"],
      }, 6),
    ];

    act(() => {
      for (const persistedEvent of events) {
        source.emit(persistedEvent);
      }
    });

    expect(screen.getByText("Your video is understood.")).toBeInTheDocument();
    expect(
      screen.getByText("I found 2 speakers, clear pacing, and strong speech quality."),
    ).toBeInTheDocument();
    expect(screen.getByText("I understand how this video is structured.")).toBeInTheDocument();
    expect(screen.queryByText("interview")).not.toBeInTheDocument();
    expect(screen.getByText("This video is ready to localize.")).toBeInTheDocument();
    screen.getByRole("button", { name: "Continue to localization" }).click();
    expect(push).toHaveBeenCalledWith("/studio/job-1");
  });
});
