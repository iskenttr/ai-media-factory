# Subtitle Quality Pipeline

## Quality gates

### Pre-render

- cue order, positive duration, no overlap, required gap
- speaker-boundary preservation
- maximum two lines
- Turkish NFC/Unicode integrity
- reading speed and minimum/maximum duration
- measured text bounds and safe-area containment
- stable collision-aware placement

### Post-render

- expected video dimensions and playable streams
- input/output duration tolerance
- subtitle frame bounds at representative and boundary frames
- cue transition sampling for stale/overlapping pixels
- visual collision score
- comparison with the accepted baseline

## Score

The score is explainable and deterministic. Hard failures cap the result below the acceptance threshold. Soft penalties cover reading-speed proximity, imbalance, small typography, unstable placement, and collision risk. AI review is reported separately and cannot erase deterministic failures.

Suggested acceptance policy:

- deterministic hard failures: zero
- deterministic quality score: at least 90/100
- AI advisory score, when enabled: at least 80/100
- regression delta: not worse than the accepted baseline on any hard metric

## Repair order

1. Trim/align speech boundaries and normalize gaps.
2. Split at speaker, pause, punctuation, and aligned-word boundaries.
3. Reallocate cue duration without crossing speech or speaker boundaries.
4. Rewrap and refit typography.
5. Reposition to the next stable safe band.
6. Rerender and repeat validation.

Every attempt records input fingerprints, applied repairs, metrics, output hash, duration, and cost. Repeated identical inputs use cached analysis. The loop stops at five attempts.

## Regression artifacts

For each fixture retain outside git:

- source hash and metadata
- normalized cue plan
- ASS file or render manifest
- quality report
- midpoint contact sheet
- before/after transition sheets
- visual diff summary
- final output path and hash

The permanent test corpus must include vertical/horizontal video, multiple speakers, pauses, overlapping source speech, long Turkish words, Unicode, burned captions, faces/lower-thirds, and no-audio/error cases.
