#!/usr/bin/env bash
set -euo pipefail

PROFILE_NAME="${OPENCLAW_PROFILE:-n8n}"
PROFILE_DIR="/root/.openclaw-${PROFILE_NAME}"
TELEGRAM_PROFILE_PATH="${PROFILE_DIR}/telegram-profile.json"
GATEWAY_BIND="${OPENCLAW_GATEWAY_BIND:-lan}"
GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-bridge-runtime-token}"

mkdir -p "${PROFILE_DIR}"

# Ensure a minimal valid profile so gateway can start.
openclaw --profile "${PROFILE_NAME}" config set gateway.mode local >/dev/null

if [[ -n "${OPENCLAW_TELEGRAM_BOT_TOKEN:-}" ]]; then
  openclaw --profile "${PROFILE_NAME}" config set --json channels.telegram "{ enabled: true, botToken: \"${OPENCLAW_TELEGRAM_BOT_TOKEN}\", dmPolicy: \"open\", allowFrom: [\"*\"] }" >/dev/null
fi

if [[ -n "${OPENCLAW_TELEGRAM_BOT_TOKEN:-}" && -n "${OPENCLAW_TELEGRAM_CHAT_ID:-}" ]]; then
  cat <<EOF > "${TELEGRAM_PROFILE_PATH}"
{
  "bot_token": "${OPENCLAW_TELEGRAM_BOT_TOKEN}",
  "chat_id": "${OPENCLAW_TELEGRAM_CHAT_ID}"
}
EOF
  chmod 600 "${TELEGRAM_PROFILE_PATH}"
fi

exec openclaw --profile "${PROFILE_NAME}" gateway --bind "${GATEWAY_BIND}" --token "${GATEWAY_TOKEN}" --force
