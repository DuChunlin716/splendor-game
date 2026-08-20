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
const { WebSocketServer } = require('ws');
const G = require('./game.js');
const AI = require('./ai.js');

const PORT = process.env.PORT || 3000;

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
const ROOT = __dirname;
console.log("ROOT:", ROOT);

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { url = '/'; }
  if (url === '/') url = '/index.html';
  const file = path.resolve(ROOT, '.' + url);
  if (!file.startsWith(path.resolve(ROOT))) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

/* ---------------- 房间管理 ---------------- */
let nextRoom = 1000;
const rooms = {}; // roomId -> room

function makeRoom(roomId, playerCount, aiLevel) {
  return {
    id: roomId,
    playerCount: playerCount,
    aiLevel: aiLevel,
    started: false,
    state: null,
    seats: [],      // [{ name, ws, connected }]
    turnTimer: null
  };
}

/** 发送房间信息（含 mySeat）给指定连接 */
function sendRoomInfo(room, ws) {
  const seat = room.seats.findIndex(s => s.ws === ws);
  ws.send(JSON.stringify({
    type: 'roomInfo',
    roomId: room.id,
    mySeat: seat,
    playerCount: room.playerCount,
    started: room.started,
    seats: room.seats.map(s => ({ name: s.name, connected: s.connected }))
  }));
}

/** 广播当前状态给房间内所有连接（每个连接附带自己的座位号） */
function sendState(room) {
  const snap = JSON.parse(JSON.stringify(room.state));
  room.seats.forEach((s, i) => {
    if (s.ws && s.ws.readyState === 1) {
      s.ws.send(JSON.stringify({ type: 'state', state: snap, mySeat: i, roomId: room.id, started: room.started }));
    }
  });
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
        const roomId = String(nextRoom++);
        const room = makeRoom(roomId, playerCount, aiLevel);
        room.seats.push({ name: String(msg.name || '玩家').slice(0, 12), ws: ws, connected: true });
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
        room.seats.push({ name: String(msg.name || '玩家' + (seat + 1)).slice(0, 12), ws: ws, connected: true });
        ws.roomId = room.id;
        sendRoomInfo(room, ws);
        // 通知房间内其他玩家刷新列表
        room.seats.forEach((s, i) => { if (s.ws !== ws && s.ws.readyState === 1) sendRoomInfo(room, s.ws); });
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
      room.seats[seat].connected = false;
      // 掉线托管：该座位由 AI 接管（保留名字），游戏继续
      if (room.state && room.state.players[seat] && !room.state.gameOver) {
        room.state.players[seat].isAI = true;
        sendState(room);
        scheduleAiTurn(room);
      }
      room.seats[seat].ws = null;
    }
    // 清理空房间（所有座位都断线）
    if (room.seats.every(s => !s.connected)) {
      clearTimeout(room.turnTimer);
      delete rooms[room.id];
    }
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
