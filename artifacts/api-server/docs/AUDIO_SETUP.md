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

Run the included setup script once after each boot (or persist it across reboots):

```bash
sudo bash artifacts/api-server/scripts/setup-alsa-loopback.sh
```

To load the loopback module automatically at boot:
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

### Tuning the voice relay ring buffer

The relay holds unplayed PCM chunks in a ring buffer while `aplay` stdin is draining. You can adjust the buffer capacity without redeploying:

```bash
# VOICE_RING_CAPACITY — number of PCM chunks to buffer under back-pressure
# Default: 100 (~9 s at a 4096-sample chunk / 44100 Hz)
# Recommended range: 10–1000
# Increase on slow Pi hardware or high-latency networks; decrease on very constrained RAM.
export VOICE_RING_CAPACITY=100
```

The server validates this value at startup and logs a warning if it is outside the 10–1000 range.

### Install alsa-utils

`aplay` must be installed on the Pi:
```bash
sudo apt install -y alsa-utils
```

---

## 7. Bluetooth Microphone Setup

The **Pi Bluetooth Mic** mode lets the storyteller use a Bluetooth microphone physically paired to the Raspberry Pi. Audio is captured locally using `arecord` and piped directly to the ALSA loopback — no browser mic permission is required and network latency is eliminated.

### What you need

- A Bluetooth microphone (e.g. a wireless headset or lapel mic transmitter)
- `bluez` and `bluez-alsa` (the ALSA-only Bluetooth audio backend for Pi OS Lite)
- `alsa-utils` for `arecord`

### 1. Install bluez-alsa

```bash
sudo apt update
sudo apt install -y bluez bluez-alsa-utils alsa-utils
```

Enable and start the bluealsa service:

```bash
sudo systemctl enable --now bluetooth
sudo systemctl enable --now bluealsa
```

> **Note:** `bluez-alsa` (also called `bluealsa`) provides the ALSA-compatible interface for Bluetooth devices without requiring PulseAudio or PipeWire. On Pi OS Lite this is the minimal viable path.

### 2. Create the ALSA Bluetooth config

Add a virtual capture device so `arecord` can see the Bluetooth mic by a stable name. Edit `~/.asoundrc`:

```
# Bluetooth microphone capture device
pcm.bt_mic {
    type plug
    slave.pcm {
        type bluealsa
        device "XX:XX:XX:XX:XX:XX"   # replace with your mic's BT address
        profile "sco"
    }
}
ctl.bt_mic {
    type bluealsa
    device "XX:XX:XX:XX:XX:XX"
}
```

Or rely on the auto-generated `hw:` device that bluealsa creates and select it by name in the dashboard.

### 3. Pair the Bluetooth mic

```bash
bluetoothctl
# Inside bluetoothctl:
power on
agent on
scan on
# Wait for your mic's address to appear, then:
pair XX:XX:XX:XX:XX:XX
trust XX:XX:XX:XX:XX:XX
connect XX:XX:XX:XX:XX:XX
quit
```

Verify the mic is connected:

```bash
bluetoothctl info XX:XX:XX:XX:XX:XX
# Look for: Connected: yes
```

### 4. Verify arecord can see the device

```bash
arecord -l
```

You should see an entry like:

```
card 2: Device [Headset Mono], device 0: Bluetooth SCO [Bluetooth SCO]
```

This gives you the ALSA device ID (e.g. `hw:2,0`) to select in the dashboard.

### 5. Test capture before the show

```bash
# Record 5 seconds and play back
arecord -D hw:2,0 -f S16_LE -r 44100 -c 1 -d 5 /tmp/test.wav
aplay /tmp/test.wav
```

If you hear your voice, the mic is working correctly.

### 6. Use the dashboard source selector

1. Open the **Storyteller Voice** panel in the dashboard.
2. Click **Pi Bluetooth Mic** in the source selector.
3. The device dropdown will list all ALSA capture devices. Select the Bluetooth mic.
4. Press **Start Capture** — the server will run `arecord` on the Pi and pipe audio into SuperCollider.
5. A blue "Capturing locally" indicator confirms audio is flowing.

If the mic disconnects mid-show, the dashboard shows a "Capture lost" error with recovery guidance. Reconnect the mic via `bluetoothctl connect XX:XX:XX:XX:XX:XX` and press **Start Capture** again.

### 7. Auto-reconnect on boot (optional)

To make the Bluetooth mic connect automatically at boot, add a udev rule or use a systemd service:

```bash
sudo nano /etc/systemd/system/bt-mic-connect.service
```

```ini
[Unit]
Description=Connect Bluetooth mic at boot
After=bluetooth.target bluealsa.service
Wants=bluetooth.target

[Service]
Type=oneshot
ExecStart=/usr/bin/bluetoothctl connect XX:XX:XX:XX:XX:XX
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable bt-mic-connect
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `arecord -l` shows no Bluetooth device | Check `systemctl status bluealsa`; ensure mic is connected via `bluetoothctl` |
| `bluealsa` not found | Run `sudo apt install bluez-alsa-utils` |
| "Capture stopped unexpectedly" in dashboard | Bluetooth mic disconnected — reconnect and press Start Capture |
| Audio crackles or drops | Bluetooth SCO profile has narrow bandwidth; move mic closer to Pi or reduce interference |
| `hci0: SCO connect` errors in `dmesg` | Some USB BT dongles don't support SCO; use the Pi's built-in Bluetooth or a HFP-compatible dongle |

---

## 8. Auto-launch on Boot (systemd)

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
# Optional: tune the voice relay ring buffer (default 100, range 10-1000)
# Environment=VOICE_RING_CAPACITY=100
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
