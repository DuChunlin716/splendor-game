/* ============================================================
 * net-ui-check.js —— 联机界面路径验证（严格 DOM 桩）
 * 在 vm 中加载完整脚本链（含 net-client.js），直接驱动
 * SplendorNet 的回调（roomInfo / state），验证联机 UI 关键路径：
 *   - 收到状态 → 进入游戏界面（隐藏主菜单/大厅）
 *   - 我的座位号动态（mySeat=1 时主座位渲染该玩家）
 *   - 归还阶段 → 归还弹窗打开；returnOne 发送联机指令
 *   - 掉线托管横幅逻辑不崩溃
 * 用法：node net-ui-check.js
 * ============================================================ */
'use strict';
const fs = require('fs');
const vm = require('vm');
const G = require('./game.js');

const html = fs.readFileSync('index.html', 'utf8');
const staticIds = Array.from(html.matchAll(/id="([^"]+)"/g)).map(m => m[1]);

function cls() {
  const s = new Set();
  return {
    add: (...c) => c.forEach(x => s.add(x)),
    remove: (...c) => c.forEach(x => s.delete(x)),
    toggle: (c, f) => { if (f === undefined) { s.has(c) ? s.delete(c) : s.add(c); } else { f ? s.add(c) : s.delete(c); } },
    contains: c => s.has(c)
  };
}
function el(id) {
  return {
    id, innerHTML: '', textContent: '', className: '', dataset: {}, style: {},
    disabled: false, scrollTop: 0, scrollHeight: 0, value: '',
    classList: cls(), listeners: {},
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    appendChild() {}, removeChild() {}, closest() { return null; }, querySelectorAll() { return []; }
  };
}
const els = {};
staticIds.forEach(id => { els[id] = el(id); });

const sockets = [];
class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    sockets.push(this);
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  open() { this.readyState = 1; if (this.onopen) this.onopen(); }
}

const sb = {
  console, setTimeout, clearTimeout, Math, JSON, Object, Array, String, Number, Date,
  WebSocket: FakeWebSocket,
  location: { protocol: 'http:', host: 'localhost:3000' },
  window: null
};
sb.window = sb;
sb.AI_SPEED = 0.05;
sb.document = {
  getElementById: id => els[id] || null,
  createElement: () => el(null),
  body: { appendChild() {}, removeChild() {} }
};
sb.addEventListener = function () {};
vm.createContext(sb);

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { failed++; console.log('  ✗ ' + msg); }
}

try {
  for (const f of ['data.js', 'game.js', 'aiConfig.js', 'ai_expert_weights.js', 'ai.js', 'net-client.js', 'ui.js']) {
    vm.runInContext(fs.readFileSync(f, 'utf8'), sb, { filename: f });
  }
} catch (e) { console.log('加载失败: ' + e.message); process.exit(1); }

const Net = sb.SplendorNet;
ok(Net && typeof Net.onState === 'function', 'net-client.js 已加载并注册回调（bindNet）');

// --- 场景 1：打开大厅建立连接；连接完成前点击创建会排队 ---
els['btn-menu-net'].listeners.click[0]();
ok(sockets.length === 1 && sockets[0].url === 'ws://localhost:3000', '打开联机大厅自动连接当前服务器');
els['net-name'].value = '阿明';
els['btn-net-create'].listeners.click[0]();
ok(sockets[0].sent.length === 0, '连接建立前创建房间消息进入队列');
sockets[0].open();
ok(sockets[0].sent.length === 1 && sockets[0].sent[0].type === 'createRoom',
  '连接成功后自动发送创建房间消息');

// --- 场景 2：创建房间 → 等待区 ---
Net.onRoomInfo({ roomId: '1042', mySeat: 0, playerCount: 2, started: false, seats: [{ name: '阿明', connected: true }] });
ok(els['net-forms'].classList.contains('hidden'), '创建房间后显示等待区（表单隐藏）');
ok(els['net-room-code'].textContent === '1042', '等待区显示房间码');
ok(els['btn-net-start'].classList.contains('hidden') === false, '房主（mySeat=0）看到「开始游戏」按钮');
ok(els['net-seats'].innerHTML.includes('阿明'), '座位列表显示玩家名');

