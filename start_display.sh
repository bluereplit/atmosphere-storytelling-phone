#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Atmosphere Storytelling Display — Raspberry Pi launch script
#
#  This script starts the fullscreen pygame visual display.
#  The backend Node.js server must already be running (default: port 8080).
#
#  ┌─────────────────────────────────────────────────────────────────────────┐
#  │  DISPLAY MODES                                                          │
#  │                                                                         │
#  │  1. X11 mode (Raspberry Pi OS Desktop or a running X server)           │
#  │     DISPLAY=:0 is set automatically below; change if your X display    │
#  │     is on a different virtual terminal.                                 │
#  │                                                                         │
#  │  2. KMS/DRM mode (Raspberry Pi OS Lite, no X server needed)            │
#  │     SDL_VIDEODRIVER=kmsdrm renders directly to the GPU framebuffer.    │
#  │     Uncomment the kmsdrm block below instead of the X11 block.         │
#  │                                                                         │
#  │  3. Development / headless (offscreen — no actual display output)      │
#  │     SDL_VIDEODRIVER=offscreen lets the app run on a machine without    │
#  │     any monitor (useful for CI or remote testing).                     │
#  └─────────────────────────────────────────────────────────────────────────┘
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPLAY_DIR="$SCRIPT_DIR/artifacts/atmosphere-display"

# ── Configurable options ────────────────────────────────────────────────────
BACKEND_PORT="${BACKEND_PORT:-8080}"
TARGET_FPS="${TARGET_FPS:-60}"

# ── Mode selection ──────────────────────────────────────────────────────────
# Uncomment ONE block:

# --- X11 mode (default) ---
export DISPLAY="${DISPLAY:-:0}"
export SDL_VIDEODRIVER="${SDL_VIDEODRIVER:-x11}"

# --- KMS/DRM mode (uncomment for Pi OS Lite / no X server) ---
# export SDL_VIDEODRIVER=kmsdrm
# unset DISPLAY

# --- Offscreen / development mode ---
# export SDL_VIDEODRIVER=offscreen

# ── SDL audio — disable to avoid conflicts with SuperCollider ───────────────
export SDL_AUDIODRIVER=dummy

# ── Launch ───────────────────────────────────────────────────────────────────
echo "Starting Atmosphere Display"
echo "  Backend: ws://localhost:${BACKEND_PORT}/ws"
echo "  Video driver: ${SDL_VIDEODRIVER:-auto}"
echo "  FPS: ${TARGET_FPS}"
echo ""

exec python3 "$DISPLAY_DIR/main.py" \
    --ws-port "$BACKEND_PORT" \
    --fps "$TARGET_FPS" \
    "$@"

# ─────────────────────────────────────────────────────────────────────────────
#  Auto-launch on boot (systemd unit — optional)
#
#  Save as /etc/systemd/system/atmosphere-display.service and enable:
#    sudo systemctl daemon-reload
#    sudo systemctl enable --now atmosphere-display
#
#  [Unit]
#  Description=Atmosphere Storytelling Display
#  After=network.target atmosphere-backend.service
#  Requires=atmosphere-backend.service
#
#  [Service]
#  Type=simple
#  User=pi
#  WorkingDirectory=/home/pi/atmosphere
#  Environment=DISPLAY=:0
#  Environment=SDL_VIDEODRIVER=x11
#  Environment=SDL_AUDIODRIVER=dummy
#  ExecStart=/bin/bash /home/pi/atmosphere/start_display.sh
#  Restart=on-failure
#  RestartSec=5
#
#  [Install]
#  WantedBy=multi-user.target
# ─────────────────────────────────────────────────────────────────────────────
