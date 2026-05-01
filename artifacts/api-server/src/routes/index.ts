import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import stateRouter from "./state.js";
import { makeTransitionRouter } from "./transition.js";
import environmentRouter from "./environment.js";
import attributesRouter from "./attributes.js";
import audioRouter from "./audio.js";
import { makeShowRouter } from "./show.js";
import { makeDisplayRouter } from "./display.js";
import phaseRouter from "./phase.js";
import type { ShowConfig } from "../lib/themes.config.js";

export function initRouter(
  getShow: () => ShowConfig,
  setShow: (s: ShowConfig) => void
): IRouter {
  const router: IRouter = Router();

  router.use(healthRouter);
  router.use(stateRouter);
  router.use(makeTransitionRouter(getShow));
  router.use(environmentRouter);
  router.use(attributesRouter);
  router.use(audioRouter);
  router.use(phaseRouter);
  router.use(makeShowRouter(getShow, setShow));
  router.use(makeDisplayRouter());

  return router;
}

const router: IRouter = Router();
export default router;
