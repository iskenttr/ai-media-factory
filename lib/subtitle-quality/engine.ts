export interface QualityCue {
  startMs: number;
  endMs: number;
  text: string;
  speakerId?: string;
}

export interface SpeechInterval { startMs: number; endMs: number }

export interface QualityProfile {
  width: number;
  height: number;
  orientation: "horizontal" | "vertical";
  safeLeft: number;
  safeRight: number;
  safeTop: number;
  safeBottom: number;
  preferredBottom: number;
  minFontSize: number;
  maxFontSize: number;
  maxCps: number;
  minCueMs: number;
  maxCueMs: number;
  cueGapMs: number;
}

export interface FittedCue extends QualityCue {
  lines: [string] | [string, string];
  fontSize: number;
}

export interface QualityIssue {
  code: "overlap" | "duration" | "reading_speed" | "line_count" | "text_bounds" | "empty";
  cueIndex: number;
  detail: string;
}

const normalize = (text: string) => text.normalize("NFC").replace(/\s+/gu, " ").trim();

export function createQualityProfile(width: number, height: number): QualityProfile {
  const vertical = height > width;
  const short = Math.min(width, height);
  return {
    width,
    height,
    orientation: vertical ? "vertical" : "horizontal",
    safeLeft: Math.round(width * (vertical ? 0.09 : 0.07)),
    safeRight: Math.round(width * (vertical ? 0.09 : 0.07)),
    safeTop: Math.round(height * 0.08),
    safeBottom: Math.round(height * (vertical ? 0.12 : 0.08)),
    preferredBottom: Math.round(height * (vertical ? 0.24 : 0.12)),
    minFontSize: Math.max(24, Math.round(short * 0.035)),
    maxFontSize: Math.max(32, Math.round(short * (vertical ? 0.052 : 0.044))),
    maxCps: 17,
    minCueMs: 480,
    maxCueMs: 6_000,
    cueGapMs: 30,
  };
}

/** Parse ffmpeg silencedetect output into voiced intervals. */
export function speechIntervalsFromSilenceLog(log: string, durationMs: number): SpeechInterval[] {
  const events = [...log.matchAll(/silence_(start|end):\s*([0-9.]+)/gu)]
    .map((match) => ({ kind: match[1], at: Math.round(Number(match[2]) * 1_000) }))
    .sort((a, b) => a.at - b.at);
  const result: SpeechInterval[] = [];
  let voiceStart = 0;
  for (const event of events) {
    if (event.kind === "start" && event.at > voiceStart) result.push({ startMs: voiceStart, endMs: event.at });
    if (event.kind === "end") voiceStart = event.at;
  }
  if (voiceStart < durationMs) result.push({ startMs: voiceStart, endMs: durationMs });
  return result.filter((item) => item.endMs - item.startMs >= 80);
}

function closestBoundary(value: number, boundaries: number[], tolerance: number) {
  const candidates = boundaries.filter((boundary) => Math.abs(boundary - value) <= tolerance);
  return candidates.sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0] ?? value;
}

export function refineSpeechBoundaries(cues: QualityCue[], speech: SpeechInterval[]) {
  const starts = speech.map((item) => item.startMs);
  const ends = speech.map((item) => item.endMs);
  return cues.map((cue) => ({
    ...cue,
    startMs: Math.max(0, closestBoundary(cue.startMs, starts, 420)),
    endMs: closestBoundary(cue.endMs, ends, 520),
    text: normalize(cue.text),
  }));
}

function splitCandidates(text: string) {
  const words = normalize(text).split(" ");
  const candidates: number[] = [];
  for (let index = 1; index < words.length; index += 1) {
    if (/[.!?…;,:]$/u.test(words[index - 1])) candidates.push(index);
  }
  for (let index = 1; index < words.length; index += 1) if (!candidates.includes(index)) candidates.push(index);
  return { words, candidates };
}

export function semanticSplit(text: string): [string, string] | null {
  const { words, candidates } = splitCandidates(text);
  if (words.length < 2) return null;
  let best: { index: number; score: number } | null = null;
  for (const index of candidates) {
    const left = words.slice(0, index).join(" ");
    const right = words.slice(index).join(" ");
    const punctuationBonus = /[.!?…;,:]$/u.test(left) ? -12 : 0;
    const orphanPenalty = Math.min(index, words.length - index) === 1 ? 18 : 0;
    const score = Math.abs(weightedTextWidth(left) - weightedTextWidth(right)) + punctuationBonus + orphanPenalty;
    if (!best || score < best.score) best = { index, score };
  }
  return best ? [words.slice(0, best.index).join(" "), words.slice(best.index).join(" ")] : null;
}

