#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8080}"

echo "[api-server-monitor] waiting for port $PORT (api-server is started by the fisiogest workflow)..."
for i in $(seq 1 240); do
  if curl -fsS --max-time 1 "http://127.0.0.1:$PORT/api/healthz" >/dev/null 2>&1 \
     || curl -fsS --max-time 1 "http://[::1]:$PORT/api/healthz" >/dev/null 2>&1; then
    echo "[api-server-monitor] api-server is responding on port $PORT (after ${i}s)"
    break
  fi
  if [ "$i" = "240" ]; then
    echo "[api-server-monitor] api-server not detected on port $PORT after 240s"
    echo "[api-server-monitor] (start fisiogest workflow to launch the api-server)"
  fi
  sleep 1
done

trap 'echo "[api-server-monitor] received signal — exiting"; exit 0' TERM INT

echo "[api-server-monitor] entering steady-state — periodic health checks every 30s"
while true; do
  if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/healthz" >/dev/null 2>&1 \
     || curl -fsS --max-time 2 "http://[::1]:$PORT/api/healthz" >/dev/null 2>&1; then
    echo "[api-server-monitor] $(date -u +%H:%M:%S) ok (port $PORT responding)"
  else
    echo "[api-server-monitor] $(date -u +%H:%M:%S) WARN port $PORT not responding"
  fi
  sleep 30
done
