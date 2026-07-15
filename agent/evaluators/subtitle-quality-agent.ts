import { evaluateSubtitleQuality } from "../../lib/subtitle-quality/v3";
import { SMOKE_ASS } from "./render-analysis-agent";

export function evaluateSmokeQuality(runId: string) {
  return evaluateSubtitleQuality({
    runId,
    videoId: "synthetic-agent-smoke",
    videoDurationMs: 1_000,
    videoWidth: 320,
    videoHeight: 180,
    safeArea: { x: 16, y: 12, width: 288, height: 150 },
    assText: SMOKE_ASS,
    cues: [{ id: "smoke-1", startMs: 100, endMs: 850, text: "Güvenli test altyazısı", speakerId: "Speaker-1", bounds: { x: 40, y: 125, width: 240, height: 28 } }],
  });
}
