# Research Survey: Open-Source AI Dubbing & Lip-Sync Frameworks

This survey evaluates open-source lip-sync and talking-head models for integration into the AI Media Factory video localization pipeline (targeting Turkish-language localized video rendering).

---

## Critical Licensing & Policy Notice

> [!IMPORTANT]
> **WAV2LIP IS BLOCKED FOR USE.**
> **Reasoning:** Wav2Lip is trained on the LRS2 dataset, which has non-commercial constraints. The licensing terms of the dataset and the original repository make Wav2Lip non-compliant with commercial/permissive production environments. It is strictly blocked from integration in the AI Media Factory pipeline.

---

## Evaluated Frameworks

### 1. MuseTalk
- **License:** Apache 2.0 (Permissive)
- **Core Mechanics:** Real-time lip-syncing model that modifies the mouth area of a target input video based on input audio. It employs latent coordinate attention mechanisms.
- **Performance & VRAM:** Achieves ~30 frames per second (real-time) during inference. Requires approximately **8GB VRAM**, making it highly viable for cost-effective single-node deployment architectures.
- **Quality:** High visual fidelity with stable face structures. The localized mouth area merges seamlessly with the original face under moderate head pose variations.
- **Integration Difficulty:** Moderate. Requires preprocessing of video to align faces (using landmarks) and feed latent coordinates to the model.
- **Production Readiness:** High. The permissive license combined with fast inference speeds and low resource overhead makes it the primary candidate.

### 2. LatentSync 1.5
- **License:** Apache 2.0 (Permissive)
- **Core Mechanics:** Audio-guided lip-sync using a latent diffusion framework. It integrates audio features directly into the UNet denoiser.
- **Performance & VRAM:** Higher computational demands. Training/fine-tuning requires **20GB VRAM** or more (e.g., enterprise GPUs like A10G/A100). Inference can run on lower-tier cards but is slower than real-time (~10-15fps depending on resolution).
- **Quality:** Outstanding temporal consistency and highly realistic mouth shapes. Diffusion steps reduce artifacting commonly seen in traditional GANs.
- **Integration Difficulty:** High. Pipeline requires diffusion scheduling, stable audio-visual embedding pipelines, and post-processing filters.
- **Production Readiness:** Medium. Extremely high-quality results, but constrained by higher processing latency and infrastructure costs.

### 3. SadTalker
- **License:** MIT (Permissive)
- **Core Mechanics:** Talking-head generation from a single static reference image and an audio file. Generates realistic 3D motion coefficients (head pose, expression, blink) and renders via a neural network.
- **Performance & VRAM:** Low computational overhead for single frame generation. Requires **~4-6GB VRAM** for basic inference.
- **Quality:** High quality for static-image inputs. However, it is not designed to modify pre-existing, continuous high-motion speaker footage natively.
- **Integration Difficulty:** Low to Moderate. Clean API for generating a video from a portrait image and localized Turkish audio file.
- **Production Readiness:** Medium. Suitable specifically for static-avatar localization pipelines, but not directly applicable to continuous multi-person cinematic video streams.

---

## Comparative Analysis

| Framework | License | Quality | Min VRAM (Inference) | Real-time? | Primary Constraint |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MuseTalk** | Apache 2.0 | High | ~8 GB | Yes (30fps) | Face cropping/alignment bounds |
| **LatentSync 1.5** | Apache 2.0 | Excellent | ~12 GB (20GB for train) | No | High computational cost |
| **SadTalker** | MIT | Good (Avatar) | ~6 GB | No | Restricted to static source images |
| **Wav2Lip** | Non-Comm. | Moderate | ~4 GB | Yes | **Blocked (LRS2 Licensing)** |

---

## Recommended Integration Sequence

To systematically introduce lip-sync rendering capabilities safely into the single-node AI Media Factory worker without destabilizing the current subtitle validation flow, we propose the following phased approach:

```text
Phase 1: Foundation (MuseTalk) -> Phase 2: High-Fidelity Option (LatentSync) -> Phase 3: Avatar Mode (SadTalker)
```

### Phase 1: Prototype and Establish MuseTalk Pipeline (Short-term)
- **Action:** Develop a containerized pipeline inside a sandbox executing `MuseTalk`. Set up face landmark detection and crop/bounding preprocessing helpers.
- **Rationale:** Offers the highest ROI due to low VRAM usage (8GB), 30fps real-time inference, and commercial-friendly Apache 2.0 license. This fits the current single-concurrency worker architecture perfectly.
- **Validation:** Measure structural face drift and alignment accuracy using SSIM/PSNR benchmarks on localized test fixtures.

### Phase 2: Add LatentSync 1.5 as High-Quality Offline Renderer (Medium-term)
- **Action:** Build a secondary adapter implementing `LatentSync 1.5`. Since inference is slower than real-time, wrap it in a background job queue with progressive progress reporting.
- **Rationale:** Useful for premium localization pipelines where render speed is secondary to absolute photorealism and temporal diffusion consistency.

### Phase 3: Implement SadTalker for Avatar Generation (Long-term)
- **Action:** Add support for static-image source assets (e.g., localizing training videos or slide-based presentations using static avatars).
- **Rationale:** Completes the audio-to-video capabilities of the factory while keeping footprint low.

