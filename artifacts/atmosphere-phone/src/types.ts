export type Phase = 'daytime' | 'evening' | 'night' | 'dawn';

export type Theme =
  | 'forest' | 'ocean' | 'mountain' | 'desert' | 'city'
  | 'mystical' | 'medieval' | 'underwater' | 'cosmic'
  | 'cave' | 'arctic' | 'jungle' | 'tavern';

export type AttributeName =
  | 'crickets' | 'birds' | 'wind' | 'owls' | 'campfire'
  | 'ocean_waves' | 'rain' | 'thunder' | 'frogs' | 'stream'
  | 'wolves' | 'ravens' | 'bats' | 'insects_night' | 'horses'
  | 'waterfall' | 'blizzard' | 'sandstorm' | 'geothermal' | 'traffic'
  | 'crowd' | 'subway' | 'sirens' | 'rain_city' | 'singing_bowls'
  | 'chimes' | 'whispers' | 'choir_pad' | 'portal_hum' | 'heartbeat'
  | 'war_drums' | 'tension_drone' | 'thunder_distant' | 'blacksmith'
  | 'church_bells' | 'tavern_crowd' | 'seagulls' | 'dripping_cave';

export interface AttributeState {
  enabled: boolean;
  volume: number;
}

export interface PhaseParams {
  reverb: number;
  lpfFreq: number;
  masterPitch: number;
}

export interface AtmosphereState {
  phase: Phase;
  theme: Theme;
  intensity: number;
  masterVolume: number;
  muted: boolean;
  phaseParams: PhaseParams;
  attributes: Record<AttributeName, AttributeState>;
}

export type AppMode = 'presentation' | 'controller';

// Commands: controller → relay → presentation
export type CmdMessage =
  | { type: 'CMD_SET_PHASE'; phase: Phase }
  | { type: 'CMD_SET_THEME'; theme: Theme }
  | { type: 'CMD_SET_INTENSITY'; value: number }
  | { type: 'CMD_SET_MASTER_VOLUME'; value: number }
  | { type: 'CMD_SET_MUTED'; muted: boolean }
  | { type: 'CMD_TOGGLE_ATTRIBUTE'; name: AttributeName }
  | { type: 'CMD_SET_ATTRIBUTE_ENABLED'; name: AttributeName; enabled: boolean }
  | { type: 'CMD_SET_ATTRIBUTE_VOLUME'; name: AttributeName; value: number }
  | { type: 'CMD_SET_PHASE_PARAMS'; params: Partial<PhaseParams> }
  | { type: 'CMD_VOICE_DATA'; data: string; mimeType: string };

// State broadcast: presentation → relay → controllers
export interface StateBroadcast {
  type: 'STATE';
  state: AtmosphereState;
}

export interface NetworkMessage {
  type: string;
  [key: string]: unknown;
}

export interface ConnectionConfig {
  relayUrl: string;
  role: AppMode;
}
