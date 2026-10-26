#!/bin/sh
# Container command for Dockerfile.cloud. docker-entrypoint.sh has already waited
# for the database and applied migrations. The TTS service and the worker run in
# the background; the API is the main process and listens on Render's $PORT.
set -e

# Render sets RENDER_EXTERNAL_URL; SSLCommerz callbacks need the public https address.
export PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL:-$RENDER_EXTERNAL_URL}"

echo "Starting Gemini TTS/OCR service on 127.0.0.1:8001..."
(cd /srv/tts-service && exec uvicorn app.main:app --host 127.0.0.1 --port 8001) &

echo "Starting generation worker..."
python -m app.worker &

echo "Starting Platform API on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"
