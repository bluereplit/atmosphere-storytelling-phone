import type { AtmosphereState, AttributeName } from './types';
import { ALL_ATTRIBUTES, THEME_DEFAULT_ATTRIBUTES, PHASE_DEFAULT_PARAMS } from './themes.config';

function buildDefaultAttributes(): Record<AttributeName, { enabled: boolean; volume: number }> {
  const attrs = {} as Record<AttributeName, { enabled: boolean; volume: number }>;
  const defaults = THEME_DEFAULT_ATTRIBUTES.forest;
  for (const name of ALL_ATTRIBUTES) {
    attrs[name] = { enabled: defaults.includes(name), volume: 0.7 };
  }
  return attrs;
}

export const DEFAULT_STATE: AtmosphereState = {
  phase: 'daytime',
  theme: 'forest',
  intensity: 0.6,
  masterVolume: 0.8,
  muted: false,
  phaseParams: PHASE_DEFAULT_PARAMS.daytime,
  attributes: buildDefaultAttributes(),
};
