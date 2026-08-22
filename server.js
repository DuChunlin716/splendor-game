/* ============================================================
 * server.js —— 《璀璨宝石》联机服务器（静态托管 + WebSocket 房间）
 *
 * 架构：服务器权威
 *   - 浏览器访问 http://服务器:3000 获得游戏页面（含单机模式）
 *   - 联机模式：创建/加入房间（2~4 人），服务器运行游戏状态，
 *     真人操作指令由服务器执行，AI 补位/掉线托管由服务器自动行动，
 *     每次状态变化广播快照给所有玩家。
 *
 * 启动：node server.js   （或 npm start）
 * 环境变量 PORT 可指定端口（公网平台会自动注入）。
 * ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const G = require('./game.js');
const AI = require('./ai.js');

const PORT = process.env.PORT || 3000;
const RECONNECT_GRACE_MS = Math.max(0, Number(process.env.RECONNECT_GRACE_MS) || 15000);
const ROOM_IDLE_MS = Math.max(RECONNECT_GRACE_MS, Number(process.env.ROOM_IDLE_MS) || 10 * 60 * 1000);

/* ---------------- 静态文件服务 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml'
};

/**
 * 定位静态文件根目录。
 * 优先使用 __dirname（脚本所在目录）；若其中没有 index.html（部分部署平台
 * 的工作目录与脚本目录不一致，或代码被放在仓库子目录），回退到 process.cwd()。
 */
function resolveRoot() {
  const candidates = [__dirname, process.cwd()];
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, 'index.html'))) return c;
    } catch (e) { /* 目录不可读时跳过 */ }
  }
  return __dirname;
}
const ROOT = resolveRoot();

console.log('[static] 根目录: ' + ROOT);
console.log('[static] index.html 存在: ' + fs.existsSync(path.join(ROOT, 'index.html')));
try {
  console.log('[static] 文件清单: ' + fs.readdirSync(ROOT).join(', '));
} catch (e) {
  console.error('[static] 根目录不可读: ' + e.message);
}

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { url = '/'; }
  // 主页与目录请求 → index.html
  if (url === '/' || url === '') url = '/index.html';
  if (url.charAt(url.length - 1) === '/') url += 'index.html';
  // 规范化路径并严格限定在 ROOT 内（防目录穿越，如 /../、/..%2F）
  const file = path.normalize(path.join(ROOT, url));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      console.error('[static] 404 ' + req.url + ' -> ' + file + ' (' + err.code + ')');
      res.writeHead(404); res.end('Not Found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

/* ---------------- 房间管理 ---------------- */
const rooms = {}; // roomId -> room

function createRoomId() {
  let id;
  do { id = String(crypto.randomInt(100000, 1000000)); } while (rooms[id]);
  return id;
}

function createResumeToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function makeRoom(roomId, playerCount, aiLevel) {
  return {
    id: roomId,
    playerCount: playerCount,
    aiLevel: aiLevel,
    started: false,
    state: null,
    seats: [],      // [{ name, ws, connected, token, disconnectTimer }]
    turnTimer: null,
    emptyTimer: null
  };
}

function publicSeats(room) {
  return room.seats.map(s => ({ name: s.name, connected: s.connected }));
}

function sendError(ws, message, code) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', message, code: code || '' }));
}

/** 发送房间信息（含 mySeat）给指定连接 */
function sendRoomInfo(room, ws) {
  const seat = room.seats.findIndex(s => s.ws === ws);
  if (seat < 0) return;
  ws.send(JSON.stringify({
    type: 'roomInfo',
    roomId: room.id,
    mySeat: seat,
    playerCount: room.playerCount,
    started: room.started,
    seats: publicSeats(room),
    resumeToken: room.seats[seat].token
  }));
}

/**
 * 为指定座位生成安全快照：公开区完整；自己预留卡完整；对手预留卡只保留数量；
 * 牌堆只保留长度。服务端内部状态与撤销快照绝不下发。
 */
function stateForSeat(room, seat) {
  const snap = JSON.parse(JSON.stringify(room.state));
  for (let tier = 1; tier <= 3; tier++) {
    snap.decks[tier] = new Array(room.state.decks[tier].length).fill(null);
  }
  snap.players.forEach((p, i) => {
    if (i !== seat) p.reserved = new Array(room.state.players[i].reserved.length).fill({ hidden: true });
    const humanSeat = room.seats[i];
    p.seatType = humanSeat ? 'human' : 'ai';
    p.connected = humanSeat ? !!humanSeat.connected : true;
  });
  delete snap.snapshots;
  delete snap.rng;
  delete snap.aiGoal;
  return snap;
}

/** 广播当前状态给房间内所有连接（每个连接获得各自裁剪后的快照） */
function sendState(room) {
  room.seats.forEach((s, i) => {
    if (s.ws && s.ws.readyState === 1) {
      s.ws.send(JSON.stringify({
        type: 'state', state: stateForSeat(room, i), mySeat: i,
        roomId: room.id, started: room.started
      }));
    }
  });
}

function broadcastRoomInfo(room, exceptWs) {
  room.seats.forEach(s => {
    if (s.ws && s.ws !== exceptWs && s.ws.readyState === 1) sendRoomInfo(room, s.ws);
  });
}

