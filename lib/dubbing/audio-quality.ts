export interface Pcm16Measurement {
  durationMs: number;
  sampleRate: number;
  channels: number;
  peakDbfs: number;
  rmsDbfs: number;
  clippedSamples: number;
  clippedSampleRatio: number;
  silenceRatio: number;
  signature: {
    rmsDbfs: number;
    zeroCrossingRate: number;
    estimatedPitchHz: number | null;
  };
}

export interface DubbingSegmentEvidence {
  segmentId: string;
  speakerId: string;
  voiceProfileId: string;
  expectedText: string;
  recognizedText: string | null;
  targetDurationMs: number;
  synthesizedDurationMs: number;
  fittedDurationMs: number;
  audioBuffer: Uint8Array;
}

function finiteDb(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : -120;
}

function parsePcm16Wav(audio: Uint8Array) {
  const bytes = Buffer.from(audio);
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("audio_quality_wav_invalid");
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataStart = 0;
  let dataBytes = 0;
  while (offset + 8 <= bytes.length) {
    const chunk = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > bytes.length) throw new Error("audio_quality_wav_truncated");
    if (chunk === "fmt " && size >= 16) {
      const format = bytes.readUInt16LE(start);
      channels = bytes.readUInt16LE(start + 2);
      sampleRate = bytes.readUInt32LE(start + 4);
      bitsPerSample = bytes.readUInt16LE(start + 14);
      if (format !== 1) throw new Error("audio_quality_wav_not_pcm");
    } else if (chunk === "data") {
      dataStart = start;
      dataBytes = size;
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!dataStart || !dataBytes || !sampleRate || !channels || bitsPerSample !== 16) {
    throw new Error("audio_quality_wav_format_unsupported");
  }
  const samples = new Int16Array(Math.floor(dataBytes / 2));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = bytes.readInt16LE(dataStart + index * 2);
  }
  return { samples, sampleRate, channels };
}

function estimatePitch(samples: number[], sampleRate: number) {
  const maximumSamples = Math.min(samples.length, sampleRate);
  if (maximumSamples < sampleRate / 5) return null;
  const startLag = Math.max(1, Math.floor(sampleRate / 350));
  const endLag = Math.max(startLag + 1, Math.ceil(sampleRate / 70));
  let bestLag = 0;
  let bestCorrelation = 0;
  let energy = 0;
  for (let index = 0; index < maximumSamples; index += 1) energy += samples[index] ** 2;
  if (energy <= 0) return null;
  for (let lag = startLag; lag <= endLag; lag += 1) {
    let correlation = 0;
    for (let index = lag; index < maximumSamples; index += 1) {
      correlation += samples[index] * samples[index - lag];
    }
    const normalized = correlation / energy;
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestLag = lag;
    }
  }
  return bestCorrelation >= 0.1 && bestLag > 0
    ? Number((sampleRate / bestLag).toFixed(2))
    : null;
}

export function measurePcm16Wav(audio: Uint8Array): Pcm16Measurement {
  const { samples, sampleRate, channels } = parsePcm16Wav(audio);
  let squareSum = 0;
  let peak = 0;
  let clippedSamples = 0;
  let silentSamples = 0;
  const mono: number[] = [];
  for (let frame = 0; frame < Math.floor(samples.length / channels); frame += 1) {
    let frameSample = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = samples[frame * channels + channel];
      const absolute = Math.abs(sample);
      peak = Math.max(peak, absolute);
      squareSum += sample ** 2;
      if (absolute >= 32_760) clippedSamples += 1;
      if (absolute <= 328) silentSamples += 1;
      frameSample += sample / channels;
    }
    mono.push(frameSample / 32_768);
  }
  let zeroCrossings = 0;
  for (let index = 1; index < mono.length; index += 1) {
    if ((mono[index - 1] < 0 && mono[index] >= 0) || (mono[index - 1] >= 0 && mono[index] < 0)) {
      zeroCrossings += 1;
    }
  }
  const rms = Math.sqrt(squareSum / Math.max(1, samples.length)) / 32_768;
  const durationMs = Math.round((mono.length / sampleRate) * 1_000);
  return {
    durationMs,
    sampleRate,
    channels,
    peakDbfs: finiteDb(20 * Math.log10(peak / 32_768)),
    rmsDbfs: finiteDb(20 * Math.log10(rms)),
    clippedSamples,
    clippedSampleRatio: Number((clippedSamples / Math.max(1, samples.length)).toFixed(8)),
    silenceRatio: Number((silentSamples / Math.max(1, samples.length)).toFixed(6)),
    signature: {
      rmsDbfs: finiteDb(20 * Math.log10(rms)),
      zeroCrossingRate: Number((zeroCrossings / Math.max(1, mono.length - 1)).toFixed(6)),
      estimatedPitchHz: estimatePitch(mono, sampleRate),
    },
  };
}

