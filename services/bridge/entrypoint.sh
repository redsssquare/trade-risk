#!/bin/sh
set -e
# Чтобы процесс node мог писать в volume /app/bridge-state (создаётся с правами root)
mkdir -p /app/bridge-state
chown -R node:node /app/bridge-state 2>/dev/null || true
exec su-exec node "$@"
