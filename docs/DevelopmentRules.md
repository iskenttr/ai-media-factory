# Development Rules

## What These Rules Govern

These rules govern the implementation of AI Media Factory, an AI-powered video localization platform.
Engineering work must support a production workflow that handles source video ingestion, transcription, translation, dubbing, subtitles, review, and export without losing quality control.

## Engineering Priorities

- Protect the accuracy of source and target language content.
- Keep every localization job observable from upload to export.
- Build workflows that survive long-running media processing and partial failures.
- Preserve human review points for all publish-critical outputs.
- Optimize for predictable production operations, not demo behavior.

## Delivery Workflow

### 1. Before Building

Every task must identify:

- which localization stage it affects,
- which user role it serves,
- what output it changes,
- what failure mode it introduces or removes,
- how success will be measured,
- the intended user flow,
- and the approved wireframe or UX direction when the task changes the interface.

If a task cannot answer those five points, it is not ready.

### No Code Before UX

For any user-facing change, the sequence is mandatory:

1. User flow
2. Wireframe
3. Visual design
4. Code

Engineering must not implement screens, interactions, or navigation changes before UX intent is explicit and reviewable.

### 2. During Implementation

- Keep pipeline state explicit in code and UI contracts.
- Separate media processing concerns from user-facing review concerns.
- Prefer deterministic workflows over hidden automation chains.
- Treat retries, cancellations, and partial completion as first-class cases.
- Do not merge AI-generated output into approved output automatically.

### 3. Before Merge

- Run relevant tests for the affected localization stage.
- Validate success and failure paths for async processing.
- Confirm that state transitions remain visible to the user.
- Check auditability for generated versus human-edited output.
- Update docs if terminology, workflow, or approval logic changed.

## Architecture Rules

### Pipeline Modeling

- Model the platform around explicit stages: upload, transcript, translation, dubbing, subtitles, review, export.
- Each stage must have clear input, output, status, and error states.
- Avoid ambiguous global statuses like "processing" when the exact stage can be named.

### Data Integrity

- Preserve source transcript history and target-language revision history.
- Do not overwrite approved content silently.
- Track lineage between source segment, translated segment, subtitle segment, and dubbed segment when possible.

### Service Boundaries

- Keep media processing jobs, localization data, review interfaces, and export generation logically separated.
- External AI providers must be abstracted cleanly so provider changes do not rewrite product workflows.
- Job orchestration should be robust to retries and out-of-order completion.

## Code Quality Standards

- Names should reflect localization concepts clearly.
- Comments should explain workflow or risk, not obvious syntax.
- Avoid generic naming like `item`, `data`, or `result` when the object is actually a transcript segment, target-language draft, or dubbing render.
- Remove dead workflow paths instead of leaving uncertain states in production code.

## Testing Rules

- Transcription flows need coverage for success, failure, retry, and correction states.
- Translation flows need coverage for per-language generation and editing behavior.
- Dubbing and subtitle flows need coverage for render state handling and export eligibility.
- Approval logic needs automated protection so unreviewed assets cannot appear export-ready by mistake.
- Export flows need smoke coverage for each output type we support.

Minimum expectation before release:

- new localization logic is tested,
- async job failures are re-verified,
- approval gates are checked,
- and at least one end-to-end source-to-export path is validated when the risk is high.

## UX Implementation Rules

- Never hide the current localization stage.
- Always show per-language status where relevant.
- Source and target content must remain traceable in the interface.
- Users must be able to tell what AI generated and what a human changed.
- Processing, blocked, review-needed, approved, and exported states must all have distinct behavior.
- First-impression screens must reduce choices to the single most important next action whenever focus is the primary UX goal.

## Performance Rules

- Prioritize responsiveness in transcript and subtitle editing views.
- Long-running generation jobs must not freeze the product experience.
- Optimize preview loading for video-heavy workflows.
- Measure queue time, processing time, and export time for critical stages.

## Security And Privacy Rules

- Treat uploaded media and generated language assets as sensitive production material.
- Never expose customer video, transcripts, or voice outputs through insecure logging or debugging paths.
- Apply least privilege to media access, export access, and review permissions.
- Handle third-party AI service payloads carefully and intentionally.

## Observability Rules

- Every localization job needs a visible lifecycle.
- Logs and events should identify the project, language, stage, provider call if relevant, and failure type.
- Operators must be able to diagnose whether a problem occurred in upload, transcript, translation, dubbing, subtitle, review, or export.
- Silent degradation of output quality is not acceptable.

## Git And Review Rules

- Pull requests must state which localization stage is affected.
- Reviewers should check correctness, stage safety, data lineage, and approval risk before style concerns.
- Large changes that affect multiple pipeline stages should be split unless impossible.
- Risk to publish quality must be called out explicitly in PR descriptions.

## Documentation Rules

- Update `/docs` whenever localization workflow rules or product terminology change.
- Record major technical decisions around media processing, provider integration, or approval architecture.
- Keep naming consistent with the product language defined in the docs: transcript, translation, dubbing, subtitles, review, export.

## Definition Of Done

Work is done only when:

- the affected localization stage behaves correctly,
- state transitions are clear,
- failure cases are handled,
- approval logic remains trustworthy,
- tests are appropriate to the risk,
- observability is sufficient,
- and the change is safe for production media workflows.

## Escalation Triggers

Pause and realign before continuing when:

- a change weakens transcript or translation accuracy controls,
- AI output is being auto-approved without explicit product intent,
- export can include unreviewed or blocked language assets,
- provider limitations force a visible product compromise,
- or the workflow becomes less understandable for localization teams.
