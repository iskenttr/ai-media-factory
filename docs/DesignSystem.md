# Design System

## What This Design System Serves

This design system exists for AI Media Factory, an AI-powered video localization platform.
Its job is to make complex multilingual media workflows feel clear, controllable, and production-safe for teams managing transcript, translation, dubbing, subtitle, and approval work.

## Experience Goals

The interface should communicate three things immediately:

- this is a video localization product,
- every language version has a visible status,
- and AI outputs can be reviewed and corrected before export.

## Design Principles

- Emotion before information.
- Show pipeline status before decorative polish.
- Make language state visible everywhere.
- Let users compare source and localized outputs quickly.
- Support fast line-level editing.
- Keep AI actions transparent and reversible.
- Design for long working sessions with dense media information.
- No code before UX: user flow, wireframe, and visual intent must be resolved before implementation.

## Experience Attributes

AI Media Factory should feel:

- desirable,
- editorial,
- precise,
- production-grade,
- multilingual,
- calm under complexity,
- and trustworthy.

## Foundations

### Color

- The light theme is the primary experience and must feel premium before any dark mode is considered.
- The palette should feel quiet, luminous, and editorial rather than colorful or corporate.
- Use color to communicate pipeline stages, approval states, warnings, and export readiness.
- Neutrals carry most of the product. Color appears with intent.
- Never use color as the only indicator for language status; pair it with labels and icons.

Core palette:

- `Canvas / #F7F7F4`
- `Surface Primary / #FFFFFF`
- `Surface Secondary / #F1F1EC`
- `Surface Tinted / #ECEDE7`
- `Text Primary / #111111`
- `Text Secondary / #5F6158`
- `Text Tertiary / #86897D`
- `Border Soft / rgba(17, 17, 17, 0.08)`
- `Border Strong / rgba(17, 17, 17, 0.14)`
- `Brand Ink / #111111`
- `Brand Accent / #5B7CFF`
- `Brand Accent Soft / #E9EEFF`
- `Success / #1F9D61`
- `Success Soft / #E9F7F0`
- `Warning / #D98A00`
- `Warning Soft / #FFF4DB`
- `Danger / #C94A4A`
- `Danger Soft / #FDECEC`

Usage rules:

- The first screen should use mostly neutrals plus one restrained accent glow.
- Primary calls to action should default to near-black ink or deep neutral, not bright SaaS blue.
- Accent blue is reserved for active selection, progress, and high-confidence interactive feedback.
- Success, warning, and danger are operational colors, not brand colors.

Recommended tokens:

- `color.bg.canvas`
- `color.bg.hero`
- `color.bg.panel`
- `color.bg.timeline`
- `color.surface.card`
- `color.surface.cardHover`
- `color.surface.active`
- `color.text.primary`
- `color.text.secondary`
- `color.text.tertiary`
- `color.border.soft`
- `color.border.strong`
- `color.border.critical`
- `color.status.generated`
- `color.status.review`
- `color.status.approved`
- `color.status.blocked`
- `color.action.primary`
- `color.action.primaryHover`
- `color.action.accent`
- `color.action.accentSoft`

### Typography

- Typography should feel calm, expensive, and modern.
- The system should be closer to Apple and ChatGPT than to typical startup marketing pages.
- Use one primary sans family across the product unless a second family is justified for editorial marketing surfaces.
- Prioritize legibility for transcript lines, subtitle text, timestamps, and metadata.
- Timestamp, speaker label, and language code treatments must be visually distinct from body copy.

Recommended families:

- Primary UI: `SF Pro Display`, `SF Pro Text`, `Inter`, `system-ui`, `sans-serif`
- Optional editorial display usage on landing surfaces only: same family with tighter tracking rather than a second font

Type scale:

- `Display XL` : 64/68, weight 600, tracking -0.04em
- `Display L` : 48/52, weight 600, tracking -0.035em
- `Page Title` : 36/40, weight 600, tracking -0.03em
- `Section Title` : 28/34, weight 600, tracking -0.025em
- `Panel Title` : 20/28, weight 600, tracking -0.02em
- `Body L` : 18/28, weight 400, tracking -0.01em
- `Body` : 16/24, weight 400, tracking -0.01em
- `Body S` : 14/22, weight 400, tracking -0.005em
- `Script Line` : 15/24, weight 400, tracking -0.005em
- `Caption` : 13/18, weight 400, tracking 0
- `Metadata` : 12/16, weight 500, tracking 0.01em
- `Status Label` : 11/14, weight 600, tracking 0.04em, uppercase optional

Usage rules:

- First-impression hero should use `Display L` on desktop and `Page Title` on mobile.
- Body copy on the first screen should be minimal and never exceed two short lines.
- Operational screens should favor `Body`, `Script Line`, `Metadata`, and `Status Label`.

### Spacing

- Spacing must feel intentional and quiet.
- The product should breathe like a premium tool, not compress like a dashboard.
- Dense interfaces are acceptable later in the workflow, but only when grouping and alignment stay disciplined.

Spacing scale:

