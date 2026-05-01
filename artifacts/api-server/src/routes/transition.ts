import { Router, type IRouter } from "express";
import { setPhase, nextPhase } from "../lib/stateManager.js";
import { PHASES, type Phase } from "../lib/themes.config.js";

const router: IRouter = Router();

export function makeTransitionRouter(getShow: () => import("../lib/themes.config.js").ShowConfig): IRouter {
  router.post("/transition/next", (_req, res) => {
    const phase = nextPhase(getShow());
    res.json({ phase });
  });

  router.post("/transition/to/:phase", (req, res) => {
    const phase = req.params["phase"] as Phase;
    if (!PHASES.includes(phase)) {
      res.status(400).json({ error: `Unknown phase: ${phase}. Valid: ${PHASES.join(", ")}` });
      return;
    }
    setPhase(phase, getShow());
    res.json({ phase });
  });

  return router;
}

export default router;
