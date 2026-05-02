# Atmosphere Storytelling System

A live, generative audio-visual atmosphere engine for immersive tabletop roleplaying and theatre performances. Operators control richly layered soundscapes (SuperCollider + OSC) and a fullscreen generative visual display (Python + pygame) from a browser-based control dashboard. Scenes cycle through Daytime, Evening, Night, and Dawn, each with its own palette of toggleable audio attributes, environment themes, and real-time parameters.

---

## Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Raspberry Pi | Pi 3B+ | Pi 4 (4 GB) or Pi 5 |
| Operating System | Raspberry Pi OS Bullseye (64-bit) | Raspberry Pi OS Bookworm (64-bit) |
| Display | Any HDMI monitor | 1080p HDMI display |
| Audio output | 3.5mm jack or HDMI audio | USB audio interface or HiFiBerry DAC+ |
| Network | Wi-Fi or Ethernet | Ethernet recommended for OSC control |
| Storage | 8 GB microSD | 16 GB+ microSD (Class 10 or better) |

---

## Quick Start (Automated Install)

The fastest way from a fresh Pi to a running system is the included install script.

### 1. Get the code onto the Pi

Clone via the Replit git URL (replace `<url>` with the URL shown in your Replit project):

```bash
git clone <url> atmosphere
cd atmosphere
```

Or download and extract a zip of the project, then `cd` into the folder.

### 2. Run the install script

```bash
bash install.sh
```

The script will:
- Install Node.js 20, pnpm, SuperCollider, Python packages, SDL2, and alsa-utils
- Run `pnpm install` and build the API server
- Install Python requirements from `requirements.txt`
- Write `atmosphere-backend.service` and `atmosphere-display.service` systemd unit files

This is the only command you need. Follow the printed instructions at the end to enable the services.

### 3. Enable and start the services

```bash
sudo systemctl enable --now atmosphere-backend
sudo systemctl enable --now atmosphere-display
```

### 4. Open the control dashboard

From any browser on the same network:

```
http://<pi-ip-address>:8080
```

To find the Pi's IP address: `hostname -I`

---

## Manual Install

Use this section if you want to understand each step or prefer not to run the automated script.

### Prerequisites

**Node.js 20+**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
```

**pnpm**

```bash
sudo npm install -g pnpm
```

**Python 3.11+**

Comes pre-installed on Raspberry Pi OS Bookworm. Verify:

```bash
python3 --version
```

**pygame and Python dependencies**

```bash
sudo apt-get install -y python3-pip python3-pygame libsdl2-dev alsa-utils
pip3 install --break-system-packages -r requirements.txt
```

**SuperCollider**

```bash
sudo apt-get install -y supercollider supercollider-server
```

Verify:

```bash
scsynth -v
sclang -v
```

See [AUDIO_SETUP.md](AUDIO_SETUP.md) for full SuperCollider configuration, ALSA setup, and audio output options.

### Install project dependencies

```bash
pnpm install
```

### Build the API server

```bash
pnpm --filter @workspace/api-server run build
```

---

## Running the System

### Development (on the Pi or any Linux machine)

Start both the API backend and the display together:

```bash
# Headless display (no monitor required — useful for testing)
pnpm dev

# Pi with X11 desktop
pnpm dev:pi:x11

# Pi OS Lite / KMS framebuffer (no X server)
pnpm dev:pi
```

The control dashboard will be available at `http://localhost:8080`.

### Production (systemd services)

After running `install.sh`, or after writing the unit files manually (see below), start with:

```bash
sudo systemctl start atmosphere-backend
sudo systemctl start atmosphere-display
```

View logs:

```bash
journalctl -u atmosphere-backend -f
journalctl -u atmosphere-display -f
```

### Manual production start (no systemd)

In one terminal:

```bash
PORT=8080 OSC_PORT=57120 NODE_ENV=production \
  node --enable-source-maps artifacts/api-server/dist/index.mjs
```

In a second terminal:

```bash
bash start_display.sh
```

---

## Display Video Drivers

The visual display uses SDL2 and supports three video drivers. Edit `start_display.sh` or the systemd unit file to switch:

| Mode | When to use | Environment variable |
|------|-------------|----------------------|
| **X11** (default) | Pi OS Desktop with a running X server | `SDL_VIDEODRIVER=x11` |
| **KMS/DRM** | Pi OS Lite, no X server (direct GPU framebuffer) | `SDL_VIDEODRIVER=kmsdrm` |
| **Offscreen** | Headless CI or testing without a monitor | `SDL_VIDEODRIVER=offscreen` |

