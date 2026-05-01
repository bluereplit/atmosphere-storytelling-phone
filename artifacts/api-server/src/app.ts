import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import pinoHttp from "pino-http";
import { initRouter } from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { initWebSocketServer, broadcastState } from "./lib/wsServer.js";
import { initOscServer } from "./lib/oscServer.js";
import { startSuperCollider, stopSuperCollider } from "./lib/supercollider.js";
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

export function createAppServer(): Server {
  const server = createServer(app);

  initWebSocketServer(server);

  onStateChange((state) => {
    broadcastState(state);
  });

  initFromShow(currentShow);

  startSuperCollider();

  setTimeout(() => {
    startAudioEngine(currentShow);
  }, 8000);

  const overlayToggle = () => {
    broadcastState({ ...getShow() as unknown as import("./lib/stateManager.js").LiveState, __overlayToggle: true } as unknown as import("./lib/stateManager.js").LiveState);
  };

  initOscServer(getShow, overlayToggle);

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  function cleanup(): void {
    logger.info("Shutting down...");
    teardown();
    stopSuperCollider();
    saveShow(currentShow);
    process.exit(0);
  }

  return server;
}

export default app;
