FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir \
      --index-url https://download.pytorch.org/whl/cpu \
      torch==2.8.0 torchaudio==2.8.0 \
    && pip install --no-cache-dir -r /app/requirements.txt

COPY run_diarization.py /app/run_diarization.py

ENTRYPOINT ["python", "/app/run_diarization.py"]
