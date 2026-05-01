import {
  PHASES,
  ATTRIBUTE_NAMES,
  type Phase,
  type EnvironmentTheme,
  type AttributeName,
  type ShowConfig,
} from "./themes.config.js";
import {
  addSynth,
  setSynth,
  freeSynth,
  freeAllSynths,
  isSuperColliderReady,
} from "./supercollider.js";
import { logger } from "./logger.js";

export interface LiveState {
  currentPhase: Phase;
  environmentTheme: EnvironmentTheme;
  intensity: number;
  attributes: Record<AttributeName, { enabled: boolean; volume: number }>;
  muted: boolean;
  scReady: boolean;
}

type StateChangeCallback = (state: LiveState) => void;

const FADE_IN_TIME = 1.0;
const FADE_OUT_TIME = 1.0;
const THEME_CROSSFADE_TIME = 3.0;
const PHASE_CROSSFADE_TIME = 2.0;

let currentPhase: Phase = "daytime";
let environmentTheme: EnvironmentTheme = "forest";
let intensity: number = 0.3;
let muted: boolean = false;

let themeNodeId: number = -1;
let oldThemeNodeId: number = -1;
let themeTransitionTimer: ReturnType<typeof setTimeout> | null = null;

const attrNodeIds = new Map<AttributeName, number>();
const attrEnabled = new Map<AttributeName, boolean>();
const attrVolumes = new Map<AttributeName, number>();
const attrExtras = new Map<AttributeName, Record<string, number>>();

const listeners: StateChangeCallback[] = [];

export function onStateChange(cb: StateChangeCallback): void {
  listeners.push(cb);
}

function emit(): void {
  const state = getLiveState();
  for (const cb of listeners) {
    cb(state);
  }
}

export function getLiveState(): LiveState {
  const attributes = {} as Record<AttributeName, { enabled: boolean; volume: number }>;
  for (const name of ATTRIBUTE_NAMES) {
    attributes[name] = {
      enabled: attrEnabled.get(name) ?? false,
      volume: attrVolumes.get(name) ?? 0.7,
    };
  }
  return {
    currentPhase,
    environmentTheme,
    intensity,
    attributes,
    muted,
    scReady: isSuperColliderReady(),
  };
}

export function initFromShow(show: ShowConfig): void {
  currentPhase = PHASES[0];
  environmentTheme = show.environmentTheme;
  intensity = show.intensity;
  muted = show.muted;

  for (const name of ATTRIBUTE_NAMES) {
    attrVolumes.set(name, show.attributeVolumes[name] ?? 0.7);
    const tempo = show.attributeTempo[name];
    if (tempo !== undefined) {
      attrExtras.set(name, { ...(attrExtras.get(name) ?? {}), tempo });
    }
    attrEnabled.set(name, show.phases[currentPhase]?.attributes[name] ?? false);
  }
}

function effectiveAmp(volume: number): number {
  return muted ? 0 : Math.max(0, Math.min(1, volume));
}

function startThemeSynth(theme: EnvironmentTheme, amp: number): number {
  return addSynth(`env_${theme}`, {
    amp,
    intensity,
    gate: 1,
  });
}

export function applyTheme(theme: EnvironmentTheme): void {
  if (!isSuperColliderReady()) {
    environmentTheme = theme;
    emit();
    return;
  }

  if (themeTransitionTimer) {
    clearTimeout(themeTransitionTimer);
  }

  const newNodeId = startThemeSynth(theme, 0);

  if (themeNodeId >= 0) {
    setSynth(themeNodeId, { amp: 0, fadeTime: THEME_CROSSFADE_TIME });
    oldThemeNodeId = themeNodeId;
    themeTransitionTimer = setTimeout(() => {
      if (oldThemeNodeId >= 0) {
        freeSynth(oldThemeNodeId);
        oldThemeNodeId = -1;
      }
    }, THEME_CROSSFADE_TIME * 1000 + 500);
  }

  setSynth(newNodeId, { amp: effectiveAmp(1), fadeTime: THEME_CROSSFADE_TIME, intensity });
  themeNodeId = newNodeId;
  environmentTheme = theme;
  emit();
}

export function setIntensity(value: number): void {
  intensity = Math.max(0, Math.min(1, value));
  if (themeNodeId >= 0 && isSuperColliderReady()) {
    setSynth(themeNodeId, { intensity });
  }
  for (const [name, nodeId] of attrNodeIds.entries()) {
    if (nodeId >= 0 && attrEnabled.get(name)) {
      setSynth(nodeId, { intensity });
    }
  }
  emit();
}

