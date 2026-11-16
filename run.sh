#!/usr/bin/env bash
# ==============================================================================
# Sanad Local Full-Stack Runner (run.sh)
# Based on RUNBOOK.md — Starts Database, Langfuse, Backend (FastAPI), and Frontend (Vite)
#
# Notice: Sanad is a research prototype for men's reproductive health, not a
# medical device. Synthetic fixtures only; no real patient data or clinic transport.
# ==============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# ------------------------------------------------------------------------------
# Default Configuration & Credentials (Default password/key: 123456)
# ------------------------------------------------------------------------------
export DEFAULT_PASSWORD="${DEFAULT_PASSWORD:-123456}"
# Langfuse requires an admin password of at least 8 characters
export LANGFUSE_ADMIN_PASSWORD="${LANGFUSE_ADMIN_PASSWORD:-12345678}"

# Simulated Staff Console Passwords (demo-reviewer / demo-mock-facility)
export SANAD_DEMO_REVIEWER_PASSWORD="${SANAD_DEMO_REVIEWER_PASSWORD:-$DEFAULT_PASSWORD}"
export SANAD_DEMO_MOCK_FACILITY_PASSWORD="${SANAD_DEMO_MOCK_FACILITY_PASSWORD:-$DEFAULT_PASSWORD}"

# Local SQLite Case Database
export SANAD_DB_FILE="${SANAD_DB_FILE:-$REPO_ROOT/apps/api/sanad-dev.db}"
export SANAD_DATABASE_URL="${SANAD_DATABASE_URL:-sqlite:///$SANAD_DB_FILE}"

# Self-Hosted Langfuse Observability (content-free metadata only)
export LANGFUSE_DIR="${LANGFUSE_DIR:-$HOME/langfuse}"
export SANAD_LANGFUSE_ENABLED="${SANAD_LANGFUSE_ENABLED:-true}"
export LANGFUSE_BASE_URL="${LANGFUSE_BASE_URL:-http://localhost:3100}"
export LANGFUSE_PUBLIC_KEY="${LANGFUSE_PUBLIC_KEY:-pk-lf-$DEFAULT_PASSWORD}"
export LANGFUSE_SECRET_KEY="${LANGFUSE_SECRET_KEY:-sk-lf-$DEFAULT_PASSWORD}"

# Host & Port Settings
export API_HOST="${API_HOST:-127.0.0.1}"
export API_PORT="${API_PORT:-8000}"
export WEB_HOST="${WEB_HOST:-127.0.0.1}"
export WEB_PORT="${WEB_PORT:-3000}"

API_PID=""
WEB_PID=""

