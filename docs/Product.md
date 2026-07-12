# Product

## What The Product Does

AI Media Factory is a platform for AI-powered video localization.
Users upload a source video, generate a transcript, translate it into target languages, create dubbed voices and subtitles, review every language version, and export publish-ready assets from one controlled workflow.

## Product Scope

The product covers the end-to-end localization pipeline for video content:

- source video ingestion,
- transcription,
- source script cleanup,
- translation into target languages,
- voice selection and dubbing generation,
- subtitle generation and timing alignment,
- human review and approval,
- and export of localized assets.

## Product Outcome

The outcome is not "AI generated something."
The outcome is that a media team can confidently ship localized video in multiple languages with less manual coordination and better operational visibility.

## Primary Users

### Media Localization Managers

They need visibility across many videos and languages, clear status tracking, and confidence that nothing ships with broken subtitles, wrong terminology, or incomplete review.

### Content Operations Teams

They need a repeatable workflow that moves fast without relying on scattered vendors and manual file passing.

### Language Reviewers

They need precise editing control over transcript lines, translations, subtitle timing, pronunciation choices, and dubbing output.

### Marketing And Distribution Teams

They need market-ready versions of campaign or content videos in multiple languages with consistent brand tone.

## Core Workflow

The default product flow is:

1. Upload source video
2. Generate transcript and speaker segments
3. Review and correct source script
4. Select target languages
5. Generate translations
6. Generate subtitles and dubbed voice tracks
7. Review timing, terminology, pronunciation, and tone
8. Approve each language
9. Export final assets

Every roadmap item and feature request must improve this workflow directly or remove friction around it.

## Product Principles

### 1. Source Truth Comes First

Bad transcripts create bad translations, bad subtitles, and bad dubbing.
The product must treat source transcription quality as a first-class control point.

### 2. Translation Must Preserve Intent

Localization is not word replacement.
The system must protect meaning, context, brand terminology, and speaker intent across languages.

### 3. Dubbing Must Feel Deliberate

AI voice output must sound selected, not random.
Voice identity, pronunciation, pacing, and emotional fit are product quality concerns, not cosmetic extras.

### 4. Review Must Be Fast And Precise

Users should be able to spot and fix localization issues at the line level, speaker level, and language level without fighting the interface.

### 5. Every Language Needs Status

The platform must always show what is generated, what is edited, what is blocked, and what is approved for each target language.

### 6. Export Is Part Of The Product

Localized subtitle files, scripts, audio stems, and final video outputs are core deliverables.
Export quality and reliability matter as much as in-app generation.

### 7. AI Must Remain Auditable

Users need to understand what the system generated, what changed, and what still requires human approval.
Black-box localization is unacceptable for production workflows.

## Product Decision Rules

- No feature is prioritized unless it improves transcription quality, translation quality, dubbing quality, subtitle quality, review speed, or export reliability.
- No workflow change is acceptable if it hides language status or makes approval less explicit.
- No AI shortcut may remove human correction points from high-risk outputs.
- No roadmap item should dilute focus into unrelated creator tooling or generic workspace features.
- No localization flow is complete without clear ownership from upload to export.
- No implementation should start before the user flow and UX intent are defined for the affected localization step.

## Prioritization Framework

Prioritize work in this order:

1. Quality issues that can ship wrong localized output
2. Bottlenecks in transcript, translation, dubbing, subtitle, or review workflow
3. Visibility improvements for language status and approval
4. Scale improvements for handling more videos and languages
5. Adjacent enhancements that strengthen the core localization operation

## Definition Of Product Ready

Work is ready for development only when it states:

- which step of the localization pipeline it improves,
- which user role it helps,
- what output quality or workflow speed it changes,
- what success metric will validate it,
- what failure mode or review risk must be considered,
- and what approved user flow and screen intent it depends on.

## Anti-Patterns

Avoid:

- generic dashboard features not tied to localization,
- AI generation with no review controls,
- language workflows that hide blockers,
- export options that cannot be trusted in production,
- and interface decisions that optimize novelty over operational speed.
