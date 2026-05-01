import { Router, type IRouter, type Request, type Response } from "express";
import { startVoice, stopVoice, setVoiceParams, getVoiceState } from "../lib/stateManager.js";

const router: IRouter = Router();

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
  res.json({ ok: true, voice: getVoiceState() });
});

router.get("/voice", (_req: Request, res: Response) => {
  res.json({ voice: getVoiceState() });
});

export default router;
