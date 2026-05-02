/**
 * Local microphone relay — captures audio from an ALSA device (e.g. Bluetooth
 * mic paired with bluez-alsa) using `arecord` and pipes the raw PCM stream
 * directly to `aplay` targeting the ALSA loopback playback device.
 *
 * This bypasses the WebSocket relay entirely and removes browser permission
 * prompts during live shows.
 *
 * Audio format: S16_LE, 44100 Hz, mono — matches the WebSocket relay format.
 */

import { spawn, execSync, type ChildProcess } from "child_process";
import { logger } from "./logger.js";

const LOOPBACK_DEVICE = process.env["VOICE_LOOPBACK_DEVICE"] ?? "hw:Loopback,0";
const SAMPLE_RATE = 44100;

export interface AlsaDevice {
  id: string;
  name: string;
}

export type LocalMicStatus =
  | { running: false; device: null; error: null }
  | { running: true; device: string; error: null }
  | { running: false; device: string | null; error: string };

let arecordProcess: ChildProcess | null = null;
let aplayProcess: ChildProcess | null = null;
let activeDevice: string | null = null;
/** Preserved across _cleanup() so error status can identify the failed device. */
let lastDevice: string | null = null;
let lastError: string | null = null;

/**
 * Parse `arecord -l` output into a list of capture devices.
 *
 * Each card/device line follows this format (short names may contain spaces):
 *   card 2: SomeName [Full Card Name], device 0: Short Name [Full Device Name]
 *
 * We use `[^\[]+` (anything before the next `[`) to capture short names that
 * may contain spaces (e.g. "Bluetooth SCO", "USB Audio"), then capture the
 * bracketed long name.
 */
export function parseArecordList(output: string): AlsaDevice[] {
  const devices: AlsaDevice[] = [];
  // Match:  card <N>: <anything>[<card-name>], device <M>: <anything>[<dev-name>]
  const lineRe = /^card\s+(\d+):\s+[^\[]+\[([^\]]+)\],\s+device\s+(\d+):\s+[^\[]+\[([^\]]+)\]/;
  for (const line of output.split("\n")) {
    const m = line.trim().match(lineRe);
    if (m) {
      const cardNum = m[1];
      const cardName = m[2]!.trim();
      const devNum = m[3];
      const devName = m[4]!.trim();
      devices.push({
        id: `hw:${cardNum},${devNum}`,
        name: `${cardName} — ${devName}`,
      });
    }
  }
  return devices;
}

/**
 * List available ALSA capture devices by running `arecord -l`.
 * Returns an empty array if `arecord` is unavailable or no devices exist.
 */
export function listAlsaCaptureDevices(): AlsaDevice[] {
  try {
    const out = execSync("arecord -l", { timeout: 5000 }).toString();
    return parseArecordList(out);
  } catch {
    return [];
  }
}

/**
 * Start local capture: `arecord` → pipe → `aplay` (ALSA loopback).
 * If a capture is already running for the same device, this is a no-op.
 * If a different device is active, the existing capture is stopped first.
 */
export function start(device: string): void {
  if (arecordProcess && activeDevice === device) {
    logger.debug({ device }, "localMicRelay: already running on same device");
    return;
  }

  if (arecordProcess) {
    stop();
  }

  lastError = null;
  lastDevice = device;

  logger.info({ device, loopback: LOOPBACK_DEVICE }, "localMicRelay: starting capture");

  try {
    arecordProcess = spawn(
      "arecord",
      [
        "-D", device,
        "-f", "S16_LE",
        "-r", String(SAMPLE_RATE),
        "-c", "1",
        "-t", "raw",
        "-",
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    aplayProcess = spawn(
      "aplay",
      [
        "-D", LOOPBACK_DEVICE,
        "-f", "S16_LE",
        "-r", String(SAMPLE_RATE),
        "-c", "1",
        "-t", "raw",
        "-",
      ],
      { stdio: ["pipe", "ignore", "pipe"] }
    );

    activeDevice = device;

    // Pipe arecord stdout → aplay stdin
    arecordProcess.stdout!.pipe(aplayProcess.stdin!);

    arecordProcess.stderr?.on("data", (d: Buffer) => {
      const txt = d.toString().trim();
      if (txt) logger.warn({ arecord: txt }, "localMicRelay: arecord stderr");
    });

    aplayProcess.stderr?.on("data", (d: Buffer) => {
      const txt = d.toString().trim();
      if (txt) logger.warn({ aplay: txt }, "localMicRelay: aplay stderr");
    });

    arecordProcess.on("error", (err: NodeJS.ErrnoException) => {
      const msg = err.code === "ENOENT"
        ? "arecord not found — install alsa-utils on the Pi"
        : `arecord error: ${err.message}`;
      logger.error({ err }, `localMicRelay: ${msg}`);
      lastError = msg;
      _cleanup();
    });

    aplayProcess.on("error", (err: NodeJS.ErrnoException) => {
      const msg = err.code === "ENOENT"
        ? "aplay not found — install alsa-utils on the Pi"
        : `aplay error: ${err.message}`;
      logger.error({ err }, `localMicRelay: ${msg}`);
      lastError = msg;
      _cleanup();
    });

    arecordProcess.on("exit", (code, signal) => {
      logger.info({ code, signal }, "localMicRelay: arecord exited");
      if (arecordProcess !== null) {
        lastError = `Capture stopped unexpectedly (exit ${code ?? signal ?? "unknown"})`;
      }
      _cleanup();
    });

    aplayProcess.on("exit", (code, signal) => {
      logger.info({ code, signal }, "localMicRelay: aplay exited");
      _cleanup();
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "localMicRelay: failed to spawn processes");
    lastError = `Failed to start capture: ${msg}`;
    _cleanup();
  }
}

/**
 * Stop local capture cleanly.
 */
export function stop(): void {
  if (!arecordProcess && !aplayProcess) return;
  logger.info({ device: activeDevice }, "localMicRelay: stopping capture");
  _cleanup();
}

function _cleanup(): void {
  const rec = arecordProcess;
  const play = aplayProcess;
  // Preserve lastDevice before nulling activeDevice so getStatus() can
  // report which device failed in the error case.
  if (activeDevice !== null) {
    lastDevice = activeDevice;
  }
  arecordProcess = null;
  aplayProcess = null;
  activeDevice = null;

  try { rec?.stdin?.end(); } catch { /* ignore */ }
  try { rec?.kill("SIGTERM"); } catch { /* ignore */ }
  try { play?.stdin?.end(); } catch { /* ignore */ }
  try { play?.kill("SIGTERM"); } catch { /* ignore */ }
}

/**
 * Returns the current status of the local capture relay.
 */
export function getStatus(): LocalMicStatus {
  if (arecordProcess !== null) {
    return { running: true, device: activeDevice!, error: null };
  }
  if (lastError !== null) {
    return { running: false, device: lastDevice, error: lastError };
  }
  return { running: false, device: null, error: null };
}

/**
 * Returns true if local capture is currently active.
 */
export function isRunning(): boolean {
  return arecordProcess !== null;
}
