export const PHASES = ["daytime", "evening", "night", "dawn"] as const;
export type Phase = (typeof PHASES)[number];

export const ENVIRONMENT_THEMES = [
  "forest",
  "ocean",
  "mountain",
  "desert",
  "city",
  "mystical",
  "medieval",
  "underwater",
  "cosmic",
  "cave",
  "arctic",
  "jungle",
  "tavern",
] as const;
export type EnvironmentTheme = (typeof ENVIRONMENT_THEMES)[number];

export const ATTRIBUTE_NAMES = [
  "crickets",
  "birds",
  "wind",
  "owls",
  "campfire",
  "ocean_waves",
  "rain",
  "thunder",
  "frogs",
  "stream",
  "wolves",
  "ravens",
  "bats",
  "insects_night",
  "horses",
  "waterfall",
  "blizzard",
  "sandstorm",
  "geothermal",
  "traffic",
  "crowd",
  "subway",
  "sirens",
  "rain_city",
  "singing_bowls",
  "chimes",
  "whispers",
  "choir_pad",
  "portal_hum",
  "heartbeat",
  "war_drums",
  "tension_drone",
  "thunder_distant",
  "blacksmith",
  "church_bells",
  "tavern_crowd",
  "seagulls",
  "dripping_cave",
] as const;
export type AttributeName = (typeof ATTRIBUTE_NAMES)[number];

export interface AttributeState {
  enabled: boolean;
  volume: number;
  tempo?: number;
  distance?: number;
}

export interface PhaseParams {
  reverb: number;        // 0–1 reverb wet mix
  lpfFreq: number;       // low-pass filter cutoff Hz
  masterPitch: number;   // master pitch shift semitones
}

export interface PhaseConfig {
  attributes: Record<AttributeName, boolean>;
  params: PhaseParams;
  environmentTheme?: EnvironmentTheme;
  intensity?: number;
}

export interface ShowConfig {
  environmentTheme: EnvironmentTheme;
  intensity: number;
  phases: Record<Phase, PhaseConfig>;
  attributeVolumes: Record<AttributeName, number>;
  attributeTempo: Partial<Record<AttributeName, number>>;
  muted: boolean;
}

export const DEFAULT_PHASE_PARAMS: Record<Phase, PhaseParams> = {
  daytime: { reverb: 0.15, lpfFreq: 12000, masterPitch: 0 },
  evening: { reverb: 0.25, lpfFreq: 8000,  masterPitch: -1 },
  night:   { reverb: 0.40, lpfFreq: 5000,  masterPitch: -3 },
  dawn:    { reverb: 0.20, lpfFreq: 10000, masterPitch: 1  },
};

export const DEFAULT_PHASE_ATTRIBUTES: Record<Phase, Partial<Record<AttributeName, boolean>>> = {
  daytime: {
    birds: true,
    wind: true,
    crickets: false,
    stream: true,
  },
  evening: {
    crickets: true,
    wind: true,
    campfire: true,
    frogs: true,
  },
  night: {
    crickets: true,
    owls: true,
    insects_night: true,
    wind: true,
  },
  dawn: {
    birds: true,
    wind: true,
    stream: true,
    frogs: false,
  },
};

export const DEFAULT_ATTRIBUTE_VOLUMES: Record<AttributeName, number> = Object.fromEntries(
  ATTRIBUTE_NAMES.map((n) => [n, 0.7])
) as Record<AttributeName, number>;

export const DEFAULT_ATTRIBUTE_TEMPO: Partial<Record<AttributeName, number>> = {
  heartbeat: 60,
  war_drums: 80,
  blacksmith: 72,
};

export function buildDefaultShow(): ShowConfig {
  const phases = {} as Record<Phase, PhaseConfig>;
  for (const phase of PHASES) {
    const defaults = DEFAULT_PHASE_ATTRIBUTES[phase] ?? {};
    const attrs = {} as Record<AttributeName, boolean>;
    for (const name of ATTRIBUTE_NAMES) {
      attrs[name] = defaults[name] ?? false;
    }
    phases[phase] = {
      attributes: attrs,
      params: { ...DEFAULT_PHASE_PARAMS[phase] },
    };
  }
  return {
    environmentTheme: "forest",
    intensity: 0.3,
    phases,
    attributeVolumes: { ...DEFAULT_ATTRIBUTE_VOLUMES },
    attributeTempo: { ...DEFAULT_ATTRIBUTE_TEMPO },
    muted: false,
  };
}
