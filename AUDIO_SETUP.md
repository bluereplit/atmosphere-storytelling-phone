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

> **Raspberry Pi OS Bookworm note:**
> raspi-config's audio menu shows the error *"raspi-config cannot configure audio when PulseAudio or PipeWire are in use"* because Bookworm ships with **PipeWire** running by default.
> **Do not use raspi-config for audio on Bookworm.** Use the methods below instead.

---

### Bookworm — select audio output with `wpctl`

`wpctl` is the WirePlumber control tool that ships with Bookworm.

List all available audio sinks:
```bash
wpctl status
# Look for the "Sinks:" section, e.g.:
#   *  51. Built-in Audio Stereo         [vol: 1.00]
#      52. HDMI / DisplayPort            [vol: 1.00]
#      53. USB Audio Headphones          [vol: 1.00]
```

Set the default sink by its ID number:
```bash
wpctl set-default 52   # e.g. to use HDMI
```

Make the change permanent (survives reboot):
```bash
# Find the node name shown by wpctl status, e.g. "alsa_output.pci-0000_00_1f.3.hdmi-stereo"
# Then add to ~/.config/wireplumber/main.lua.d/51-default-sink.lua:
mkdir -p ~/.config/wireplumber/main.lua.d
cat > ~/.config/wireplumber/main.lua.d/51-default-sink.lua << 'EOF'
rule = {
  matches = { { { "node.name", "=", "alsa_output.pci-0000_00_1f.3.hdmi-stereo" } } },
  apply_properties = { ["priority.session"] = 1000 },
}
table.insert(alsa_monitor.rules, rule)
EOF
```

Or simply set volume and default via the **taskbar volume plugin** (right-click the speaker icon on the Pi desktop → Audio Output → select HDMI or headphones).

---

### HDMI audio — `/boot/firmware/config.txt`

> **Path changed in Bookworm:** the config file is now `/boot/firmware/config.txt`, not `/boot/config.txt`.

To force HDMI audio output unconditionally, add or uncomment in `/boot/firmware/config.txt`:
```
hdmi_drive=2
```

Then reboot. This works regardless of PipeWire.

---

### USB audio interface

List available ALSA devices (still works alongside PipeWire):
```bash
aplay -l
```

PipeWire will automatically expose the USB device as a sink. Select it with `wpctl set-default <id>` as shown above.

If you need ALSA direct access (e.g. for SuperCollider bypassing PipeWire), see Section 4.

---

### 3.5mm jack (Bookworm)

The 3.5mm jack is exposed by PipeWire as a sink called something like `Built-in Audio Analog Stereo`. Select it with:
```bash
wpctl set-default <id>   # id from wpctl status
```

---

## 3. Test SuperCollider Headless

SuperCollider can run without a display. On **Bookworm with PipeWire**, use `pw-jack` so SuperCollider connects through PipeWire's JACK compatibility layer instead of fighting PipeWire for the ALSA device:

```bash
sudo apt install -y pipewire-jack

# Start scsynth via pw-jack
pw-jack scsynth -u 57110 -a 1024 -i 0 -o 2 &

# In another terminal, test with sclang
pw-jack sclang -e '{ SinOsc.ar(440, 0, 0.1) ! 2 }.play; 2.wait; 0.exit'
```

If you hear a sine tone, audio is working.

On **Bullseye** (no PipeWire), the original ALSA approach works directly:
```bash
scsynth -u 57110 -a 1024 -i 0 -o 2 &
```

---

## 4. SuperCollider Audio Backend — Bookworm vs Bullseye

### Bookworm: use `pw-jack` (recommended)

PipeWire holds the audio device. SuperCollider must connect through PipeWire's JACK compatibility layer using `pw-jack`. The API server launches SuperCollider automatically — set the environment variable to enable `pw-jack` mode:

```bash
export SC_USE_PIPEWIRE_JACK=1
```

Or add it to `/etc/systemd/system/atmosphere.service` (see Section 8).

With this flag set, the API server prepends `pw-jack` when spawning `sclang`:
```
pw-jack sclang artifacts/api-server/sc/startup.scd
```

Install the JACK compatibility package once:
```bash
sudo apt install -y pipewire-jack
```

### Bullseye / ALSA direct (no PipeWire)

The system uses SuperCollider's built-in ALSA support. No JACK is required.

Create or edit `~/.config/SuperCollider/startup.scd`:

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
cd /home/pi/atmosphere-storytelling-system
# Bookworm:
SC_USE_PIPEWIRE_JACK=1 PORT=8080 pnpm --filter @workspace/api-server run start

# Bullseye:
PORT=8080 pnpm --filter @workspace/api-server run start
```

SuperCollider will be launched automatically. Check the logs for:
```
SuperCollider ready
SynthDefs loaded
```

---

## 6. Storyteller Voice — ALSA Loopback Setup

The **Storyteller Voice** feature lets the narrator's microphone be mixed directly into the SuperCollider soundscape. The browser dashboard captures the mic, streams audio to the API server over WebSocket, and the server pipes it into SuperCollider via an ALSA virtual loopback device.

### How it works

```
Browser mic → WebSocket /ws/voice → aplay → ALSA Loopback (playback side)
                                                    ↓
                                      SuperCollider SoundIn (capture side)
