'use strict';

const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');
const serveStatic = require('serve-static');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'events.db');
const DIST_DIR = path.join(__dirname, 'dist');

// ---- SQLite setup ----
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT    NOT NULL,
    client_id  TEXT    NOT NULL,
    name       TEXT,
    char_id    TEXT,
    event_type TEXT    NOT NULL,
    event_data TEXT,
    timestamp  INTEGER NOT NULL
  )
`);

const insertEvent = db.prepare(
  'INSERT INTO events (session_id, client_id, name, char_id, event_type, event_data, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
);

// Session ID resets each calendar day
const sessionId = new Date().toISOString().slice(0, 10);

// ---- Rebuild stats from DB for the current session ----
function loadStats() {
  const totalJoins = db.prepare(
    "SELECT COUNT(*) AS n FROM events WHERE session_id = ? AND event_type = 'join'"
  ).get(sessionId).n;

  const totalMoves = db.prepare(
    "SELECT COUNT(*) AS n FROM events WHERE session_id = ? AND event_type = 'move'"
  ).get(sessionId).n;

  const sentenceRows = db.prepare(
    "SELECT event_data, COUNT(*) AS n FROM events WHERE session_id = ? AND event_type = 'speak' GROUP BY event_data"
  ).all(sessionId);
  const sentences = {};
  sentenceRows.forEach(r => { if (r.event_data) sentences[r.event_data] = r.n; });

  const emoteRows = db.prepare(
    "SELECT event_data, COUNT(*) AS n FROM events WHERE session_id = ? AND event_type = 'emote' GROUP BY event_data"
  ).all(sessionId);
  const emotes = {};
  emoteRows.forEach(r => { if (r.event_data) emotes[r.event_data] = r.n; });

  const activityRows = db.prepare(
    "SELECT client_id, name, char_id, COUNT(*) AS n FROM events WHERE session_id = ? AND event_type IN ('speak','emote','move') GROUP BY client_id"
  ).all(sessionId);
  const activity = {};
  activityRows.forEach(r => { activity[r.client_id] = { name: r.name, charId: r.char_id, count: r.n }; });

  // Replay join/disconnect events to find peak concurrent count
  const timeline = db.prepare(
    "SELECT event_type FROM events WHERE session_id = ? AND event_type IN ('join','disconnect') ORDER BY timestamp, id"
  ).all(sessionId);
  let current = 0, peak = 0;
  timeline.forEach(r => {
    if (r.event_type === 'join') current++;
    else current = Math.max(0, current - 1);
    if (current > peak) peak = current;
  });

  return { peakCount: peak, totalJoins, sentences, emotes, totalMoves, activity };
}

// ---- HTTP server ----
const serve = serveStatic(DIST_DIR);
const server = http.createServer((req, res) => {
  serve(req, res, () => {
    res.writeHead(404);
    res.end('Not found');
  });
});

// ---- WebSocket server ----
const wss = new WebSocketServer({ server, path: '/ws' });

// clients: clientId → { ws, role, name, charId }
const clients = new Map();
let presenterWs = null;
let slideMode = 'free'; // 'free' | 'strip'

function send(ws, data) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

function broadcast(wsList, data) {
  const msg = JSON.stringify(data);
  wsList.forEach(ws => { if (ws.readyState === ws.OPEN) ws.send(msg); });
}

function audienceClients() {
  return [...clients.values()].filter(c => c.role === 'audience').map(c => c.ws);
}

function remoteClients() {
  return [...clients.values()].filter(c => c.role === 'remote').map(c => c.ws);
}

wss.on('connection', (ws) => {
  let clientId = randomUUID();
  clients.set(clientId, { ws, role: null, name: null, charId: null, x: null, y: null, lastMoveInsert: 0 });
  send(ws, { type: 'connected', clientId });

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    const client = clients.get(clientId);
    if (!client) return;

    // ---- Role assignment ----
    if (data.type === 'presenter-init') {
      client.role = 'presenter';
      presenterWs = ws;
      send(ws, { type: 'stats-restore', stats: loadStats() });
      return;
    }

    if (data.type === 'remote-init') {
      client.role = 'remote';
      // Notify all peers about new remote count
      broadcastRemoteCount();
      return;
    }

    // ---- Audience joining ----
    if (data.type === 'audience-join') {
      // Gjenbruk gammal clientId om klienten sender ein (refresh-støtte)
      const resumeId = String(data.resumeClientId || '').trim();
      if (resumeId && resumeId !== clientId && !clients.has(resumeId)) {
        clients.set(resumeId, clients.get(clientId));
        clients.delete(clientId);
        clientId = resumeId;
      }
      client.role = 'audience';
      client.name = String(data.name || '').trim().slice(0, 16) || 'Anonym';
      client.charId = String(data.charId || '');
      client.x = Math.floor(20 + Math.random() * 60);
      client.y = 3;
      insertEvent.run(sessionId, clientId, client.name, client.charId, 'join', null, Date.now());
      send(presenterWs, { type: 'audience-join', clientId, name: client.name, charId: client.charId, x: client.x, y: client.y });
      return;
    }

    // ---- Audience actions → persist + relay to presenter ----
    if (data.type === 'audience-speak') {
      insertEvent.run(sessionId, clientId, client.name, client.charId, 'speak', String(data.sentenceId || ''), Date.now());
      send(presenterWs, { type: 'audience-speak', clientId, sentenceId: data.sentenceId });
      return;
    }

    if (data.type === 'audience-emote') {
      insertEvent.run(sessionId, clientId, client.name, client.charId, 'emote', String(data.emoteId || ''), Date.now());
      send(presenterWs, { type: 'audience-emote', clientId, emoteId: data.emoteId });
      return;
    }

    if (data.type === 'slide-context') {
      const newMode = data.mode === 'free' ? 'free' : 'strip';
      if (newMode !== slideMode) {
        slideMode = newMode;
        if (slideMode === 'strip') {
          for (const [cid, c] of clients) {
            if (c.role === 'audience' && c.y > 6) {
              c.y = 6;
              send(presenterWs, { type: 'audience-position', clientId: cid, x: c.x, y: c.y });
            }
          }
        }
      }
      return;
    }

    if (data.type === 'audience-move') {
      const dir = String(data.direction || '');
      const yMax = slideMode === 'free' ? 90 : 6;
      if (dir === 'left')  client.x = Math.max(2,  client.x - 1);
      if (dir === 'right') client.x = Math.min(98, client.x + 1);
      if (dir === 'up')    client.y = Math.min(yMax, client.y + 1);
      if (dir === 'down')  client.y = Math.max(1,   client.y - 1);
      const now = Date.now();
      if (now - client.lastMoveInsert > 1000) {
        insertEvent.run(sessionId, clientId, client.name, client.charId, 'move', dir, now);
        client.lastMoveInsert = now;
      }
      send(presenterWs, { type: 'audience-position', clientId, x: client.x, y: client.y });
      return;
    }

    // ---- Presenter → specific audience client ----
    if (data.type === 'audience-ack') {
      const target = clients.get(data.clientId);
      if (target) send(target.ws, { type: 'audience-ack', totalMembers: data.totalMembers });
      return;
    }

    // ---- Presenter → all audience ----
    if (data.type === 'audience-update') {
      broadcast(audienceClients(), { type: 'audience-update', totalMembers: data.totalMembers });
      return;
    }

    // ---- Remote action → presenter ----
    if (data.action === 'reset-stats') {
      db.prepare("DELETE FROM events WHERE session_id = ?").run(sessionId);
      send(presenterWs, { type: 'stats-restore', stats: loadStats() });
      return;
    }

    if (data.action) {
      send(presenterWs, data);
      return;
    }

    // ---- Presenter state/timer/etc → all remotes ----
    if (data.type === 'state' || data.type === 'timer' || data.type === 'timer-stop' ||
        data.type === 'font-scale' || data.type === 'timer-duration') {
      broadcast(remoteClients(), data);
      return;
    }
  });

  ws.on('close', () => {
    const client = clients.get(clientId);
    if (!client) return;

    if (client.role === 'audience') {
      insertEvent.run(sessionId, clientId, client.name, client.charId, 'disconnect', null, Date.now());
      send(presenterWs, { type: 'audience-disconnect', clientId });
    }

    if (client.role === 'presenter') presenterWs = null;

    if (client.role === 'remote') {
      clients.delete(clientId);
      broadcastRemoteCount();
      return;
    }

    clients.delete(clientId);
  });
});

function broadcastRemoteCount() {
  const count = [...clients.values()].filter(c => c.role === 'remote').length;
  send(presenterWs, { type: 'remote-count', count });
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`SQLite: ${DB_PATH}`);
  console.log(`Serving: ${DIST_DIR}`);
});