function words(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function wordErrorRate(expected: string, recognized: string) {
  const left = words(expected);
  const right = words(recognized);
  if (left.length === 0) return right.length === 0 ? 0 : 1;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const old = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = old;
    }
  }
  return Number((previous[right.length] / left.length).toFixed(4));
}

function signatureSimilarity(
  left: Pcm16Measurement["signature"],
  right: Pcm16Measurement["signature"],
) {
  const rmsDistance = Math.abs(left.rmsDbfs - right.rmsDbfs) / 18;
  const crossingDistance = Math.abs(left.zeroCrossingRate - right.zeroCrossingRate) / 0.25;
  const pitchDistance = left.estimatedPitchHz && right.estimatedPitchHz
    ? Math.abs(Math.log(left.estimatedPitchHz / right.estimatedPitchHz))
    : 0.25;
  return Number(Math.exp(-(rmsDistance + crossingDistance + pitchDistance)).toFixed(4));
}

export function evaluateDubbingQuality(input: {
  segments: DubbingSegmentEvidence[];
  finalAudio: Uint8Array;
  integratedLufs: number | null;
  truePeakDbfs: number | null;
}) {
  if (input.segments.length === 0) throw new Error("audio_quality_segments_required");
  const finalMeasurement = measurePcm16Wav(input.finalAudio);
  const measuredSegments = input.segments.map((segment) => ({
    ...segment,
    measurement: measurePcm16Wav(segment.audioBuffer),
    wordErrorRate: segment.recognizedText === null
      ? null
      : wordErrorRate(segment.expectedText, segment.recognizedText),
    timingErrorMs: Math.abs(segment.fittedDurationMs - segment.targetDurationMs),
    stretchRatio: Number((segment.synthesizedDurationMs / segment.targetDurationMs).toFixed(4)),
  }));
  const wordErrors = measuredSegments.flatMap((segment) => segment.wordErrorRate === null ? [] : [segment.wordErrorRate]);
  const maximumWordErrorRate = wordErrors.length ? Math.max(...wordErrors) : null;
  const maximumTimingErrorMs = Math.max(...measuredSegments.map((segment) => segment.timingErrorMs));
  const stretchRatios = measuredSegments.map((segment) => segment.stretchRatio);

  const bySpeaker = new Map<string, typeof measuredSegments>();
  for (const segment of measuredSegments) {
    const values = bySpeaker.get(segment.speakerId) ?? [];
    values.push(segment);
    bySpeaker.set(segment.speakerId, values);
  }
  const assignmentConflicts = [...bySpeaker.entries()].flatMap(([speakerId, segments]) => {
    const profiles = [...new Set(segments.map((segment) => segment.voiceProfileId))];
    return profiles.length > 1 ? [{ speakerId, voiceProfileIds: profiles }] : [];
  });
  const acousticSimilarities = [...bySpeaker.values()].flatMap((segments) => {
    if (segments.length < 2) return [];
    const reference = segments[0].measurement.signature;
    return segments.slice(1).map((segment) => signatureSimilarity(reference, segment.measurement.signature));
  });
  const minimumAcousticSimilarity = acousticSimilarities.length
    ? Math.min(...acousticSimilarities)
    : null;

  const report = {
    version: "dubbing-quality-v1",
    aggregateScore: null,
    explanation: "No synthetic 0-100 score is used; each physical or transcript metric has its own gate.",
    intelligibility: {
      available: wordErrors.length === measuredSegments.length,
      maximumWordErrorRate,
      threshold: { maximumWordErrorRate: 0.2 },
      passed: wordErrors.length === measuredSegments.length
        && maximumWordErrorRate !== null
        && maximumWordErrorRate <= 0.2,
    },
    synchronization: {
      maximumTimingErrorMs,
      stretchRatioRange: [Math.min(...stretchRatios), Math.max(...stretchRatios)],
      threshold: { maximumTimingErrorMs: 120, minimumStretchRatio: 0.75, maximumStretchRatio: 1.35 },
      passed: maximumTimingErrorMs <= 120
        && stretchRatios.every((ratio) => ratio >= 0.75 && ratio <= 1.35),
    },
    loudness: {
      available: input.integratedLufs !== null && input.truePeakDbfs !== null,
      integratedLufs: input.integratedLufs,
      truePeakDbfs: input.truePeakDbfs,
      threshold: { minimumIntegratedLufs: -18, maximumIntegratedLufs: -14, maximumTruePeakDbfs: -1 },
      passed: input.integratedLufs !== null
        && input.truePeakDbfs !== null
        && input.integratedLufs >= -18
        && input.integratedLufs <= -14
        && input.truePeakDbfs <= -1,
    },
    clipping: {
      peakDbfs: finalMeasurement.peakDbfs,
      clippedSamples: finalMeasurement.clippedSamples,
      clippedSampleRatio: finalMeasurement.clippedSampleRatio,
      threshold: { maximumClippedSampleRatio: 0.00001, maximumPeakDbfs: -0.5 },
      passed: finalMeasurement.clippedSampleRatio <= 0.00001 && finalMeasurement.peakDbfs <= -0.5,
    },
    speakerConsistency: {
      assignmentConflicts,
      acousticSimilarityAvailable: acousticSimilarities.length > 0,
      minimumAcousticSimilarity,
      threshold: { minimumAcousticSimilarity: 0.55 },
      passed: assignmentConflicts.length === 0
        && (minimumAcousticSimilarity === null || minimumAcousticSimilarity >= 0.55),
      explanation: "Provider profile continuity is authoritative; acoustic similarity is a transparent signal, not biometric identity proof.",
    },
    segments: measuredSegments.map((segment) => ({
      segmentId: segment.segmentId,
      speakerId: segment.speakerId,
      voiceProfileId: segment.voiceProfileId,
      expectedText: segment.expectedText,
      recognizedText: segment.recognizedText,
      wordErrorRate: segment.wordErrorRate,
      targetDurationMs: segment.targetDurationMs,
      synthesizedDurationMs: segment.synthesizedDurationMs,
      fittedDurationMs: segment.fittedDurationMs,
      timingErrorMs: segment.timingErrorMs,
      stretchRatio: segment.stretchRatio,
      signal: segment.measurement,
    })),
    finalSignal: finalMeasurement,
  };
  return {
    ...report,
    passed: report.intelligibility.passed
      && report.synchronization.passed
      && report.loudness.passed
      && report.clipping.passed
      && report.speakerConsistency.passed,
  };
}

export function parseEbur128Summary(log: string) {
  const integrated = [...log.matchAll(/\bI:\s*(-?\d+(?:\.\d+)?)\s+LUFS/g)].at(-1);
  const peak = [...log.matchAll(/\bPeak:\s*(-?\d+(?:\.\d+)?)\s+dBFS/g)].at(-1);
  return {
    integratedLufs: integrated ? Number(integrated[1]) : null,
    truePeakDbfs: peak ? Number(peak[1]) : null,
  };
}
