import { spawn, type ChildProcess } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Client as OscClient } from "node-osc";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SC_DIR = join(__dirname, "../sc");

const SC_SERVER_PORT = 57110;
const SC_SERVER_HOST = "127.0.0.1";

let scProcess: ChildProcess | null = null;
let oscClient: OscClient | null = null;
let nodeIdCounter = 1000;
let isReady = false;
let restartTimer: ReturnType<typeof setTimeout> | null = null;

const liveNodes = new Map<number, string>();
const readyCallbacks: (() => void)[] = [];
const persistentReadyHandlers: (() => void)[] = [];
const persistentExitHandlers: (() => void)[] = [];

export function isSuperColliderReady(): boolean {
  return isReady;
}

export function onSuperColliderReady(cb: () => void): void {
  if (isReady) {
    cb();
  } else {
    readyCallbacks.push(cb);
  }
}

export function onEverySuperColliderReady(cb: () => void): void {
  persistentReadyHandlers.push(cb);
  if (isReady) {
    try { cb(); } catch (err) { logger.error({ err }, "SC persistent ready callback error"); }
  }
}

export function onEverySuperColliderExit(cb: () => void): void {
  persistentExitHandlers.push(cb);
}

function fireReadyCallbacks(): void {
  const cbs = readyCallbacks.splice(0);
  for (const cb of [...cbs, ...persistentReadyHandlers]) {
    try { cb(); } catch (err) { logger.error({ err }, "SC ready callback error"); }
  }
}

function createOscClient(): OscClient {
  return new OscClient(SC_SERVER_HOST, SC_SERVER_PORT);
}

export function startSuperCollider(): void {
  if (scProcess) return;

  const startupScript = join(SC_DIR, "startup.scd");
  logger.info({ startupScript }, "Starting SuperCollider");

  try {
    scProcess = spawn("sclang", [startupScript], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    scProcess.stdout?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        logger.info({ sc: text }, "SuperCollider");
        if (text.includes("Master limiter started")) {
          logger.info("SuperCollider master limiter active — clipping protection enabled");
        }
        if (
          !isReady &&
          (text.includes("SuperCollider ready") || text.includes("SynthDefs loaded"))
        ) {
          isReady = true;
          oscClient = createOscClient();
          logger.info("SuperCollider audio engine ready");
          fireReadyCallbacks();
        }
      }
    });

    scProcess.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) logger.warn({ sc: text }, "SuperCollider stderr");
    });

    scProcess.on("exit", (code) => {
      logger.warn({ code }, "SuperCollider process exited");
      isReady = false;
      oscClient = null;
      scProcess = null;
      liveNodes.clear();
      for (const cb of persistentExitHandlers) {
        try { cb(); } catch (err) { logger.error({ err }, "SC exit callback error"); }
      }

      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        logger.info("Restarting SuperCollider...");
        startSuperCollider();
      }, 5000);
    });

    scProcess.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        logger.warn(
          "sclang not found — SuperCollider is not installed. Audio synthesis disabled. See AUDIO_SETUP.md."
        );
      } else {
        logger.error({ err }, "SuperCollider process error");
      }
      isReady = false;
      scProcess = null;
    });
  } catch (err) {
    logger.error({ err }, "Failed to spawn sclang");
  }
}

export function stopSuperCollider(): void {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (scProcess) {
    scProcess.kill("SIGTERM");
    scProcess = null;
  }
  isReady = false;
  oscClient = null;
  liveNodes.clear();
}

function sendOsc(address: string, ...args: (string | number)[]): void {
  if (!oscClient || !isReady) return;
  try {
    const msg: [string, ...(string | number)[]] = [address, ...args];
    oscClient.send(...msg, (err: Error | null) => {
      if (err) logger.warn({ err, address }, "OSC send error");
    });
  } catch (err) {
    logger.warn({ err, address }, "OSC send failed");
  }
}

export function addSynth(defName: string, params: Record<string, number> = {}): number {
  if (!isReady) return -1;
  const nodeId = nodeIdCounter++;
  liveNodes.set(nodeId, defName);

  const mergedParams: Record<string, number> = { outBus: 0, ...params };
  const flatParams: (string | number)[] = [];
  for (const [k, v] of Object.entries(mergedParams)) {
    flatParams.push(k, v);
  }

  sendOsc("/s_new", defName, nodeId, 1, 0, ...flatParams);
  return nodeId;
}

export function setSynth(nodeId: number, params: Record<string, number>): void {
  if (!isReady || nodeId < 0) return;
  const flatParams: (string | number)[] = [];
  for (const [k, v] of Object.entries(params)) {
    flatParams.push(k, v);
  }
  sendOsc("/n_set", nodeId, ...flatParams);
}

export function freeSynth(nodeId: number): void {
  if (!isReady || nodeId < 0) return;
  liveNodes.delete(nodeId);
  sendOsc("/n_free", nodeId);
}

export function freeAllSynths(): void {
  if (!isReady) return;
  for (const nodeId of liveNodes.keys()) {
    sendOsc("/n_free", nodeId);
  }
  liveNodes.clear();
}

export function setMasterVolume(volume: number): void {
  sendOsc("/c_set", 0, Math.max(0, Math.min(1, volume)));
}