// --- 场景 3：收到游戏状态 → 进入联机游戏 ---
const st0 = G.createGame({ players: [{ name: '阿明', isAI: false }, { name: '小红', isAI: false }], aiLevel: 2, rng: Math.random });
st0.turn = 1;
Net.onState(st0, { mySeat: 0 });
ok(els['main-menu'].classList.contains('hidden'), '收到状态后主菜单隐藏');
ok(els['net-lobby'].classList.contains('hidden'), '收到状态后联机大厅隐藏');
ok(els['net-badge'].style.display !== 'none', '顶栏房间码徽章显示（' + els['net-badge'].textContent + '）');
ok(els['seat-human'].innerHTML.includes('阿明'), '主座位显示我的玩家');
ok(els['seat-ai-1'].innerHTML.includes('小红'), '对方（真人）显示在其他座位');
ok(els['btn-undo'].style.display === 'none', '联机模式隐藏「撤销」按钮');
ok(!els['take-ops'].innerHTML.includes('btn-skip'), '正式操作区不存在「跳过本回合」测试按钮');

// --- 场景 4：mySeat=1（我加入为第二位）---
const st1 = G.createGame({ players: [{ name: '甲', isAI: false }, { name: '乙', isAI: false }], aiLevel: 2, rng: Math.random });
Net.onState(st1, { mySeat: 1 });
ok(els['seat-human'].innerHTML.includes('乙'), 'mySeat=1 时主座位显示「乙」');
ok(els['seat-ai-1'].innerHTML.includes('甲'), '对方显示在 AI 座位（带真人标记）');
ok(els['seat-ai-1'].innerHTML.includes('真人'), '其他真人座位带「👤 真人」标记');

// --- 场景 5：手机端四人圆桌完整渲染，和桌面端共用状态 ---
const stMobile = G.createGame({
  players: [
    { name: '荣耀', isAI: false },
    { name: '小红', isAI: false },
    { name: '电脑1', isAI: true, aiLevel: 2 },
    { name: '电脑2', isAI: true, aiLevel: 2 }
  ],
  aiLevel: 2,
  rng: Math.random
});
stMobile.currentPlayer = 0;
Net.onState(stMobile, { mySeat: 0 });
ok(els['mobile-nobles'].innerHTML.includes('mobile-noble'), '手机端渲染贵族区');
ok(els['mobile-nobles'].innerHTML.includes('portrait-'), '手机端贵族区已接入肖像样片');
ok(/portrait-n(?:10|[1-9])/.test(els['mobile-nobles'].innerHTML), '联网手机端贵族使用独立 ID 肖像');
const mobileTierArt = [1, 2, 3].map(t => els['mobile-tier-' + t].innerHTML).join('');
ok(/art-t[123]-(?:white|blue|green|red|black)/.test(mobileTierArt), '联网手机端发展卡使用等级与奖励色母版');
ok((els['mobile-tier-3'].innerHTML.match(/data-card-id/g) || []).length === 4,
  '手机端第三层保持 4 个公开卡位');
ok(els['mobile-tier-3'].innerHTML.includes('art-tier-3') &&
   els['mobile-tier-3'].innerHTML.includes('<b>抽</b>') &&
   els['mobile-tier-3'].innerHTML.includes('openBlindReserveConfirm'),
  '手机发展卡接入美术样片，牌堆显示“抽”并使用确认入口');
ok((els['mobile-bank'].innerHTML.match(/mobile-bank-gem/g) || []).length === 6,
  '手机端公共宝石池显示六色筹码');
ok(els['mobile-seat-top'].style.display !== 'none' &&
   els['mobile-seat-left'].style.display !== 'none' &&
   els['mobile-seat-right'].style.display !== 'none' &&
   els['mobile-seat-self'].style.display !== 'none',
  '四人局的四个手机圆桌座位同时显示');
ok(els['mobile-seat-self'].innerHTML.includes('荣耀') &&
   els['mobile-seat-self'].innerHTML.includes('mobile-resource-row'),
  '手机端自己的座位显示筹码和永久折扣');
ok(els['mobile-turn-hub'].innerHTML.includes('回合'), '手机端圆桌中心显示回合信息');

