#!/usr/bin/env bash
# Regenerates docs/assets/screenshots/*.png and docs/assets/demo.{mp4,gif}.
# Run from the repo root via `make screenshots`. Needs Docker, Go and Bun.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/scripts/screenshots"
SFW="${SFW-sfw}"
BROKER="localhost:19092"
PORT=18080
COMPOSE=(docker compose -p kpanel-screenshots -f "$HERE/compose.yml")
WORK="$(mktemp -d)"

cleanup() {
  kill $(jobs -p) 2>/dev/null && wait 2>/dev/null || true
  "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

cd "$ROOT"

echo "==> building"
make build SFW="$SFW" VERSION=v0.0.0-docs >/dev/null
(cd server/cmd/kafkaseed && go build -o "$WORK/kafkaseed" .)
(cd "$HERE" && $SFW bun install --frozen-lockfile >/dev/null && bun x playwright install chromium >/dev/null)

echo "==> starting Kafka on $BROKER and seeding"
"${COMPOSE[@]}" up -d --wait >/dev/null
"$WORK/kafkaseed" --broker "$BROKER" >/dev/null 2>&1

# One connection, and no AWS config so nothing from ~/.aws shows up.
mkdir -p "$WORK/config"
echo '{"version":1,"clusters":[{"id":"prod-eu-west","name":"prod-eu-west","platform":"generic","color":"blue","brokers":["'$BROKER'"]}]}' >"$WORK/config/config.json"
touch "$WORK/aws-empty"

echo "==> starting kpanel on :$PORT"
env -u AWS_PROFILE -u AWS_REGION -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
  AWS_CONFIG_FILE="$WORK/aws-empty" AWS_SHARED_CREDENTIALS_FILE="$WORK/aws-empty" \
  KPANEL_CONFIG_DIR="$WORK/config" KPANEL_PORT="$PORT" KPANEL_NO_BROWSER=1 \
  ./dist/kpanel >/dev/null 2>&1 &
# Checking for our broker also catches another kpanel already on $PORT.
until curl -fsS "http://localhost:$PORT/api/connections" 2>/dev/null | grep -q "$BROKER"; do sleep 0.2; done

echo "==> capturing"
KPANEL_URL="http://localhost:$PORT" \
TRAFFIC_CMD="$WORK/kafkaseed --broker $BROKER --traffic 15m" \
OUT_DIR="$ROOT/docs/assets" \
FFMPEG="$(cd "$HERE" && bun -e 'console.log(require("@ffmpeg-installer/ffmpeg").path)')" \
  bash -c 'cd "$0" && bun shoot.ts' "$HERE"
