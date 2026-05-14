#!/usr/bin/env bash
# Corner Streams — one-command local setup (macOS / Linux).
# Run from the repo root:  bash setup.sh
#
# What it does (idempotent — safe to re-run):
#   1. Verifies Python 3.11+, Node 18+, Yarn, MongoDB are installed
#   2. Creates backend/.env from .env.example (with a generated JWT_SECRET) if missing
#   3. Creates frontend/.env from .env.example if missing
#   4. Sets up backend Python venv + installs requirements.txt
#   5. Runs yarn install for the frontend
#   6. Prints the next-step command to start the app

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()  { echo -e "${GREEN}✓${NC} $1"; }
warn(){ echo -e "${YELLOW}!${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1"; exit 1; }

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "================================"
echo " Corner Streams — local setup"
echo "================================"

# ---------- 1. prerequisite check ----------
command -v python3 >/dev/null 2>&1 || err "python3 not found. Install Python 3.11+ from python.org"
command -v node    >/dev/null 2>&1 || err "node not found. Install Node 18+ from nodejs.org"
command -v yarn    >/dev/null 2>&1 || err "yarn not found. Run: npm install -g yarn"
PYV=$(python3 -c 'import sys;print(f"{sys.version_info[0]}.{sys.version_info[1]}")')
NODEV=$(node -v | sed 's/v//;s/\..*//')
[ "$NODEV" -ge 18 ] || err "Node $NODEV detected; need 18+"
ok "Python $PYV, Node $(node -v), Yarn $(yarn -v)"

if command -v mongosh >/dev/null 2>&1; then
  mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1 \
    && ok "MongoDB reachable on localhost:27017" \
    || warn "MongoDB is installed but not running. Start it (mac: 'brew services start mongodb-community')."
else
  warn "mongosh not found. If you're using MongoDB Atlas (cloud) this is fine — just paste the Atlas URL into backend/.env."
fi

# ---------- 2. backend/.env ----------
if [ -f "$ROOT/backend/.env" ]; then
  ok "backend/.env already exists (left untouched)"
else
  [ -f "$ROOT/backend/.env.example" ] || err "backend/.env.example missing — did you clone the corner_streams branch?"
  JWT=$(python3 -c "import secrets;print(secrets.token_urlsafe(48))")
  sed "s|replace_me_with_a_long_random_string_at_least_48_chars|$JWT|" "$ROOT/backend/.env.example" > "$ROOT/backend/.env"
  ok "backend/.env created (JWT_SECRET auto-generated)"
  warn "Default super admin password is 'Super@123' — change ADMIN_PASSWORD in backend/.env before sharing with anyone."
fi

# ---------- 3. frontend/.env ----------
if [ -f "$ROOT/frontend/.env" ]; then
  ok "frontend/.env already exists (left untouched)"
else
  [ -f "$ROOT/frontend/.env.example" ] || err "frontend/.env.example missing"
  cp "$ROOT/frontend/.env.example" "$ROOT/frontend/.env"
  ok "frontend/.env created (points to http://localhost:8001)"
fi

# ---------- 4. backend deps ----------
cd "$ROOT/backend"
if [ ! -d venv ]; then
  python3 -m venv venv
  ok "Python virtualenv created at backend/venv"
fi
# shellcheck disable=SC1091
source venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
ok "Backend dependencies installed"
deactivate

# ---------- 5. frontend deps ----------
cd "$ROOT/frontend"
yarn install --silent
ok "Frontend dependencies installed"

cd "$ROOT"

echo ""
echo "================================"
echo -e "${GREEN} Setup complete!${NC}"
echo "================================"
echo ""
echo "Next: start both servers with one command:"
echo ""
echo "    bash start.sh"
echo ""
echo "Or manually (in two separate terminals):"
echo "  Terminal A:  cd backend && source venv/bin/activate && uvicorn server:app --reload --port 8001"
echo "  Terminal B:  cd frontend && yarn start"
echo ""
echo "Then open  http://localhost:3000"
echo ""
echo "Demo logins (seeded automatically on first backend boot):"
echo "  super@cornerstreams.com  /  Super@123    (or whatever you set in backend/.env)"
echo "  admin@demo.school        /  Admin@123"
echo "  teacher@demo.school      /  Teacher@123"
echo "  parent@demo.school       /  Parent@123"
echo "  adaeze@demo.school       /  Student@123"