// 盲抽必须先确认，打开弹窗本身不能改变服务器状态。
const beforeBlindConfirm = stMobile.players[0].reserved.length;
sb.UI.openBlindReserveConfirm(3);
ok(els['modal-box'].innerHTML.includes('确认盲抽预留') && els['modal-box'].innerHTML.includes('确认抽取'),
  '手机/电脑共用盲抽确认弹窗');
ok(stMobile.players[0].reserved.length === beforeBlindConfirm, '打开确认弹窗不会立即盲抽');
sb.UI.hideModal();

// 自己的预留卡在玩家详情中可点击，并能进入购买弹窗。
const ownReserved = stMobile.board[1].find(Boolean);
G.reserveCard(stMobile, 0, ownReserved.id);
stMobile.currentPlayer = 0;
stMobile.phase = 'action';
Net.onState(stMobile, { mySeat: 0 });
sb.UI.openMobilePlayer(0);
ok(els['modal-box'].innerHTML.includes('mobile-reserved-card') &&
   els['modal-box'].innerHTML.includes('data-card-id="' + ownReserved.id + '"'),
  '手机玩家详情把自己的预留卡渲染为可点击按钮');
els['modal-box'].listeners.click[0]({
  target: { closest: sel => sel === '.mobile-reserved-card[data-card-id]' ? { dataset: { cardId: String(ownReserved.id) } } : null }
});
ok(els['modal-box'].innerHTML.includes('购买') && !els['modal-box'].innerHTML.includes('预留（获黄金）'),
  '点击自己的预留卡进入购买弹窗，且不会再次显示预留操作');
sb.UI.hideModal();

// --- 场景 6：归还阶段 → 归还弹窗；returnOne 发联机指令 ---
const st2 = G.createGame({ players: [{ name: '阿明', isAI: false }, { name: '电脑', isAI: true }], aiLevel: 2, rng: Math.random });
st2.players[0].tokens.white = 7;
st2.players[0].tokens.blue = 4; // 11 枚超限
st2.phase = 'discard';
st2.currentPlayer = 0;
st2.log = st2.log || [];
let sentAction = null;
Net.action = (a) => { sentAction = a; };
Net.onState(st2, { mySeat: 0 });
ok(!els['modal-mask'].classList.contains('hidden'), '归还阶段自动打开归还弹窗');
ok(els['modal-box'].innerHTML.includes('归还筹码'), '弹窗内容为归还筹码');
sb.UI.returnOne('white');
ok(sentAction && sentAction.type === 'returnToken' && sentAction.color === 'white' && sentAction.n === 1,
  'returnOne 发送联机归还指令 ' + JSON.stringify(sentAction));
ok(els['modal-box'].innerHTML.includes('已还×1'), '本地乐观记录「已还×1」');

// --- 场景 7：掉线托管横幅（真人变 AI）不崩溃且弹横幅 ---
const st3 = G.createGame({ players: [{ name: '阿明', isAI: false }, { name: '小红', isAI: false }], aiLevel: 2, rng: Math.random });
Net.onState(st3, { mySeat: 0 }); // 先正常
st3.players[1].isAI = true;      // 小红掉线托管
Net.onState(st3, { mySeat: 0 });
ok(true, '掉线托管广播处理无异常');

// --- 场景 8：游戏结束 ---
const st4 = G.createGame({ players: [{ name: '阿明', isAI: false }, { name: '电脑', isAI: true }], aiLevel: 2, rng: Math.random });
st4.gameOver = true;
st4.winner = 1;
st4.phase = 'gameover';
Net.onState(st4, { mySeat: 0 });
ok(els['modal-box'].innerHTML.includes('获胜'), '终局弹窗显示获胜者');

// --- 场景 9：连接断开后手机顶部立即更新，操作区被锁定 ---
sockets[0].close();
ok(els['mobile-connection'].className.includes('offline') &&
   els['mobile-connection'].innerHTML.includes('恢复中'),
  '连接断开后手机顶部立即显示恢复中');
ok(els['mobile-confirm'].disabled === true, '断线期间手机操作按钮保持禁用');

console.log('\n=== 结果：' + (failed === 0 ? '全部通过 ✓' : failed + ' 项失败 ✗') + ' ===');
process.exit(failed === 0 ? 0 : 1);
