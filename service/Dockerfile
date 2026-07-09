# docutract perception service — containerized deployment (P7.2).
#
# The constitution requires loopback-only reachability: publish with
#   docker run -p 127.0.0.1:8477:8477 docutract-service
# (DOCUTRACT_BIND_HOST=0.0.0.0 below is INSIDE the container only; the
# host-side publish rule above re-establishes loopback isolation.)
#
# Build from the repo root so the built UI can ride along:
#   bun run build   (or: npx vite build)
#   docker build -f service/Dockerfile -t docutract-service .

FROM python:3.12-slim

# opencv-python-headless runtime needs libglib only; all other wheels are
# self-contained (onnxruntime, zxing-cpp, pypdfium2 bundle their natives).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY service/ ./service/
COPY dist/ ./dist/
RUN pip install --no-cache-dir ./service

# Models are fetched at FIRST RUN by the console script (sha256-verified;
# refuses to serve unverified). Persist them across restarts with a volume:
#   docker run -v docutract-models:/models -e DOCUTRACT_MODEL_DIR=/models ...
ENV DOCUTRACT_MODEL_DIR=/models \
    DOCUTRACT_UI_DIR=/app/dist \
    DOCUTRACT_BIND_HOST=0.0.0.0 \
    DOCUTRACT_PROFILE=lite

EXPOSE 8477
VOLUME ["/models"]

CMD ["docutract-service"]
