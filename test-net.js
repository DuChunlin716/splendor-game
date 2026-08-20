/* ============================================================
 * test-net.js —— 联机模式集成测试
 *
 * 启动 server.js（子进程，随机端口），用 ws 客户端模拟多名玩家：
 *   [1] 静态文件服务
 *   [2] 房间 R1（2 真人）：创建 / 加入 / 房间信息 / 权限校验，
 *       之后 b 掉线，房主开局 → 掉线座位由 AI 托管补位
 *   [3] 归还筹码完整流程（R1：真人 + AI 补位，AI 自动行动）
 *   [4] 房间 R2（2 真人）：开局后非当前回合者行动被拒；
 *       中途掉线 → AI 托管并自动完成回合
 *   [5] 空房间清理
 *
 * 用法：node test-net.js
 * ============================================================ */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const G = require('./game.js');

const PORT = 3199 + Math.floor(Math.random() * 200);
const URL = 'ws://127.0.0.1:' + PORT;
let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { failed++; console.log('  ✗ ' + msg); }
}

/* ---------------- 工具 ---------------- */
/** WS 客户端包装：消息队列 + 按条件等待 */
function wrap(ws) {
  const queue = [];
  const waiters = [];
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    const wi = waiters.findIndex((w) => !w.filter || w.filter(msg));
    if (wi >= 0) { const w = waiters.splice(wi, 1)[0]; w.resolve(msg); }
    else queue.push(msg);
  });
  return {
    ws: ws,
    send: (obj) => ws.send(JSON.stringify(obj)),
    wait: (filter, timeout) => new Promise((resolve, reject) => {
      const idx = queue.findIndex((m) => !filter || filter(m));
      if (idx >= 0) { resolve(queue.splice(idx, 1)[0]); return; }
      const timer = setTimeout(() => reject(new Error('等待消息超时: ' + (timeout || 8000))), timeout || 8000);
      waiters.push({ filter: filter, resolve: (m) => { clearTimeout(timer); resolve(m); } });
    })
  };
}
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.on('open', () => resolve(wrap(ws)));
    ws.on('error', reject);
  });
}
function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:' + PORT + path, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: body }));
    }).on('error', reject);
  });
}
function tokenTotal(t) {
  let s = 0;
  for (const c in t) s += t[c];
  return s;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** 等待 c 的座位 seat 处于行动阶段 */
async function waitTurn(c, seat) {
  let st = c.curState;
  while (!(st.currentPlayer === seat && st.phase === 'action')) {
    st = (await c.wait((m) => m.type === 'state')).state;
  }
  c.curState = st;
  return st;
}

/** 当前真人玩家行动：拿 3 色（不足则同色 2 枚），返回拿取的颜色 */
async function humanTake(c, seat, label) {
  const st = await waitTurn(c, seat);
  const bank = st.bank;
  const threes = G.COLORS.filter((col) => bank[col] > 0);
  let colors;
  if (threes.length >= 3) colors = threes.slice(0, 3);
  else {
    const pair = G.COLORS.find((col) => bank[col] >= 4);
    colors = pair ? [pair, pair] : null;
  }
  if (!colors) { ok(false, label + '：公共区无合法拿取'); return null; }
  c.send({ type: 'action', action: { type: 'take', colors: colors } });
  c.curState = (await c.wait((m) => m.type === 'state')).state;
  return colors;
}

/** 若当前处于归还阶段：归还到 <=10 并确认，直到回到行动阶段 */
async function discardToEnd(c, seat) {
  let guard = 0;
  while (c.curState.phase === 'discard' && guard++ < 8) {
    const p = c.curState.players[seat];
    if (tokenTotal(p.tokens) > 10) {
      const col = G.COLORS.find((cc) => p.tokens[cc] > 0) || 'gold';
      c.send({ type: 'action', action: { type: 'returnToken', color: col, n: 1 } });
      c.curState = (await c.wait((m) => m.type === 'state')).state;
    } else {
      c.send({ type: 'action', action: { type: 'finishDiscard' } });
      c.curState = (await c.wait((m) => m.type === 'state')).state;
    }
  }
}

/** 行动后的连带处理：多贵族择一 + 归还阶段，直到本轮流程结束 */
async function settleAfterAction(c, seat) {
  c.curState = (await c.wait((m) => m.type === 'state')).state;
  let guard = 0;
  while (guard++ < 8) {
    if (c.curState.phase === 'discard') { await discardToEnd(c, seat); continue; }
    if (c.curState.pendingNobles.length > 0 && c.curState.currentPlayer === seat) {
      c.send({ type: 'action', action: { type: 'chooseNoble', nobleId: c.curState.pendingNobles[0].id } });
      c.curState = (await c.wait((m) => m.type === 'state')).state;
      continue;
    }
    break;
  }
}

/** 当前真人玩家行动：优先拿 3 色（或同色 2 枚）；拿不了则盲抽预留；再不行买一张买得起的卡。
 *  opts.manualDiscard=true 时：若本轮为「拿宝石」且触发了归还阶段，不自动处理，
 *  返回 { desc, manual:true } 交由调用方接管归还流程（用于测试撤销归还）。 */
async function humanTake(c, seat, label, opts) {
  opts = opts || {};
  const st = await waitTurn(c, seat);
  const bank = st.bank;
  const threes = G.COLORS.filter((col) => bank[col] > 0);
  let colors = null;
  if (threes.length >= 3) colors = threes.slice(0, 3);
  else {
    const pair = G.COLORS.find((col) => bank[col] >= 4);
    colors = pair ? [pair, pair] : null;
  }
  if (colors) {
    c.send({ type: 'action', action: { type: 'take', colors: colors } });
    c.curState = (await c.wait((m) => m.type === 'state')).state;
    if (opts.manualDiscard) return { desc: colors, manual: true };
    await settleAfterAction(c, seat);
    return colors;
  }
  // fallback 1：盲抽预留（预留 <3 且任一牌堆非空）
  const p = st.players[seat];
  if (p.reserved.length < 3) {
    for (let tier = 3; tier >= 1; tier--) {
      if (st.decks[tier] && st.decks[tier].length > 0) {
        c.send({ type: 'action', action: { type: 'blindReserve', tier: tier } });
        await settleAfterAction(c, seat);
        return 'blind' + tier;
      }
    }
  }
  // fallback 2：购买一张买得起的公开卡
  for (let tier = 1; tier <= 3; tier++) {
    for (const card of (st.board[tier] || [])) {
      if (card && G.canAfford(st.players[seat], card)) {
        c.send({ type: 'action', action: { type: 'buy', cardId: card.id } });
        await settleAfterAction(c, seat);
        return 'buy' + card.id;
      }
    }
  }
  ok(false, label + '：无任何合法行动');
  return null;
}

/** 协程：c 在座位 seat 上持续自动行动（推进另一真人回合），掉线/超时自动停止 */
function autoPlay(c, seat) {
  return (async () => {
    for (let i = 0; i < 12; i++) {
      const r = await humanTake(c, seat, '自动行动');
      if (!r) return;
    }
  })().catch(() => { /* 连接关闭后停止 */ });
}

/* ---------------- 测试 ---------------- */
async function testStatic() {
  console.log('\n[1] 静态文件服务');
  const home = await httpGet('/');
  ok(home.status === 200 && home.body.includes('璀璨宝石'), 'GET / 返回游戏页面');
  const js = await httpGet('/game.js');
  ok(js.status === 200 && js.body.includes('SplendorGame'), 'GET /game.js 返回脚本');
  const notFound = await httpGet('/no-such-file.js');
  ok(notFound.status === 404, '不存在的文件返回 404');
}

/** R1：创建/加入/权限校验；b 掉线后房主开局（掉线座位 AI 托管） */
async function testRoomA() {
  console.log('\n[2] 创建 / 加入 / 权限（房间 R1）');
  const a = await connect();
  const b = await connect();
  a.send({ type: 'createRoom', playerCount: 2, aiLevel: 2, name: '阿明' });
  const infoA = await a.wait((m) => m.type === 'roomInfo');
  ok(infoA.mySeat === 0 && infoA.roomId && infoA.playerCount === 2, '创建房间：mySeat=0，返回房间码');
  b.send({ type: 'joinRoom', roomId: infoA.roomId, name: '小红' });
  const infoB = await b.wait((m) => m.type === 'roomInfo');
  ok(infoB.mySeat === 1 && infoB.seats.length === 2, '加入房间：mySeat=1，座位列表 2 人');
  const infoA2 = await a.wait((m) => m.type === 'roomInfo');
  ok(infoA2.seats.length === 2 && infoA2.seats[1].name === '小红', '房主收到成员更新广播');

  // 权限校验
  b.send({ type: 'startGame' });
  const errNonHost = await b.wait((m) => m.type === 'error');
  ok(/房主/.test(errNonHost.message), '非房主开始游戏被拒');
  b.send({ type: 'joinRoom', roomId: '99999', name: 'x' });
  const errNoRoom = await b.wait((m) => m.type === 'error');
  ok(/不存在/.test(errNoRoom.message), '加入不存在的房间报错');

  // b 掉线（未开局），房主开局：掉线座位自动由 AI 托管补位
  b.ws.close();
  await sleep(500);
  a.send({ type: 'startGame' });
  const stA = await a.wait((m) => m.type === 'state');
  ok(stA.state.players.length === 2, '开局：2 名玩家');
  ok(!stA.state.players[0].isAI && stA.state.players[1].isAI,
    '掉线的座位 1 由 AI 托管（名字保留：' + stA.state.players[1].name + '）');
  ok(stA.state.bank.white === 4 && stA.state.bank.gold === 5, '2 人局公共宝石：4/色 + 金 5');
  a.curState = stA.state;
  return { a: a, roomId: infoA.roomId };
}

/** R1 继续：真人（a）+ AI：拿宝石触发归还，走完归还流程 */
async function testDiscardFlow(a) {
  console.log('\n[3] 行动与归还筹码流程（R1：真人 + AI）');
  let triggered = false;
  for (let round = 0; round < 16 && !triggered; round++) {
    const r = await humanTake(a, 0, '第 ' + (round + 1) + ' 回合', { manualDiscard: true });
    if (!r) break;
    const desc = r.manual ? (Array.isArray(r.desc) ? r.desc.join('+') : r.desc)
      : (Array.isArray(r) ? r.join('+') : r);
    const total0 = tokenTotal(a.curState.players[0].tokens);
    ok(true, '行动 ' + desc + '，现持有 ' + total0 + ' 枚');
    if (r.manual && a.curState.phase === 'discard') {
      triggered = true;
      ok(true, '超过 10 枚触发归还阶段');
      const p0 = a.curState.players[0];
      const totalNow = tokenTotal(p0.tokens);
      if (totalNow >= 12) {
        // 归还 1 枚（仍 >10，归还阶段继续）后撤销归还（测试 n=-1）
        const col = G.COLORS.find((cc) => p0.tokens[cc] > 0) || 'gold';
        a.send({ type: 'action', action: { type: 'returnToken', color: col, n: 1 } });
        a.curState = (await a.wait((m) => m.type === 'state')).state;
        a.send({ type: 'action', action: { type: 'returnToken', color: col, n: -1 } });
        a.curState = (await a.wait((m) => m.type === 'state')).state;
        ok(tokenTotal(a.curState.players[0].tokens) === totalNow, '撤销归还成功（筹码加回）');
      } else {
        ok(true, '触发归还时仅 ' + totalNow + ' 枚（还 1 即完成），跳过撤销归还断言');
      }
      await discardToEnd(a, 0);
      ok(a.curState.phase === 'action' && tokenTotal(a.curState.players[0].tokens) <= 10,
        '归还完成，回到行动阶段');
    }
  }
  ok(triggered, '归还流程完整触发并完成');
  // 顺带验证：AI 座位有结构化 lastAction（上回合行动）
  ok(!!a.curState.players[1].lastAction && !!a.curState.players[1].lastAction.type,
    'AI 座位记录「上回合行动」：' + a.curState.players[1].lastAction.type);
}

/** R2：2 真人开局；非当前回合者被拒；中途掉线托管并自动行动 */
async function testRoomB() {
  console.log('\n[4] 掉线托管（房间 R2）');
  const a = await connect();
  const b = await connect();
  a.send({ type: 'createRoom', playerCount: 2, aiLevel: 3, name: '甲' });
  const infoA = await a.wait((m) => m.type === 'roomInfo');
  b.send({ type: 'joinRoom', roomId: infoA.roomId, name: '乙' });
  await b.wait((m) => m.type === 'roomInfo');
  await a.wait((m) => m.type === 'roomInfo');
  a.send({ type: 'startGame' });
  const stA = await a.wait((m) => m.type === 'state');
  ok(!stA.state.players[0].isAI && !stA.state.players[1].isAI, 'R2 开局：2 名真人');
  a.curState = stA.state;
  const stB = await b.wait((m) => m.type === 'state');
  b.curState = stB.state;

  // b 持续自动行动（先手可能随机；轮到 b 时由它推进，避免游戏卡住）
  const bAuto = autoPlay(b, 1);
  await waitTurn(a, 0);
  // 轮到 a 后，b（座位 1）发行动指令应被拒
  b.send({ type: 'action', action: { type: 'take', colors: ['red', 'blue', 'green'] } });
  const errTurn = await b.wait((m) => m.type === 'error');
  ok(/还没轮到/.test(errTurn.message), '非当前回合玩家行动被拒');

  // b 掉线 → a 收到广播：座位 1 标记 AI 托管
  b.ws.close();
  const stTO = await a.wait((m) => m.type === 'state' && m.state.players[1] && m.state.players[1].isAI);
  a.curState = stTO.state;
  ok(true, '掉线座位标记为 AI 托管（名字保留：' + stTO.state.players[1].name + '）');
  void bAuto; // b 已断开，自动行动协程会自行超时结束（不等待）

  // 托管 AI 自动行动：等轮到 0 后 a 行动，再等待回到 0（托管 AI 走完自己的回合）
  await waitTurn(a, 0);
  const colors = await humanTake(a, 0, '托管后的行动');
  ok(colors !== null, '托管后真人仍可正常行动');
  await discardToEnd(a, 0);
  let guard = 0;
  while (a.curState.currentPlayer !== 0 && guard++ < 15) {
    a.curState = (await a.wait((m) => m.type === 'state')).state;
  }
  ok(a.curState.currentPlayer === 0 && a.curState.players[1].lastAction,
    '托管 AI 自动完成回合（lastAction: ' + a.curState.players[1].lastAction.type + '）');
  a.ws.close();
  return { a: a, roomId: infoA.roomId };
}

async function testCleanup(roomIds) {
  console.log('\n[5] 空房间清理');
  for (const roomId of roomIds) {
    const c = await connect();
    c.send({ type: 'joinRoom', roomId: roomId, name: '路人' });
    const err = await c.wait((m) => m.type === 'error');
    ok(/不存在/.test(err.message), '房间 ' + roomId + ' 已清理');
    c.ws.close();
  }
}

/* ---------------- 主流程 ---------------- */
async function main() {
  // stdio:'ignore'：沙箱不允许子进程管道；就绪检测用 HTTP 轮询
  const srv = spawn(process.execPath, ['server.js'], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: 'ignore'
  });
  // 等待服务器就绪
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    try { await httpGet('/'); ready = true; } catch (e) { await sleep(200); }
  }
  if (!ready) { console.log('✗ 服务器启动失败'); srv.kill(); process.exit(1); }
  console.log('服务器已启动（端口 ' + PORT + '）');

  try {
    await testStatic();
    const r1 = await testRoomA();
    await testDiscardFlow(r1.a);
    const r2 = await testRoomB();
    r1.a.ws.close();
    await sleep(300);
    await testCleanup([r1.roomId, r2.roomId]);
  } catch (e) {
    failed++;
    console.log('✗ 测试异常: ' + e.message);
  } finally {
    srv.kill();
  }

  console.log('\n=== 结果：' + (failed === 0 ? '全部通过 ✓' : failed + ' 项失败 ✗') + ' ===');
  process.exit(failed === 0 ? 0 : 1);
}

main();
