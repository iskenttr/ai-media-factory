FROM debian:bookworm-slim AS whisper-builder
RUN apt-get update && apt-get install -y --no-install-recommends build-essential ca-certificates cmake git \
  && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/ggml-org/whisper.cpp.git /src/whisper.cpp \
  && cd /src/whisper.cpp && git checkout 7695a5331230c585f5ce92291c4256973985ae5a \
  && cmake -B build -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON \
  && cmake --build build --config Release -j2

FROM docker:29-cli AS docker-cli

FROM node:26-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg fontconfig fonts-dejavu-core libgomp1 sqlite3 tini \
  && rm -rf /var/lib/apt/lists/*
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=whisper-builder /src/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=whisper-builder /src/whisper.cpp/build/bin/lib*.so* /usr/local/lib/
RUN ldconfig \
  && ln -s /usr/bin/ffmpeg /usr/local/bin/ffmpeg \
  && ln -s /usr/bin/ffprobe /usr/local/bin/ffprobe
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
