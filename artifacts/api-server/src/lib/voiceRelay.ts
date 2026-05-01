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
 */

import { WebSocketServer, WebSocket } from "ws";
import { spawn, type ChildProcess } from "child_process";
import type { Server } from "http";
import { logger } from "./logger.js";

const LOOPBACK_DEVICE = process.env["VOICE_LOOPBACK_DEVICE"] ?? "hw:Loopback,0";
const SAMPLE_RATE = 44100;

let voiceWss: WebSocketServer | null = null;
let aplayProcess: ChildProcess | null = null;
let clientCount = 0;
let aplayAvailable: boolean | null = null;

function float32ToInt16(floatArr: Float32Array): Buffer {
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
    });

    aplayProcess.on("exit", (code) => {
      logger.info({ code }, "aplay process exited");
      aplayProcess = null;
    });
  } catch (err) {
    logger.warn({ err }, "Failed to spawn aplay — voice audio relay disabled");
    aplayProcess = null;
    aplayAvailable = false;
  }
}

function stopAplay(): void {
  if (!aplayProcess) return;
  try {
    aplayProcess.stdin?.end();
    aplayProcess.kill("SIGTERM");
  } catch {
    // ignore
  }
  aplayProcess = null;
  logger.info("aplay voice relay stopped");
}

function writeChunk(data: Buffer): void {
  if (!aplayProcess || !aplayProcess.stdin || aplayProcess.stdin.destroyed) {
    if (aplayAvailable !== false) {
      startAplay();
    }
    return;
  }
  try {
    aplayProcess.stdin.write(data);
  } catch (err) {
    logger.warn({ err }, "aplay stdin write error");
  }
}

export function initVoiceWebSocket(server: Server): void {
  voiceWss = new WebSocketServer({ server, path: "/ws/voice" });

  voiceWss.on("connection", (ws, req) => {
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
