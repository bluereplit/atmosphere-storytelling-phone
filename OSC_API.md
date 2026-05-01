# Atmosphere Storytelling System — OSC API Reference

## Overview

The Atmosphere System exposes a UDP OSC interface that accepts commands from any OSC-compatible application on the local network. The system also listens for commands via REST HTTP — every OSC command has a matching HTTP endpoint.

## Connection

| Protocol | Port | Default |
|----------|------|---------|
| UDP OSC  | 57120 | Configurable via `OSC_PORT` environment variable |
| HTTP REST | (same as web server) | Configurable via `PORT` environment variable |

All OSC messages use **OSC 1.0** format. The system responds to messages from any sender IP.

---

## Scene Transitions

### `/transition/next`
Advance to the next atmosphere scene in the cycle: Daytime → Evening → Night → Dawn → Daytime.

- **Arguments:** none
- **REST:** `POST /api/transition/next`
- **Example:** `/transition/next`

---

### `/transition/to <phase>`
Jump directly to a named scene.

- **Arguments:** `phase` (string) — one of: `daytime`, `evening`, `night`, `dawn`
- **REST:** `POST /api/transition/to/:phase`
- **Example:** `/transition/to night`

---

## Environment Theme

The environment theme is a persistent generative audio texture that spans all 5 scenes. It provides the underlying musical character of the world.

### `/environment/set <theme>`
Set the active environment theme. Crossfades over 3 seconds.

- **Arguments:** `theme` (string) — one of:
  `forest`, `ocean`, `mountain`, `desert`, `city`, `mystical`, `medieval`, `underwater`, `cosmic`, `cave`, `arctic`, `jungle`, `tavern`
- **REST:** `POST /api/environment/set/:theme`
- **Example:** `/environment/set mystical`

---

### `/environment/intensity <value>`
Morph the energy of the environment theme from calm to intense.

- **Arguments:** `value` (float, 0.0–1.0) — 0.0 = very calm, 1.0 = intense
- **REST:** `POST /api/environment/intensity` with body `{ "value": 0.7 }`
- **Example:** `/environment/intensity 0.7`

---

## Audio Attributes

Attributes are individual sound layers that can be toggled on and off independently. Each has its own volume control. Some have additional parameters.

### `/attribute/<name>/on`
Enable an audio attribute (fades in over ~1 second).

- **REST:** `POST /api/attribute/:name/on`
- **Example:** `/attribute/crickets/on`

### `/attribute/<name>/off`
Disable an audio attribute (fades out over ~1 second).

- **REST:** `POST /api/attribute/:name/off`
- **Example:** `/attribute/wolves/off`

### `/attribute/<name>/toggle`
Toggle an audio attribute on or off.

- **REST:** `POST /api/attribute/:name/toggle`
- **Example:** `/attribute/campfire/toggle`

### `/attribute/<name>/volume <value>`
Set the volume of an attribute.

- **Arguments:** `value` (float, 0.0–1.0)
- **REST:** `POST /api/attribute/:name/volume` with body `{ "value": 0.8 }`
- **Example:** `/attribute/rain/volume 0.6`

### `/attribute/<name>/tempo <bpm>`
Set the tempo for rhythm-based attributes (heartbeat, war_drums, blacksmith).

- **Arguments:** `bpm` (float, positive)
- **REST:** `POST /api/attribute/:name/tempo` with body `{ "value": 72 }`
- **Example:** `/attribute/heartbeat/tempo 80`

### `/attribute/<name>/distance <value>`
Set the perceived distance for distance-aware attributes (war_drums).

- **Arguments:** `value` (float, 0.0–1.0) — 0.0 = close, 1.0 = very distant
- **REST:** `POST /api/attribute/:name/distance` with body `{ "value": 0.8 }`
- **Example:** `/attribute/war_drums/distance 0.9`

---

## Available Attribute Names

### Nature — Original
| Name | Description |
|------|-------------|
| `crickets` | Chirping cricket rhythm |
| `birds` | Stochastic melodic bird calls |
| `wind` | Filtered wind noise |
| `owls` | Sparse owl hoots |
| `campfire` | Crackling fire |
| `ocean_waves` | Rhythmic wave texture |
| `rain` | Rainfall |
| `thunder` | Thunder strikes |
| `frogs` | Croaking frogs |
| `stream` | Babbling stream |

