# Research: External Subtitle Quality Evaluation Tools

## Executive Summary

This survey evaluates three open-source subtitle quality metric frameworks as candidates to complement the existing deterministic TypeScript Subtitle Quality Engine: **SubER** (AppTek), **EvalSubtitle/Sigma** (Fyvo), and **SubSonar** (HLT-MT). 

Our current Subtitle Engine is highly competent at deterministic physical validation (CPS, overlap, duration, line length, clitic safety). However, it lacks systemic semantic similarity evaluation, translation edit distance scoring, and automated reference-alignment capabilities required for continuous integration (CI) benchmark loops.

---

## Technical Profile: SubER

*   **Source Repository / Author:** AppTek / `apptek/suber`
*   **License:** Apache License 2.0
*   **Core Metrics:** Segmentation-aware and timing-aware Translation Edit Rate (TER), Word Error Rate (WER), BLEU.
*   **What it Measures:** Measures the distance between automated subtitle output (hypothesis) and a human reference subtitle (reference). Unlike standard TER/WER which ignore block layouts, SubER penalizes alignment shifts, incorrect line breaks, and split errors.
*   **Contrast with Existing Engine:** 
    *   *Existing Engine:* Performs static bounds, timing checks (CPS, gaps, overlaps) on isolated candidate JSONs.
    *   *SubER:* Evaluates temporal alignment, semantic sequence integrity, and structural segmentation over entire files simultaneously using dynamic programming matching.
*   **Integration Point:** Benchmark Harness. Ideal for offline pipeline tests against golden reference files (`.srt`).
*   **Installation Command:**
    ```bash
    pip install suber
    ```

---

## Technical Profile: EvalSubtitle / Sigma

*   **Source Repository / Author:** Fyvo / `fyvo/EvalSubtitle` (often packaged with Sigma metric tools)
*   **License:** Apache License 2.0
*   **Core Metrics:** Segmentation Quality Score, boundary precision/recall, and layout preservation metrics.
*   **What it Measures:** Evaluates how closely a subtitle model's structural decisions match natural grammatical and breath boundaries of the reference audio/transcript. It highlights broken syntactic phrases and orphan words.
*   **Contrast with Existing Engine:**
    *   *Existing Engine:* Enforces hard binary constraints on Turkish clitics, line lengths, and max line count.
    *   *EvalSubtitle/Sigma:* Provides a mathematical score of segmentation similarity, showing how closely the semantic distribution of cues mirrors human-expert chunking strategy.
*   **Integration Point:** Benchmark Harness (CI validation) and occasionally in a decoupled staging validation harness.
*   **Installation Command:**
    ```bash
    pip install evalsubtitle
    ```

---

## Technical Profile: SubSonar

*   **Source Repository / Author:** HLT-MT / `hlt-mt/subsonar`
*   **License:** Apache License 2.0
*   **Core Metrics:** Multi-lingual Semantic Similarity utilizing SONAR (Sentence-level mUltilingual seNtence representAtions) and LASER/mBERT embedding spaces.
*   **What it Measures:** Semantic equivalence of multi-lingual translations at the subtitle unit scale. It evaluates translation accuracy independently of direct lexical overlaps (WER/TER), making it robust to synonym replacement and sentence restructuring.
*   **Contrast with Existing Engine:**
    *   *Existing Engine:* Completely blind to meaning and translation accuracy; only checks structure, speed, and typography.
    *   *SubSonar:* Validates that the underlying meaning of the Turkish translated cues matches the source language transcript semantic intent.
*   **Integration Point:** Benchmark Harness / Offline evaluation. Too compute-heavy (requires GPU or PyTorch CPU inference) for hot path production rendering loops.
*   **Installation Command:**
    ```bash
    pip install subsonar-eval
    ```

---

## Comparison Matrix

| Metric Framework | Primary Metric | Input Formats | Primary Focus | Compute Cost |
| :--- | :--- | :--- | :--- | :--- |
| **SubER** | Edit-distance (TER/WER) | `.srt`, `.vtt` | Layout & timing shifts | Low (CPU-only) |
| **EvalSubtitle** | Boundary overlap/F1 | `.srt`, `.json` | Segmentation correctness | Low (CPU-only) |
| **SubSonar** | Semantic Cosine Distance | `.srt`, `.txt` | Translation fidelity | High (PyTorch/GPU) |

---

## Recommendation for CI Adoption

We recommend adopting **SubER** as the primary CI benchmark metric.

### Justification
1. **Robustness to Subtitle constraints:** Standard WER/BLEU do not account for where subtitles are cut. SubER natively handles time-alignment and split-discrepancies, penalizing structural splits that break readability.
2. **Resource Efficiency:** Unlike SubSonar, SubER operates efficiently on CPU without requiring heavy neural networks or custom CUDA environments inside our sandboxed testing infrastructure.
3. **Deterministic Integration:** SubER's output can be easily serialized to JSON and integrated into our TypeScript metrics dashboard as a benchmark score.
4. **Workflow:** On each Pull Request, the CI pipeline can run the rendering pipeline on standard audio assets, produce `.srt` hypotheses, and run SubER against our standard golden `.srt` targets. Any sudden drop in SubER score below an established threshold (e.g., `< 0.15` edit rate) will block the build. 

### Proposed Implementation Roadmap
*   **Phase 1:** Install SubER into the sandbox environment.
*   **Phase 2:** Author a small wrapper runner that translates output scores into our benchmark payload formats.
*   **Phase 3:** Set a baseline threshold for Turkish models using historically validated perfect outputs.
