import json
import sys

from pyannote.audio import Pipeline


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: run_diarization.py MODEL_PATH AUDIO_PATH")

    model_path, audio_path = sys.argv[1:]
    pipeline = Pipeline.from_pretrained(model_path)
    output = pipeline(audio_path)
    diarization = getattr(output, "exclusive_speaker_diarization", None)
    if diarization is None:
        diarization = output.speaker_diarization

    segments = [
        {"speaker": speaker, "start": float(turn.start), "end": float(turn.end)}
        for turn, _, speaker in diarization.itertracks(yield_label=True)
        if turn.end > turn.start
    ]
    print(json.dumps({"providerVersion": "community-1", "segments": segments}))


if __name__ == "__main__":
    main()
