import { Server as OscServer } from "node-osc";
import { logger } from "./logger.js";
import type { ShowConfig } from "./themes.config.js";
import {
  PHASES,
  ENVIRONMENT_THEMES,
  ATTRIBUTE_NAMES,
  type Phase,
  type EnvironmentTheme,
  type AttributeName,
} from "./themes.config.js";
import {
  applyTheme,
  setIntensity,
  setPhase,
  nextPhase,
  enableAttribute,
  disableAttribute,
  toggleAttribute,
  setAttributeVolume,
  setAttributeExtra,
  setMuted,
} from "./stateManager.js";

const OSC_PORT = parseInt(process.env["OSC_PORT"] ?? "57120", 10);

let oscServer: OscServer | null = null;
let getShow: (() => ShowConfig) | null = null;
let displayOverlayToggle: (() => void) | null = null;

export function initOscServer(
  showGetter: () => ShowConfig,
  overlayToggle: () => void
): void {
  getShow = showGetter;
  displayOverlayToggle = overlayToggle;

  try {
    oscServer = new OscServer(OSC_PORT, "0.0.0.0", () => {
      logger.info({ port: OSC_PORT }, "OSC server listening");
    });

    oscServer.on("message", (msg) => {
      const [address, ...args] = msg;
      handleOscMessage(String(address), args as (string | number)[]);
    });

    oscServer.on("error", (err) => {
      logger.error({ err }, "OSC server error");
    });
  } catch (err) {
    logger.error({ err }, "Failed to start OSC server");
  }
}

export function stopOscServer(): void {
  if (oscServer) {
    oscServer.close();
    oscServer = null;
  }
}

function handleOscMessage(address: string, args: (string | number)[]): void {
  logger.debug({ address, args }, "OSC message received");

  const show = getShow?.() ?? null;
  if (!show) return;

  const parts = address.replace(/^\//, "").split("/");

  if (parts[0] === "transition") {
    handleTransition(parts, args, show);
    return;
  }

  if (parts[0] === "environment") {
    handleEnvironment(parts, args);
    return;
  }

  if (parts[0] === "attribute") {
    handleAttribute(parts, args);
    return;
  }

  if (parts[0] === "audio") {
    handleAudio(parts, args);
    return;
  }

  if (address === "/display/overlay/toggle") {
    displayOverlayToggle?.();
    return;
  }

  logger.warn({ address }, "Unknown OSC address");
}

function handleTransition(
  parts: string[],
  args: (string | number)[],
  show: ShowConfig
): void {
  if (parts[1] === "next") {
    nextPhase(show);
    return;
  }
  if (parts[1] === "to") {
    const phaseVal = parts[2] ?? String(args[0] ?? "");
    const phase = phaseVal as Phase;
    if (PHASES.includes(phase)) {
      setPhase(phase, show);
    } else {
      logger.warn({ phase: phaseVal }, "Unknown phase in /transition/to");
    }
    return;
  }
  if (parts[1] && PHASES.includes(parts[1] as Phase)) {
    setPhase(parts[1] as Phase, show);
  }
}

function handleEnvironment(parts: string[], args: (string | number)[]): void {
  if (parts[1] === "set") {
    const theme = (parts[2] ?? String(args[0])) as EnvironmentTheme;
    if (ENVIRONMENT_THEMES.includes(theme)) {
      applyTheme(theme);
    } else {
      logger.warn({ theme }, "Unknown environment theme");
    }
    return;
  }
  if (parts[1] === "intensity") {
    const val = Number(args[0] ?? parts[2]);
    if (!isNaN(val)) setIntensity(val);
    return;
  }
}

function handleAttribute(parts: string[], args: (string | number)[]): void {
  const name = parts[1] as AttributeName;
  if (!name || !ATTRIBUTE_NAMES.includes(name)) {
    logger.warn({ name }, "Unknown attribute name");
    return;
  }

  const action = parts[2];

  if (action === "on") { enableAttribute(name); return; }
  if (action === "off") { disableAttribute(name); return; }
  if (action === "toggle") { toggleAttribute(name); return; }
  if (action === "volume") {
    const val = Number(args[0] ?? parts[3]);
    if (!isNaN(val)) setAttributeVolume(name, val);
    return;
  }
  if (action === "tempo") {
    const val = Number(args[0] ?? parts[3]);
    if (!isNaN(val)) setAttributeExtra(name, "tempo", val);
    return;
  }
  if (action === "distance") {
    const val = Number(args[0] ?? parts[3]);
    if (!isNaN(val)) setAttributeExtra(name, "distance", val);
    return;
  }
}

function handleAudio(parts: string[], _args: (string | number)[]): void {
  if (parts[1] === "mute") { setMuted(true); return; }
  if (parts[1] === "unmute") { setMuted(false); return; }
}

export function getOscPort(): number {
  return OSC_PORT;
}
