# Subtitle Engine V2

## Design objective

Produce professional Turkish subtitles from imperfect upstream timestamps without allowing generative AI to control timestamps, geometry, rendering, or acceptance.

## Pipeline

```text
source segments + word timestamps + speaker turns + audio activity
  -> speech boundary detector
  -> word/phrase forced alignment
  -> speaker-aware semantic segmentation
  -> reading-speed and duration optimization
  -> gap normalization
  -> safe-area and collision map
  -> measured line breaking and font fitting
  -> render candidate
  -> deterministic + optional AI review
  -> repair plan (max 5)
```

## Timing rules

- Prefer word timestamps; fall back to segment timestamps constrained by detected speech intervals.
- A cue begins at its first aligned word and ends at its last aligned word plus only a bounded tail pad.
- Speaker changes, sentence punctuation, and meaningful silence create hard boundaries.
- Cues never overlap. A configurable positive gap separates adjacent cues.
- Short cues are resegmented, not blindly extended into silence or the next speaker.
- Long/dense cues split at scored semantic boundaries and receive time proportional to aligned words.

## Turkish segmentation

Candidates are scored by punctuation, conjunction/morpheme safety, phrase balance, orphan words, line width, CPS, duration, pause evidence, and speaker continuity. A cue is at most two lines. Splits must not detach Turkish clitics or leave punctuation at the start of a line.

## Typography and layout

- Vertical and horizontal profiles define independent safe regions and typography ranges.
- Width is measured using font metrics when available and a conservative Unicode-width fallback otherwise.
- The fitter searches from preferred to minimum readable size; it resegments before violating minimum size.
- Layout accounts for outline/shadow and validates the final bounding rectangle.
- Candidate subtitle bands are ranked against caption/text-like edges, faces/important regions when available, and temporal stability.

## Validation and repair

Validators classify failures as timing, segmentation, reading speed, bounds, Unicode, collision, media duration, render, or provider advisory. Repairs are deterministic and ordered: normalize timing, resegment, refit, reposition, then rerender. The loop stops after five attempts and never lowers hard safety limits merely to obtain a pass.

## AI boundary

Gemini may review selected frames and structured cue metadata, propose Turkish rewrites/splits, flag visual collisions, and score typography. Suggestions must conform to a schema, be cached by input fingerprint, and pass deterministic validation before use. Raw videos are not uploaded by default.