```

### Enable the ALSA loopback

**After running `install.sh` the loopback is enabled automatically.** `install.sh` installs and enables a dedicated systemd service (`alsa-loopback.service`) that loads `snd-aloop` every time the Pi boots — no manual steps are needed.

Check the service status at any time:

```bash
sudo systemctl status alsa-loopback
journalctl -u alsa-loopback --no-pager
```

#### Manual setup (if you skipped `install.sh`)

**Option A — one-shot (current boot only):**
```bash
sudo bash artifacts/api-server/scripts/setup-alsa-loopback.sh
```

**Option B — persistent via systemd (recommended):**
```bash
sudo cp artifacts/api-server/scripts/alsa-loopback.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now alsa-loopback
```

**Option C — kernel modules list:**
```bash
echo snd-aloop | sudo tee -a /etc/modules
```

### Configure SuperCollider to use the loopback

SuperCollider needs to read from the **capture side** of the loopback (card `Loopback`, device 1). Create a virtual ALSA device in `~/.asoundrc` that uses `asym`:

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

```bash
# VOICE_RING_CAPACITY — number of PCM chunks to buffer under back-pressure
# Default: 100 (~9 s at a 4096-sample chunk / 44100 Hz)
# Recommended range: 10–1000
export VOICE_RING_CAPACITY=100
```

### Install alsa-utils

`aplay` must be installed on the Pi:
```bash
sudo apt install -y alsa-utils
```

---

## 7. Bluetooth Microphone Setup

The **Pi Bluetooth Mic** mode lets the storyteller use a Bluetooth microphone physically paired to the Raspberry Pi.

### Bookworm (PipeWire) — recommended approach

On Bookworm, PipeWire manages Bluetooth audio natively via `bluez`. No `bluez-alsa` is needed.

```bash
sudo apt install -y bluez pulseaudio-utils   # pactl for sink listing
sudo systemctl enable --now bluetooth
```

Pair the mic:
```bash
bluetoothctl
power on
agent on
scan on
# wait for address to appear, then:
pair XX:XX:XX:XX:XX:XX
trust XX:XX:XX:XX:XX:XX
connect XX:XX:XX:XX:XX:XX
quit
```

PipeWire will expose the Bluetooth mic as an ALSA capture source. List devices:
```bash
arecord -l
# or
wpctl status   # look under "Sources:"
```

### Bullseye (no PipeWire) — bluez-alsa

On Bullseye, use `bluez-alsa` for ALSA-compatible Bluetooth audio:

```bash
sudo apt install -y bluez bluez-alsa-utils alsa-utils
sudo systemctl enable --now bluetooth
sudo systemctl enable --now bluealsa
```

Add a virtual capture device in `~/.asoundrc`:
```
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

### Pair and test (both OS versions)

```bash
arecord -D hw:2,0 -f S16_LE -r 44100 -c 1 -d 5 /tmp/test.wav && aplay /tmp/test.wav
```

### Dashboard usage

1. Open the **Storyteller Voice** panel in the dashboard.
2. Click **Pi Bluetooth Mic** in the source selector.
3. Select the Bluetooth mic from the device dropdown.
4. Press **Start Capture**.

---

## 8. Auto-launch on Boot (systemd)

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
WorkingDirectory=/home/pi/atmosphere-storytelling-system
Environment=PORT=8080
Environment=OSC_PORT=57120
Environment=NODE_ENV=production
# Bookworm: uncomment the next line to run SuperCollider via PipeWire JACK
# Environment=SC_USE_PIPEWIRE_JACK=1
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

## 9. Launch the Visual Display on Boot

For X11 (default Pi desktop):
```bash
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/atmosphere-display.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=Atmosphere Display
Exec=/home/pi/atmosphere-storytelling-system/start_display.sh
EOF
```

For KMS framebuffer without X11 (headless display):
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
| `raspi-config cannot configure audio` | Expected on Bookworm — use `wpctl set-default <id>` or the taskbar plugin instead |
| `sclang not found` | Run `sudo apt install supercollider` |
| SuperCollider: `device not found` or ALSA error on Bookworm | Install `pipewire-jack` and set `SC_USE_PIPEWIRE_JACK=1` |
| No audio output | Run `wpctl status` (Bookworm) or `aplay -l` (Bullseye) and confirm the correct sink is default |
| SuperCollider crashes | Check Pi memory: `free -h`; increase `memSize` in startup.scd |
| High CPU on Pi 3 | Increase `blockSize` to 1024 in startup.scd |
| Clicking/glitching | Increase `blockSize` to 1024 or use a USB audio interface |
| `JACK errors` on Bullseye | Ignore — the system uses ALSA directly, not JACK |
| Bluetooth mic not showing in `arecord -l` (Bookworm) | Ensure mic is connected: `bluetoothctl info XX:XX:XX:XX:XX:XX` |
| Bluetooth mic not showing (Bullseye) | Check `systemctl status bluealsa`; re-run `bluetoothctl connect` |

---

## Audio Quality Tips

- **USB audio interface** (e.g., Focusrite Scarlett Solo, Behringer UMC22) provides much better quality than the Pi's built-in 3.5mm audio
- **HiFiBerry DAC+** is an excellent Pi HAT for high-quality stereo output
- For projection shows, **HDMI audio** passed through to a receiver or mixer is often the cleanest path
- Set system volume: `wpctl set-volume @DEFAULT_AUDIO_SINK@ 80%` (Bookworm) or `amixer set Master 80%` (Bullseye)
