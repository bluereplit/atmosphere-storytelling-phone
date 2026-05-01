import { Router, type IRouter } from "express";
import { buildDefaultShow, type ShowConfig } from "../lib/themes.config.js";
import { saveShow } from "../lib/showConfig.js";
import { initFromShow } from "../lib/stateManager.js";

export function makeShowRouter(
  getShow: () => ShowConfig,
  setShow: (s: ShowConfig) => void
): IRouter {
  const router: IRouter = Router();

  router.get("/show", (_req, res) => {
    res.json(getShow());
  });

  router.put("/show", (req, res) => {
    const body = req.body as ShowConfig;
    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "Invalid show configuration" });
      return;
    }
    const current = getShow();
    const updated: ShowConfig = {
      ...current,
      ...body,
      phases: {
        daytime: { ...current.phases.daytime, ...(body.phases?.daytime ?? {}) },
        evening: { ...current.phases.evening, ...(body.phases?.evening ?? {}) },
        night: { ...current.phases.night, ...(body.phases?.night ?? {}) },
        dawn: { ...current.phases.dawn, ...(body.phases?.dawn ?? {}) },
      },
      attributeVolumes: { ...current.attributeVolumes, ...(body.attributeVolumes ?? {}) },
      attributeTempo: { ...current.attributeTempo, ...(body.attributeTempo ?? {}) },
    };
    setShow(updated);
    saveShow(updated);
    res.json(updated);
  });

  router.post("/show/reset", (_req, res) => {
    const defaults = buildDefaultShow();
    setShow(defaults);
    saveShow(defaults);
    initFromShow(defaults);
    res.json(defaults);
  });

  return router;
}
