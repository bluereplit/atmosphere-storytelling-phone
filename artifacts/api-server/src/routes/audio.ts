import { Router, type IRouter } from "express";
import { setMuted } from "../lib/stateManager.js";

const router: IRouter = Router();

router.post("/audio/mute", (_req, res) => {
  setMuted(true);
  res.json({ muted: true });
});

router.post("/audio/unmute", (_req, res) => {
  setMuted(false);
  res.json({ muted: false });
});

export default router;