cleanup() {
  echo ""
  echo "[sanad] Stopping background processes..."
  if [[ -n "$WEB_PID" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
  fi
}

# ------------------------------------------------------------------------------
# 1. Environment & Database Initialization
# ------------------------------------------------------------------------------
setup_env_and_db() {
  echo "[sanad] 1/4 Preparing local environment & database..."

  # Create apps/api/.env from template if missing, and populate empty staff passwords with default 123456
  if [[ ! -f "$REPO_ROOT/apps/api/.env" ]] && [[ -f "$REPO_ROOT/apps/api/.env.example" ]]; then
    cp "$REPO_ROOT/apps/api/.env.example" "$REPO_ROOT/apps/api/.env"
    echo "[sanad] Created apps/api/.env from .env.example"
  fi

  if [[ -f "$REPO_ROOT/apps/api/.env" ]]; then
    sed -i.bak \
      -e "s|^SANAD_DEMO_REVIEWER_PASSWORD=$|SANAD_DEMO_REVIEWER_PASSWORD=${SANAD_DEMO_REVIEWER_PASSWORD}|" \
      -e "s|^SANAD_DEMO_MOCK_FACILITY_PASSWORD=$|SANAD_DEMO_MOCK_FACILITY_PASSWORD=${SANAD_DEMO_MOCK_FACILITY_PASSWORD}|" \
      "$REPO_ROOT/apps/api/.env"
    rm -f "$REPO_ROOT/apps/api/.env.bak"
  fi

  # Ensure Python virtualenv and API + observability packages are installed
  if [[ ! -x "$REPO_ROOT/apps/api/.venv/bin/python" ]]; then
    echo "[sanad] Creating Python virtual environment in apps/api/.venv..."
    python3 -m venv "$REPO_ROOT/apps/api/.venv"
  fi

  if ! "$REPO_ROOT/apps/api/.venv/bin/python" -c "import sanad_api, uvicorn, langfuse" >/dev/null 2>&1; then
    echo "[sanad] Installing Backend dependencies (apps/api[dev,observability])..."
    "$REPO_ROOT/apps/api/.venv/bin/python" -m pip install -e "$REPO_ROOT/apps/api[dev,observability]"
  fi

  # Bootstrap SQLite schema via SQLAlchemy Base.metadata.create_all
  "$REPO_ROOT/apps/api/.venv/bin/python" -c "
from sanad_api.main import create_app
create_app()
" >/dev/null
  echo "[sanad] Database ready at: $SANAD_DB_FILE"

  # Optional: Bootstrap separate PostgreSQL knowledge database if configured
  if [[ -n "${SANAD_KNOWLEDGE_DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
    echo "[sanad] Applying knowledge migration (knowledge/migrations/0001_init.sql)..."
    psql "$SANAD_KNOWLEDGE_DATABASE_URL" -f "$REPO_ROOT/knowledge/migrations/0001_init.sql" || true
  fi
}

# ------------------------------------------------------------------------------
# 2. Self-Hosted Langfuse (Docker Compose on http://localhost:3100)
# ------------------------------------------------------------------------------
start_langfuse() {
  echo "[sanad] 2/4 Starting self-hosted Langfuse on ${LANGFUSE_BASE_URL}..."

  if ! command -v docker >/dev/null 2>&1; then
    echo "[sanad] WARNING: 'docker' not found. Skipping Langfuse container startup."
    return 0
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "[sanad] WARNING: Docker daemon is not running. Skipping Langfuse container startup."
    return 0
  fi

  if [[ ! -d "$LANGFUSE_DIR" ]]; then
    echo "[sanad] Cloning Langfuse repository to $LANGFUSE_DIR..."
    git clone https://github.com/langfuse/langfuse.git "$LANGFUSE_DIR"
  fi

  local compose_file="$LANGFUSE_DIR/docker-compose.yml"
  if [[ -f "$compose_file" ]]; then
    # Replace CHANGEME secrets with default password (123456), remap web port 3000 -> 3100,
    # and remap Postgres host port 5432 -> 5433 (and Redis 6379 -> 6380) to avoid host port conflicts
    sed -i.bak \
      -e "s|CHANGEME|${DEFAULT_PASSWORD}|g" \
      -e 's|"3000:3000"|"127.0.0.1:3100:3000"|g' \
      -e 's|^\( *- \)3000:3000|\1127.0.0.1:3100:3000|' \
      -e 's|127.0.0.1:5432:5432|127.0.0.1:5433:5432|g' \
      -e 's|"5432:5432"|"127.0.0.1:5433:5432"|g' \
      -e 's|127.0.0.1:6379:6379|127.0.0.1:6380:6379|g' \
      -e 's|"6379:6379"|"127.0.0.1:6380:6379"|g' \
      -e "s|http://localhost:3000|http://localhost:3100|g" \
      "$compose_file"
    rm -f "${compose_file}.bak"
  fi

  # Write docker-compose.override.yml so Langfuse initializes default user/org/project & keys (123456)
  cat > "$LANGFUSE_DIR/docker-compose.override.yml" <<EOF
services:
  langfuse-web:
    environment:
      NEXTAUTH_URL: "http://localhost:3100"
      LANGFUSE_INIT_ORG_ID: "sanad-org"
      LANGFUSE_INIT_ORG_NAME: "Sanad"
      LANGFUSE_INIT_PROJECT_ID: "sanad-project"
      LANGFUSE_INIT_PROJECT_NAME: "Sanad"
      LANGFUSE_INIT_PROJECT_PUBLIC_KEY: "${LANGFUSE_PUBLIC_KEY}"
      LANGFUSE_INIT_PROJECT_SECRET_KEY: "${LANGFUSE_SECRET_KEY}"
      LANGFUSE_INIT_USER_EMAIL: "admin@sanad.local"
      LANGFUSE_INIT_USER_NAME: "admin"
      LANGFUSE_INIT_USER_PASSWORD: "${LANGFUSE_ADMIN_PASSWORD}"
EOF

  (
    cd "$LANGFUSE_DIR"
    docker compose up -d
  )
  echo "[sanad] Langfuse containers started at ${LANGFUSE_BASE_URL}"
  echo "        Login: admin@sanad.local / ${LANGFUSE_ADMIN_PASSWORD}"
  echo "        Public Key: ${LANGFUSE_PUBLIC_KEY} | Secret Key: ${LANGFUSE_SECRET_KEY}"
}

# ------------------------------------------------------------------------------
# 3. Backend API (FastAPI / Uvicorn on http://127.0.0.1:8000)
# ------------------------------------------------------------------------------
start_backend_bg() {
  echo "[sanad] 3/4 Starting Backend API on http://${API_HOST}:${API_PORT}..."
  "$REPO_ROOT/apps/api/.venv/bin/uvicorn" sanad_api.main:create_app \
    --factory \
    --app-dir "$REPO_ROOT/apps/api" \
    --reload \
    --host "$API_HOST" \
    --port "$API_PORT" &
  API_PID=$!

  # Wait until /version responds
  for _ in {1..40}; do
    if curl -fsS "http://${API_HOST}:${API_PORT}/version" >/dev/null 2>&1; then
      echo "[sanad] Backend API is ready (PID: $API_PID)."
      return 0
    fi
    sleep 0.25
  done
  echo "[sanad] WARNING: Backend API did not respond within 10s; check logs above."
}

start_backend_fg() {
  setup_env_and_db
  echo "[sanad] Starting Backend API in foreground on http://${API_HOST}:${API_PORT}..."
  exec "$REPO_ROOT/apps/api/.venv/bin/uvicorn" sanad_api.main:create_app \
    --factory \
    --app-dir "$REPO_ROOT/apps/api" \
    --reload \
    --host "$API_HOST" \
    --port "$API_PORT"
}

# ------------------------------------------------------------------------------
# 4. Frontend Web App (Vite on http://127.0.0.1:3000)
# ------------------------------------------------------------------------------
ensure_frontend_deps() {
  if [[ ! -d "$REPO_ROOT/apps/web/node_modules" ]]; then
    echo "[sanad] Installing Frontend dependencies (npm ci in apps/web)..."
    (cd "$REPO_ROOT/apps/web" && npm ci)
  fi
}

start_frontend_bg() {
  ensure_frontend_deps
  echo "[sanad] 4/4 Starting Frontend Web App on http://${WEB_HOST}:${WEB_PORT}..."
  npm --prefix "$REPO_ROOT/apps/web" run dev -- --host "$WEB_HOST" --port "$WEB_PORT" &
  WEB_PID=$!

  for _ in {1..40}; do
    if curl -fsS "http://${WEB_HOST}:${WEB_PORT}/" >/dev/null 2>&1; then
      echo "[sanad] Frontend Web App is ready (PID: $WEB_PID)."
      return 0
    fi
    sleep 0.25
  done
  echo "[sanad] WARNING: Frontend Web App did not respond within 10s; check logs above."
}

start_frontend_fg() {
  ensure_frontend_deps
  echo "[sanad] Starting Frontend Web App in foreground on http://${WEB_HOST}:${WEB_PORT}..."
  exec npm --prefix "$REPO_ROOT/apps/web" run dev -- --host "$WEB_HOST" --port "$WEB_PORT"
}

# ------------------------------------------------------------------------------
# Banner & Command Dispatcher
# ------------------------------------------------------------------------------
print_summary() {
  cat <<EOF

================================================================================
  Sanad Research Prototype — All Services Running
================================================================================
  Frontend (Web UI)     : http://${WEB_HOST}:${WEB_PORT}
  Emergency Page        : http://${WEB_HOST}:${WEB_PORT}/urgent.html
  Backend API           : http://${API_HOST}:${API_PORT}
  OpenAPI Docs          : http://${API_HOST}:${API_PORT}/api/docs
  Health / Version      : http://${API_HOST}:${API_PORT}/version
  SQLite Database       : ${SANAD_DB_FILE}
  Langfuse UI           : ${LANGFUSE_BASE_URL}

  Default Credentials (Password / Key: ${DEFAULT_PASSWORD}):
  - Mock Reviewer       : username = demo-reviewer        | password = ${SANAD_DEMO_REVIEWER_PASSWORD}
  - Mock Facility       : username = demo-mock-facility   | password = ${SANAD_DEMO_MOCK_FACILITY_PASSWORD}
  - Langfuse Admin      : email    = admin@sanad.local    | password = ${DEFAULT_PASSWORD}
  - Langfuse API Keys   : public   = ${LANGFUSE_PUBLIC_KEY}     | secret   = ${LANGFUSE_SECRET_KEY}
================================================================================
Press Ctrl+C to stop Backend and Frontend servers.
EOF
}

usage() {
  cat <<EOF
Usage: ./run.sh [command]

Commands:
  all        Start Database, Langfuse, Backend (BE), and Frontend (FE) [default]
  db         Initialize local .env (password: 123456) and SQLite database
  langfuse   Start self-hosted Langfuse via Docker Compose on port 3100
  be         Start only Backend FastAPI server on http://${API_HOST}:${API_PORT}
  fe         Start only Frontend Vite server on http://${WEB_HOST}:${WEB_PORT}
  test       Run Backend pytest suite and Live Full-Stack E2E test
  reset      Remove local SQLite database (${SANAD_DB_FILE}) and re-initialize
  stop       Stop Langfuse Docker containers
  help       Show this help message
EOF
}

COMMAND="${1:-all}"

case "$COMMAND" in
  all|up|start)
    trap cleanup EXIT INT TERM
    setup_env_and_db
    start_langfuse
    start_backend_bg
    start_frontend_bg
    print_summary
    wait
    ;;
  db|database)
    setup_env_and_db
    ;;
  langfuse)
    start_langfuse
    ;;
  be|backend|api)
    start_backend_fg
    ;;
  fe|frontend|web)
    start_frontend_fg
    ;;
  test)
    setup_env_and_db
    "$REPO_ROOT/apps/api/.venv/bin/python" -m pytest "$REPO_ROOT/apps/api/tests" -v
    node --test "$REPO_ROOT/apps/web/e2e-full-flow.test.mjs"
    ;;
  reset)
    rm -f "$SANAD_DB_FILE"
    echo "[sanad] Removed $SANAD_DB_FILE"
    setup_env_and_db
    ;;
  stop|down)
    if [[ -d "$LANGFUSE_DIR" ]] && command -v docker >/dev/null 2>&1; then
      (cd "$LANGFUSE_DIR" && docker compose down)
    fi
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "Unknown command: $COMMAND" >&2
    usage
    exit 1
    ;;
esac
