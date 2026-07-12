import type { QualityProfile } from "./engine";

export interface PlacementResult {
  bottomMargin: number;
  collisionScore: number;
  candidates: Array<{ bottomMargin: number; score: number }>;
}

function edgeDensity(frame: Uint8Array, width: number, height: number, top: number, bottom: number) {
  let edges = 0;
  let samples = 0;
  const y0 = Math.max(1, Math.floor(top));
  const y1 = Math.min(height - 1, Math.ceil(bottom));
  for (let y = y0; y < y1; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const index = y * width + x;
      const horizontal = Math.abs(frame[index] - frame[index - 1]);
      const vertical = Math.abs(frame[index] - frame[index - width]);
      if (horizontal > 38 || vertical > 38) edges += 1;
      samples += 1;
    }
  }
  return samples ? edges / samples : 1;
}

/** Selects a stable subtitle band with the least visual/text-like edge activity. */
export function choosePlacement(
  frames: Uint8Array[],
  frameWidth: number,
  frameHeight: number,
  profile: QualityProfile,
  renderedLineHeight: number,
): PlacementResult {
  const ratios = profile.orientation === "vertical" ? [0.22, 0.31, 0.40, 0.49] : [0.11, 0.19, 0.27];
  const scaleY = frameHeight / profile.height;
  const bandHeight = Math.max(12, renderedLineHeight * 2.5 * scaleY);
  const candidates = ratios.map((ratio, index) => {
    const bottomMargin = Math.round(profile.height * ratio);
    const bottom = frameHeight - bottomMargin * scaleY;
    const raw = frames.length
      ? frames.reduce((sum, frame) => sum + edgeDensity(frame, frameWidth, frameHeight, bottom - bandHeight, bottom), 0) / frames.length
      : 0;
    // Prefer the familiar lower-third position when visual scores are effectively tied.
    return { bottomMargin, score: raw + index * 0.0025 };
  });
  const selected = [...candidates].sort((a, b) => a.score - b.score)[0];
  return { bottomMargin: selected.bottomMargin, collisionScore: selected.score, candidates };
}