function clearEmptyTimer(room) {
  if (room.emptyTimer) clearTimeout(room.emptyTimer);
  room.emptyTimer = null;
}

function scheduleRoomCleanup(room) {
  clearEmptyTimer(room);
  if (!room.seats.every(s => !s.connected)) return;
  room.emptyTimer = setTimeout(() => {
    if (room.seats.every(s => !s.connected)) {
      clearTimeout(room.turnTimer);
      room.seats.forEach(s => clearTimeout(s.disconnectTimer));
      delete rooms[room.id];
    }
  }, ROOM_IDLE_MS);
}

/** 连续执行 AI 回合（AI 座位 / 掉线托管的真人座位），带思考延迟 */
function scheduleAiTurn(room) {
  if (!room.started || !room.state || room.state.gameOver) return;
  const idx = room.state.currentPlayer;
  if (!room.state.players[idx].isAI) return; // 真人回合，等待指令
  clearTimeout(room.turnTimer);
  room.turnTimer = setTimeout(() => {
    AI.executeAiTurn(room.state, idx);
    sendState(room);
    scheduleAiTurn(room);
  }, 600 + Math.random() * 400);
}

/* ---------------- 行动处理（真人回合） ---------------- */
/** 罕见死局自动救济：无任何合法行动时，自动归还 1 枚筹码并结束回合 */
function autoRelief(room, seat) {
  const st = room.state;
  const p = st.players[seat];
  const order = G.COLORS.slice().sort((a, b) => (p.tokens[b] || 0) - (p.tokens[a] || 0));
  for (const c of order) {
    if (p.tokens[c] > 0) { G.returnTokens(st, seat, c, 1); return true; }
  }
  if (p.tokens[G.GOLD] > 0) { G.returnTokens(st, seat, G.GOLD, 1); return true; }
  return false;
}

function handleAction(room, seat, action) {
  const st = room.state;
  if (!room.started || !st) return { ok: false, reason: '游戏未开始' };
  if (st.gameOver) return { ok: false, reason: '游戏已结束' };
  if (st.currentPlayer !== seat) return { ok: false, reason: '还没轮到你行动' };
  if (st.players[seat].isAI) return { ok: false, reason: '该座位由电脑托管' };

  // 罕见死局自动救济（真人行动阶段已无任何合法行动）
  if (st.phase === 'action' && !G.hasAnyLegalAction(st, seat)) {
    if (autoRelief(room, seat)) {
      G.log(st, '（罕见局面）' + st.players[seat].name + ' 无合法行动，自动归还 1 枚筹码并结束回合');
      G.completeTurn(st);
      sendState(room);
      scheduleAiTurn(room);
      return { ok: true, relief: true };
    }
    return { ok: false, reason: '无合法行动且无法归还筹码' };
  }

  // 阶段校验
  if (['take', 'buy', 'reserve', 'blindReserve'].indexOf(action.type) >= 0 && st.phase !== 'action') {
    return { ok: false, reason: '当前阶段不能执行该操作' };
  }
  if ((action.type === 'returnToken' || action.type === 'finishDiscard') && st.phase !== 'discard') {
    return { ok: false, reason: '当前不需要归还筹码' };
  }
  if (action.type === 'chooseNoble' && st.pendingNobles.length === 0) {
    return { ok: false, reason: '没有待选择的贵族' };
  }

  let res = null;
  switch (action.type) {
    case 'take': res = G.takeTokens(st, seat, action.colors); break;
    case 'buy': res = G.buyCard(st, seat, action.cardId); break;
    case 'reserve': res = G.reserveCard(st, seat, action.cardId); break;
    case 'blindReserve': res = G.reserveCard(st, seat, null, action.tier); break;
    case 'returnToken': res = G.returnTokens(st, seat, action.color, action.n || 1); break;
    case 'finishDiscard': res = G.finishDiscard(st, seat); break;
    case 'chooseNoble': res = G.chooseNoble(st, seat, action.nobleId); break;
    default: return { ok: false, reason: '未知指令' };
  }
  if (!res || !res.ok) return { ok: false, reason: res ? res.reason : '执行失败' };

  // 多贵族待选：等待 chooseNoble 指令
  if (st.pendingNobles.length > 0) { sendState(room); return { ok: true, needNoble: true }; }
  // 归还阶段：等待 returnToken / finishDiscard 指令
  if (G.needDiscard(st, seat)) {
    st.phase = 'discard';
    sendState(room);
    return { ok: true, needDiscard: true };
  }
  // 结束回合并进入下一位
  G.completeTurn(st);
  sendState(room);
  scheduleAiTurn(room);
  return { ok: true };
}

