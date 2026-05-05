import type { Theme, Phase, AttributeName } from './types';

export const ALL_THEMES: Theme[] = [
  'forest', 'ocean', 'mountain', 'desert', 'city',
  'mystical', 'medieval', 'underwater', 'cosmic',
  'cave', 'arctic', 'jungle', 'tavern',
];

export const ALL_PHASES: Phase[] = ['daytime', 'evening', 'night', 'dawn'];

export const ALL_ATTRIBUTES: AttributeName[] = [
  'crickets', 'birds', 'wind', 'owls', 'campfire',
  'ocean_waves', 'rain', 'thunder', 'frogs', 'stream',
  'wolves', 'ravens', 'bats', 'insects_night', 'horses',
  'waterfall', 'blizzard', 'sandstorm', 'geothermal', 'traffic',
  'crowd', 'subway', 'sirens', 'rain_city', 'singing_bowls',
  'chimes', 'whispers', 'choir_pad', 'portal_hum', 'heartbeat',
  'war_drums', 'tension_drone', 'thunder_distant', 'blacksmith',
  'church_bells', 'tavern_crowd', 'seagulls', 'dripping_cave',
];

export const ATTRIBUTE_LABELS: Record<AttributeName, string> = {
  crickets: 'Crickets', birds: 'Birds', wind: 'Wind', owls: 'Owls',
  campfire: 'Campfire', ocean_waves: 'Ocean Waves', rain: 'Rain',
  thunder: 'Thunder', frogs: 'Frogs', stream: 'Stream', wolves: 'Wolves',
  ravens: 'Ravens', bats: 'Bats', insects_night: 'Night Insects',
  horses: 'Horses', waterfall: 'Waterfall', blizzard: 'Blizzard',
  sandstorm: 'Sandstorm', geothermal: 'Geothermal', traffic: 'Traffic',
  crowd: 'Crowd', subway: 'Subway', sirens: 'Sirens', rain_city: 'City Rain',
  singing_bowls: 'Singing Bowls', chimes: 'Chimes', whispers: 'Whispers',
  choir_pad: 'Choir Pad', portal_hum: 'Portal Hum', heartbeat: 'Heartbeat',
  war_drums: 'War Drums', tension_drone: 'Tension Drone',
  thunder_distant: 'Distant Thunder', blacksmith: 'Blacksmith',
  church_bells: 'Church Bells', tavern_crowd: 'Tavern Crowd',
  seagulls: 'Seagulls', dripping_cave: 'Dripping Cave',
};

export const ATTRIBUTE_CATEGORIES: Record<string, AttributeName[]> = {
  Nature: ['wind', 'rain', 'thunder', 'thunder_distant', 'blizzard', 'sandstorm', 'geothermal'],
  Water: ['ocean_waves', 'stream', 'waterfall', 'rain_city', 'dripping_cave'],
  Wildlife: ['crickets', 'birds', 'owls', 'frogs', 'wolves', 'ravens', 'bats', 'insects_night', 'horses', 'seagulls'],
  Fire: ['campfire'],
  Urban: ['traffic', 'crowd', 'subway', 'sirens'],
  Mystical: ['singing_bowls', 'chimes', 'whispers', 'choir_pad', 'portal_hum', 'tension_drone'],
  Dramatic: ['heartbeat', 'war_drums', 'blacksmith', 'church_bells', 'tavern_crowd'],
};

export const THEME_LABELS: Record<Theme, string> = {
  forest: 'Forest', ocean: 'Ocean', mountain: 'Mountain', desert: 'Desert',
  city: 'City', mystical: 'Mystical', medieval: 'Medieval', underwater: 'Underwater',
  cosmic: 'Cosmic', cave: 'Cave', arctic: 'Arctic', jungle: 'Jungle', tavern: 'Tavern',
};

export const THEME_ICONS: Record<Theme, string> = {
  forest: 'tree', ocean: 'droplet', mountain: 'triangle', desert: 'sun',
  city: 'building', mystical: 'star', medieval: 'shield', underwater: 'anchor',
  cosmic: 'moon', cave: 'layers', arctic: 'wind', jungle: 'feather', tavern: 'coffee',
};

export const PHASE_LABELS: Record<Phase, string> = {
  daytime: 'Daytime', evening: 'Evening', night: 'Night', dawn: 'Dawn',
};

export const THEME_DEFAULT_ATTRIBUTES: Record<Theme, AttributeName[]> = {
  forest: ['wind', 'birds', 'crickets', 'stream'],
  ocean: ['ocean_waves', 'seagulls', 'wind'],
  mountain: ['wind', 'birds', 'stream', 'waterfall'],
  desert: ['wind', 'sandstorm', 'crickets'],
  city: ['traffic', 'crowd', 'rain_city'],
  mystical: ['singing_bowls', 'whispers', 'portal_hum', 'choir_pad'],
  medieval: ['wind', 'ravens', 'church_bells'],
  underwater: ['ocean_waves', 'singing_bowls', 'portal_hum'],
  cosmic: ['portal_hum', 'tension_drone', 'singing_bowls'],
  cave: ['dripping_cave', 'bats', 'geothermal'],
  arctic: ['blizzard', 'wind', 'owls'],
  jungle: ['rain', 'birds', 'insects_night', 'frogs'],
  tavern: ['tavern_crowd', 'campfire', 'chimes'],
};

export const PHASE_DEFAULT_PARAMS: Record<Phase, { reverb: number; lpfFreq: number; masterPitch: number }> = {
  daytime: { reverb: 0.15, lpfFreq: 12000, masterPitch: 0 },
  evening: { reverb: 0.3, lpfFreq: 8000, masterPitch: -1 },
  night: { reverb: 0.5, lpfFreq: 5000, masterPitch: -2 },
  dawn: { reverb: 0.35, lpfFreq: 9000, masterPitch: 1 },
};

export const PHASE_GRADIENT_COLORS: Record<Phase, [string, string, string]> = {
  daytime: ['#4a8fd4', '#a8c8f0', '#f5e090'],
  evening: ['#8a3020', '#d06030', '#f09060'],
  night: ['#05091a', '#0a1535', '#162050'],
  dawn: ['#1a0a2e', '#8a3070', '#f07890'],
};

export const THEME_GRADIENT_TINTS: Record<Theme, string> = {
  forest: '#1a4a28',
  ocean: '#0a2a4a',
  mountain: '#2a3040',
  desert: '#4a3010',
  city: '#202530',
  mystical: '#2a1a4a',
  medieval: '#2a1a0a',
  underwater: '#0a3040',
  cosmic: '#10082a',
  cave: '#1a1010',
  arctic: '#1a2a38',
  jungle: '#0a2a18',
  tavern: '#2a1a08',
};
