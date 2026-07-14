# Design Improvement Proposals (DIPs)

This document maintains the approved registry of UX, UI, and accessibility enhancements designed to elevate the AI Media Factory platform, aligning directly with the core criteria established in `docs/DesignSystem.md` and `docs/Product.md`.

---

## DIP-001: Language Status Matrix Visibility & Filtering

### 1. Problem Statement
Localization Managers supervising multi-language project targets (e.g., 10+ languages) struggle to quickly identify which specific languages are blocked, which need human review, and which are export-ready without scrolling or drilling down.

### 2. Proposed Improvement
- **Grid Layout Density & Contrast**: Implement an explicit 3-column layout highlighting pipeline lanes: `Needs Action`, `In Progress`, and `Ready/Approved`.
- **Visual Indicators**: Pair status colors with distinct geometric icon indicators as defined in `DesignSystem.md` (e.g., a solid warning sign icon for `Blocked` alongside `#D98A00` status borders; a check icon for `Approved` alongside `#1F9D61`).
- **Micro-Filtering Toolbar**: Provide a persistent, low-noise metadata toolbar allowing immediate filtering of target languages by pipeline status (`All`, `Blocked`, `Pending Review`, `Approved`).

### 3. Accessibility Impact
- **WCAG 2.2 AA Compliance**: Removes color dependency by pairing color-coded states with clear status text and distinctive graphic icons.
- **Screen Reader Navigation**: Introduce an ARIA-live region that announces updated language filter counts and status changes upon user action.

### 4. Validation & Testing Plan
- **Interactive Prototyping**: Test with 3-5 Localization Managers handling more than 8 target languages simultaneously.
- **Usability Success Criteria**: Time-to-identify a critical translation block should decrease by at least 40% compared to the baseline single-column list.

---

## DIP-002: Side-by-Side Transcript & Subtitle Editor Refinement

### 1. Problem Statement
Reviewers experience cognitive fatigue during long editing sessions because text editing boxes, timestamp metadata, and character-count overload indicators compete for visual dominance on the canvas.

### 2. Proposed Improvement
- **Typography and Hierarchy**: Utilize `Script Line` (15px, line-height 24px) for editable transcription rows, distinct from timestamp metadata (`Metadata` token, 12px, tracking 0.01em) in a muted neutral gray (`#86897D`).
- **Smart Timing Pressure Indicators**: Instead of warning alerts on the entire segment, highlight only the text exceeding character limits with a subtle underline in `Danger` color (`#C94A4A`), and display a character count metric when active.
- **Keyboard Shortcuts Visual Hints**: Display key-combination tooltips inline when focused on an active segment (e.g., `Tab` to jump to target line, `CMD + Space` to replay current video segment).

### 3. Accessibility Impact
- **Focus Visibility**: Focus indicators will receive a high-contrast `#5B7CFF` Brand Accent border with a `2px` offset.
- **Keyboard Only Testing**: Ensure reviewers can navigate, edit, split segments, and commit translations entirely without mouse clicks.

### 4. Validation & Testing Plan
- **Testing Metric**: Measure the rate of keystrokes versus manual clicks during a standard 5-minute correction exercise.
- **Success Target**: 95% of corrective actions completed natively via keyboard shortcuts within the workspace.

---

## DIP-003: Keyboard-Only Timeline Navigation

### 1. Problem Statement
Reviewers must continuously reach for the mouse to scrub the video timeline or click on visual waveform indicators, disrupting editing flow and limiting workspace accessibility.

### 2. Proposed Improvement
- **Time Scrubbing Keys**: Map custom time increments (`Left/Right` arrow keys for -/+ 1 second, and shift combinations for -/+ 5 seconds).
- **Anchor Navigation**: Bind `[` and `]` key shortcuts to instantly move the playhead to the beginning or end of the current active subtitle cue card.

### 3. Accessibility Impact
- Ensures the timeline element meets strict keyboard navigation standards without relying on fine-grained mouse motor control over a condensed canvas waveform.

### 4. Validation & Testing Plan
- **Automated Accessibility Testing**: Run screen reader and keyboard accessibility analysis over the timeline workspace.
- **Success Metric**: Zero keyboard traps detected during localized segment traversal and replay.
