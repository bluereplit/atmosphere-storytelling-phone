/**
 * Local microphone relay — captures audio from an ALSA device (e.g. Bluetooth
 * mic paired with bluez-alsa) using `arecord` and pipes the raw PCM stream
 * directly to `aplay` targeting the ALSA loopback playback device.
 *
 * This bypasses the WebSocket relay entirely and removes browser permission
 * prompts during live shows.
 *
 * Audio format: S16_LE, 44100 Hz, mono — matches the WebSocket relay format.
 *
 * Auto-reconnect: when capture stops unexpectedly (e.g. Bluetooth mic drops),
 * the relay will automatically retry up to BT_RECONNECT_ATTEMPTS times with a
 * BT_RECONNECT_DELAY_MS delay between each attempt.  The attempt counter is
 * only reset after the capture has been running stably for
 * RECONNECT_STABLE_MS, so short-lived spawns correctly count against the
 * retry budget and cannot cause an infinite loop.
 */

import { spawn, execSync, type ChildProcess } from "child_process";
import { logger } from "./logger.js";

const LOOPBACK_DEVICE = process.env["VOICE_LOOPBACK_DEVICE"] ?? "hw:Loopback,0";
const SAMPLE_RATE = 44100;

export const RECONNECT_MAX_ATTEMPTS = Math.max(
  1,
  parseInt(process.env["BT_RECONNECT_ATTEMPTS"] ?? "3", 10)
);
const RECONNECT_DELAY_MS = Math.max(
  500,
  parseInt(process.env["BT_RECONNECT_DELAY_MS"] ?? "5000", 10)
);
/**
 * How long capture must run continuously before we consider the reconnect
 * successful and reset the attempt counter.  Prevents a spawn that lives only
 * a few milliseconds from consuming the entire retry budget in one cycle.
 */
const RECONNECT_STABLE_MS = Math.max(
  1000,
  parseInt(process.env["BT_RECONNECT_STABLE_MS"] ?? "10000", 10)
);

export interface AlsaDevice {
  id: string;
  name: string;
}

export type LocalMicStatus =
  | { running: false; device: null; error: null; reconnecting: false; reconnectAttempt: number; reconnectMaxAttempts: number; autoReconnect: boolean }
  | { running: true; device: string; error: null; reconnecting: false; reconnectAttempt: number; reconnectMaxAttempts: number; autoReconnect: boolean }
  | { running: false; device: string | null; error: string; reconnecting: false; reconnectAttempt: number; reconnectMaxAttempts: number; autoReconnect: boolean }
  | { running: false; device: string | null; error: string | null; reconnecting: true; reconnectAttempt: number; reconnectMaxAttempts: number; autoReconnect: boolean };

let arecordProcess: ChildProcess | null = null;
let aplayProcess: ChildProcess | null = null;
let activeDevice: string | null = null;
/** Preserved across _cleanup() so error status can identify the failed device. */
let lastDevice: string | null = null;
let lastError: string | null = null;

// Auto-reconnect state
let autoReconnect = true;
/** True while we are waiting between retry attempts (not while capture is running). */
let reconnecting = false;
/**
 * Number of retry attempts consumed in the current reconnect cycle.
 * This is NOT reset when processes spawn — only after the stability timer
 * confirms they have been running for RECONNECT_STABLE_MS, or when
 * stop() / start() (user-initiated) is called.
 */
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
/** Fires once capture has been running stably, confirming a successful reconnect. */
let reconnectStabilityTimer: ReturnType<typeof setTimeout> | null = null;

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

/** Cancel the pending reconnect retry timer. */
function _cancelReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/** Cancel the stability confirmation timer. */
function _cancelStabilityTimer(): void {
  if (reconnectStabilityTimer !== null) {
    clearTimeout(reconnectStabilityTimer);
    reconnectStabilityTimer = null;
  }
}

/**
 * Schedule a reconnect attempt for the given device.
 * `reconnectAttempt` must already have been incremented by the caller.
 */
function _scheduleReconnect(device: string): void {
  logger.info(
    { device, attempt: reconnectAttempt, max: RECONNECT_MAX_ATTEMPTS, delayMs: RECONNECT_DELAY_MS },
    "localMicRelay: scheduling reconnect"
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    if (!autoReconnect) {
      reconnecting = false;
      reconnectAttempt = 0;
      logger.info({ device }, "localMicRelay: auto-reconnect disabled — cancelling retry");
      return;
    }

    logger.info({ device, attempt: reconnectAttempt }, "localMicRelay: retrying capture");
    lastError = null;
    _doStart(device);
  }, RECONNECT_DELAY_MS);
}

/**
 * Internal: spawn arecord → aplay.
 *
 * Deliberately does NOT reset `reconnectAttempt`.  The counter tracks how
 * many spawn attempts have been made in the current reconnect cycle; it is
 * only cleared by the stability timer (after RECONNECT_STABLE_MS of healthy
 * operation) or by an explicit user-initiated stop()/start() call.
 */
