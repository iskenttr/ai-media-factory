import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AnyAnalysisEvent, AnalysisEventType } from "@/lib/analysis/contracts";

import { AnalysisTimeline } from "./AnalysisTimeline";

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

describe("AnalysisTimeline", () => {
  it("renders only received events and keeps technical content labels private", () => {
    render(
      <AnalysisTimeline
        events={[
          event(
            "content_profile_completed",
            {
              availability: "available",
              profile: {
                primaryType: "interview",
                dialogueStructure: "multi_speaker",
                deliveryStyle: "conversational",
                visualDependency: "medium",
              },
              evidence: ["Explicit interview framing."],
              providerVersion: "model-v1",
              limitations: [],
            },
            1,
          ),
        ]}
      />,
    );

    expect(screen.getByText("I understand how this video is structured.")).toBeInTheDocument();
    expect(screen.queryByText("interview")).not.toBeInTheDocument();
    expect(screen.queryByText("I hear English.")).not.toBeInTheDocument();
  });

  it("does not present unavailable analysis as understood", () => {
    render(
      <AnalysisTimeline
        events={[
          event(
            "language_detected",
            { availability: "unavailable", reason: "model_not_configured" },
            1,
          ),
        ]}
      />,
    );

    expect(screen.getByText("I couldn’t identify the spoken language.")).toBeInTheDocument();
    expect(screen.queryByText("I hear English.")).not.toBeInTheDocument();
  });
});
