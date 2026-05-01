import { Router, type IRouter } from "express";
import {
  enableAttribute,
  disableAttribute,
  toggleAttribute,
  setAttributeVolume,
  setAttributeExtra,
} from "../lib/stateManager.js";
import { ATTRIBUTE_NAMES, type AttributeName } from "../lib/themes.config.js";

const router: IRouter = Router();

function validAttr(name: string): name is AttributeName {
  return ATTRIBUTE_NAMES.includes(name as AttributeName);
}

router.post("/attribute/:name/on", (req, res) => {
  const name = req.params["name"]!;
  if (!validAttr(name)) { res.status(400).json({ error: `Unknown attribute: ${name}` }); return; }
  enableAttribute(name);
  res.json({ attribute: name, enabled: true });
});

router.post("/attribute/:name/off", (req, res) => {
  const name = req.params["name"]!;
  if (!validAttr(name)) { res.status(400).json({ error: `Unknown attribute: ${name}` }); return; }
  disableAttribute(name);
  res.json({ attribute: name, enabled: false });
});

router.post("/attribute/:name/toggle", (req, res) => {
  const name = req.params["name"]!;
  if (!validAttr(name)) { res.status(400).json({ error: `Unknown attribute: ${name}` }); return; }
  const enabled = toggleAttribute(name);
  res.json({ attribute: name, enabled });
});

router.post("/attribute/:name/volume", (req, res) => {
  const name = req.params["name"]!;
  if (!validAttr(name)) { res.status(400).json({ error: `Unknown attribute: ${name}` }); return; }
  const value = Number(req.body?.value ?? req.query["value"]);
  if (isNaN(value) || value < 0 || value > 1) {
    res.status(400).json({ error: "volume must be between 0.0 and 1.0" }); return;
  }
  setAttributeVolume(name, value);
  res.json({ attribute: name, volume: value });
});

router.post("/attribute/:name/tempo", (req, res) => {
  const name = req.params["name"]!;
  if (!validAttr(name)) { res.status(400).json({ error: `Unknown attribute: ${name}` }); return; }
  const value = Number(req.body?.value ?? req.query["value"]);
  if (isNaN(value) || value <= 0) {
    res.status(400).json({ error: "tempo must be a positive number (BPM)" }); return;
  }
  setAttributeExtra(name, "tempo", value);
  res.json({ attribute: name, tempo: value });
});

router.post("/attribute/:name/distance", (req, res) => {
  const name = req.params["name"]!;
  if (!validAttr(name)) { res.status(400).json({ error: `Unknown attribute: ${name}` }); return; }
  const value = Number(req.body?.value ?? req.query["value"]);
  if (isNaN(value) || value < 0 || value > 1) {
    res.status(400).json({ error: "distance must be between 0.0 and 1.0" }); return;
  }
  setAttributeExtra(name, "distance", value);
  res.json({ attribute: name, distance: value });
});

export default router;
