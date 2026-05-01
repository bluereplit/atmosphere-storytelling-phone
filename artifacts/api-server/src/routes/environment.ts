import { Router, type IRouter } from "express";
import { applyTheme, setIntensity } from "../lib/stateManager.js";
import { ENVIRONMENT_THEMES, type EnvironmentTheme } from "../lib/themes.config.js";

const router: IRouter = Router();

router.post("/environment/set/:theme", (req, res) => {
  const theme = req.params["theme"] as EnvironmentTheme;
  if (!ENVIRONMENT_THEMES.includes(theme)) {
    res.status(400).json({ error: `Unknown theme: ${theme}. Valid: ${ENVIRONMENT_THEMES.join(", ")}` });
    return;
  }
  applyTheme(theme);
  res.json({ environmentTheme: theme });
});

router.post("/environment/intensity", (req, res) => {
  const value = Number(req.body?.value ?? req.query["value"]);
  if (isNaN(value) || value < 0 || value > 1) {
    res.status(400).json({ error: "intensity must be a number between 0.0 and 1.0" });
    return;
  }
  setIntensity(value);
  res.json({ intensity: value });
});

export default router;
