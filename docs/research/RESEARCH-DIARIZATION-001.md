# Research Report: Speaker Diarization Upgrade Paths (RESEARCH-DIARIZATION-001)

## Executive Summary

This survey evaluates potential replacements for the legacy `pyannote-speaker-diarization-community-1` adapter in the AI Media Factory pipeline. We compare **pyannote.audio 3.1**, **DiariZen/BUTSpeechFIT**, and **NVIDIA NeMo** on accuracy (DER), licensing, integration complexity, runtime resource constraints, and suitability for our single-concurrency worker architecture.

---

## Comparative Evaluation Matrix

| Metric / Dimension | pyannote.audio 3.1 | DiariZen / BUTSpeechFIT | NVIDIA NeMo (Parakeet-TDT v3) |
| :--- | :--- | :--- | :--- |
| **Primary License** | MIT | MIT | Apache 2.0 |
| **Model Weights License** | CC-BY-4.0 | MIT / Apache 2.0 (WavLM/Conformer) | Apache 2.0 |
| **Diarization Error Rate (DER)** | ~11% - 19% on AMI benchmark | ~13.3% on AMI | **Highly variable** (~10% - 14% AMI depending on tuning) |
| **GPU / Compute Target** | CPU-friendly; GPU-accelerated | Heavily benefits from GPU | Mandatory GPU for viable execution |
| **Speed (Real-time factor)** | ~5x to 15x RT (on CPU/GPU) | ~3x to 8x RT (GPU) | **~80x RT (on T4/L4 GPU)** |
| **Integration Model** | In-process Python API | In-process Python API | Subprocess CLI or Triton / gRPC Client |
| **Dependency Footprint** | Moderate (PyTorch, SpeechBrain) | High (Fairseq, WavLM, Conformer) | Extremely Heavy (NeMo Core, PyTorch Lightning) |
| **Hugging Face Token Req.** | Yes (for gated weight access) | No | No |

---

## Deep-Dive Analysis

### 1. pyannote.audio 3.1
* **Overview:** The de facto standard in open-source diarization, delivering excellent balance out of the box.
* **Accuracy:** DER of ~11-19% on AMI corpus. Highly robust to room acoustics and overlapping speech.
* **GPU Requirements:** Extremely flexible. Can run in-process on CPU within bounded container workloads, though execution speeds scale linearly with a CUDA device.
* **Integration Complexity:** Low-to-medium. Operates as an in-process library. Uses Python pipelines directly via simple API wrappers.
* **Key Risks:** Requires a Hugging Face user access token accepted for gated weights (`pyannote/speaker-diarization-3.1`), adding runtime configuration complexity.

### 2. DiariZen / BUTSpeechFIT
* **Overview:** A leading-edge research combination utilizing WavLM-Large for representation and Conformer-based neural diarization.
* **Accuracy:** Excellent benchmark DER (~13.3% on AMI dataset), exhibiting competitive performance against commercial offerings.
* **GPU Requirements:** High. The combination of large WavLM backbones and conformer networks results in high VRAM utilization during inference.
* **Integration Complexity:** High. Relies on complex downstream repository dependencies (Fairseq, custom transformers/conformer configurations) which often trigger dependency pin conflicts in production environments.
* **Key Risks:** Less packaged than pyannote; upgrading pipelines or adapting models requires hand-rolled processing scripts and lacks automated hub loading.

### 3. NVIDIA NeMo (with Parakeet-TDT v3)
* **Overview:** Enterprise-grade, GPU-optimized speech and diarization framework designed for high-throughput workloads.
* **Accuracy:** State-of-the-art DER when fine-tuned; heavily optimized for fast real-time transcription and diarization correlation.
* **GPU Requirements:** Strict. Non-viable on standard CPU targets; optimized specifically for CUDA/TensorRT acceleration.
* **Integration Complexity:** Extremely high. The NeMo dependency tree is massive and prone to compiler mismatches during installation.
* **Execution Architecture:** Subprocess / External Service. Running NeMo in-process inside our lightweight worker is highly discouraged. The recommended path is running it in a detached container or calling it as an external microservice via Triton/gRPC.

---

## Architecture & Execution Strategy

### Subprocess vs. In-Process execution

* **In-Process Integration (e.g., pyannote.audio 3.1):** 
  * *Pros:* Directly integrated into our single-concurrency queue; zero external daemon dependencies; minimal IPC serialization cost.
  * *Cons:* Memory footprint is bound to the parent worker process. If a model segmentation segmentation-faults, it crashes the active node. 
* **Subprocess Execution (e.g., NeMo CLI or Python wrapper):**
  * *Pros:* Complete process isolation; crash safety (failures are caught via exit codes); clean memory release upon task completion.
  * *Cons:* Higher overhead for tiny files; requires strict execution sandboxing to respect our security boundaries.

---

## Recommended Upgrade Path

We recommend a phased transition from `pyannote-speaker-diarization-community-1` to **pyannote.audio 3.1** as the default engine, with an optional **NVIDIA NeMo** integration route for high-throughput GPU-enabled installations.

### Phase 1: Upgrade to pyannote.audio 3.1 (Default Mode)
Maintain our current in-process/subprocess Python adapter model but upgrade the underlying model weights and library to `pyannote.audio 3.1`. This preserves compatibility on single-node CPU-only platforms while boosting precision. 

### Phase 2: High-Accuracy & High-Throughput Selector
Introduce a high-accuracy and performance mode selector in our provider contract. This allows deployments on GPU hardware to switch to **NVIDIA NeMo** or specialized pyannote CUDA pipelines.

```typescript
// Proposed update to lib/providers/contracts/speaker-analysis-provider.ts
export type DiarizationMode = 'balanced' | 'high-accuracy';

export interface DiarizationOptions {
  mode?: DiarizationMode;
  gpuFallback?: boolean;
}
```

### Infrastructure & Runtime Impact
1. **Hugging Face Authentication:** A secure runtime environment variable (`HF_TOKEN`) must be added to the worker container configuration, avoiding hardcoding in any adapter configurations or settings files.
2. **Resource Limits:** Docker container memory allocations must be adjusted to safely support the ~1.5 GB to 3.0 GB resident memory requirements during concurrent transcription/diarization segments.
