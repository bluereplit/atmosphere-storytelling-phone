/**
 * Voice audio relay — accepts raw 32-bit float PCM chunks from the browser
 * over a dedicated WebSocket path (/ws/voice) and pipes them to an aplay
 * subprocess targeting the ALSA loopback playback device.
 *
 * Browser sends: Float32Array chunks, mono, 44100 Hz, little-endian.
 * aplay expects: raw signed 16-bit LE PCM on the loopback device.
 *
 * If aplay / ALSA is unavailable (e.g. Replit dev environment), the relay
 * logs a warning and drops audio data gracefully without crashing.
 *
 * Backpressure: before writing to aplay stdin, the relay checks whether
 * stdin.writableNeedDrain is true. When the pipe is saturated, incoming
 * chunks are held in a bounded ring buffer (RING_CAPACITY slots). If the
 * ring buffer is also full, the incoming chunk is dropped and the drop
 * count is incremented. When the pipe drains, buffered chunks are flushed.
 */

import { WebSocketServer, WebSocket } from "ws";
import { spawn, execSync, type ChildProcess } from "child_process";
import type { Server } from "http";
import { logger } from "./logger.js";

const LOOPBACK_DEVICE = process.env["VOICE_LOOPBACK_DEVICE"] ?? "hw:Loopback,0";
const SAMPLE_RATE = 44100;

// ---------------------------------------------------------------------------
// Loopback pre-flight check
// ---------------------------------------------------------------------------

/**
 * Verify that the ALSA loopback device is available before accepting a voice
 * WebSocket connection. Returns { available: true } when ready, or
 * { available: false, reason: "<human-readable message>" } when not.
 */
function checkLoopbackAvailable(): { available: boolean; reason: string } {
  try {
    const lsmodOut = execSync("lsmod", { timeout: 3000 }).toString();
    const moduleLoaded = lsmodOut.split("\n").some((line) => /^snd_aloop\b/.test(line));
    if (!moduleLoaded) {
      return {
        available: false,
        reason: "ALSA loopback not available — run: sudo systemctl start alsa-loopback",
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      reason: `ALSA loopback check failed: ${msg}`,
    };
  }

  try {
    const cardsOut = execSync("cat /proc/asound/cards", { timeout: 2000 }).toString();
    if (!/Loopback/i.test(cardsOut)) {
      return {
        available: false,
        reason: "ALSA Loopback device not found — run: sudo systemctl start alsa-loopback",
      };
    }
  } catch {
    return {
      available: false,
      reason: "Could not read /proc/asound/cards — run: sudo systemctl start alsa-loopback",
    };
  }

  return { available: true, reason: "" };
}

/**
 * Maximum number of PCM chunks held in the ring buffer while aplay stdin
 * is draining.  At a typical 4096-sample chunk (~93 ms) this is ~9 seconds
 * of audio, which is more than enough headroom without growing unbounded.
 */
const RING_CAPACITY = 100;

// ---------------------------------------------------------------------------
// Stats – accessible via getVoiceRelayStats() for the level-meter endpoint
// ---------------------------------------------------------------------------

let receivedFrames = 0;
let droppedFrames = 0;

/** Ring buffer for backpressure buffering */
const ring: Buffer[] = [];

/** Flush any buffered chunks to aplay stdin, stopping if it fills again. */
function flushRing(): void {
  if (!aplayProcess?.stdin || aplayProcess.stdin.destroyed) {
    ring.length = 0;
    return;
  }
  while (ring.length > 0) {
    if (aplayProcess.stdin.writableNeedDrain) {
      // Pipe is full again – stop here; the next drain event will resume.
      return;
    }
    const chunk = ring.shift()!;
    try {
      aplayProcess.stdin.write(chunk);
    } catch (err) {
      logger.warn({ err }, "aplay stdin write error (flush)");
    }
  }
}

// ---------------------------------------------------------------------------

let voiceWss: WebSocketServer | null = null;
let aplayProcess: ChildProcess | null = null;
let clientCount = 0;
let aplayAvailable: boolean | null = null;

export function float32ToInt16(floatArr: Float32Array): Buffer {
  const buf = Buffer.allocUnsafe(floatArr.length * 2);
  for (let i = 0; i < floatArr.length; i++) {
    const s = Math.max(-1, Math.min(1, floatArr[i]!));
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), i * 2);
  }
  return buf;
}

