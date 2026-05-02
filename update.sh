#!/usr/bin/env bash
# =============================================================================
#  Atmosphere Storytelling System — Update Script
#
#  Targets: Raspberry Pi OS Bookworm or Bullseye (arm64 / armhf)
#
#  Usage (run from the repo root on a Pi that already has the system installed):
#    cd atmosphere
#    bash update.sh
#
#  What this script does:
#    1. Pulls the latest code from the current git remote/branch
#    2. Shows a brief summary of what changed
#    3. Runs pnpm install --frozen-lockfile
#    4. Rebuilds the API server
#    5. Restarts atmosphere-backend and atmosphere-display systemd services
# =============================================================================

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[atmosphere]${NC} $*"; }
success() { echo -e "${GREEN}[atmosphere]${NC} $*"; }
warn()    { echo -e "${YELLOW}[atmosphere]${NC} $*"; }
error()   { echo -e "${RED}[atmosphere]${NC} $*" >&2; exit 1; }

# ── Sanity checks ─────────────────────────────────────────────────────────────
[[ "$(uname -s)" == "Linux" ]] || error "This script must be run on Linux (Raspberry Pi OS)."
[[ "$EUID" -ne 0 ]] && SUDO="sudo" || SUDO=""

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
info "Repository directory: $REPO_DIR"

command -v git   &>/dev/null || error "git not found. Re-run install.sh first."
command -v node  &>/dev/null || error "node not found. Re-run install.sh first."
command -v pnpm  &>/dev/null || error "pnpm not found. Re-run install.sh first."

cd "$REPO_DIR"

[[ -d .git ]] || error "Not a git repository. Cannot pull updates automatically."

echo ""
info "============================================================"
info "  Step 1/4 — Pull latest code"
info "============================================================"

BEFORE_SHA="$(git rev-parse HEAD)"

git fetch --quiet
REMOTE_BRANCH="$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || true)"

if [[ -z "$REMOTE_BRANCH" ]]; then
    warn "No upstream tracking branch configured. Attempting 'git pull' on current branch …"
    git pull
else
    info "Pulling from $REMOTE_BRANCH …"
    git pull
fi

AFTER_SHA="$(git rev-parse HEAD)"

echo ""
if [[ "$BEFORE_SHA" == "$AFTER_SHA" ]]; then
    success "Already up to date ($(git rev-parse --short HEAD))."
else
    success "Updated $(git rev-parse --short "$BEFORE_SHA") → $(git rev-parse --short "$AFTER_SHA")"
    echo ""
    info "What changed:"
    git log --oneline --no-decorate "${BEFORE_SHA}..${AFTER_SHA}" | sed 's/^/    /'
    echo ""
    info "Files changed:"
    git diff --name-only "${BEFORE_SHA}" "${AFTER_SHA}" | sed 's/^/    /'
fi

echo ""
info "============================================================"
info "  Step 2/4 — Install Node.js dependencies"
info "============================================================"

info "Running pnpm install --frozen-lockfile …"
pnpm install --frozen-lockfile
success "Node.js dependencies up to date."

echo ""
info "============================================================"
info "  Step 3/4 — Rebuild API server"
info "============================================================"

info "Building API server …"
pnpm --filter @workspace/api-server run build
success "API server built."

echo ""
info "============================================================"
info "  Step 4/4 — Restart services"
info "============================================================"

BACKEND_ACTIVE="$(systemctl is-active atmosphere-backend 2>/dev/null || true)"
DISPLAY_ACTIVE="$(systemctl is-active atmosphere-display 2>/dev/null || true)"

BACKEND_UNIT="/etc/systemd/system/atmosphere-backend.service"
DISPLAY_UNIT="/etc/systemd/system/atmosphere-display.service"

if [[ "$BACKEND_ACTIVE" == "active" || "$DISPLAY_ACTIVE" == "active" ]]; then
    info "Stopping services before restart …"
    [[ "$DISPLAY_ACTIVE"  == "active" ]] && $SUDO systemctl stop atmosphere-display
    [[ "$BACKEND_ACTIVE"  == "active" ]] && $SUDO systemctl stop atmosphere-backend
fi

if [[ -f "$BACKEND_UNIT" ]]; then
    info "Reloading systemd daemon …"
    $SUDO systemctl daemon-reload

    info "Starting atmosphere-backend …"
    $SUDO systemctl start atmosphere-backend
    success "atmosphere-backend started."

    if [[ -f "$DISPLAY_UNIT" ]]; then
        info "Starting atmosphere-display …"
        $SUDO systemctl start atmosphere-display
        success "atmosphere-display started."
    else
        warn "atmosphere-display.service not found — skipping. Re-run install.sh to register it."
    fi
else
    warn "systemd unit files not found — services not restarted."
    warn "To start the system manually:"
    warn "  PORT=8080 OSC_PORT=57120 NODE_ENV=production node --enable-source-maps $REPO_DIR/artifacts/api-server/dist/index.mjs"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Update complete!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  Version: $(git rev-parse --short HEAD) ($(git log -1 --format='%ci' | cut -d' ' -f1))"
echo ""
echo "  View live logs:"
echo "       journalctl -u atmosphere-backend -f"
echo "       journalctl -u atmosphere-display -f"
echo ""
echo "  Check service status:"
echo "       sudo systemctl status atmosphere-backend"
echo "       sudo systemctl status atmosphere-display"
echo ""