export function setPhase(phase: Phase, show: ShowConfig): void {
  currentPhase = phase;
  const phaseConfig = show.phases[phase];

  if (isSuperColliderReady() && themeNodeId >= 0) {
    setSynth(themeNodeId, {
      phaseOffset: PHASES.indexOf(phase) * 0.1,
      fadeTime: PHASE_CROSSFADE_TIME,
    });
  }

  for (const name of ATTRIBUTE_NAMES) {
    const shouldBeEnabled = phaseConfig?.attributes[name] ?? false;
    const currentlyEnabled = attrEnabled.get(name) ?? false;
    if (shouldBeEnabled !== currentlyEnabled) {
      if (shouldBeEnabled) {
        enableAttribute(name);
      } else {
        disableAttribute(name);
      }
    }
  }
  emit();
}

export function nextPhase(show: ShowConfig): Phase {
  const idx = PHASES.indexOf(currentPhase);
  const next = PHASES[(idx + 1) % PHASES.length];
  setPhase(next, show);
  return next;
}

export function enableAttribute(name: AttributeName): void {
  attrEnabled.set(name, true);
  if (!isSuperColliderReady()) {
    emit();
    return;
  }
  const existing = attrNodeIds.get(name);
  if (existing !== undefined && existing >= 0) {
    setSynth(existing, { amp: effectiveAmp(attrVolumes.get(name) ?? 0.7), fadeTime: FADE_IN_TIME });
    emit();
    return;
  }
  const extras = attrExtras.get(name) ?? {};
  const nodeId = addSynth(`attr_${name}`, {
    amp: 0,
    intensity,
    ...extras,
  });
  attrNodeIds.set(name, nodeId);
  setSynth(nodeId, {
    amp: effectiveAmp(attrVolumes.get(name) ?? 0.7),
    fadeTime: FADE_IN_TIME,
  });
  emit();
}

export function disableAttribute(name: AttributeName): void {
  attrEnabled.set(name, false);
  const nodeId = attrNodeIds.get(name);
  if (nodeId !== undefined && nodeId >= 0 && isSuperColliderReady()) {
    setSynth(nodeId, { amp: 0, fadeTime: FADE_OUT_TIME });
    setTimeout(() => {
      if (!attrEnabled.get(name)) {
        freeSynth(nodeId);
        attrNodeIds.delete(name);
      }
    }, FADE_OUT_TIME * 1000 + 300);
  }
  emit();
}

export function toggleAttribute(name: AttributeName): boolean {
  const current = attrEnabled.get(name) ?? false;
  if (current) {
    disableAttribute(name);
  } else {
    enableAttribute(name);
  }
  return !current;
}

export function setAttributeVolume(name: AttributeName, volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  attrVolumes.set(name, clamped);
  const nodeId = attrNodeIds.get(name);
  if (nodeId !== undefined && nodeId >= 0 && isSuperColliderReady()) {
    setSynth(nodeId, { amp: effectiveAmp(clamped) });
  }
  emit();
}

export function setAttributeExtra(name: AttributeName, key: string, value: number): void {
  const extras = attrExtras.get(name) ?? {};
  extras[key] = value;
  attrExtras.set(name, extras);
  const nodeId = attrNodeIds.get(name);
  if (nodeId !== undefined && nodeId >= 0 && isSuperColliderReady()) {
    setSynth(nodeId, { [key]: value });
  }
  emit();
}

export function setMuted(value: boolean): void {
  muted = value;
  if (themeNodeId >= 0 && isSuperColliderReady()) {
    setSynth(themeNodeId, { amp: value ? 0 : 1, fadeTime: 1.0 });
  }
  for (const [name, nodeId] of attrNodeIds.entries()) {
    if (nodeId >= 0 && attrEnabled.get(name)) {
      const vol = attrVolumes.get(name) ?? 0.7;
      setSynth(nodeId, { amp: value ? 0 : effectiveAmp(vol), fadeTime: 1.0 });
    }
  }
  emit();
}

export function startAudioEngine(show: ShowConfig): void {
  if (!isSuperColliderReady()) {
    logger.warn("SuperCollider not ready — will start audio when SC is ready");
    return;
  }
  themeNodeId = startThemeSynth(show.environmentTheme, 1);
  environmentTheme = show.environmentTheme;
  const phaseConfig = show.phases[currentPhase];
  for (const name of ATTRIBUTE_NAMES) {
    if (phaseConfig?.attributes[name]) {
      enableAttribute(name);
    }
  }
  emit();
}

export function teardown(): void {
  freeAllSynths();
  attrNodeIds.clear();
  attrEnabled.clear();
  themeNodeId = -1;
}
