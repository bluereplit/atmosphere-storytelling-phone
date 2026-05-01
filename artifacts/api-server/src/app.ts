import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server } from "http";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import cors from "cors";
import pinoHttp from "pino-http";
import { initRouter } from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { initWebSocketServer, broadcastState, broadcastOverlayToggle } from "./lib/wsServer.js";
import { initVoiceWebSocket, closeVoiceWebSocket } from "./lib/voiceRelay.js";
import { initOscServer } from "./lib/oscServer.js";
import { startSuperCollider, stopSuperCollider, onEverySuperColliderReady, onEverySuperColliderExit } from "./lib/supercollider.js";
import {
  initFromShow,
  onStateChange,
  startAudioEngine,
  teardown,
} from "./lib/stateManager.js";
import { loadShow, saveShow } from "./lib/showConfig.js";
import type { ShowConfig } from "./lib/themes.config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let currentShow: ShowConfig = loadShow();

function getShow(): ShowConfig {
  return currentShow;
}

function setShow(s: ShowConfig): void {
  currentShow = s;
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  })
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const docsDir = join(__dirname, "../docs");
app.use("/docs", express.static(docsDir));

app.use("/api", initRouter(getShow, setShow));

// Serve the control dashboard as static assets at root "/" when the production
// build exists. This allows the API server to self-host the dashboard on a
// Raspberry Pi without a separate reverse proxy (e.g. after running
// `pnpm --filter @workspace/control-dashboard run build`).
// In Replit development the Vite dev server handles "/" via the artifact proxy.
const dashboardDist = resolve(
  process.env.DASHBOARD_DIST_DIR ??
  join(__dirname, "../../control-dashboard/dist/public")
);
if (existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  // SPA fallback — serve index.html for any path not handled above.
  // Excludes /api, /ws, /docs so unrecognised API calls still return 404.
  app.use((req: Request, res: Response, next) => {
    const p = req.path;
    if (p.startsWith("/api") || p.startsWith("/ws") || p.startsWith("/docs")) {
      return next();
    }
    res.sendFile(join(dashboardDist, "index.html"));
  });
  logger.info({ dashboardDist }, "Serving control dashboard from built assets");
}

export function createAppServer(): Server {
  const server = createServer(app);

  initWebSocketServer(server);
  initVoiceWebSocket(server);

  onStateChange((state) => {
    broadcastState(state);
  });

  initFromShow(currentShow);

  startSuperCollider();

  onEverySuperColliderExit(() => {
    logger.warn("SuperCollider exited — resetting audio engine state");
    teardown();
  });

  onEverySuperColliderReady(() => {
    logger.info("SuperCollider ready — starting audio engine");
    startAudioEngine(currentShow);
  });

  const overlayToggle = () => {
    broadcastOverlayToggle();
  };

  initOscServer(getShow, overlayToggle);

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  function cleanup(): void {
    logger.info("Shutting down...");
    teardown();
    stopSuperCollider();
    closeVoiceWebSocket();
    saveShow(currentShow);
    process.exit(0);
  }

  return server;
}

export default app;