- `space.2` = 2
- `space.4` = 4
- `space.6` = 6
- `space.8` = 8
- `space.12` = 12
- `space.16` = 16
- `space.20` = 20
- `space.24` = 24
- `space.32` = 32
- `space.40` = 40
- `space.48` = 48
- `space.64` = 64
- `space.80` = 80
- `space.96` = 96

Usage rules:

- First screens should bias toward `32`, `48`, `64`, and `80`.
- Tight UI controls can use `8`, `12`, and `16`.
- Panels should rarely have less than `24` internal padding.
- Hero sections should avoid noisy micro-gaps and instead use fewer, larger spacing moves.

### Border Radius

- Radius should feel soft and deliberate, never bubbly.
- Avoid mixing too many radius values.

Radius scale:

- `radius.8`
- `radius.12`
- `radius.16`
- `radius.20`
- `radius.24`
- `radius.full`

Usage rules:

- Inputs and compact buttons: `12`
- Standard cards: `16`
- Hero upload surface: `20` or `24`
- Pills and badges: `full`

### Layout

- Default page structures should support video preview plus adjacent review context.
- Important localization screens should prefer split-pane or multi-panel layouts over single-column forms.
- Language selection, language status, and quality warnings should stay visible without deep navigation.
- Design mobile responsibly, but optimize primarily for desktop production workflows.

### Elevation

- Elevation should be subtle and optical, not dramatic.
- Most depth should come from contrast, border definition, and spacing before large shadows.

Elevation scale:

- `elevation.0` : no shadow
- `elevation.1` : `0 1px 2px rgba(17,17,17,0.04), 0 0 0 1px rgba(17,17,17,0.04)`
- `elevation.2` : `0 8px 24px rgba(17,17,17,0.06), 0 0 0 1px rgba(17,17,17,0.05)`
- `elevation.3` : `0 16px 40px rgba(17,17,17,0.10), 0 0 0 1px rgba(17,17,17,0.06)`

Usage rules:

- Default cards use `elevation.1`
- Hovered cards and upload surfaces use `elevation.2`
- Modal or focused hero states can use `elevation.3` sparingly

### Motion And Feedback

- Motion should reinforce processing states such as transcription running, translation queued, dubbing rendering, and export packaging.
- Avoid decorative motion in timeline-heavy or review-heavy views.
- Loading states must communicate which stage is running and what remains blocked.

Motion language:

- Motions should feel restrained, smooth, and confident.
- Nothing should bounce like a toy.
- Motion should suggest readiness, momentum, and polish.

Timing:

- Hover transitions: `120ms` to `160ms`
- Surface lifts and fades: `180ms` to `220ms`
- Progress transitions: `240ms` to `320ms`
- Page or panel reveals: `320ms` to `420ms`

Easing:

- Standard: `cubic-bezier(0.22, 1, 0.36, 1)`
- Entrance: `cubic-bezier(0.16, 1, 0.3, 1)`
- Exit: `cubic-bezier(0.4, 0, 1, 1)`

Motion rules:

- Hover should slightly lift, sharpen, or brighten a surface.
- Drag states should feel magnetic rather than flashy.
- Loading should feel calm and continuous.
- Success should resolve cleanly, not celebrate excessively.

## Core Product Patterns

### Iconography

- Icons should be simple, geometric, and slightly rounded.
- Use thin-to-regular stroke weights with high clarity at small sizes.
- Avoid cartoonish fills or overly expressive icon sets.
- Upload, language, subtitle, waveform, play, approve, and export icons should feel cut from one system.

Recommended sizing:

- `16` for dense controls
- `18` for standard inline actions
- `20` for primary interface moments
- `24` for hero or empty-state expression

### First Impression Screen

- The first screen exists to create desire and reduce hesitation.
- Only one primary action should dominate: upload the source video.
- Any supporting information must stay visually subordinate to the upload invitation.
- The layout should feel centered, quiet, and emotionally confident.

### Video Workspace

- The video player, waveform or timeline, transcript, and localized output should feel part of one workspace.
- Time-based media context must stay close to editable language content.
- Users should never lose the relationship between source moment and localized line.

### Language Status Matrix

- Every project needs a clear view of all target languages.
- Each language card or row should show generation status, review status, blockers, assignee if applicable, and export readiness.
- Bulk actions should exist only when users can still inspect per-language exceptions.

### Transcript And Translation Editor

- Show source and target content side by side when possible.
- Preserve timestamps, speaker boundaries, and terminology context.
- Editing controls must support quick corrections without modal overload.

### Dubbing Controls

- Voice choice, pronunciation overrides, pacing controls, and preview playback need dedicated UI patterns.
- Users must be able to compare alternate voice results without losing the active version.
- Generated audio state should distinguish draft render from approved render.

### Subtitle Review

- Subtitle lines must expose timing, line breaks, length pressure, and overlap risk.
- Screens should support spotting readability problems fast, especially in narrow timing windows.
- Subtitle errors should surface as actionable issues, not generic warnings.

### Export Panel

