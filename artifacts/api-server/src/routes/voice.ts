import { Router, type IRouter, type Request, type Response } from "express";
import { execSync } from "child_process";
import { startVoice, stopVoice, setVoiceParams, getVoiceState } from "../lib/stateManager.js";
import { saveShow } from "../lib/showConfig.js";
import type { ShowConfig } from "../lib/themes.config.js";

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

  router.post("/voice/start", (_req: Request, res: Response) => {
    startVoice();
    res.json({ ok: true, voice: getVoiceState() });
  });

  router.post("/voice/stop", (_req: Request, res: Response) => {
    stopVoice();
    res.json({ ok: true, voice: getVoiceState() });
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
      voice: { gain: updatedVoice.gain, reverb: updatedVoice.reverb },
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
