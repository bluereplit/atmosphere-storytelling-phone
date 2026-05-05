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

export interface NetworkMessage {
  type: string;
  [key: string]: unknown;
}

export interface ConnectionConfig {
  relayUrl: string;
  role: AppMode;
}
