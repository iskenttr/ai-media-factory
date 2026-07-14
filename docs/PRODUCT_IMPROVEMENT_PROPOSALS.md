# AI Media Factory Product Improvement Proposals

This document outlines prioritized, high-value product improvements designed to optimize the end-to-end video localization pipeline. Every proposal conforms to the safety, validation, and deterministic standards set forth in the AI Media Factory Engineering Agent Constitution.

---

## Proposal 1: Context-Aware Terminology & Pronunciation Verification

### 1. Localization Step
- Step 3 (Source Script Cleanup)
- Step 5 (Generate Translations)
- Step 7 (Review and Approve)

### 2. User Roles
- Language Reviewers
- Media Localization Managers

### 3. Workflow Improvement & Target Value
Users currently lack a deterministic mechanism to enforce brand glossaries and regional pronunciation guidelines before voice dubbing synthesis or subtitle rendering. This proposal introduces an active Terminology Compliance Layer that flags non-compliant segments in both text and phonetic preview stages.

### 4. Success Metrics
- **Deterministic Metric**: Reduce the voice re-rendering rate due to incorrect pronunciation or brand-name mismatch by 40%.
- **Workflow Speed**: Shorten language reviewer editing cycles by 15% per localized language track.

### 5. Safety & System Boundaries
- Glossary data storage must remain separate from public translation models.
- Terminology validation is performed locally and deterministically via regex and tokenization engines without exposing pipeline state to unauthorized external APIs.

### 6. Validation & Testing Plan
- **Mock Fixtures**: Compile a test suite containing 10 target languages with 50 intentional brand deviations.
- **Deterministic Assertion**: Verify that the translation validation engine flags 100% of non-compliant terms with context suggestions.

---

## Proposal 2: Deterministic Subtitle Overflow & Visual Safe-Area Guardrails

### 1. Localization Step
- Step 6 (Generate Subtitles and Dubbed Tracks)
- Step 7 (Review Timing and Subtitles)

### 2. User Roles
- Content Operations Teams
- Language Reviewers

### 3. Workflow Improvement & Target Value
Provides immediate visual and structural feedback during translation editing. If a target-language translation exceeds safe physical dimensions or timing limits (e.g., characters-per-second, maximum line length, line-count overflows), the interface flags the error immediately instead of waiting for a full video render.

### 4. Success Metrics
- **Deterministic Metric**: 100% compliance with safe-area guidelines (e.g., Netflix/EBU-TT standards) before video export.
- **Workflow Speed**: Eliminate duplicate render-and-review loops triggered by subtitle geometry overflows.

### 5. Safety & System Boundaries
- All calculations (character counting, font metric bounds, reading speeds) must run locally in isolated sandboxes using pre-compiled native layouts.
- No model-guided estimations; boundaries must use strict, human-approved threshold parameters.

### 6. Validation & Testing Plan
- **Mock Fixtures**: Build synthetic JSON transcript sequences containing long Turkish or German compound strings exceeding 42 characters per line.
- **Deterministic Assertion**: Validate that the boundary engine rejects the sequence and returns exact visual offset failures.

---

## Proposal 3: Multi-Language Progress Auditing & Batch Compliance Dashboard

### 1. Localization Step
- Step 8 (Approve Each Language)
- Step 9 (Export Final Assets)

### 2. User Roles
- Media Localization Managers
- Content Operations Teams

### 3. Workflow Improvement & Target Value
Introduces an immutable, unified compliance manifest for every localization project. This dashboard visualizes the operational readiness of all targeted locales in a single pipeline view, ensuring that no partially reviewed video or incomplete translation can be triggered for batch asset compilation.

### 4. Success Metrics
- **Visibility Metric**: Reduce accidental or incomplete exports to absolute zero.
- **Workflow Speed**: Decrease time spent on manual progress tracking and email status verification by 50%.

### 5. Safety & System Boundaries
- The auditing dashboard must consume read-only status metrics.
- No production database mutations or direct write access to cloud deployment buckets may originate from the reporting view.

### 6. Validation & Testing Plan
- **Mock Fixtures**: Create a project state where 4 out of 5 languages are approved, and 1 language contains pending reviewer edits.
- **Deterministic Assertion**: Ensure the system blocks the global export action and generates an explicit progress-gap warning highlighting the missing locale's current state.
