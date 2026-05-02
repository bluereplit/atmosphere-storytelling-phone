# Audio Setup Guide — Raspberry Pi

This guide explains how to install SuperCollider on a Raspberry Pi and configure it for headless operation with the Atmosphere Storytelling System.

## Requirements

- Raspberry Pi 4 or 5 (recommended) or Pi 3B+
- Raspberry Pi OS (Bookworm or Bullseye, 64-bit recommended)
- Audio output: HDMI audio, USB audio interface, or 3.5mm jack (with HiFiBerry or similar for best quality)
- Node.js 20+ installed

---

## 1. Install SuperCollider

```bash
sudo apt update
sudo apt install -y supercollider supercollider-server
```

Verify the installation:
```bash
scsynth -v
sclang -v
```

---

## 2. Configure Audio Output

### Using HDMI audio (recommended for projection setups)

Force HDMI audio output via raspi-config:
```bash
sudo raspi-config
# → System Options → Audio → HDMI
```

Or set it in `/boot/config.txt` (add or uncomment):
```
hdmi_drive=2
```

### Using USB audio interface

List available audio devices:
```bash
aplay -l
```

Set the USB device as default in `~/.asoundrc`:
```
pcm.!default {
    type hw
    card 1
}
ctl.!default {
    type hw
    card 1
}
```
Replace `card 1` with the card number from `aplay -l`.

### Using 3.5mm jack

```bash
sudo raspi-config
# → System Options → Audio → Headphones
```

---

## 3. Test SuperCollider Headless

SuperCollider can run without a display (headless). Test it:

```bash
# Start the synthesis server directly
scsynth -u 57110 -a 1024 -i 0 -o 2 &

# In another terminal, test with sclang
echo '{ SinOsc.ar(440, 0, 0.1) ! 2 }.play' | sclang
```

If you hear a sine tone, the audio is working.

---

## 4. Configure SuperCollider for ALSA (No JACK)

The system uses SuperCollider's built-in ALSA support. No JACK is required.