function startAplay(): void {
  if (aplayProcess) return;

  try {
    aplayProcess = spawn("aplay", [
      "--device", LOOPBACK_DEVICE,
      "--format", "S16_LE",
      "--rate", String(SAMPLE_RATE),
      "--channels", "1",
      "--file-type", "raw",
      "-",
    ], {
      stdio: ["pipe", "ignore", "pipe"],
    });

    aplayAvailable = true;
    logger.info({ device: LOOPBACK_DEVICE }, "aplay voice relay started");

    // Flush the ring buffer once stdin is ready to accept more data.
    aplayProcess.stdin?.on("drain", () => {
      logger.debug({ buffered: ring.length }, "aplay stdin drained – flushing ring buffer");
      flushRing();
    });

    aplayProcess.stderr?.on("data", (d: Buffer) => {
      const txt = d.toString().trim();
      if (txt) logger.warn({ aplay: txt }, "aplay stderr");
    });

    aplayProcess.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        aplayAvailable = false;
        logger.warn("aplay not found — voice audio relay disabled. Install alsa-utils on the Pi.");
      } else {
        logger.error({ err }, "aplay process error");
      }
      aplayProcess = null;
      ring.length = 0;
    });

    aplayProcess.on("exit", (code) => {
      logger.info({ code }, "aplay process exited");
      aplayProcess = null;
      ring.length = 0;
    });
  } catch (err) {
    logger.warn({ err }, "Failed to spawn aplay — voice audio relay disabled");
    aplayProcess = null;
    aplayAvailable = false;
  }
}

function stopAplay(): void {
  if (!aplayProcess) return;
  ring.length = 0;
  try {
    aplayProcess.stdin?.end();
    aplayProcess.kill("SIGTERM");
  } catch {
    // ignore
  }
  aplayProcess = null;
  logger.info("aplay voice relay stopped");
}

/**
 * Write a PCM chunk to aplay stdin, applying backpressure when the pipe
 * is saturated.
 *
 * - If stdin is ready: write immediately.
 * - If stdin needs draining but the ring buffer has room: enqueue the chunk.
 * - If the ring buffer is full: drop the chunk and log a warning.
 */
export function writeChunk(data: Buffer): void {
  receivedFrames++;

  if (!aplayProcess || !aplayProcess.stdin || aplayProcess.stdin.destroyed) {
    if (aplayAvailable !== false) {
      startAplay();
    }
    // aplay just started or unavailable — drop this first chunk
    droppedFrames++;
    return;
  }

  if (aplayProcess.stdin.writableNeedDrain) {
    // Pipe is back-pressured; try to buffer the chunk.
    if (ring.length >= RING_CAPACITY) {
      droppedFrames++;
      logger.warn(
        { droppedFrames, buffered: ring.length },
        "aplay stdin saturated and ring buffer full — dropping PCM chunk"
      );
      return;
    }
    ring.push(data);
    return;
  }

  // Flush any previously buffered chunks first to preserve ordering.
  if (ring.length > 0) {
    ring.push(data);
    flushRing();
    return;
  }

  try {
    aplayProcess.stdin.write(data);
  } catch (err) {
    logger.warn({ err }, "aplay stdin write error");
    droppedFrames++;
  }
}

/**
 * Returns relay stats for the level-meter / health endpoint.
 * receivedFrames counts every chunk the relay received from the browser.
 * droppedFrames counts chunks that were discarded due to back-pressure or
 * aplay being unavailable.
 */
export function getVoiceRelayStats(): {
  receivedFrames: number;
  droppedFrames: number;
  bufferedChunks: number;
} {
  return {
    receivedFrames,
    droppedFrames,
    bufferedChunks: ring.length,
  };
}

/** Reset stats (used in tests). */
export function resetVoiceRelayStats(): void {
  receivedFrames = 0;
  droppedFrames = 0;
  ring.length = 0;
}

export function initVoiceWebSocket(server: Server): void {
  voiceWss = new WebSocketServer({ server, path: "/ws/voice" });

  voiceWss.on("connection", (ws, req) => {
    // Pre-flight: verify the ALSA loopback device is ready before accepting audio.
    const loopback = checkLoopbackAvailable();
    if (!loopback.available) {
      logger.warn(
        { ip: req.socket.remoteAddress, reason: loopback.reason },
        "Rejecting voice WebSocket — ALSA loopback not ready"
      );
      // WS close-frame reason is limited to 123 bytes (UTF-8) per RFC 6455.
      const closeReason = Buffer.byteLength(loopback.reason, "utf8") <= 123
        ? loopback.reason
        : loopback.reason.slice(0, 120) + "…";
      ws.close(4001, closeReason);
      return;
    }

    clientCount++;
    logger.info({ ip: req.socket.remoteAddress, clientCount }, "Voice WebSocket client connected");

    if (clientCount === 1) {
      startAplay();
    }

    ws.binaryType = "arraybuffer";

    ws.on("message", (raw) => {
      if (aplayAvailable === false) return;

      let pcm16: Buffer;
      if (raw instanceof Buffer) {
        const float32 = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
        pcm16 = float32ToInt16(float32);
      } else if (raw instanceof ArrayBuffer) {
        const float32 = new Float32Array(raw);
        pcm16 = float32ToInt16(float32);
      } else {
        return;
      }

      writeChunk(pcm16);
    });

    ws.on("error", (err) => logger.warn({ err }, "Voice WebSocket client error"));

    ws.on("close", () => {
      clientCount = Math.max(0, clientCount - 1);
      logger.info({ clientCount }, "Voice WebSocket client disconnected");
      if (clientCount === 0) {
        stopAplay();
      }
    });
  });

  logger.info("Voice WebSocket relay initialized at /ws/voice");
}

export function closeVoiceWebSocket(): void {
  stopAplay();
  if (voiceWss) {
    voiceWss.close();
    voiceWss = null;
  }
}
