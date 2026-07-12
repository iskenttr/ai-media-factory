"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  analysisEventTypes,
  parseAnalysisEvent,
  type AnyAnalysisEvent,
} from "@/lib/analysis/contracts";

import { AISignature } from "./AISignature";
import { AnalysisCard } from "./AnalysisCard";
import { AnalysisTimeline } from "./AnalysisTimeline";
import { ContinueButton } from "./ContinueButton";
import styles from "./Analysis.module.css";

function findEvent<T extends AnyAnalysisEvent["type"]>(events: AnyAnalysisEvent[], type: T) {
  return events.find((event): event is Extract<AnyAnalysisEvent, { type: T }> => event.type === type);
}

function completedSummary(events: AnyAnalysisEvent[]) {
  const speakers = findEvent(events, "speaker_analysis_completed");
  const pacing = findEvent(events, "pacing_analysis_completed");
  const quality = findEvent(events, "speech_quality_assessed");
  if (
    speakers?.payload.availability !== "available" ||
    pacing?.payload.availability !== "available" ||
    quality?.payload.availability !== "available"
  ) {
    return null;
  }

  const speakerText =
    speakers.payload.speakerCount === 1
      ? "one speaker"
      : `${speakers.payload.speakerCount} speakers`;
  const pacingText =
    pacing.payload.assessment === "clear"
      ? "clear pacing"
      : pacing.payload.assessment === "dense"
        ? "dense pacing"
        : "variable pacing";
  const qualityText = `${quality.payload.assessment} speech quality`;
  return `I found ${speakerText}, ${pacingText}, and ${qualityText}.`;
}

export function AnalysisScreen({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [events, setEvents] = useState<AnyAnalysisEvent[]>([]);
  const [connectionInterrupted, setConnectionInterrupted] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/api/analysis/jobs/${jobId}/events`);
    let terminal = false;

    const receiveEvent = (message: MessageEvent<string>) => {
      const event = parseAnalysisEvent(JSON.parse(message.data) as unknown);
      setEvents((current) => {
        const highestAttempt = current.reduce((highest, item) => Math.max(highest, item.attempt), 0);
        const base = event.attempt > highestAttempt ? [] : current;
        if (base.some((item) => item.eventId === event.eventId)) {
          return base;
        }
        return [...base, event].sort((left, right) => left.sequence - right.sequence);
      });
      setConnectionInterrupted(false);
      if (event.type === "analysis_completed" || event.type === "analysis_failed") {
        terminal = true;
        source.close();
      }
    };

    for (const type of analysisEventTypes) {
      source.addEventListener(type, receiveEvent as EventListener);
    }
    source.onopen = () => setConnectionInterrupted(false);
    source.onerror = () => {
      if (!terminal) {
        setConnectionInterrupted(true);
      }
    };

    return () => source.close();
  }, [jobId, retryVersion]);

  const completed = findEvent(events, "analysis_completed");
  const failed = findEvent(events, "analysis_failed");
  const ready = completed?.payload.readiness === "ready";
  const limited = completed?.payload.readiness === "limited";
  const summary = completedSummary(events);

  const retry = async () => {
    setRetrying(true);
    const response = await fetch(`/api/analysis/jobs/${jobId}/retry`, { method: "POST" });
    if (response.ok) {
      setEvents([]);
      setRetryVersion((version) => version + 1);
    }
    setRetrying(false);
  };

  return (
    <section className={styles.screen} aria-labelledby="analysis-title">
      <div className={styles.content}>
        <AISignature resolved={Boolean(completed)} />
        <div className={styles.headingGroup}>
          <h1 className={styles.heading} id="analysis-title">
            {failed
              ? "I couldn’t finish understanding this video."
              : ready
                ? "Your video is understood."
                : completed
                  ? "I understood what I could."
                  : "I’m getting to know your video."}
          </h1>
          {ready && summary ? <p className={styles.summary}>{summary}</p> : null}
        </div>

        {events.length > 0 ? (
          <AnalysisCard>
            {failed ? (
              <div className={styles.failure}>
                <p>{failed.payload.safeMessage}</p>
                <button
                  disabled={retrying || !failed.payload.retryable}
                  onClick={retry}
                  type="button"
                >
                  {retrying ? "Trying again…" : "Try again"}
                </button>
                <button onClick={() => router.push("/")} type="button">
                  Choose another video
                </button>
              </div>
            ) : (
              <AnalysisTimeline events={events} />
            )}
          </AnalysisCard>
        ) : null}

        {connectionInterrupted && !failed && !completed ? (
          <p className={styles.connection} role="status">
            The connection paused. I’m reconnecting safely.
          </p>
        ) : null}

        {limited ? (
          <div className={styles.actions}>
            <p>Some details remain unavailable, but localization can begin safely.</p>
            <ContinueButton onClick={() => router.push(`/studio/${jobId}`)} />
          </div>
        ) : null}

        {ready ? (
          <div className={styles.completion}>
            <p>This video is ready to localize.</p>
            <ContinueButton onClick={() => router.push(`/studio/${jobId}`)} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
