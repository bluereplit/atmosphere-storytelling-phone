import { Router, type IRouter } from "express";
import { getLiveState } from "../lib/stateManager.js";
import { isSuperColliderReady } from "../lib/supercollider.js";
import { getOscPort } from "../lib/oscServer.js";

const router: IRouter = Router();

router.get("/state", (_req, res) => {
  res.json(getLiveState());
});

router.get("/audio/status", (_req, res) => {
  res.json({
    supercollider: isSuperColliderReady() ? "ready" : "unavailable",
    oscPort: getOscPort(),
  });
});

export default router;
