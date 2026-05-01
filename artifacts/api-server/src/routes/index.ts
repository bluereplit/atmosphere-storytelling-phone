import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import stateRouter from "./state.js";
import { makeTransitionRouter } from "./transition.js";
import environmentRouter from "./environment.js";
import attributesRouter from "./attributes.js";
import audioRouter from "./audio.js";
import { makeShowRouter } from "./show.js";
import type { ShowConfig } from "../lib/themes.config.js";

let _getShow: (() => ShowConfig) | null = null;
let _setShow: ((s: ShowConfig) => void) | null = null;

export function initRouter(
  getShow: () => ShowConfig,
  setShow: (s: ShowConfig) => void
): IRouter {
  _getShow = getShow;
  _setShow = setShow;

  const router: IRouter = Router();

  router.use(healthRouter);
  router.use(stateRouter);
  router.use(makeTransitionRouter(getShow));
  router.use(environmentRouter);
  router.use(attributesRouter);
  router.use(audioRouter);
  router.use(makeShowRouter(getShow, setShow));

  return router;
}

const router: IRouter = Router();
export default router;
