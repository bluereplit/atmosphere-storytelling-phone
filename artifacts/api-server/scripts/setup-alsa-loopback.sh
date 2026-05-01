#!/usr/bin/env bash
# setup-alsa-loopback.sh — Configure an ALSA virtual loopback soundcard on the Raspberry Pi.
#
# This script loads the snd-aloop kernel module so that the API server can
# pipe the storyteller's microphone audio (received over WebSocket) into
# SuperCollider via aplay on one side of the loopback, while SuperCollider
# reads it back as a SoundIn input bus on the other side.
#
# Run once after boot (or add to /etc/rc.local or a systemd service):
#   sudo bash scripts/setup-alsa-loopback.sh
#
# To load automatically at boot, add "snd-aloop" to /etc/modules.

set -euo pipefail

LOOPBACK_DEVICE="${VOICE_LOOPBACK_DEVICE:-hw:Loopback,0}"

echo "==> Loading snd-aloop kernel module..."
if lsmod | grep -q snd_aloop; then
    echo "    snd-aloop already loaded"
else
    modprobe snd-aloop pcm_substreams=1
    echo "    snd-aloop loaded"
fi

echo "==> Available ALSA devices:"
aplay -l 2>/dev/null || true

echo ""
echo "==> ALSA loopback ready."
echo "    Playback side (for aplay): ${LOOPBACK_DEVICE}"
echo "    Capture side  (for sclang): hw:Loopback,1"
echo ""
echo "    SuperCollider must use the Loopback capture device as its input."
echo "    Set SUPERCOLLIDER_INPUT_DEVICE=hw:Loopback,1 or configure scsynth"
echo "    with -i 2 and the loopback card name when launching."
echo ""
echo "    To persist across reboots, add 'snd-aloop' to /etc/modules:"
echo "      echo snd-aloop | sudo tee -a /etc/modules"