Create or edit `~/.config/SuperCollider/startup.scd` (this is separate from the system's startup file):

```supercollider
Server.default.options.device = nil; // Use system default ALSA device
Server.default.options.numInputBusChannels = 0;
Server.default.options.numOutputBusChannels = 2;
```

If you need to specify a device (e.g., for USB audio), find the device name:
```bash
scsynth -H ?
```
Then set it in the Node.js environment:
```bash
export SC_AUDIO_DEVICE="hw:1,0"
```

---

## 5. Run the System

Start the Node.js backend (which manages SuperCollider automatically):

```bash
cd /path/to/workspace
PORT=3000 OSC_PORT=57120 pnpm --filter @workspace/api-server run start
```

SuperCollider will be launched automatically. Check the logs for:
```
SuperCollider ready
SynthDefs loaded
```

---

## 6. Storyteller Voice — ALSA Loopback Setup

The **Storyteller Voice** feature lets the narrator's microphone be mixed directly into the SuperCollider soundscape.  The browser dashboard captures the mic, streams audio to the API server over WebSocket, and the server pipes it into SuperCollider via an ALSA virtual loopback device.

### How it works

```
Browser mic → WebSocket /ws/voice → aplay → ALSA Loopback (playback side)
                                                    ↓
                                      SuperCollider SoundIn (capture side)
```

### Enable the ALSA loopback

**After running `install.sh` the loopback is enabled automatically.**  `install.sh` installs and enables a dedicated systemd service (`alsa-loopback.service`) that loads `snd-aloop` every time the Pi boots — no manual steps are needed.

Check the service status at any time:

```bash
sudo systemctl status alsa-loopback
# View the last boot's setup log:
journalctl -u alsa-loopback --no-pager
```

#### Manual setup (if you skipped `install.sh`)

If you need to enable the loopback without running the full installer, do one of the following:

**Option A — one-shot (current boot only):**
```bash
sudo bash artifacts/api-server/scripts/setup-alsa-loopback.sh
```

**Option B — persistent via systemd (recommended):**
```bash
# Copy the unit file and enable the service
sudo cp artifacts/api-server/scripts/alsa-loopback.service /etc/systemd/system/
# Edit ExecStart to point to your repo's copy of setup-alsa-loopback.sh, then:
sudo systemctl daemon-reload
sudo systemctl enable --now alsa-loopback
```

**Option C — kernel modules list:**
```bash
echo snd-aloop | sudo tee -a /etc/modules
```

### Configure SuperCollider to use the loopback

SuperCollider needs to read from the **capture side** of the loopback (card `Loopback`, device 1).  The easiest way is to set `numInputBusChannels = 2` (already done in `startup.scd`) and launch SuperCollider with the loopback card.

To specify a separate input device for SuperCollider without changing the output, create a virtual ALSA device in `~/.asoundrc` that uses `asym`:

```
# ~/.asoundrc — asymmetric device: Loopback capture + main output
pcm.atmosphere_io {
    type asym
    playback.pcm "hw:0,0"   # your main audio output card
    capture.pcm  "hw:Loopback,1"
}
ctl.atmosphere_io {
    type hw
    card 0
}
```

Then set SuperCollider's device to `atmosphere_io` by editing `startup.scd`:
```supercollider
Server.default.options.device = "atmosphere_io";
```

Or use the `VOICE_LOOPBACK_DEVICE` environment variable to change which ALSA device `aplay` uses on the playback side:
```bash
export VOICE_LOOPBACK_DEVICE="hw:Loopback,0"   # default
```

### Install alsa-utils

`aplay` must be installed on the Pi:
```bash
sudo apt install -y alsa-utils
```

---

## 7. Auto-launch on Boot (systemd)

Create a systemd service to start the system automatically:

```bash
sudo nano /etc/systemd/system/atmosphere.service
```

```ini
[Unit]
Description=Atmosphere Storytelling System
After=network.target sound.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/workspace
Environment=PORT=3000
Environment=OSC_PORT=57120
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --enable-source-maps artifacts/api-server/dist/index.mjs
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable atmosphere
sudo systemctl start atmosphere
sudo systemctl status atmosphere
```

View logs:
```bash
journalctl -u atmosphere -f
```

---

## 8. Launch the Visual Display on Boot

The visual display (Python + pygame) runs separately and connects to the system's HDMI output.

For X11 (default Pi desktop):
```bash
# Add to ~/.config/autostart/atmosphere-display.desktop
[Desktop Entry]
Type=Application
Name=Atmosphere Display
Exec=/home/pi/workspace/start_display.sh
```

For framebuffer/KMS without X11 (headless display):
```bash
export SDL_VIDEODRIVER=kmsdrm
export SDL_AUDIODRIVER=dummy
python artifacts/atmosphere-display/main.py
```

See `start_display.sh` in the workspace root for a complete launch script.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `sclang not found` | Run `sudo apt install supercollider` |
| No audio output | Check `aplay -l` and set the correct ALSA device |
| SuperCollider crashes | Check Pi memory: `free -h`; increase `memSize` in startup.scd |
| High CPU on Pi 3 | Increase `blockSize` to 1024 in startup.scd |
| Clicking/glitching | Increase `blockSize` to 1024 or use a USB audio interface |
| JACK errors | Ignore — the system uses ALSA directly, not JACK |

---

## Audio Quality Tips

- **USB audio interface** (e.g., Focusrite Scarlett Solo, Behringer UMC22) provides much better quality than the Pi's built-in 3.5mm audio
- **HiFiBerry DAC+** is an excellent Pi HAT for high-quality stereo output
- For projection shows, **HDMI audio** passed through to a receiver or mixer is often the cleanest path
- Set system volume to 80%: `amixer set Master 80%`
