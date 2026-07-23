import json
import sys

import sherpa_onnx
import soundfile as sf


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit(
            "usage: run_diarization.py SEGMENTATION_MODEL EMBEDDING_MODEL AUDIO_PATH"
        )
    segmentation_model, embedding_model, audio_path = sys.argv[1:]
    config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                model=segmentation_model
            )
        ),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(
            model=embedding_model
        ),
        clustering=sherpa_onnx.FastClusteringConfig(
            num_clusters=-1,
            threshold=0.5,
        ),
        min_duration_on=0.3,
        min_duration_off=0.5,
    )
    if not config.validate():
        raise RuntimeError("sherpa_onnx_diarization_config_invalid")
    diarizer = sherpa_onnx.OfflineSpeakerDiarization(config)
    audio, sample_rate = sf.read(audio_path, dtype="float32", always_2d=True)
    if sample_rate != diarizer.sample_rate:
        raise RuntimeError(
            f"sherpa_onnx_sample_rate_mismatch:{sample_rate}:{diarizer.sample_rate}"
        )
    result = diarizer.process(audio[:, 0]).sort_by_start_time()
    print(json.dumps({
        "providerVersion": "sherpa-onnx-pyannote-segmentation-3.0-3dspeaker-v1",
        "segments": [
            {
                "speaker": segment.speaker,
                "start": float(segment.start),
                "end": float(segment.end),
            }
            for segment in result
            if segment.end > segment.start
        ],
    }))


if __name__ == "__main__":
    main()