export function weightedTextWidth(text: string) {
  let width = 0;
  for (const character of text) {
    if (/\s/u.test(character)) width += 0.32;
    else if (/[ilıİIjtfr.,:;!'|]/u.test(character)) width += 0.34;
    else if (/[MWĞŞÖÜÇmwğşöüç@%&]/u.test(character)) width += 0.86;
    else if (/\p{Lu}/u.test(character)) width += 0.68;
    else width += 0.56;
  }
  return width;
}

export function wrapBalanced(text: string): [string] | [string, string] {
  const normalized = normalize(text);
  const split = semanticSplit(normalized);
  if (!split) return [normalized];
  const singleWidth = weightedTextWidth(normalized);
  const widestSplit = Math.max(...split.map(weightedTextWidth));
  return widestSplit < singleWidth * 0.72 ? split : [normalized];
}

export function fitCue(text: string, profile: QualityProfile): Pick<FittedCue, "lines" | "fontSize"> {
  let lines = wrapBalanced(text);
  const availableWidth = profile.width - profile.safeLeft - profile.safeRight;
  const maxUnits = Math.max(...lines.map(weightedTextWidth));
  let fontSize = Math.min(profile.maxFontSize, Math.floor(availableWidth / Math.max(1, maxUnits)));
  if (fontSize < profile.minFontSize && lines.length === 1) {
    const split = semanticSplit(text);
    if (split) lines = split;
    const splitUnits = Math.max(...lines.map(weightedTextWidth));
    fontSize = Math.min(profile.maxFontSize, Math.floor(availableWidth / Math.max(1, splitUnits)));
  }
  return { lines, fontSize: Math.max(profile.minFontSize, fontSize) };
}

function splitCueForReadingSpeed(cue: QualityCue, profile: QualityProfile, depth = 0): QualityCue[] {
  const duration = cue.endMs - cue.startMs;
  const wrapped = wrapBalanced(cue.text);
  const safeWidth = profile.width - profile.safeLeft - profile.safeRight;
  const layoutTooDense = Math.max(...wrapped.map(weightedTextWidth)) * profile.minFontSize > safeWidth;
  const needsSplit = duration > profile.maxCueMs
    || normalize(cue.text).length / (duration / 1_000) > profile.maxCps * 1.15
    || layoutTooDense;
  const split = needsSplit ? semanticSplit(cue.text) : null;
  if (!split || duration < profile.minCueMs * 2 || depth >= 4) return [cue];
  const firstWeight = Math.max(1, split[0].length);
  const ratio = firstWeight / (firstWeight + Math.max(1, split[1].length));
  const splitAt = Math.round(cue.startMs + duration * Math.min(0.7, Math.max(0.3, ratio)));
  return [
    { ...cue, text: split[0], endMs: splitAt },
    { ...cue, text: split[1], startMs: splitAt + profile.cueGapMs },
  ].flatMap((part) => splitCueForReadingSpeed(part, profile, depth + 1));
}

export function normalizeCueTiming(input: QualityCue[], profile: QualityProfile) {
  const split = input
    .filter((cue) => normalize(cue.text) && cue.endMs > cue.startMs)
    .sort((a, b) => a.startMs - b.startMs)
    .flatMap((cue) => splitCueForReadingSpeed({ ...cue, text: normalize(cue.text) }, profile));
  const result: QualityCue[] = [];
  for (let index = 0; index < split.length; index += 1) {
    const cue = { ...split[index] };
    const next = split[index + 1];
    if (next && cue.endMs >= next.startMs) cue.endMs = next.startMs - profile.cueGapMs;
    if (cue.endMs - cue.startMs >= 100) result.push(cue);
  }
  return result;
}

export function prepareCues(input: QualityCue[], profile: QualityProfile, speech: SpeechInterval[] = []): FittedCue[] {
  const refined = speech.length ? refineSpeechBoundaries(input, speech) : input;
  return normalizeCueTiming(refined, profile).map((cue) => ({ ...cue, ...fitCue(cue.text, profile) }));
}

export function validateCues(cues: FittedCue[], profile: QualityProfile): QualityIssue[] {
  const issues: QualityIssue[] = [];
  cues.forEach((cue, index) => {
    const duration = cue.endMs - cue.startMs;
    if (!normalize(cue.text)) issues.push({ code: "empty", cueIndex: index, detail: "Cue text is empty" });
    if (index > 0 && cues[index - 1].endMs >= cue.startMs) issues.push({ code: "overlap", cueIndex: index, detail: "Cue overlaps previous cue" });
    if (duration < 100 || duration > profile.maxCueMs) issues.push({ code: "duration", cueIndex: index, detail: `${duration}ms` });
    if (normalize(cue.text).length / (duration / 1_000) > profile.maxCps * 1.15) issues.push({ code: "reading_speed", cueIndex: index, detail: "CPS exceeds hard limit" });
    if (cue.lines.length > 2) issues.push({ code: "line_count", cueIndex: index, detail: "More than two lines" });
    const available = profile.width - profile.safeLeft - profile.safeRight;
    if (Math.max(...cue.lines.map(weightedTextWidth)) * cue.fontSize > available + 1) issues.push({ code: "text_bounds", cueIndex: index, detail: "Measured line exceeds safe width" });
  });
  return issues;
}
