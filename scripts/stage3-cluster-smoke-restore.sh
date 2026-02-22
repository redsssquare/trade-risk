#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_PATH="data/simulated_day.stage3.backup.json"
TARGET_PATH="data/simulated_day.json"

if [[ -f "$BACKUP_PATH" ]]; then
  cp "$BACKUP_PATH" "$TARGET_PATH"
  echo "[stage3:restore] restored $TARGET_PATH from $BACKUP_PATH"
else
  echo "[stage3:restore] backup not found: $BACKUP_PATH"
  echo "[stage3:restore] nothing to restore"
fi

export CALENDAR_TEST_MODE="${CALENDAR_TEST_MODE:-false}"
export BRIDGE_CRON_INTERVAL_MS="${BRIDGE_CRON_INTERVAL_MS:-30000}"

echo "[stage3:restore] recreating bridge with CALENDAR_TEST_MODE=$CALENDAR_TEST_MODE"
CALENDAR_TEST_MODE="$CALENDAR_TEST_MODE" BRIDGE_CRON_INTERVAL_MS="$BRIDGE_CRON_INTERVAL_MS" docker compose up -d --force-recreate --no-deps bridge

echo "[stage3:restore] done"

