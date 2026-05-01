import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { logger } from "./logger.js";
import type { LiveState } from "./stateManager.js";

export type WsStateEvent = { type: "state" } & LiveState;
export type WsOverlayToggleEvent = { type: "overlay_toggle"; timestamp: number };
export type WsEvent = WsStateEvent | WsOverlayToggleEvent;

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

function broadcast(event: WsEvent): void {
  if (!wss) return;
  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload, (err) => {
        if (err) logger.warn({ err }, "WebSocket broadcast error");
      });
    }
  }
}

export function broadcastState(state: LiveState): void {
  broadcast({ type: "state", ...state });
}

export function broadcastOverlayToggle(): void {
  broadcast({ type: "overlay_toggle", timestamp: Date.now() });
}