/* ---------------- WebSocket 消息 ---------------- */
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    switch (msg.type) {
      case 'createRoom': {
        const playerCount = Math.max(2, Math.min(4, msg.playerCount || 2));
        const aiLevel = Math.max(1, Math.min(6, msg.aiLevel || 3));
        const roomId = createRoomId();
        const room = makeRoom(roomId, playerCount, aiLevel);
        room.seats.push({
          name: String(msg.name || '玩家').slice(0, 12), ws: ws, connected: true,
          token: createResumeToken(), disconnectTimer: null
        });
        rooms[roomId] = room;
        ws.roomId = roomId;
        sendRoomInfo(room, ws);
        break;
      }
      case 'joinRoom': {
        const room = rooms[String(msg.roomId)];
        if (!room) { ws.send(JSON.stringify({ type: 'error', message: '房间不存在，请检查房间码' })); break; }
        if (room.started) { ws.send(JSON.stringify({ type: 'error', message: '游戏已开始，无法加入' })); break; }
        if (room.seats.length >= room.playerCount) { ws.send(JSON.stringify({ type: 'error', message: '房间已满' })); break; }
        const seat = room.seats.length;
        room.seats.push({
          name: String(msg.name || '玩家' + (seat + 1)).slice(0, 12), ws: ws, connected: true,
          token: createResumeToken(), disconnectTimer: null
        });
        ws.roomId = room.id;
        sendRoomInfo(room, ws);
        broadcastRoomInfo(room, ws);
        break;
      }
      case 'resumeRoom': {
        const room = rooms[String(msg.roomId || '')];
        if (!room) { sendError(ws, '原房间已失效，请重新创建或加入', 'RESUME_FAILED'); break; }
        const seat = room.seats.findIndex(s => s.token && s.token === String(msg.resumeToken || ''));
        if (seat < 0) { sendError(ws, '回座凭证无效，请重新加入', 'RESUME_FAILED'); break; }
        const slot = room.seats[seat];
        if (slot.ws && slot.ws !== ws && slot.ws.readyState === 1) {
          try { slot.ws.close(4001, 'seat resumed elsewhere'); } catch (e) { /* ignore */ }
        }
        clearTimeout(slot.disconnectTimer);
        slot.disconnectTimer = null;
        slot.ws = ws;
        slot.connected = true;
        ws.roomId = room.id;
        clearEmptyTimer(room);
        clearTimeout(room.turnTimer);
        if (room.state && room.state.players[seat] && !room.state.gameOver) {
          room.state.players[seat].isAI = false;
        }
        sendRoomInfo(room, ws);
        if (room.started && room.state) sendState(room);
        else broadcastRoomInfo(room, ws);
        scheduleAiTurn(room);
        break;
      }
      case 'startGame': {
        const room = rooms[ws.roomId];
        if (!room || room.started) break;
        if (room.seats.findIndex(s => s.ws === ws) !== 0) {
          ws.send(JSON.stringify({ type: 'error', message: '只有房主可以开始游戏' }));
          break;
        }
        // 真人按加入顺序入座；已掉线的座位与不足人数用 AI 补位
        const players = room.seats.map((s) => ({ name: s.name, isAI: !s.connected }));
        while (players.length < room.playerCount) {
          players.push({ name: '电脑' + (players.length), isAI: true });
        }
        room.state = G.createGame({ players: players, aiLevel: room.aiLevel, rng: Math.random });
        room.started = true;
        sendState(room);
        scheduleAiTurn(room);
        break;
      }
      case 'action': {
        const room = rooms[ws.roomId];
        if (!room) break;
        const seat = room.seats.findIndex(s => s.ws === ws);
        const res = handleAction(room, seat, msg.action);
        if (res && !res.ok) ws.send(JSON.stringify({ type: 'error', message: res.reason }));
        break;
      }
      case 'restart': {
        const room = rooms[ws.roomId];
        if (!room || !room.started) break;
        if (room.seats.findIndex(s => s.ws === ws) !== 0) {
          ws.send(JSON.stringify({ type: 'error', message: '只有房主可以重新开始' }));
          break;
        }
        G.resetGame(room.state, { rng: Math.random });
        sendState(room);
        scheduleAiTurn(room);
        break;
      }
      default: break;
    }
  });

  ws.on('close', () => {
    const room = rooms[ws.roomId];
    if (!room) return;
    const seat = room.seats.findIndex(s => s.ws === ws);
    if (seat >= 0) {
      const slot = room.seats[seat];
      slot.connected = false;
      slot.ws = null;
      clearTimeout(slot.disconnectTimer);
      // 给手机网络切换/锁屏恢复预留短暂回座时间；超时后才交给 AI 托管。
      slot.disconnectTimer = setTimeout(() => {
        if (slot.connected) return;
        if (room.state && room.state.players[seat] && !room.state.gameOver) {
          room.state.players[seat].isAI = true;
          sendState(room);
          scheduleAiTurn(room);
        }
      }, RECONNECT_GRACE_MS);
      if (room.started && room.state) sendState(room);
      else broadcastRoomInfo(room);
    }
    scheduleRoomCleanup(room);
  });
});

server.listen(PORT, () => {
  console.log('💎 璀璨宝石服务器已启动');
  console.log('   本地访问:  http://localhost:' + PORT);
  console.log('   局域网访问: http://' + (require('os').networkInterfaces() && getLocalIp()) + ':' + PORT);
});

function getLocalIp() {
  try {
    const nets = require('os').networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  } catch (e) { /* ignore */ }
  return 'localhost';
}
