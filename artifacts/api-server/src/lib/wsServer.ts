import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { logger } from "./logger.js";
import type { LiveState } from "./stateManager.js";

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: Server): void {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    logger.info({ ip: req.socket.remoteAddress }, "WebSocket client connected");
    ws.on("error", (err) => logger.warn({ err }, "WebSocket client error"));
    ws.on("close", () => logger.info("WebSocket client disconnected"));
  });

  logger.info("WebSocket server initialized at /ws");
}

export function broadcastState(state: LiveState): void {
  if (!wss) return;
  const payload = JSON.stringify({ type: "state", ...state });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload, (err) => {
        if (err) logger.warn({ err }, "WebSocket broadcast error");
      });
    }
  }
}
