# RESEARCH-TTS-001: Open-Source TTS & Voice Cloning for Turkish Dubbing

## Overview
This document evaluates open-source Text-to-Speech (TTS) and zero-shot voice cloning engines to establish a high-quality, localizable dubbing pipeline for the AI Media Factory system. Turkish language support, licensing compliance, resource utilization, and zero-shot synthesis quality are the primary dimensions analyzed.

---

## Candidate Evaluation

### 1. Coqui XTTS-v2
- **License**: Mozilla Public License 2.0 (MPL-2.0)
- **Turkish Support**: Explicit native support included in its 17-language multi-lingual model.
- **Zero-Shot Voice Cloning**: High-quality timbre and emotion transfer.
- **Reference Audio Length**: 3 to 10 seconds of clean audio is optimal.
- **Inference Latency**: 
  - **GPU**: High performance (~1.5x real-time factor or better on modern NVIDIA GPUs).
  - **CPU**: Moderately slow; struggles on standard CPU cores without substantial quantization or threading adjustments.
- **Evaluation**: Excellent match for Turkish pronunciation; MPL-2.0 licensing is permissive and compliant with commercial distribution boundaries.

### 2. CosyVoice 2.0
- **License**: Apache 2.0
- **Turkish Support**: Multilingual capabilities, but Turkish synthesis requires careful phonetic mapping or custom fine-tuning as Turkish is not natively prioritized in default zero-shot weights.
- **Zero-Shot Voice Cloning**: State-of-the-art multi-modal capabilities with high naturalness and custom controls.
- **Reference Audio Length**: 3 to 15 seconds.
- **Inference Latency**:
  - **GPU**: Outstanding latency using stream-capable autoregressive architectures.
  - **CPU**: Heavy; primarily optimized for CUDA environments.
- **Evaluation**: Highly robust and permissive license, but Turkish pronunciation precision falls behind XTTS-v2 without custom pronunciation dictionaries.

### 3. F5-TTS
- **License**: Non-commercial license (CC-BY-NC-4.0)
- **Licensing Risk**: **CRITICAL RISK**. The CC-BY-NC-4.0 license prevents commercial usage of the model weights and code in a production environment without special arrangements. This violates our standard permissive repository boundaries.
- **Turkish Support**: Multilingual support via Flow Matching, though Turkish naturalness is secondary to English and Chinese.
- **Zero-Shot Voice Cloning**: Very high similarity score and excellent handling of short, noisy reference audio.
- **Reference Audio Length**: 3 to 10 seconds.
- **Inference Latency**:
  - **GPU**: Fast sampling speeds due to ODE solvers.
  - **CPU**: High resource footprint; unoptimized for single-concurrency CPU workers.
- **Evaluation**: Highly capable but disqualified from primary consideration due to licensing constraints.

### 4. Kokoro-82M
- **License**: Apache 2.0
- **Turkish Support**: Unofficial or limited direct Turkish support in the base 82M checkpoint, requiring custom G2P (Grapheme-to-Phoneme) and voice building.
- **Zero-Shot Voice Cloning**: Lightweight voice mixing and clone adaptation, but lacks robust zero-shot multi-speaker cloning from a raw audio file compared to XTTS-v2.
- **Reference Audio Length**: N/A (requires pre-extracted style vectors or model-fine-tuning adaptation).
- **Inference Latency**:
  - **GPU**: Instantaneous latency (< 0.1 RTF).
  - **CPU**: Extremely fast and lightweight. Easily runs on single-core setups using ONNX Runtime.
- **Evaluation**: Perfect for high-efficiency scenarios, but insufficient zero-shot capability and native Turkish support out-of-the-box.

---

## Technical Metrics Comparison Matrix

| Metric / Feature | Coqui XTTS-v2 | CosyVoice 2.0 | F5-TTS | Kokoro-82M |
| :--- | :--- | :--- | :--- | :--- |
| **License** | MPL-2.0 | Apache 2.0 | CC-BY-NC-4.0 (Risk) | Apache 2.0 |
| **Turkish Quality** | High (Explicit) | Moderate | Moderate | Low (Requires G2P) |
| **Zero-Shot Cloning**| Excellent | Excellent | Outstanding | Limited |
| **Reference Audio** | 3 - 10 seconds | 3 - 15 seconds | 3 - 10 seconds | N/A |
| **GPU Performance** | Fast | Very Fast | Fast | Instant |
| **CPU Performance** | Slow | Slow | Very Slow | Extremely Fast |
| **Primary Constraint**| Project unmaintained | Multilingual accent | Commercial Use Block | Missing Turkish base |

---

## Recommendations for AI Media Factory Pipeline

### Primary Adapter: `Coqui XTTS-v2`
- **Rationale**: Direct, built-in support for Turkish paired with an open-source permissive license (MPL-2.0) makes this the absolute best candidate for the localization engine. It handles Turkish semantic nuances, syllable lengths, and punctuation-based pacing without custom phonemizers.
- **Integration Strategy**: Create a Python-based worker adapter under `lib/providers/adapters/xtts` exposing standard audio output paths to the render pipeline.

### Fallback Adapter: `CosyVoice 2.0`
- **Rationale**: Apache 2.0 compliant and offers state-of-the-art voice reconstruction. If XTTS-v2 exhibits synthesis failures or unresolvable artifacts on specific source speakers, CosyVoice 2.0 provides an alternative pipeline, subject to phonetic validation filters in the Subtitle Quality Engine.
- **Integration Strategy**: Integrate via a local container or standalone Python API utilizing ONNX/TensorRT acceleration where available.

---
*Prepared in accordance with the AI Media Factory Engineering Agent Constitution.*
