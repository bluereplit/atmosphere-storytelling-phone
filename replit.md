# Workspace

## Overview

Self-hosted storytelling atmosphere system for Raspberry Pi. pnpm workspace monorepo using TypeScript.

## Project Goal

Build a self-hosted real-time storytelling atmosphere system with:
1. **Node.js/Express backend** — REST + WebSocket + OSC APIs, 5-phase state machine, 13 environment themes, 38 toggleable audio attributes synthesized via SuperCollider
2. **Python+pygame visual display** — fullscreen native GPU output over HDMI (complete)
3. **React+Vite web control dashboard** — control panel for live use (complete)

All sound is programmatically generated via SuperCollider SynthDefs. No file-based audio.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Validation**: Zod (`zod/v4`)
- **API codegen**: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- **Build**: esbuild (ESM bundle via `build.mjs`)
- **Audio synthesis**: SuperCollider (sclang/scsynth spawned as child process, graceful degradation)
- **Real-time**: WebSocket at /ws + node-osc OSC server on port 57120

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/api-server run dev` — run API server locally (build + start)

## Artifact: API Server

**Dir**: `artifacts/api-server/`  
**Port**: `$PORT` (default 8080 in dev)

### Key source files

| File | Purpose |
|---|---|
| `src/app.ts` | App entry: HTTP+WebSocket+OSC+SC initialization |
| `src/index.ts` | Process entry, graceful shutdown |
| `src/lib/stateManager.ts` | Central state machine (daytime/evening/night/dawn) + attribute engine |
| `src/lib/supercollider.ts` | SC process management + OSC bridge |
| `src/lib/themes.config.ts` | 13 environment themes + 38 audio attribute definitions |
| `src/lib/showConfig.ts` | ShowConfig persistence to `data/show.json` |
| `src/lib/wsServer.ts` | WebSocket server; broadcasts state changes to all clients |
| `src/lib/oscServer.ts` | OSC server — mirrors REST API over OSC |
| `src/routes/index.ts` | `initRouter(getShow, setShow)` factory mounting all routes |

### SuperCollider files

| File | Purpose |
|---|---|
| `sc/startup.scd` | Boot SuperCollider server + load SynthDef files |
| `sc/envThemes.scd` | 13 environment theme SynthDefs |
| `sc/attributes.scd` | 38 audio attribute SynthDefs |

### REST API summary

| Endpoint | Description |
|---|---|
| `GET /api/state` | Full runtime state (includes `timestamp`, `phaseParams`) |
| `POST /api/transition/to/:phase` | Switch phase (daytime/evening/night/dawn) |
| `POST /api/transition/auto` | Enable/disable auto-cycling |
| `POST /api/environment/set/:theme` | Set one of 13 environment themes |
| `POST /api/environment/intensity` | Set intensity 0–1 |
| `POST /api/attribute/:name/on|off|toggle` | Enable/disable an attribute |
| `POST /api/attribute/:name/volume` | Set attribute volume 0–1 |
| `POST /api/attribute/:name/tempo` | Set attribute BPM (rhythm attrs) |
| `POST /api/attribute/:name/distance` | Set attribute distance 0–1 (spatial attrs) |
| `POST /api/audio/mute|unmute` | Global mute |
| `GET  /api/audio/status` | SC health + OSC port |
| `POST /api/display/overlay/toggle` | Broadcast overlay_toggle WS event to all clients |
| `GET/POST /api/show` | Show configuration persistence |

### Data

- `data/show.json` — persisted ShowConfig (13 themes, per-phase attribute enable lists)
- `docs/` — static documentation served at `/docs` (OSC_API.md, AUDIO_SETUP.md)

### OSC address space

All REST endpoints are mirrored as OSC messages. See `docs/OSC_API.md`.

## Artifact: Atmosphere Display (Python + pygame)

**Dir**: `artifacts/atmosphere-display/`  
**Runtime**: Python 3.11 + pygame 2.6 (SDL2)  
**Launch**: `start_display.sh` at workspace root (or `python3 artifacts/atmosphere-display/main.py`)

### Source files

| File | Purpose |
|---|---|
| `main.py` | Entry point: pygame init, main render loop, event application |
| `ws_client.py` | Asyncio WebSocket client in a daemon thread, feeds `queue.Queue` |
| `renderers.py` | Theme renderer classes: DaytimeRenderer, EveningRenderer, NightRenderer, DawnRenderer |
| `layers.py` | Attribute layer classes: SunbeamsLayer, BirdsLayer, FirefliesLayer, EveningCloudsLayer, MoonLayer, StarsLayer, AuroraLayer, MistLayer, DawnBirdsLayer |

### Visual → attribute mapping

| Phase | Always rendered | Layer: audio attribute |
|---|---|---|
| Daytime | Sky gradient, sun disc, clouds | Sunbeams ← `wind`; Birds ← `birds` |
| Evening | Sunset gradient, cloud silhouettes | Fireflies ← `campfire`; Clouds ← `wind` |
| Night | Dark gradient, star field, treeline | Moon ← `owls`; Aurora ← `choir_pad`; Stars ← `crickets` |
| Dawn | Pink/lavender gradient, horizon glow | Mist ← `stream`; Birds ← `birds` |

### Display modes

```bash
DISPLAY=:0 python3 artifacts/atmosphere-display/main.py          # X11
SDL_VIDEODRIVER=kmsdrm python3 artifacts/atmosphere-display/main.py  # KMS/DRM (Pi Lite)
SDL_VIDEODRIVER=offscreen python3 artifacts/atmosphere-display/main.py  # headless dev
```

### Dev workflow

Workflow name: `artifacts/atmosphere-display: Visual Display`  
Command: `SDL_VIDEODRIVER=offscreen SDL_AUDIODRIVER=dummy python3 artifacts/atmosphere-display/main.py --no-fullscreen --ws-port 8080`

## Artifact: Control Dashboard (React + Vite)

**Dir**: `artifacts/control-dashboard/`  
**Port**: `$PORT` (default 20266 in dev)  
**Preview path**: `/control-dashboard/`  
**Stack**: React 19, Vite 7, TailwindCSS 4, TanStack Query, Wouter, react-markdown

### Source files

| File | Purpose |
|---|---|
| `src/App.tsx` | Root — QueryClientProvider + ThemeProvider (dark) + ConnectionProvider + Wouter |
| `src/lib/ws-context.tsx` | ConnectionContext: WebSocket auto-reconnect, live state, connected bool |
| `src/pages/dashboard.tsx` | Main page: header + tab switcher (Live Controls / Show Designer / OSC Reference) |
| `src/components/LiveControls.tsx` | Env theme dropdown, intensity slider (debounced), 38 attributes in 6 collapsible groups |
| `src/components/ShowDesigner.tsx` | Grid: 38 attrs × 4 scenes; checkboxes per cell; save/reset via useUpdateShow/useResetShow |
| `src/components/OSCReference.tsx` | Fetches `/docs/OSC_API.md`, renders with react-markdown |

### Key behaviors

- **WebSocket**: Connects to `wss://<host>/ws`; auto-reconnects every 2s on drop; live state merges over query initial state
- **Scene buttons**: useTransitionTo + useTransitionNext; active scene highlighted in amber
- **Attribute groups**: Nature, Weather, Wildlife, City/Urban, Mystical/Arcane, Dramatic/Tension
- **Tempo extras**: heartbeat, war_drums, blacksmith show a BPM slider when enabled (useAttributeTempo)
- **Debounce**: Volume and intensity sliders debounce 250ms before sending API calls
- **Dark theme**: `.dark` added to `<html>` on mount; amber/gold accent palette

### Serving architecture

**Development (Replit)**: Vite dev server (port 20266) serves the dashboard at `/` via the artifact proxy. The API server (port 8080) handles `/api`, `/ws`, `/docs` on its own port.

**Production / Raspberry Pi deployment**:
1. Build the dashboard: `pnpm --filter @workspace/control-dashboard run build`
2. The API server detects the built output at `artifacts/control-dashboard/dist/public/` (or override via `DASHBOARD_DIST_DIR` env var) and serves it as static files at `/`. The Express server self-hosts both the API and the dashboard on a single port — no separate reverse proxy needed.

This means on a Raspberry Pi you run only one Node.js process (`pnpm --filter @workspace/api-server run start`) and visit `http://<pi-ip>:8080/` to access the dashboard.

## Codegen notes

OpenAPI spec: `lib/api-spec/openapi.yaml`  
Schema naming: Use `Result` suffix for response schemas (e.g. `AttributeToggleResult`) to avoid name collisions with orval-generated inline response types.  
Run codegen: `pnpm --filter @workspace/api-spec run codegen`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
