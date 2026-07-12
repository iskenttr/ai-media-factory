"use client";

import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";

import type { TranslationRevisionData } from "@/lib/localization/contracts";
import type { StudioProjectData, StudioSegment, TargetLanguage, TranscriptPatch } from "@/lib/studio/contracts";

import { SuggestionsPanel } from "./SuggestionsPanel";
import styles from "./Studio.module.css";

const languages: TargetLanguage[] = [
  { code: "ar", name: "Arabic" }, { code: "de", name: "German" }, { code: "en", name: "English" },
  { code: "es", name: "Spanish" }, { code: "fr", name: "French" }, { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" }, { code: "ko", name: "Korean" }, { code: "pt", name: "Portuguese" },
  { code: "tr", name: "Turkish" }, { code: "zh", name: "Chinese" },
];

function formatTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function loadRecentLanguages() {
  try { return JSON.parse(localStorage.getItem("amf-recent-target-languages") ?? "[]") as TargetLanguage[]; } catch { return []; }
}

export function Studio({ jobId }: { jobId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [project, setProject] = useState<StudioProjectData | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<StudioSegment | null>(null);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<TargetLanguage[]>(() => typeof window === "undefined" ? [] : loadRecentLanguages());
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [editingLocalized, setEditingLocalized] = useState<{ runId: string; segmentId: string; text: string } | null>(null);
  const [history, setHistory] = useState<{ segmentId: string; revisions: TranslationRevisionData[] } | null>(null);
  const [regenerating, setRegenerating] = useState<Set<string>>(() => new Set());
  const [rendering, setRendering] = useState(false);
  const renderId = project?.localization?.render?.id;
  const renderStatus = project?.localization?.render?.status;

  const refresh = async () => {
    const response = await fetch(`/api/studio/jobs/${jobId}`, { cache: "no-store" });
    if (!response.ok) throw new Error("This Studio is not ready yet.");
    const data = await response.json() as StudioProjectData;
    setProject(data);
    setActiveId((current) => current ?? data.segments[0]?.id ?? null);
  };
  const refreshLocalization = useEffectEvent(() => {
    void refresh().catch((cause: Error) => setError(cause.message));
  });

  useEffect(() => {
    void fetch(`/api/studio/jobs/${jobId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("This Studio is not ready yet.");
        return response.json() as Promise<StudioProjectData>;
      })
      .then((data) => startTransition(() => {
        setProject(data);
        setActiveId((current) => current ?? data.segments[0]?.id ?? null);
        setPrepared(data.setupPrepared);
      }))
      .catch((cause: Error) => startTransition(() => setError(cause.message)));
  }, [jobId]);

  useEffect(() => {
    const runId = project?.localization?.id;
    if (!runId) return;
    const source = new EventSource(`/api/localization/runs/${runId}/events`);
    ["localization_run_created", "translation_segment_completed", "translation_segment_failed", "translation_segment_edited", "translation_segment_regeneration_queued", "translation_segment_regenerated", "translation_segment_regeneration_failed", "localization_run_completed", "localization_run_partial", "localization_run_failed"]
      .forEach((type) => source.addEventListener(type, (event) => {
        if (type === "translation_segment_regenerated" || type === "translation_segment_regeneration_failed") {
          try {
            const payload = (JSON.parse((event as MessageEvent).data) as { payload?: { sourceSegmentId?: string } }).payload;
            if (payload?.sourceSegmentId) setRegenerating((current) => {
              const next = new Set(current);
              next.delete(payload.sourceSegmentId!);
              return next;
            });
          } catch {}
        }
        refreshLocalization();
      }));
    source.onerror = () => source.close();
    return () => source.close();
  }, [project?.localization?.id]);

  useEffect(() => {
    if (!renderId || !renderStatus || !["queued", "running"].includes(renderStatus)) return;
    const interval = window.setInterval(() => refreshLocalization(), 1_500);
    return () => window.clearInterval(interval);
  }, [renderId, renderStatus]);

  const selectSegment = (segment: StudioSegment) => {
    setActiveId(segment.id);
    if (videoRef.current) videoRef.current.currentTime = segment.startMs / 1000;
  };
  const saveCorrection = async (patch: TranscriptPatch) => {
    if (!editing) return;
    const response = await fetch(`/api/studio/jobs/${jobId}/segments/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (!response.ok) { setError("I couldn’t save that correction. Please try again."); return; }
    setEditing(null); await refresh();
  };
  const selectLanguage = async (language: TargetLanguage) => {
    const response = await fetch(`/api/studio/jobs/${jobId}/target-language`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(language),
    });
    if (!response.ok) { setError("I couldn’t save the target language."); return; }
    const next = [language, ...recent.filter((item) => item.code !== language.code)].slice(0, 4);
    localStorage.setItem("amf-recent-target-languages", JSON.stringify(next));
    setRecent(next); await refresh();
  };
  const prepare = async () => {
    const response = await fetch(`/api/studio/jobs/${jobId}/prepare`, { method: "POST" });
    if (!response.ok) { setError("I couldn’t prepare localization setup."); return; }
    await response.json() as { status: string; runId: string };
    setPrepared(true);
    await refresh();
  };
  const saveLocalizedRevision = async (input: { runId: string; segmentId: string; translatedText: string }) => {
    const response = await fetch(`/api/localization/runs/${input.runId}/segments/${input.segmentId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ translatedText: input.translatedText }),
    });
    if (!response.ok) { setError("I couldn’t save that localized edit."); return; }
    setEditingLocalized(null);
    await refresh();
  };
  const showHistory = async (runId: string, segmentId: string) => {
    const response = await fetch(`/api/localization/runs/${runId}/segments/${segmentId}/revisions`, { cache: "no-store" });
    if (!response.ok) { setError("I couldn’t open the translation history."); return; }
    const data = await response.json() as { revisions: TranslationRevisionData[] };
    setHistory({ segmentId, revisions: data.revisions });
  };
  const regenerateSegment = async (runId: string, segmentId: string) => {
    setRegenerating((current) => new Set(current).add(segmentId));
    const response = await fetch(`/api/localization/runs/${runId}/segments/${segmentId}/regenerate`, { method: "POST" });
    if (!response.ok) {
      setRegenerating((current) => {
        const next = new Set(current);
        next.delete(segmentId);
        return next;
      });
      setError("I couldn’t regenerate that segment.");
      return;
    }
    await refresh();
  };
  const generateVideo = async () => {
    if (!localization) return;
    setRendering(true);
    const response = await fetch(`/api/localization/runs/${localization.id}/render`, { method: "POST" });
    if (!response.ok) {
      setRendering(false);
      setError("I couldn’t start the video render.");
      return;
    }
    await refresh();
    setRendering(false);
  };
  const decideSuggestion = async (suggestion: StudioProjectData["suggestions"][number], status: "accepted" | "ignored") => {
    const response = await fetch(`/api/studio/jobs/${jobId}/suggestions/${suggestion.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (!response.ok) { setError("I couldn’t save that suggestion decision."); return; }
    setProject((current) => current ? { ...current, suggestions: current.suggestions.filter((item) => item.id !== suggestion.id) } : current);
  };

  if (error) return <section className={styles.message}><p>{error}</p></section>;
  if (!project) return <section className={styles.message}><p>Opening your Studio…</p></section>;
  const active = project.segments.find((segment) => segment.id === activeId);
  const languageChoices = [...recent, ...languages.filter((language) => !recent.some((item) => item.code === language.code))]
    .filter((language) => language.name.toLowerCase().includes(query.toLowerCase()));
  const localizedBySource = new Map(project.localization?.segments.map((segment) => [segment.sourceSegmentId, segment]) ?? []);
  const localization = project.localization;
  const activeLocalized = active ? localizedBySource.get(active.id) : null;
  const videoOrientation = project.video.height > project.video.width ? "vertical" : "horizontal";

  return (
    <section className={styles.studio} aria-label="Localization Studio">
      <aside className={styles.videoPanel}>
        <div className={styles.videoFrame}>
          <video ref={videoRef} controls preload="metadata" src={project.video.sourceUrl}
            onTimeUpdate={(event) => {
              const time = event.currentTarget.currentTime * 1000;
              const segment = project.segments.find((item) => time >= item.startMs && time < item.endMs);
              if (segment) setActiveId(segment.id);
            }} />
          {activeLocalized?.translatedText ? <div className={styles.subtitlePreview} data-orientation={videoOrientation} aria-label="Subtitle preview">
            <span>{activeLocalized.translatedText}</span>
          </div> : null}
        </div>
        <p className={styles.videoTime}>{active ? `${formatTime(active.startMs)} / ${formatTime(project.video.durationMs)}` : formatTime(project.video.durationMs)}</p>
        {localization?.render?.status === "completed" && localization.render.previewUrl ? <div className={styles.renderPreview}>
          <div><p>Localized video</p><a href={localization.render.downloadUrl ?? localization.render.previewUrl} download>Download MP4</a></div>
          <video controls preload="metadata" src={localization.render.previewUrl} />
        </div> : null}
      </aside>

      <main className={styles.transcriptPanel}>
        <div className={styles.transcriptHeading}><p>Transcript</p><span>{project.video.name}</span></div>
        <div className={styles.segments}>
          {project.segments.map((segment) => (
            <article key={segment.id} className={styles.segment} data-active={segment.id === activeId} onClick={() => selectSegment(segment)}>
              <div className={styles.segmentMeta}><span>{segment.speakerId}</span><time>{formatTime(segment.startMs)}–{formatTime(segment.endMs)}</time></div>
              <p>{segment.originalText}</p>
              {localizedBySource.get(segment.id) && localization ? <LocalizedText
                localized={localizedBySource.get(segment.id)!}
                language={localization.targetLanguage.name}
                isRegenerating={regenerating.has(segment.id)}
                onEdit={(localized) => setEditingLocalized({ runId: localization.id, segmentId: localized.sourceSegmentId, text: localized.translatedText ?? "" })}
                onHistory={(localized) => void showHistory(localization.id, localized.sourceSegmentId)}
                onRegenerate={(localized) => void regenerateSegment(localization.id, localized.sourceSegmentId)}
              /> : null}
              <div className={styles.segmentActions} onClick={(event) => event.stopPropagation()}>
                <button type="button" onClick={() => setEditing(segment)}>Edit</button>
                <button type="button" disabled title="Segment restructuring is outside Studio Foundation">Split</button>
                <button type="button" disabled title="Segment restructuring is outside Studio Foundation">Merge</button>
              </div>
            </article>
          ))}
        </div>
      </main>

      <aside className={styles.projectPanel}>
        <div><p className={styles.eyebrow}>Project</p><dl className={styles.summary}>
          <div><dt>Source language</dt><dd>{project.sourceLanguage?.name ?? "Unavailable"}</dd></div>
          <div><dt>Speakers</dt><dd>{project.speakerCount ?? "Unavailable"}</dd></div>
          <div><dt>Duration</dt><dd>{formatTime(project.video.durationMs)}</dd></div>
          <div><dt>Structure</dt><dd>{project.contentStructure ?? "Unavailable"}</dd></div>
          {localization ? <div><dt>Localization</dt><dd>{localization.translatedCount} of {localization.totalCount}</dd></div> : null}
        </dl></div>
        <div className={styles.languagePicker}><label htmlFor="target-language">Target language</label><input id="target-language" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={project.targetLanguage?.name ?? "Search languages"} />
          <div className={styles.languageList}>{languageChoices.map((language) => <button key={language.code} type="button" data-selected={project.targetLanguage?.code === language.code} onClick={() => void selectLanguage(language)}>{language.name}</button>)}</div>
        </div>
        {project.limitations.length > 0 ? <div className={styles.limitations}><p>Needs attention</p>{project.limitations.map((limitation) => <span key={limitation}>{limitation}</span>)}</div> : null}
        <SuggestionsPanel suggestions={project.suggestions} onDecision={decideSuggestion} onSelect={(segmentId) => {
          const segment = project.segments.find((item) => item.id === segmentId); if (segment) selectSegment(segment);
        }} />
        <button className={styles.prepareButton} type="button" disabled={!project.targetLanguage || prepared} onClick={() => void prepare()}>{prepared ? localization?.status === "completed" ? "Localized transcript ready" : "Localizing…" : "Prepare localization"}</button>
        {localization?.status === "completed" && localization.render?.status !== "completed" ? <button className={styles.renderButton} type="button"
          disabled={rendering || localization.render?.status === "queued" || localization.render?.status === "running"}
          onClick={() => void generateVideo()}>
          {localization.render?.status === "failed" ? "Retry video generation" : rendering || localization.render ? "Generating video…" : "Generate localized video"}
        </button> : null}
        {localization?.render?.status === "failed" ? <p className={styles.renderError}>The video couldn’t be generated. You can try again.</p> : null}
      </aside>

      <div className={styles.timeline} aria-label="Playback timeline"><span>{formatTime(0)}</span><input type="range" min="0" max={project.video.durationMs} value={active?.startMs ?? 0} onChange={(event) => {
        const time = Number(event.target.value); const segment = project.segments.find((item) => time >= item.startMs && time < item.endMs); if (segment) selectSegment(segment);
      }} /><span>{formatTime(project.video.durationMs)}</span></div>

      {editing ? <EditSegment segment={editing} onClose={() => setEditing(null)} onSave={saveCorrection} /> : null}
      {editingLocalized ? <EditLocalizedSegment
        value={editingLocalized.text}
        onClose={() => setEditingLocalized(null)}
        onSave={(translatedText) => void saveLocalizedRevision({ ...editingLocalized, translatedText })}
      /> : null}
      {history ? <TranslationHistory revisions={history.revisions} onClose={() => setHistory(null)} /> : null}
    </section>
  );
}

function LocalizedText({ localized, language, isRegenerating, onEdit, onHistory, onRegenerate }: {
  localized: NonNullable<StudioProjectData["localization"]>["segments"][number];
  language: string;
  isRegenerating: boolean;
  onEdit: (localized: NonNullable<StudioProjectData["localization"]>["segments"][number]) => void;
  onHistory: (localized: NonNullable<StudioProjectData["localization"]>["segments"][number]) => void;
  onRegenerate: (localized: NonNullable<StudioProjectData["localization"]>["segments"][number]) => void;
}) {
  if (localized.status === "pending") return <div className={styles.localizedPending}>Translating…</div>;
  if (localized.status === "failed") return <div className={styles.localizedFailure}>This segment couldn’t be translated yet.</div>;
  return <div className={styles.localizedText} data-stale={localized.status === "stale"}>
    <span>{localized.status === "stale" ? "Source changed. Review translation." : language}</span>
    <p>{localized.translatedText}</p>
    {localized.timing ? <small data-status={localized.timing.status}>{localized.timing.status === "fits" ? "Fits timing" : localized.timing.status === "tight" ? "Timing is tight" : "May exceed timing"}</small> : null}
    <div className={styles.localizedActions}>
      <button type="button" onClick={() => onEdit(localized)}>Edit localized</button>
      <button type="button" onClick={() => onHistory(localized)}>History{localized.revisionCount > 1 ? ` (${localized.revisionCount})` : ""}</button>
      <button type="button" disabled={isRegenerating} onClick={() => onRegenerate(localized)}>{isRegenerating ? "Regenerating…" : "Regenerate"}</button>
    </div>
  </div>;
}

function EditLocalizedSegment({ value, onClose, onSave }: { value: string; onClose: () => void; onSave: (translatedText: string) => void }) {
  const [text, setText] = useState(value);
  return <div className={styles.dialogBackdrop} role="presentation"><form className={styles.dialog} onSubmit={(event) => { event.preventDefault(); onSave(text); }}>
    <p>Edit localized segment</p>
    <label>Localized text<textarea value={text} onChange={(event) => setText(event.target.value)} /></label>
    <div className={styles.dialogActions}><button type="button" onClick={onClose}>Cancel</button><button type="submit">Save edit</button></div>
  </form></div>;
}

function TranslationHistory({ revisions, onClose }: { revisions: TranslationRevisionData[]; onClose: () => void }) {
  return <div className={styles.dialogBackdrop} role="presentation"><div className={styles.dialog}>
    <p>Translation history</p>
    <div className={styles.revisionList}>
      {revisions.map((revision) => <article key={revision.id} className={styles.revisionItem} data-active={revision.isActive}>
        <div><span>Version {revision.version}</span><small>{revision.origin}{revision.isActive ? " · active" : ""}</small></div>
        <p>{revision.translatedText}</p>
      </article>)}
    </div>
    <div className={styles.dialogActions}><button type="button" onClick={onClose}>Close</button></div>
  </div></div>;
}

function EditSegment({ segment, onClose, onSave }: { segment: StudioSegment; onClose: () => void; onSave: (patch: TranscriptPatch) => void }) {
  const [text, setText] = useState(segment.originalText); const [speakerId, setSpeakerId] = useState(segment.speakerId);
  const [startMs, setStartMs] = useState(segment.startMs); const [endMs, setEndMs] = useState(segment.endMs);
  return <div className={styles.dialogBackdrop} role="presentation"><form className={styles.dialog} onSubmit={(event) => { event.preventDefault(); onSave({ text, speakerId, startMs, endMs }); }}>
    <p>Edit transcript segment</p><label>Transcript<textarea value={text} onChange={(event) => setText(event.target.value)} /></label>
    <label>Speaker<input value={speakerId} pattern="speaker_[1-9][0-9]*" onChange={(event) => setSpeakerId(event.target.value)} /></label>
    <div className={styles.timingFields}><label>Start (ms)<input type="number" min="0" value={startMs} onChange={(event) => setStartMs(Number(event.target.value))} /></label><label>End (ms)<input type="number" min="1" value={endMs} onChange={(event) => setEndMs(Number(event.target.value))} /></label></div>
    <div className={styles.dialogActions}><button type="button" onClick={onClose}>Cancel</button><button type="submit">Save correction</button></div>
  </form></div>;
}
