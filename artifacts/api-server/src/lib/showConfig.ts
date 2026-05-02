import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildDefaultShow, type ShowConfig } from "./themes.config.js";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../data");
const SHOW_FILE = join(DATA_DIR, "show.json");

export function loadShow(): ShowConfig {
  try {
    if (existsSync(SHOW_FILE)) {
      const raw = readFileSync(SHOW_FILE, "utf-8");
      const parsed = JSON.parse(raw) as ShowConfig;
      const defaults = buildDefaultShow();
      return {
        ...defaults,
        ...parsed,
        phases: {
          daytime: { ...defaults.phases.daytime, ...(parsed.phases?.daytime ?? {}), params: { ...defaults.phases.daytime.params, ...(parsed.phases?.daytime?.params ?? {}) } },
          evening: { ...defaults.phases.evening, ...(parsed.phases?.evening ?? {}), params: { ...defaults.phases.evening.params, ...(parsed.phases?.evening?.params ?? {}) } },
          night: { ...defaults.phases.night, ...(parsed.phases?.night ?? {}), params: { ...defaults.phases.night.params, ...(parsed.phases?.night?.params ?? {}) } },
          dawn: { ...defaults.phases.dawn, ...(parsed.phases?.dawn ?? {}), params: { ...defaults.phases.dawn.params, ...(parsed.phases?.dawn?.params ?? {}) } },
        },
        attributeVolumes: { ...defaults.attributeVolumes, ...(parsed.attributeVolumes ?? {}) },
        attributeTempo: { ...defaults.attributeTempo, ...(parsed.attributeTempo ?? {}) },
        voice: { ...defaults.voice, ...(parsed.voice ?? {}) },
        ...(parsed.voiceSource ? { voiceSource: parsed.voiceSource } : {}),
      };
    }
  } catch (err) {
    logger.warn({ err }, "Failed to load show config, using defaults");
  }
  return buildDefaultShow();
}

export function saveShow(config: ShowConfig): void {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(SHOW_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    logger.error({ err }, "Failed to save show config");
  }
}
