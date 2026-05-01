import { Router, type IRouter } from "express";
import { setPhaseParams, getLiveState } from "../lib/stateManager.js";

const router: IRouter = Router();

router.post("/phase/params", (req, res) => {
  const { reverb, lpfFreq, masterPitch } = req.body ?? {};

  if (
    (reverb !== undefined && (typeof reverb !== "number" || reverb < 0 || reverb > 1)) ||
    (lpfFreq !== undefined && (typeof lpfFreq !== "number" || lpfFreq < 500 || lpfFreq > 20000)) ||
    (masterPitch !== undefined && (typeof masterPitch !== "number" || masterPitch < -12 || masterPitch > 12))
  ) {
    res.status(400).json({
      error:
        "Invalid params: reverb must be 0–1, lpfFreq must be 500–20000, masterPitch must be -12 to +12",
    });
    return;
  }

  setPhaseParams({ reverb, lpfFreq, masterPitch });
  res.json(getLiveState().phaseParams);
});

export default router;