### Nature — Extended
| Name | Description |
|------|-------------|
| `wolves` | Howling wolves |
| `ravens` | Harsh raven calls |
| `bats` | High-frequency bat flutter |
| `insects_night` | Dense nighttime insect mass |
| `horses` | Hoof beats and whinnying |
| `waterfall` | Roaring waterfall |
| `blizzard` | Howling blizzard |
| `sandstorm` | Gritty sandstorm |
| `geothermal` | Bubbling volcanic vents |

### City / Urban
| Name | Description |
|------|-------------|
| `traffic` | Distant traffic hum |
| `crowd` | Crowd murmur |
| `subway` | Subway rumble |
| `sirens` | Emergency sirens |
| `rain_city` | Rain on urban surfaces |

### Mystical / Arcane
| Name | Description |
|------|-------------|
| `singing_bowls` | Resonant singing bowls |
| `chimes` | Wind chimes |
| `whispers` | Eerie whisper texture |
| `choir_pad` | Ethereal choir harmonics |
| `portal_hum` | Rotating portal hum |

### Dramatic / Tension
| Name | Description |
|------|-------------|
| `heartbeat` | Sub-frequency heartbeat pulse (tempo-adjustable) |
| `war_drums` | Distant war drums (tempo + distance adjustable) |
| `tension_drone` | Dissonant cello drone |
| `thunder_distant` | Distant rolling thunder rumble |

### Medieval / Historical
| Name | Description |
|------|-------------|
| `blacksmith` | Rhythmic blacksmith hammering (tempo-adjustable) |
| `church_bells` | Slow church bell tolling |
| `tavern_crowd` | Indoor tavern murmur |

---

## Master Audio Control

### `/audio/mute`
Mute all audio output (fades out over 1 second).

- **REST:** `POST /api/audio/mute`

### `/audio/unmute`
Restore audio output.

- **REST:** `POST /api/audio/unmute`

---

## Display Control

### `/display/overlay/toggle`
Toggle the status overlay on the visual display (shows/hides the current scene name).

- **REST:** broadcast via WebSocket only

---

## State & Configuration

### Get current state
`GET /api/state`

Returns the full live state:
```json
{
  "currentPhase": "evening",
  "environmentTheme": "forest",
  "intensity": 0.4,
  "attributes": {
    "crickets": { "enabled": true, "volume": 0.7 },
    "campfire": { "enabled": true, "volume": 0.8 }
  },
  "muted": false,
  "scReady": true
}
```

### Get show configuration
`GET /api/show`

Returns the full show configuration including per-phase attribute settings.

### Save show configuration
`PUT /api/show`

Send a partial or full show configuration object to update and persist it.

### Reset to defaults
`POST /api/show/reset`

Resets the show configuration to factory defaults.

### Audio system status
`GET /api/audio/status`

Returns SuperCollider status and OSC port.

---

## WebSocket Live Feed

Connect to `ws://<host>:<port>/ws` to receive real-time state updates.

Every state change broadcasts a JSON message:
```json
{
  "type": "state",
  "currentPhase": "night",
  "environmentTheme": "mystical",
  "intensity": 0.6,
  "attributes": { ... },
  "muted": false,
  "scReady": true
}
```

---

## Quick Start for Third-Party Controllers

### TouchOSC / Lemur / OSCHook
1. Set the target IP to your Raspberry Pi's IP address
2. Set the target UDP port to `57120`
3. Send messages using the address patterns above

### Max/MSP
```
[udpsend 192.168.1.100 57120]
[prepend /transition/to]
[message night]
```

### Pure Data
```
[netclient 192.168.1.100 57120 UDP]
[pack s s] → /transition/to night
```

### Python (using python-osc)
```python
from pythonosc import udp_client
client = udp_client.SimpleUDPClient("192.168.1.100", 57120)
client.send_message("/environment/set", "mystical")
client.send_message("/attribute/crickets/on", [])
client.send_message("/environment/intensity", 0.8)
```

---

## Scenes Reference

| Scene | Default Active Attributes |
|-------|--------------------------|
| `daytime` | birds, wind, stream |
| `evening` | crickets, wind, campfire, frogs |
| `night` | crickets, owls, insects_night, wind |
| `dawn` | birds, wind, stream |
