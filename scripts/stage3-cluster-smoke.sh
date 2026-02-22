#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[stage3] repo: $ROOT_DIR"

# Test profile defaults (can override via env)
: "${CLUSTER_COUNT:=3}"
: "${CLUSTER_OFFSET_MIN:=2}"     # first event: now + offset
: "${CLUSTER_SPACING_MIN:=2}"    # between events
: "${CLUSTER_IMPACT:=High}"

# Ensure bridge reads from simulated_day.json
export CALENDAR_TEST_MODE="${CALENDAR_TEST_MODE:-true}"
export BRIDGE_CRON_INTERVAL_MS="${BRIDGE_CRON_INTERVAL_MS:-0}"

BACKUP_PATH="data/simulated_day.stage3.backup.json"
SOURCE_PATH="data/simulated_day.json"

if [[ ! -f "$BACKUP_PATH" ]]; then
  if [[ -f "$SOURCE_PATH" ]]; then
    cp "$SOURCE_PATH" "$BACKUP_PATH"
    echo "[stage3] backup created: $BACKUP_PATH"
  else
    echo "[stage3] no $SOURCE_PATH found; skipping backup"
  fi
else
  echo "[stage3] backup exists: $BACKUP_PATH"
fi

echo "[stage3] writing $SOURCE_PATH with cluster events..."
python3 - <<'PY'
import json
import os
import time
from datetime import datetime, timezone

def iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")

count = int(os.environ.get("CLUSTER_COUNT", "3") or "3")
offset_min = int(os.environ.get("CLUSTER_OFFSET_MIN", "2") or "2")
spacing_min = int(os.environ.get("CLUSTER_SPACING_MIN", "2") or "2")
impact = os.environ.get("CLUSTER_IMPACT", "High")

count = max(1, count)
offset_min = max(0, offset_min)
spacing_min = max(0, spacing_min)

now_ms = int(time.time() * 1000)
base_ms = now_ms + offset_min * 60 * 1000

events = []
for i in range(count):
    event_ms = base_ms + i * spacing_min * 60 * 1000
    name = f"Cluster Test {chr(65 + i)}"
    events.append({"name": name, "time": iso(event_ms), "impact": impact})

payload = {"start_time": iso(now_ms), "events": events}
out_path = os.path.join("data", "simulated_day.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2, ensure_ascii=False)

print("[stage3] written", out_path)
print(json.dumps(payload, indent=2, ensure_ascii=False))
PY

echo "[stage3] building bridge image (includes updated lib/volatility-compute with cluster logic)..."
docker compose build bridge --quiet

echo "[stage3] recreating bridge with CALENDAR_TEST_MODE=$CALENDAR_TEST_MODE BRIDGE_CRON_INTERVAL_MS=$BRIDGE_CRON_INTERVAL_MS"
CALENDAR_TEST_MODE="$CALENDAR_TEST_MODE" BRIDGE_CRON_INTERVAL_MS="$BRIDGE_CRON_INTERVAL_MS" docker compose up -d --force-recreate --no-deps bridge

echo "[stage3] pushing workflow JSON to n8n (via docker)..."
if ! docker compose run --rm -e N8N_BASE_URL="http://n8n:5678" -v "$(pwd):/app" -w /app bridge node scripts/push-volatility-workflow.js; then
  echo "[stage3] WARN: push workflow failed (likely missing N8N_API_KEY in .env)."
  echo "[stage3] You can still test if workflow is already updated, otherwise set N8N_API_KEY and rerun this script."
else
  echo "[stage3] activating workflow in n8n (via docker)..."
  if ! docker compose run --rm -e N8N_BASE_URL="http://n8n:5678" -v "$(pwd):/app" -w /app bridge node scripts/activate-volatility-workflow.js; then
    echo "[stage3] WARN: activate workflow failed (you can activate manually in n8n UI)."
  fi
fi

echo
echo "[stage3] READY."
echo "  - n8n UI: http://localhost:5678"
echo "  - Workflow: Volatility Window (should be Active ON)"
echo
echo "[stage3] Watch in real-time:"
echo "  - Feed sanity: curl -s http://localhost:3000/calendar-feed | head -n 60"
echo "  - Bridge logs: docker logs bridge -f"
echo
echo "[stage3] Expected (cluster):"
echo "  - context.cluster_size > 1"
echo "  - context.cluster_events lists all events"
echo "  - no extra phase flips like during_event -> pre_event between close events"
echo
echo "[stage3] Run ONCE; wait ~10 min for full cycle. Then: bash scripts/stage3-cluster-smoke-restore.sh"

