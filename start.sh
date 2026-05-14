#!/usr/bin/env bash
# Corner Streams — start backend + frontend together (macOS / Linux).
# Press Ctrl+C once to stop both.

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

[ -f backend/.env ]  || { echo "Run 'bash setup.sh' first."; exit 1; }
[ -f frontend/.env ] || { echo "Run 'bash setup.sh' first."; exit 1; }

cleanup() {
  echo ""
  echo "Stopping…"
  [ -n "${BPID:-}" ] && kill "$BPID" 2>/dev/null || true
  [ -n "${FPID:-}" ] && kill "$FPID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo "Starting backend on http://localhost:8001 …"
( cd backend && source venv/bin/activate && uvicorn server:app --reload --host 0.0.0.0 --port 8001 ) &
BPID=$!

sleep 3

echo "Starting frontend on http://localhost:3000 …"
( cd frontend && yarn start ) &
FPID=$!

echo ""
echo "Both services running. Open http://localhost:3000 — Ctrl+C here stops both."
wait