To use KMS/DRM, edit `/etc/systemd/system/atmosphere-display.service` and change:

```ini
Environment=SDL_VIDEODRIVER=kmsdrm
```

Then unset the `DISPLAY` line (remove it), and reload:

```bash
sudo systemctl daemon-reload
sudo systemctl restart atmosphere-display
```

---

## Configuring Audio Output

See [AUDIO_SETUP.md](AUDIO_SETUP.md) for complete instructions covering:

- HDMI audio (recommended for projection setups)
- USB audio interface
- 3.5mm headphone jack
- SuperCollider headless configuration
- ALSA loopback setup for the Storyteller Voice feature
- Auto-launch on boot via systemd

---

## Accessing the Control Dashboard

The control dashboard runs in any modern browser. On the Pi itself:

```
http://localhost:8080
```

From another machine on the same network:

```
http://<pi-ip-address>:8080
```

The dashboard lets you:
- Switch between Daytime, Evening, Night, and Dawn scenes
- Select and adjust environment themes (forest, ocean, mystical, city, etc.)
- Toggle and control individual audio attributes
- Adjust master volume, intensity, and distance parameters
- Monitor SuperCollider status and view live logs

---

## Manual systemd Unit Files

If you ran `install.sh`, these files already exist. To write them by hand:

**`/etc/systemd/system/atmosphere-backend.service`**

```ini
[Unit]
Description=Atmosphere Storytelling System — API Backend
After=network.target sound.target
Wants=sound.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/atmosphere
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=OSC_PORT=57120
ExecStart=/usr/bin/node --enable-source-maps /home/pi/atmosphere/artifacts/api-server/dist/index.mjs
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**`/etc/systemd/system/atmosphere-display.service`**

```ini
[Unit]
Description=Atmosphere Storytelling System — Visual Display
After=network.target atmosphere-backend.service
Requires=atmosphere-backend.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/atmosphere
Environment=DISPLAY=:0
Environment=SDL_VIDEODRIVER=x11
Environment=SDL_AUDIODRIVER=dummy
Environment=BACKEND_PORT=8080
ExecStart=/bin/bash /home/pi/atmosphere/start_display.sh
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable both:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now atmosphere-backend
sudo systemctl enable --now atmosphere-display
```

---

## OSC / REST Control

The system accepts OSC commands over UDP (default port 57120) and has a matching HTTP REST API. This allows third-party controllers (TouchOSC, Max/MSP, Pure Data, etc.) to control the atmosphere remotely.

See [OSC_API.md](OSC_API.md) for the full command reference.

Quick example — transition to the Night scene from the command line:

```bash
curl -X POST http://localhost:8080/api/transition/to/night
```

---

## Project Structure

```
atmosphere/
├── artifacts/
│   ├── api-server/          Node.js + Express backend, SuperCollider bridge
│   ├── atmosphere-display/  Python + pygame fullscreen visual display
│   └── control-dashboard/   React browser control dashboard
├── lib/                     Shared TypeScript libraries
├── start_display.sh         Display launch script (video driver selection)
├── install.sh               Automated Raspberry Pi install script
├── requirements.txt         Python dependencies
├── AUDIO_SETUP.md           SuperCollider and audio configuration guide
└── OSC_API.md               OSC and REST API reference
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `node: command not found` | Re-run `install.sh` or install Node.js 20 manually |
| `pnpm: command not found` | Run `sudo npm install -g pnpm` |
| `sclang not found` | Run `sudo apt install supercollider` |
| Dashboard shows "SuperCollider not ready" | Check `journalctl -u atmosphere-backend -f`; verify `scsynth -v` works |
| No audio output | See AUDIO_SETUP.md → Configure Audio Output |
| Black screen on display | Check the SDL_VIDEODRIVER matches your setup (X11 vs kmsdrm) |
| Display service fails to start | Ensure `atmosphere-backend` is running first; check `journalctl -u atmosphere-display` |
| `pip install` fails with "externally managed" | Use `pip3 install --break-system-packages -r requirements.txt` |

---

## Further Reading

- [AUDIO_SETUP.md](AUDIO_SETUP.md) — SuperCollider install, ALSA loopback, audio quality tips, and systemd boot setup
- [OSC_API.md](OSC_API.md) — Full OSC and REST API reference with examples for TouchOSC, Max/MSP, Pure Data, and Python
- [start_display.sh](start_display.sh) — Annotated display launch script with all video driver options