function _doStart(device: string): void {
  if (arecordProcess && activeDevice === device) {
    logger.debug({ device }, "localMicRelay: already running on same device");
    return;
  }

  if (arecordProcess) {
    _cleanup();
  }

  lastDevice = device;
  lastError = null;

  // We are no longer waiting between retries — processes are starting now.
  reconnecting = false;

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

    // If we are in a reconnect cycle, start a stability timer.  Only once the
    // capture has been running for RECONNECT_STABLE_MS do we consider it truly
    // recovered and reset the attempt counter.
    if (reconnectAttempt > 0) {
      _cancelStabilityTimer();
      reconnectStabilityTimer = setTimeout(() => {
        reconnectStabilityTimer = null;
        if (arecordProcess !== null) {
          logger.info({ device, attempt: reconnectAttempt }, "localMicRelay: reconnect confirmed stable — resetting counter");
          reconnectAttempt = 0;
        }
      }, RECONNECT_STABLE_MS);
    }

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
      // If arecordProcess is still non-null here, this was an unexpected exit
      // (intentional stop via _cleanup() nulls it before sending SIGTERM).
      if (arecordProcess !== null) {
        const exitDesc = code ?? signal ?? "unknown";
        lastError = `Capture stopped unexpectedly (exit ${exitDesc})`;
        const device = activeDevice ?? lastDevice;
        _cleanup(); // also cancels stability timer

        if (autoReconnect && device) {
          if (reconnectAttempt < RECONNECT_MAX_ATTEMPTS) {
            reconnecting = true;
            reconnectAttempt += 1;
            _scheduleReconnect(device);
          } else {
            // All attempts exhausted
            reconnecting = false;
            const n = reconnectAttempt;
            reconnectAttempt = 0;
            lastError = `Bluetooth mic did not reconnect after ${n} attempt${n !== 1 ? "s" : ""} — reconnect manually`;
            logger.error({ device, attempts: n }, "localMicRelay: all reconnect attempts exhausted");
          }
        } else {
          reconnecting = false;
          reconnectAttempt = 0;
        }
      } else {
        _cleanup();
      }
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
 * Start local capture: `arecord` → pipe → `aplay` (ALSA loopback).
 * If a capture is already running for the same device, this is a no-op.
 * If a different device is active, the existing capture is stopped first.
 * Calling this explicitly cancels any pending auto-reconnect loop and resets
 * the attempt counter.
 */
export function start(device: string): void {
  // User-initiated start: cancel in-flight reconnect and reset counters
  _cancelReconnectTimer();
  _cancelStabilityTimer();
  reconnecting = false;
  reconnectAttempt = 0;

  _doStart(device);
}

/**
 * Stop local capture cleanly.
 * Also cancels any pending auto-reconnect attempts.
 */
export function stop(): void {
  _cancelReconnectTimer();
  _cancelStabilityTimer();
  reconnecting = false;
  reconnectAttempt = 0;

  if (!arecordProcess && !aplayProcess) return;
  logger.info({ device: activeDevice }, "localMicRelay: stopping capture");
  _cleanup();
}

function _cleanup(): void {
  // Cancel the stability timer whenever processes stop.
  _cancelStabilityTimer();

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
 * Enable or disable the automatic reconnect behaviour.
 * Disabling cancels any in-flight reconnect attempt immediately.
 */
export function setAutoReconnect(enabled: boolean): void {
  autoReconnect = enabled;
  if (!enabled) {
    _cancelReconnectTimer();
    if (reconnecting) {
      reconnecting = false;
      reconnectAttempt = 0;
      logger.info("localMicRelay: auto-reconnect disabled — pending retry cancelled");
    }
  }
  logger.info({ autoReconnect: enabled }, "localMicRelay: auto-reconnect setting changed");
}

/**
 * Returns the current status of the local capture relay, including
 * reconnect state and configuration.
 */
export function getStatus(): LocalMicStatus {
  if (arecordProcess !== null) {
    return { running: true, device: activeDevice!, error: null, reconnecting: false, reconnectAttempt, reconnectMaxAttempts: RECONNECT_MAX_ATTEMPTS, autoReconnect };
  }
  if (reconnecting) {
    return { running: false, device: lastDevice, error: lastError, reconnecting: true, reconnectAttempt, reconnectMaxAttempts: RECONNECT_MAX_ATTEMPTS, autoReconnect };
  }
  if (lastError !== null) {
    return { running: false, device: lastDevice, error: lastError, reconnecting: false, reconnectAttempt, reconnectMaxAttempts: RECONNECT_MAX_ATTEMPTS, autoReconnect };
  }
  return { running: false, device: null, error: null, reconnecting: false, reconnectAttempt, reconnectMaxAttempts: RECONNECT_MAX_ATTEMPTS, autoReconnect };
}

/**
 * Returns true if local capture is currently active.
 */
export function isRunning(): boolean {
  return arecordProcess !== null;
}

export interface TestCaptureResult {
  pass: boolean;
  /** Peak absolute sample value normalised to 0.0–1.0 */
  peakLevel: number;
  durationMs: number;
  error: string | null;
}

const TEST_CAPTURE_DURATION_S = 3;
const SILENCE_THRESHOLD = 0.001; // ~33 on a 16-bit scale

/** True while a test-capture operation is in progress. */
let testCapturing = false;

/** Returns true if a test capture is currently in progress. */
export function isTestCapturing(): boolean {
  return testCapturing;
}

/**
 * Record TEST_CAPTURE_DURATION_S seconds of audio from `device` into a
 * temporary in-memory buffer (never routed to SuperCollider / aplay) and
 * return whether any non-silent PCM was detected.
 *
 * Rejects with an error result if another test is already in progress, or
 * if normal local capture is currently running on the same device.
 */
export function testCapture(device: string): Promise<TestCaptureResult> {
  if (testCapturing) {
    return Promise.resolve({ pass: false, peakLevel: 0, durationMs: 0, error: "A test capture is already in progress" });
  }
  if (arecordProcess !== null) {
    return Promise.resolve({ pass: false, peakLevel: 0, durationMs: 0, error: "Live capture is active — stop it before running a test" });
  }
  if (reconnecting) {
    return Promise.resolve({ pass: false, peakLevel: 0, durationMs: 0, error: "Auto-reconnect is in progress — wait for it to finish or disable auto-reconnect first" });
  }

  testCapturing = true;

  // Suspend auto-reconnect for the test duration so that any reconnect timer
  // that was not yet running cannot fire and start live capture mid-test.
  const savedAutoReconnect = autoReconnect;
  _cancelReconnectTimer();
  autoReconnect = false;

  const startMs = Date.now();

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;
    let captureExitCode: number | null = null;
    let captureExitSignal: NodeJS.Signals | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    const settle = (result: TestCaptureResult) => {
      if (settled) return;
      settled = true;
      testCapturing = false;
      // Restore auto-reconnect setting that was suspended for the test
      autoReconnect = savedAutoReconnect;
      if (safetyTimer !== null) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      resolve(result);
    };

    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(
        "arecord",
        [
          "-D", device,
          "-f", "S16_LE",
          "-r", String(SAMPLE_RATE),
          "-c", "1",
          "-d", String(TEST_CAPTURE_DURATION_S),
          "-t", "raw",
          "-",
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      settle({ pass: false, peakLevel: 0, durationMs: Date.now() - startMs, error: `Failed to spawn arecord: ${msg}` });
      return;
    }

    proc.stdout!.on("data", (chunk: Buffer) => { chunks.push(chunk); });
    proc.stderr?.on("data", () => { /* discard */ });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      const msg = err.code === "ENOENT"
        ? "arecord not found — install alsa-utils on the Pi"
        : `arecord error: ${err.message}`;
      settle({ pass: false, peakLevel: 0, durationMs: Date.now() - startMs, error: msg });
    });

    // Record exit code/signal on `exit`, but defer PCM analysis until `close`
    // so that stdout has fully drained before we inspect the chunks buffer.
    proc.on("exit", (code, signal) => {
      captureExitCode = code;
      captureExitSignal = signal;
    });

    proc.on("close", () => {
      const durationMs = Date.now() - startMs;

      if (timedOut) {
        settle({ pass: false, peakLevel: 0, durationMs, error: "Test capture timed out — device may be busy or unresponsive" });
        return;
      }

      // Treat any abnormal exit as a failed capture regardless of whether
      // some PCM bytes were buffered.  A partial recording (e.g. Bluetooth
      // mic disconnected mid-test) must not produce a false pass.
      if (captureExitSignal !== null) {
        settle({ pass: false, peakLevel: 0, durationMs, error: `arecord terminated early by signal ${captureExitSignal} — recording incomplete` });
        return;
      }

      if (captureExitCode !== null && captureExitCode !== 0) {
        settle({ pass: false, peakLevel: 0, durationMs, error: `arecord exited with non-zero code ${captureExitCode} — recording incomplete` });
        return;
      }

      // arecord exited cleanly (code 0): analyse the complete recording.
      const buf = Buffer.concat(chunks);
      if (buf.length === 0) {
        settle({ pass: false, peakLevel: 0, durationMs, error: "No PCM data received from device" });
        return;
      }

      let peak = 0;
      for (let i = 0; i + 1 < buf.length; i += 2) {
        const sample = Math.abs(buf.readInt16LE(i));
        if (sample > peak) peak = sample;
      }

      const peakLevel = peak / 32767;
      const pass = peakLevel > SILENCE_THRESHOLD;
      settle({ pass, peakLevel, durationMs, error: null });
    });

    // Safety timeout — set flag then SIGTERM so the `close` handler can report it.
    // The timer reference is cleared in `settle` if the process finishes early.
    safetyTimer = setTimeout(() => {
      safetyTimer = null;
      if (!settled) {
        timedOut = true;
        try { proc.kill("SIGTERM"); } catch { /* ignore */ }
      }
    }, (TEST_CAPTURE_DURATION_S + 3) * 1000);
  });
}
