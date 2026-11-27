#!/usr/bin/env bash
# Regenerates docs/assets/screenshots/*.png and docs/assets/demo.{mp4,gif}.
# Run from the repo root via `make screenshots`. Needs Docker, Go and Bun.
#
#   SKIP_BUILD=1     reuse ./dist/kpanel
#   ONLY=demo|shots  run one half of shoot.ts
#   KEEP_KAFKA=1     leave the throwaway broker running afterwards
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/scripts/screenshots"
SFW="${SFW-sfw}"
BROKER="localhost:19092"
PORT="${KPANEL_PORT:-18080}"
COMPOSE=(docker compose -p kpanel-screenshots -f "$HERE/compose.yml")

WORK="$(mktemp -d)"
PIDS=()
cleanup() {
  for pid in ${PIDS[@]+"${PIDS[@]}"}; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  [ -n "${KEEP_KAFKA:-}" ] || "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

cd "$ROOT"

if [ -z "${SKIP_BUILD:-}" ]; then
  echo "==> building kpanel"
  # Pin the version so nothing version-dependent changes between runs.
  make build SFW="$SFW" VERSION=v0.0.0-docs >/dev/null
fi

echo "==> installing screenshot tooling"
(cd "$HERE" && $SFW bun install --frozen-lockfile >/dev/null && bun x playwright install chromium >/dev/null)

echo "==> starting throwaway Kafka on $BROKER"
"${COMPOSE[@]}" down -v >/dev/null 2>&1 || true
"${COMPOSE[@]}" up -d --wait >/dev/null

echo "==> seeding"
(cd server/cmd/kafkaseed && go build -o "$WORK/kafkaseed" .)
"$WORK/kafkaseed" --broker "$BROKER" >"$WORK/seed.log" 2>&1 || { cat "$WORK/seed.log"; exit 1; }

# One generic connection; no AWS config so nothing from the host's
# ~/.aws shows up in the UI.
mkdir -p "$WORK/config"
cat >"$WORK/config/config.json" <<JSON
{"version":1,"clusters":[{"id":"prod-eu-west","name":"prod-eu-west","platform":"generic","color":"blue","brokers":["$BROKER"]}]}
JSON
touch "$WORK/aws-empty"

echo "==> starting kpanel on :$PORT"
env -u AWS_PROFILE -u AWS_REGION -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
  AWS_CONFIG_FILE="$WORK/aws-empty" AWS_SHARED_CREDENTIALS_FILE="$WORK/aws-empty" \
  KPANEL_CONFIG_DIR="$WORK/config" KPANEL_PORT="$PORT" KPANEL_NO_BROWSER=1 \
  ./dist/kpanel >"$WORK/kpanel.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 50); do
  curl -fsS "http://localhost:$PORT/api/connections" >/dev/null 2>&1 && break
  sleep 0.2
done

# Live traffic and running consumers for the lag pages and the demo. shoot.ts
# takes the static screenshots first, so it starts the traffic itself through
# this command once those are done.
export KPANEL_URL="http://localhost:$PORT"
export KPANEL_CLUSTER="prod-eu-west"
export TRAFFIC_CMD="$WORK/kafkaseed --broker $BROKER --traffic 15m"
export OUT_DIR="$ROOT/docs/assets"
export FFMPEG="$(command -v ffmpeg || (cd "$HERE" && bun -e 'console.log(require("@ffmpeg-installer/ffmpeg").path)'))"

echo "==> capturing"
(cd "$HERE" && bun shoot.ts)
