#!/usr/bin/env bash
# =============================================================================
#  Atmosphere Storytelling System — Raspberry Pi Install Script
#
#  Targets: Raspberry Pi OS Bookworm or Bullseye (arm64 / armhf)
#
#  Usage:
#    git clone <repo-url> atmosphere
#    cd atmosphere
#    bash install.sh
#
#  What this script does:
#    1. Installs Node.js 20 via NodeSource
#    2. Installs pnpm, SuperCollider, Python deps, SDL2, alsa-utils
#    3. Runs pnpm install
#    4. Installs Python packages from requirements.txt
#    5. Builds the API server
#    6. Writes systemd unit files for atmosphere-backend and atmosphere-display
#    7. Prints next-step instructions
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
info "Install directory: $REPO_DIR"

# ── Detect the login user (the user who called sudo, if applicable) ───────────
INSTALL_USER="${SUDO_USER:-$USER}"
INSTALL_HOME="$(eval echo "~$INSTALL_USER")"
info "Installing for user: $INSTALL_USER (home: $INSTALL_HOME)"

echo ""
info "============================================================"
info "  Step 1/6 — System packages"
info "============================================================"

$SUDO apt-get update -qq

# Core build/Python tooling
$SUDO apt-get install -y \
    curl \
    git \
    python3 \
    python3-pip \
    python3-venv \
    python3-pygame \
    libsdl2-dev \
    libsdl2-image-dev \
    alsa-utils \
    alsa-tools

# SuperCollider
info "Installing SuperCollider …"
$SUDO apt-get install -y supercollider supercollider-server || \
    warn "SuperCollider package not found in default repos — you may need to add a PPA or build from source. See AUDIO_SETUP.md."

success "System packages installed."

echo ""
info "============================================================"
info "  Step 2/6 — Node.js 20"
info "============================================================"

if command -v node &>/dev/null; then
    NODE_VER="$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)"
    if [[ "$NODE_VER" -ge 20 ]]; then
        success "Node.js $(node --version) already installed — skipping."
    else
        warn "Found Node.js v$NODE_VER; upgrading to 20 via NodeSource …"
        curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO apt-get install -y nodejs
        success "Node.js $(node --version) installed."
    fi
else
    info "Node.js not found — installing via NodeSource …"
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
    $SUDO apt-get install -y nodejs
    success "Node.js $(node --version) installed."
fi

echo ""
info "============================================================"
info "  Step 3/6 — pnpm"
info "============================================================"

if command -v pnpm &>/dev/null; then
    success "pnpm $(pnpm --version) already installed — skipping."
else
    info "Installing pnpm …"
    $SUDO npm install -g pnpm
    success "pnpm $(pnpm --version) installed."
fi

echo ""
info "============================================================"
info "  Step 4/6 — Node.js dependencies & build"
info "============================================================"

cd "$REPO_DIR"

info "Running pnpm install …"
pnpm install

info "Building API server …"
pnpm --filter @workspace/api-server run build

success "Node.js dependencies installed and API server built."

echo ""
info "============================================================"
info "  Step 5/6 — Python dependencies"
info "============================================================"

info "Installing Python packages from requirements.txt …"
pip3 install --break-system-packages -r "$REPO_DIR/requirements.txt" || \
    pip3 install -r "$REPO_DIR/requirements.txt"

success "Python dependencies installed."

echo ""
info "============================================================"
info "  Step 6/6 — systemd unit files"
info "============================================================"

# ── atmosphere-backend.service ────────────────────────────────────────────────
BACKEND_SERVICE="/etc/systemd/system/atmosphere-backend.service"
info "Writing $BACKEND_SERVICE …"
$SUDO tee "$BACKEND_SERVICE" > /dev/null <<EOF
[Unit]
Description=Atmosphere Storytelling System — API Backend
After=network.target sound.target
Wants=sound.target

[Service]
Type=simple
User=$INSTALL_USER
WorkingDirectory=$REPO_DIR
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=OSC_PORT=57120
ExecStart=/usr/bin/node --enable-source-maps $REPO_DIR/artifacts/api-server/dist/index.mjs
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# ── atmosphere-display.service ────────────────────────────────────────────────
DISPLAY_SERVICE="/etc/systemd/system/atmosphere-display.service"
info "Writing $DISPLAY_SERVICE …"
$SUDO tee "$DISPLAY_SERVICE" > /dev/null <<EOF
[Unit]
Description=Atmosphere Storytelling System — Visual Display
After=network.target atmosphere-backend.service
Requires=atmosphere-backend.service

[Service]
Type=simple
User=$INSTALL_USER
WorkingDirectory=$REPO_DIR
Environment=DISPLAY=:0
Environment=SDL_VIDEODRIVER=x11
Environment=SDL_AUDIODRIVER=dummy
Environment=BACKEND_PORT=8080
ExecStart=/bin/bash $REPO_DIR/start_display.sh
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
success "systemd unit files written and daemon reloaded."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Installation complete!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Configure audio output (if needed):"
echo "       See AUDIO_SETUP.md for HDMI, USB, or 3.5mm jack setup."
echo ""
echo "  2. Enable the ALSA loopback (for Storyteller Voice feature):"
echo "       sudo bash $REPO_DIR/artifacts/api-server/scripts/setup-alsa-loopback.sh"
echo "       echo snd-aloop | sudo tee -a /etc/modules"
echo ""
echo "  3. Start the backend now:"
echo "       sudo systemctl enable --now atmosphere-backend"
echo "       sudo systemctl status atmosphere-backend"
echo ""
echo "  4. Start the display now:"
echo "       sudo systemctl enable --now atmosphere-display"
echo "         (requires a running X server or switch SDL_VIDEODRIVER=kmsdrm in"
echo "          $DISPLAY_SERVICE for KMS/DRM / Pi OS Lite)"
echo ""
echo "  5. Open the control dashboard from any browser on the same network:"
echo "       http://<pi-ip-address>:8080"
echo ""
echo "  View live logs:"
echo "       journalctl -u atmosphere-backend -f"
echo "       journalctl -u atmosphere-display -f"
echo ""
echo "  Full documentation:"
echo "       README.md        — overview and manual install steps"
echo "       AUDIO_SETUP.md   — SuperCollider and audio configuration"
echo "       OSC_API.md       — OSC/REST command reference"
echo ""
