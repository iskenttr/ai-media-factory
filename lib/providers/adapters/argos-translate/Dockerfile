FROM python:3.11-slim

# Argos imports its sentence splitter lazily; installing the full stanza extra would
# pull GPU-enabled PyTorch, which is unnecessary for the CTranslate2 CPU runtime.
RUN pip install --no-cache-dir --no-deps argostranslate==1.9.6 \
  && pip install --no-cache-dir ctranslate2==4.8.1 sacremoses==0.0.53 sentencepiece==0.2.0 packaging pyyaml requests
COPY translate.py /app/translate.py
COPY stanza.py /app/stanza.py

ENTRYPOINT ["python", "/app/translate.py"]
