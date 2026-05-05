/**
 * Atmosphere Phone — WebSocket Relay Server
 *
 * Run this on any computer on your WiFi:
 *   node relay-server/index.js
 *
 * Then set the relay URL in the app to:
 *   ws://<your-laptop-ip>:3001
 *
 * Both phones (Presentation + Controller) connect to this relay.
 * The relay routes state syncs and commands between them.
 */

const http = require('http');
const { WebSocketServer } = require('ws');
const os = require('os');

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', clients: wss.clients.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

let presentationWs = null;
const controllerClients = new Set();

function broadcast(clients, data) {
  clients.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  });
}

wss.on('connection', (ws, req) => {
  console.log(`[relay] client connected from ${req.socket.remoteAddress}`);

  ws.on('message', (rawData) => {
    let msg;
    try { msg = JSON.parse(rawData.toString()); } catch { return; }

    // Role registration
    if (msg.role === 'presentation') {
      ws.role = 'presentation';
      presentationWs = ws;
      console.log('[relay] Presentation phone registered');
      // Notify controllers
      broadcast(controllerClients, { type: 'PRESENTATION_CONNECTED' });
      return;
    }

    if (msg.role === 'controller') {
      ws.role = 'controller';
      controllerClients.add(ws);
      console.log('[relay] Controller phone registered');
      // Notify controller if presentation is already live
      if (presentationWs && presentationWs.readyState === presentationWs.OPEN) {
        ws.send(JSON.stringify({ type: 'PRESENTATION_CONNECTED' }));
        // Ask presentation to send current state
        presentationWs.send(JSON.stringify({ type: 'REQUEST_STATE' }));
      }
      return;
    }

    // Ping/pong
    if (msg.type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG' }));
      return;
    }

    // Route: presentation → broadcast to all controllers
    if (ws.role === 'presentation') {
      broadcast(controllerClients, rawData.toString());
    }

    // Route: controller → forward to presentation
    if (ws.role === 'controller' && presentationWs && presentationWs.readyState === presentationWs.OPEN) {
      presentationWs.send(rawData.toString());
    }
  });

  ws.on('close', () => {
    if (ws.role === 'presentation') {
      presentationWs = null;
      console.log('[relay] Presentation phone disconnected');
      broadcast(controllerClients, { type: 'PRESENTATION_DISCONNECTED' });
    } else if (ws.role === 'controller') {
      controllerClients.delete(ws);
      console.log('[relay] Controller phone disconnected');
    }
  });

  ws.on('error', () => {});
});

server.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  const ips = Object.values(interfaces)
    .flat()
    .filter(i => i.family === 'IPv4' && !i.internal)
    .map(i => i.address);

  console.log(`\n🌐 Atmosphere Relay Server running on port ${PORT}`);
  console.log('\nConnect your phones to:');
  ips.forEach(ip => console.log(`  ws://${ip}:${PORT}`));
  console.log('\nHealth check: http://<ip>:' + PORT + '/health\n');
});
