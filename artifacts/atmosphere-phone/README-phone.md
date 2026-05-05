# Atmosphere Phone

A standalone two-phone tabletop RPG atmosphere system built with Expo (React Native).

Replaces a Raspberry Pi setup — no server hardware required. Two phones on the same WiFi network handle everything.

---

## How It Works

| Phone | Role | Description |
|-------|------|-------------|
| **Presentation** | Display | Full-screen animated visuals + generative audio via Tone.js |
| **Controller** | Dashboard | Phase, theme, sound, and intensity controls |

Both phones connect to a lightweight **relay server** running on any laptop on the same WiFi.

---

## Quick Start

### 1. Start the Relay Server

On any computer on your WiFi network:

```bash
node relay-server/index.js
```

The relay prints its IP address. Note it — you'll enter it in both phones.

### 2. Launch the App

Open the app on both phones via **Expo Go** (scan the QR code from the Replit preview pane).

### 3. Configure the Relay URL

Tap **"Relay server URL"** on the mode picker and enter:
```
ws://192.168.x.x:3001
```
Replace `192.168.x.x` with your laptop's IP (shown when you start the relay).

### 4. Choose Roles

- **Presentation phone**: Select **Presentation** — place it facing your players
- **Controller phone**: Select **Controller** — keep it hidden behind a screen

The controller automatically syncs the atmosphere display in real time.

---

## Features

### Presentation Mode
- Full-screen animated sky/atmosphere for each phase (Daytime, Evening, Night, Dawn)
- Phase-reactive particles: stars, birds, embers, fireflies, dawn mist
- Theme color tinting (13 environments)
- Generative audio engine (38 synth attributes, no audio files required)
- Tap to toggle HUD overlay

### Controller Mode — Atmosphere Tab
- **Phase control**: Daytime / Evening / Night / Dawn
- **Environment themes**: Forest, Ocean, Mountain, Desert, City, Mystical, Medieval, Underwater, Cosmic, Cave, Arctic, Jungle, Tavern
- **Intensity slider**: scene darkness/brightness
- **Master volume**
- **Synthesis controls**: Reverb, Low-pass filter, Pitch shift

### Controller Mode — Sounds Tab
- 38 audio attributes organized by category
- Enable/disable each attribute individually
- Per-attribute volume control (long-press → expand)
- Live count of active sounds

### Controller Mode — Voice Tab
- Push-to-talk microphone button (native build)
- 8 preset narrator lines with one-tap display
- Recording timer

---

## Environments (13 Themes)

| Theme | Key Sounds |
|-------|-----------|
| Forest | Wind, Birds, Crickets, Stream |
| Ocean | Ocean Waves, Seagulls, Wind |
| Mountain | Wind, Birds, Stream, Waterfall |
| Desert | Wind, Sandstorm, Crickets |
| City | Traffic, Crowd, City Rain |
| Mystical | Singing Bowls, Whispers, Portal Hum, Choir Pad |
| Medieval | Wind, Ravens, Church Bells |
| Underwater | Ocean Waves, Singing Bowls, Portal Hum |
| Cosmic | Portal Hum, Tension Drone, Singing Bowls |
| Cave | Dripping Cave, Bats, Geothermal |
| Arctic | Blizzard, Wind, Owls |
| Jungle | Rain, Birds, Night Insects, Frogs |
| Tavern | Tavern Crowd, Campfire, Chimes |

---

## Audio Attributes (38)

**Nature**: Wind, Rain, Thunder, Distant Thunder, Blizzard, Sandstorm, Geothermal  
**Water**: Ocean Waves, Stream, Waterfall, City Rain, Dripping Cave  
**Wildlife**: Crickets, Birds, Owls, Frogs, Wolves, Ravens, Bats, Night Insects, Horses, Seagulls  
**Fire**: Campfire  
**Urban**: Traffic, Crowd, Subway, Sirens  
**Mystical**: Singing Bowls, Chimes, Whispers, Choir Pad, Portal Hum, Tension Drone  
**Dramatic**: Heartbeat, War Drums, Blacksmith, Church Bells, Tavern Crowd  

All sounds are generated synthetically using **Tone.js** — no audio files are downloaded or stored.

---

## Expo Go vs Standalone Build

| Feature | Expo Go | Standalone Build |
|---------|---------|-----------------|
| UI & navigation | ✅ | ✅ |
| Visual display | ✅ | ✅ |
| Network relay (WiFi) | ✅ | ✅ |
| Tone.js audio engine | ✅ (iOS/Android) | ✅ |
| Voice recording | ❌ | ✅ |

### Build a Standalone IPA/APK

Use Replit's **Expo Launch** for iOS App Store submission, or EAS Build for Android:

```bash
# Android APK (run locally or on EAS)
npx eas build --platform android --profile preview
```

---

## Network Architecture

```
Laptop (relay-server)
    ├── Presentation Phone → sends STATE_SYNC → relay → Controller
    └── Controller Phone   → sends commands → relay → Presentation
```

The relay is stateless — it just routes messages between roles. If the relay goes down, reconnect automatically resumes within 3 seconds.

---

## Development

```bash
# Start relay server
node relay-server/index.js

# Start Expo dev server (in project root)
pnpm --filter @workspace/atmosphere-phone dev
```

Scan the QR code with **Expo Go** on your phone.

---

## Project Structure

```
artifacts/atmosphere-phone/
├── app/
│   ├── _layout.tsx          # Root layout + providers
│   ├── index.tsx            # Mode picker
│   ├── presentation.tsx     # Presentation mode
│   └── controller/
│       ├── _layout.tsx      # Tab bar
│       ├── index.tsx        # Atmosphere controls
│       ├── sounds.tsx       # Sound attribute grid
│       └── voice.tsx        # Voice / narration
├── src/
│   ├── types.ts             # Shared TypeScript types
│   ├── themes.config.ts     # 13 themes, 38 attributes, phase data
│   ├── defaultState.ts      # Default atmosphere state
│   ├── context/
│   │   ├── AppContext.tsx   # Mode + relay URL persistence
│   │   ├── StateContext.tsx # Atmosphere state (source of truth)
│   │   └── NetworkContext.tsx # WebSocket relay client
│   ├── audio-engine/
│   │   └── engine.html      # Tone.js synth engine (WebView)
│   └── components/
│       ├── audio/AudioEngine.tsx   # WebView wrapper
│       ├── visual/PhaseRenderer.tsx # Animated phase display
│       └── ui/SliderControl.tsx    # Custom slider
├── relay-server/
│   └── index.js             # Node.js WebSocket relay
└── README-phone.md
```
