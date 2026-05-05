/**
 * Atmosphere Phone — WebSocket Relay Server
 *
 * Architecture:
 *   - Presentation phone registers as 'presentation' role (authoritative state holder)
 *   - Controller phones register as 'controller' role (send commands, receive state)
 *   - Relay routes CMD_* messages from controllers → presentation
 *   - Relay routes STATE messages from presentation → all controllers
 *   - Relay notifies presentation when controllers connect/disconnect
 *
 * Run on any WiFi-connected machine (laptop, Pi, etc.):
 *   node relay-server/index.js
 *
 * Then set relay URL in both phones to: ws://<machine-ip>:3001
 */

const http = require('http');
const { WebSocketServer } = require('ws');
const os = require('os');

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      clients: wss.clients.size,
      presentation: presentationWs !== null,
      controllers: controllerClients.size,
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

let presentationWs = null;
const controllerClients = new Set();

function sendTo(ws, data) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(typeof data === 'string' ? data : JSON.stringify(data));
  }
}

function broadcastToControllers(data) {
  controllerClients.forEach(ws => sendTo(ws, data));
}

wss.on('connection', (ws, req) => {
  const remoteIp = req.socket.remoteAddress;
  console.log(`[relay] Client connected from ${remoteIp}`);
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (rawData) => {
    let msg;
    try { msg = JSON.parse(rawData.toString()); } catch { return; }

    // ── Role registration ──────────────────────────────────────────
    if (msg.type === 'HELLO') {
      if (msg.role === 'presentation') {
        ws.role = 'presentation';
        presentationWs = ws;
        console.log(`[relay] Presentation registered (${remoteIp})`);
        // Tell all waiting controllers that presentation is live
        broadcastToControllers({ type: 'PRESENTATION_CONNECTED' });
        return;
      }

      if (msg.role === 'controller') {
        ws.role = 'controller';
        controllerClients.add(ws);
        console.log(`[relay] Controller registered (${remoteIp}) — ${controllerClients.size} total`);

        if (presentationWs) {
          // Tell this controller presentation is already live
          sendTo(ws, { type: 'PRESENTATION_CONNECTED' });
          // Ask presentation to broadcast its current state so controller syncs up
          sendTo(presentationWs, { type: 'REQUEST_STATE' });
          // Tell presentation a new controller joined
          sendTo(presentationWs, { type: 'CONTROLLER_CONNECTED', count: controllerClients.size });
        }
        return;
      }
    }

    // ── Ping/Pong keepalive ────────────────────────────────────────
    if (msg.type === 'PING') {
      sendTo(ws, { type: 'PONG' });
      return;
    }
    if (msg.type === 'PONG') {
      ws.isAlive = true;
      return;
    }

    // ── Route: controller → presentation ──────────────────────────
    // CMD_* messages (phase, theme, intensity, volume, attributes, voice, etc.)
    if (ws.role === 'controller' && presentationWs) {
      sendTo(presentationWs, rawData.toString());
      return;
    }

    // ── Route: presentation → all controllers ─────────────────────
    // STATE broadcasts and other presentation→controller messages
    if (ws.role === 'presentation') {
      broadcastToControllers(rawData.toString());
      return;
    }
  });

  ws.on('close', () => {
    if (ws.role === 'presentation') {
      presentationWs = null;
      console.log('[relay] Presentation disconnected');
      broadcastToControllers({ type: 'PRESENTATION_DISCONNECTED' });
    } else if (ws.role === 'controller') {
      controllerClients.delete(ws);
      console.log(`[relay] Controller disconnected — ${controllerClients.size} remaining`);
      // Notify presentation of updated controller count
      if (presentationWs) {
        sendTo(presentationWs, { type: 'CONTROLLER_DISCONNECTED', count: controllerClients.size });
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`[relay] WebSocket error: ${err.message}`);
  });
});

// Server-side ping to detect dead connections
const pingInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(pingInterval));

server.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  const ips = Object.values(interfaces)
    .flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address);

  console.log(`\nAtmosphere Relay Server — port ${PORT}`);
  console.log('\nSet relay URL in both phones to:');
  ips.forEach(ip => console.log(`  ws://${ip}:${PORT}`));
  if (ips.length === 0) console.log('  ws://localhost:' + PORT);
  console.log('\nHealth: http://<ip>:' + PORT + '/health\n');
});
