import {
  PHASES,
  ATTRIBUTE_NAMES,
  DEFAULT_PHASE_PARAMS,
  DEFAULT_VOICE_PARAMS,
  type Phase,
  type PhaseParams,
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

export interface VoiceState {
  active: boolean;
  gain: number;
  reverb: number;
}

export interface LiveState {
  timestamp: number;
  currentPhase: Phase;
  environmentTheme: EnvironmentTheme;
  intensity: number;
  phaseParams: PhaseParams;
  attributes: Record<AttributeName, { enabled: boolean; volume: number; distance?: number }>;
  muted: boolean;
  scReady: boolean;
  voice: VoiceState;
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
let currentPhaseParams: PhaseParams = { ...DEFAULT_PHASE_PARAMS.daytime };

let themeNodeId: number = -1;
let oldThemeNodeId: number = -1;
let themeTransitionTimer: ReturnType<typeof setTimeout> | null = null;

const attrNodeIds = new Map<AttributeName, number>();
const attrEnabled = new Map<AttributeName, boolean>();
const attrVolumes = new Map<AttributeName, number>();
const attrExtras = new Map<AttributeName, Record<string, number>>();

let voiceActive: boolean = false;
let voiceGain: number = DEFAULT_VOICE_PARAMS.gain;
let voiceReverb: number = DEFAULT_VOICE_PARAMS.reverb;
let voiceNodeId: number = -1;

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
  const attributes = {} as Record<AttributeName, { enabled: boolean; volume: number; distance?: number }>;
  for (const name of ATTRIBUTE_NAMES) {
    const extras = attrExtras.get(name);
    const distance = extras?.["distance"];
    attributes[name] = {
      enabled: attrEnabled.get(name) ?? false,
      volume: attrVolumes.get(name) ?? 0.7,
      ...(distance !== undefined ? { distance } : {}),
    };
  }
  return {
    timestamp: Date.now(),
    currentPhase,
    environmentTheme,
    intensity,
    phaseParams: { ...currentPhaseParams },
    attributes,
    muted,
    scReady: isSuperColliderReady(),
    voice: { active: voiceActive, gain: voiceGain, reverb: voiceReverb },
  };
}

export function initFromShow(show: ShowConfig): void {
  currentPhase = PHASES[0];
  const initPhaseConfig = show.phases[currentPhase];
  // Resolve effective theme/intensity respecting per-scene overrides
  environmentTheme = initPhaseConfig?.environmentTheme ?? show.environmentTheme;
  intensity = initPhaseConfig?.intensity ?? show.intensity;
  muted = show.muted;
  currentPhaseParams = {
    ...(DEFAULT_PHASE_PARAMS[currentPhase]),
    ...(initPhaseConfig?.params ?? {}),
  };

  for (const name of ATTRIBUTE_NAMES) {
    attrVolumes.set(name, show.attributeVolumes[name] ?? 0.7);
    const tempo = show.attributeTempo[name];
    if (tempo !== undefined) {
      attrExtras.set(name, { ...(attrExtras.get(name) ?? {}), tempo });
    }
    attrEnabled.set(name, initPhaseConfig?.attributes[name] ?? false);
  }

  voiceGain = show.voice?.gain ?? DEFAULT_VOICE_PARAMS.gain;
  voiceReverb = show.voice?.reverb ?? DEFAULT_VOICE_PARAMS.reverb;
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

  currentPhaseParams = {
    ...(DEFAULT_PHASE_PARAMS[phase]),
    ...(phaseConfig?.params ?? {}),
  };

  if (isSuperColliderReady() && themeNodeId >= 0) {
    setSynth(themeNodeId, {
      reverb:      currentPhaseParams.reverb,
      lpfFreq:     currentPhaseParams.lpfFreq,
      masterPitch: currentPhaseParams.masterPitch,
      fadeTime:    PHASE_CROSSFADE_TIME,
    });
  }

  // Apply per-scene environment theme override if present, otherwise use show global
  const effectiveTheme = phaseConfig?.environmentTheme ?? show.environmentTheme;
  if (effectiveTheme !== environmentTheme) {
    applyTheme(effectiveTheme);
  }

  // Apply per-scene intensity override if present, otherwise use show global
  const effectiveIntensity = phaseConfig?.intensity ?? show.intensity;
  if (effectiveIntensity !== intensity) {
    setIntensity(effectiveIntensity);
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

export function setPhaseParams(params: Partial<PhaseParams>): void {
  if (params.reverb !== undefined) {
    currentPhaseParams.reverb = Math.max(0, Math.min(1, params.reverb));
  }
  if (params.lpfFreq !== undefined) {
    currentPhaseParams.lpfFreq = Math.max(500, Math.min(20000, params.lpfFreq));
  }
  if (params.masterPitch !== undefined) {
    currentPhaseParams.masterPitch = Math.max(-12, Math.min(12, params.masterPitch));
  }
  if (isSuperColliderReady() && themeNodeId >= 0) {
    setSynth(themeNodeId, {
      reverb:      currentPhaseParams.reverb,
      lpfFreq:     currentPhaseParams.lpfFreq,
      masterPitch: currentPhaseParams.masterPitch,
    });
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
  // Resolve effective theme/intensity using per-scene override or show global,
  // matching the semantics of initFromShow() and setPhase().
  const initPhaseConfig = show.phases[currentPhase];
  const effectiveTheme = initPhaseConfig?.environmentTheme ?? show.environmentTheme;
  const effectiveIntensity = initPhaseConfig?.intensity ?? show.intensity;

  environmentTheme = effectiveTheme;
  intensity = effectiveIntensity;

  themeNodeId = startThemeSynth(effectiveTheme, effectiveAmp(1.0));

  if (themeNodeId >= 0) {
    setSynth(themeNodeId, {
      reverb:      currentPhaseParams.reverb,
      lpfFreq:     currentPhaseParams.lpfFreq,
      masterPitch: currentPhaseParams.masterPitch,
    });
  }

  const phaseConfig = show.phases[currentPhase];
  for (const name of ATTRIBUTE_NAMES) {
    if (phaseConfig?.attributes[name]) {
      enableAttribute(name);
    }
  }
  emit();
}

export function applyShowConfig(show: ShowConfig): void {
  if (show.environmentTheme !== environmentTheme) {
    applyTheme(show.environmentTheme);
  }

  if (show.intensity !== intensity) {
    setIntensity(show.intensity);
  }

  if (show.muted !== muted) {
    setMuted(show.muted);
  }

  for (const name of ATTRIBUTE_NAMES) {
    const vol = show.attributeVolumes[name] ?? 0.7;
    if (vol !== (attrVolumes.get(name) ?? 0.7)) {
      setAttributeVolume(name, vol);
    }

    const tempo = show.attributeTempo[name];
    if (tempo !== undefined) {
      setAttributeExtra(name, "tempo", tempo);
    }
  }

  const phaseConfig = show.phases[currentPhase];
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

  currentPhaseParams = {
    ...(DEFAULT_PHASE_PARAMS[currentPhase]),
    ...(phaseConfig?.params ?? {}),
  };

  if (isSuperColliderReady() && themeNodeId >= 0) {
    setSynth(themeNodeId, {
      reverb:      currentPhaseParams.reverb,
      lpfFreq:     currentPhaseParams.lpfFreq,
      masterPitch: currentPhaseParams.masterPitch,
      fadeTime:    PHASE_CROSSFADE_TIME,
    });
  }

  // Apply per-scene theme/intensity overrides for the current phase
  const effectiveTheme = phaseConfig?.environmentTheme ?? show.environmentTheme;
  if (effectiveTheme !== environmentTheme) {
    applyTheme(effectiveTheme);
  }
  const effectiveIntensity = phaseConfig?.intensity ?? show.intensity;
  if (effectiveIntensity !== intensity) {
    setIntensity(effectiveIntensity);
  }

  const newVoiceGain = show.voice?.gain ?? DEFAULT_VOICE_PARAMS.gain;
  const newVoiceReverb = show.voice?.reverb ?? DEFAULT_VOICE_PARAMS.reverb;
  if (newVoiceGain !== voiceGain || newVoiceReverb !== voiceReverb) {
    setVoiceParams(newVoiceGain, newVoiceReverb);
  }

  emit();
}

export function startVoice(): void {
  if (voiceActive) return;
  voiceActive = true;
  if (isSuperColliderReady()) {
    voiceNodeId = addSynth("voiceMix", { amp: voiceGain, reverb: voiceReverb });
    logger.info({ voiceNodeId }, "Voice mix synth started");
  }
  emit();
}

export function stopVoice(): void {
  if (!voiceActive) return;
  voiceActive = false;
  if (voiceNodeId >= 0 && isSuperColliderReady()) {
    setSynth(voiceNodeId, { amp: 0, fadeTime: 0.5 });
    const nodeToFree = voiceNodeId;
    setTimeout(() => {
      freeSynth(nodeToFree);
    }, 700);
    voiceNodeId = -1;
  }
  emit();
}

export function setVoiceParams(gain: number, reverb: number): void {
  voiceGain = Math.max(0, Math.min(1, gain));
  voiceReverb = Math.max(0, Math.min(1, reverb));
  if (voiceNodeId >= 0 && isSuperColliderReady()) {
    setSynth(voiceNodeId, { amp: voiceActive ? voiceGain : 0, reverb: voiceReverb });
  }
  emit();
}

export function getVoiceState(): VoiceState {
  return { active: voiceActive, gain: voiceGain, reverb: voiceReverb };
}

export function teardown(): void {
  freeAllSynths();
  attrNodeIds.clear();
  attrEnabled.clear();
  themeNodeId = -1;
  oldThemeNodeId = -1;
  voiceNodeId = -1;
  voiceActive = false;
  if (themeTransitionTimer) {
    clearTimeout(themeTransitionTimer);
    themeTransitionTimer = null;
  }
}
