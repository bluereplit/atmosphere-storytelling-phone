import { Router, type IRouter, type Request, type Response } from "express";
import { execSync } from "child_process";
import { startVoice, stopVoice, setVoiceParams, getVoiceState } from "../lib/stateManager.js";
import { saveShow } from "../lib/showConfig.js";
import type { ShowConfig, VoiceSourceMode } from "../lib/themes.config.js";
import { DEFAULT_VOICE_SOURCE } from "../lib/themes.config.js";
import { getVoiceRelayStats, resetVoiceRelayStats } from "../lib/voiceRelay.js";
import {
  listAlsaCaptureDevices,
  start as startLocalCapture,
  stop as stopLocalCapture,
  getStatus as getLocalCaptureStatus,
  setAutoReconnect,
} from "../lib/localMicRelay.js";

export function makeVoiceRouter(
  getShow: () => ShowConfig,
  setShow: (s: ShowConfig) => void
): IRouter {
  const router: IRouter = Router();

  router.get("/voice/loopback-status", (_req: Request, res: Response) => {
    let moduleLoaded = false;
    let deviceAccessible = false;
    let error: string | null = null;

    try {
      const lsmodOut = execSync("lsmod", { timeout: 3000 }).toString();
      moduleLoaded = lsmodOut.split("\n").some((line) => /^snd_aloop\b/.test(line));
    } catch (err) {
      error = err instanceof Error ? err.message : "lsmod check failed";
    }

    if (moduleLoaded) {
      try {
        const cardsOut = execSync("cat /proc/asound/cards", { timeout: 2000 }).toString();
        deviceAccessible = /Loopback/i.test(cardsOut);
      } catch {
        deviceAccessible = false;
      }
    }

    const available = moduleLoaded && deviceAccessible;
    res.json({ available, moduleLoaded, deviceAccessible, error });
  });

  router.get("/voice/input-devices", (_req: Request, res: Response) => {
    const devices = listAlsaCaptureDevices();
    res.json({ devices });
  });

  router.get("/voice/source", (_req: Request, res: Response) => {
    const show = getShow();
    const source = show.voiceSource ?? DEFAULT_VOICE_SOURCE;
    const captureStatus = getLocalCaptureStatus();
    res.json({ source, captureStatus });
  });

  router.post("/voice/source", (req: Request, res: Response) => {
    const { mode, device } = req.body as { mode?: unknown; device?: unknown };

    if (mode !== "browser" && mode !== "local") {
      res.status(400).json({ error: "mode must be 'browser' or 'local'" });
      return;
    }

    const deviceStr = typeof device === "string" && device.trim() !== "" ? device.trim() : null;

    if (mode === "local" && !deviceStr) {
      res.status(400).json({ error: "device is required when mode is 'local'" });
      return;
    }

    const voiceSourceMode = mode as VoiceSourceMode;

    if (voiceSourceMode === "local") {
      startLocalCapture(deviceStr!);
    } else {
      stopLocalCapture();
    }

    const newSource = { mode: voiceSourceMode, device: deviceStr };
    const updated: ShowConfig = { ...getShow(), voiceSource: newSource };
    setShow(updated);
    saveShow(updated);

    const captureStatus = getLocalCaptureStatus();
    res.json({ ok: true, source: newSource, captureStatus });
  });

  router.get("/voice/capture-status", (_req: Request, res: Response) => {
    res.json(getLocalCaptureStatus());
  });

  router.get("/voice/relay-stats", (_req: Request, res: Response) => {
    res.json(getVoiceRelayStats());
  });

  router.post("/voice/relay-stats/reset", (_req: Request, res: Response) => {
    resetVoiceRelayStats();
    res.json({ ok: true, stats: getVoiceRelayStats() });
  });

  router.post("/voice/auto-reconnect", (req: Request, res: Response) => {
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }
    setAutoReconnect(enabled);
    res.json({ ok: true, captureStatus: getLocalCaptureStatus() });
  });

  router.post("/voice/start", (_req: Request, res: Response) => {
    startVoice();
    const updatedVoice = getVoiceState();
    const updated: ShowConfig = {
      ...getShow(),
      voice: { gain: updatedVoice.gain, reverb: updatedVoice.reverb, active: true },
    };
    setShow(updated);
    saveShow(updated);
    res.json({ ok: true, voice: updatedVoice });
  });

  router.post("/voice/stop", (_req: Request, res: Response) => {
    stopVoice();
    const updatedVoice = getVoiceState();
    const updated: ShowConfig = {
      ...getShow(),
      voice: { gain: updatedVoice.gain, reverb: updatedVoice.reverb, active: false },
    };
    setShow(updated);
    saveShow(updated);
    res.json({ ok: true, voice: updatedVoice });
  });

  router.post("/voice/params", (req: Request, res: Response) => {
    const { gain, reverb } = req.body as { gain?: unknown; reverb?: unknown };
    const state = getVoiceState();

    const rawGain = typeof gain === "number" ? gain : state.gain;
    const rawReverb = typeof reverb === "number" ? reverb : state.reverb;

    if (!Number.isFinite(rawGain) || !Number.isFinite(rawReverb)) {
      res.status(400).json({ error: "gain and reverb must be finite numbers" });
      return;
    }

    setVoiceParams(rawGain, rawReverb);

    const updatedVoice = getVoiceState();
    const updated: ShowConfig = {
      ...getShow(),
      voice: { gain: updatedVoice.gain, reverb: updatedVoice.reverb, active: updatedVoice.active },
    };
    setShow(updated);
    saveShow(updated);

    res.json({ ok: true, voice: updatedVoice });
  });

  router.get("/voice", (_req: Request, res: Response) => {
    res.json({ voice: getVoiceState() });
  });

  return router;
}
