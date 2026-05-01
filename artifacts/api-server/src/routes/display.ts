import { Router, type IRouter } from "express";
import { broadcastOverlayToggle } from "../lib/wsServer.js";

export function makeDisplayRouter(): IRouter {
  const router: IRouter = Router();

  router.post("/display/overlay/toggle", (_req, res) => {
    broadcastOverlayToggle();
    res.json({ overlayToggle: true, timestamp: Date.now() });
  });

  return router;
}