- Export should present exact output types: subtitled video, dubbed video, subtitle files, audio stems, scripts.
- Availability must reflect approval status and unresolved blockers.
- Users should know exactly what file they are about to download or publish.

## Component Language

### Upload Surface Behavior

- The upload surface is the emotional center of Sprint 1.
- It must not feel like a default file picker box.
- The surface should read as an invitation, not an input field.

Default state:

- Large quiet surface on a near-white canvas
- Soft border, soft shadow, generous radius
- Minimal plus icon or upload glyph
- One memorable action line, centered

Hover state:

- Surface lifts by 2 to 4 pixels optically
- Border contrast increases slightly
- Interior glow or tint becomes subtly warmer or cooler
- Icon grows by roughly 4 to 6 percent

Drag-over state:

- Background tint strengthens
- Border becomes more defined
- Nearby text fades back one step to keep the surface dominant
- Action line can change to a more active phrase such as release-oriented copy

Loading handoff:

- Upload surface transforms into a progress container instead of disappearing abruptly
- Filename, progress bar, and one calm status line remain visible
- No technical metadata appears unless needed

### Button System

- Buttons should feel precise and quiet.
- Do not use heavy gradients, oversized pills, or loud shadows.

Button types:

- `Primary`
- `Secondary`
- `Tertiary`
- `Destructive`

Primary:

- Background: near-black or deep neutral
- Text: white
- Radius: `12`
- Height: `40` default, `48` hero contexts

Secondary:

- Background: white or subtle neutral
- Border: soft
- Text: primary text color

Tertiary:

- Background: transparent
- Text only or minimal hover tint

Destructive:

- Use danger color sparingly
- Reserve for irreversible actions only

Button motion:

- Hover: slight lift or contrast increase
- Press: compress visually by 1 pixel or darken slightly
- Disabled: lower contrast, no shadow, still readable

### Card System

- Cards should organize work without creating a dashboard feeling.
- Prefer fewer, larger cards over many tiny statistic tiles.

Card types:

- `Surface Card`
- `Status Card`
- `Media Card`
- `Review Card`

Shared rules:

- White or softly tinted surface
- Radius `16`
- Padding `24` or `32`
- Soft border first, shadow second
- Titles aligned to clear content hierarchy

### Progress Components

- Progress should feel trustworthy and calm.
- Do not use flashy animated stripes or over-branded loaders.

Components:

- `Linear Progress`
- `Stage Progress`
- `Inline Spinner`
- `Queued State`

Linear Progress:

- 6 to 8 pixel height
- Rounded ends
- Neutral track with restrained accent fill
- Smooth animated interpolation

Stage Progress:

- Used for transcript, translation, dubbing, subtitle, review, export sequences
- Each stage should be named, not abstractly numbered only

Inline Spinner:

- Thin stroke, low visual noise
- Use only for short indeterminate waits

### Empty States

- Empty states should feel editorial and encouraging, not like generic placeholders.
- The first screen is a special emotional empty state.
- Empty states later in the workflow should always name the missing artifact or next meaningful step.

Rules:

- One clear next action
- Minimal copy
- Optional small visual cue tied to video or language workflow
- Never use cute illustration styles that weaken product credibility

### Error States

- Errors must feel calm, precise, and actionable.
- Avoid alarmist red-heavy blocks unless the issue is truly critical.

Rules:

- Name the failed stage explicitly
- Say what is still safe
- Say what the user can retry, edit, or review
- Distinguish between one-language failures and project-wide failures

Error hierarchy:

- `Inline notice` for recoverable field or segment issues
- `Panel alert` for stage-specific failures
- `Blocking state` for export-stopping or upload-stopping failures

## Accessibility Standards

- Meet WCAG 2.2 AA for the full product.
- Ensure keyboard navigation works across transcript rows, timeline controls, review panels, and export actions.
- Maintain focus visibility inside dense editing interfaces.
- Support readable subtitle and transcript editing at zoomed text sizes.
- Avoid interactions that depend only on drag behavior or waveform precision.

## Content Design Rules

- First-impression copy should create desire before it explains mechanics.
- Use domain-true language: transcript, translation, dubbing, subtitles, target language, approval, export.
- Do not hide workflow meaning behind vague labels like "asset," "item," or "content" when a precise term exists.
- System copy should tell users what stage completed, what failed, and what needs human review.
- Error messages must say whether the issue affects one language, one segment, one render, or the full export.

## Design Review Checklist

- Does the surface feel premium rather than SaaS-generic?
- Is emotion leading the first screen before explanation?
- Is it obvious this screen belongs to a video localization workflow?
- Can the user identify source language, target language, and current pipeline stage immediately?
- Are AI-generated outputs reviewable and editable?
- Are transcript, subtitle, and dubbing states clearly separated?
- Is export readiness visible?
- Can a reviewer work quickly on desktop without confusion?

## Definition Of Design Done

A design is ready only when:

- the localization step is explicit,
- source and target content relationships are clear,
- all processing and review states are designed,
- language status behavior is defined,
- export outcomes are specified,
- and engineering can build the flow without inventing missing localization logic.
