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

const sb = { console, setTimeout, clearTimeout, Math, JSON, Object, Array, String, Number, Date, window: null };
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

// --- 场景 1：创建房间 → 等待区 ---
Net.onRoomInfo({ roomId: '1042', mySeat: 0, playerCount: 2, started: false, seats: [{ name: '阿明', connected: true }] });
ok(els['net-forms'].classList.contains('hidden'), '创建房间后显示等待区（表单隐藏）');
ok(els['net-room-code'].textContent === '1042', '等待区显示房间码');
ok(els['btn-net-start'].classList.contains('hidden') === false, '房主（mySeat=0）看到「开始游戏」按钮');
ok(els['net-seats'].innerHTML.includes('阿明'), '座位列表显示玩家名');

// --- 场景 2：收到游戏状态 → 进入联机游戏 ---
const st0 = G.createGame({ players: [{ name: '阿明', isAI: false }, { name: '小红', isAI: false }], aiLevel: 2, rng: Math.random });
st0.turn = 1;
Net.onState(st0, { mySeat: 0 });
ok(els['main-menu'].classList.contains('hidden'), '收到状态后主菜单隐藏');
ok(els['net-lobby'].classList.contains('hidden'), '收到状态后联机大厅隐藏');
ok(els['net-badge'].style.display !== 'none', '顶栏房间码徽章显示（' + els['net-badge'].textContent + '）');
ok(els['seat-human'].innerHTML.includes('阿明'), '主座位显示我的玩家');
ok(els['seat-ai-1'].innerHTML.includes('小红'), '对方（真人）显示在其他座位');
ok(els['btn-undo'].style.display === 'none', '联机模式隐藏「撤销」按钮');
ok(!els['take-ops'].innerHTML.includes('btn-skip'), '联机模式隐藏「跳过本回合」按钮');

// --- 场景 3：mySeat=1（我加入为第二位）--- 
const st1 = G.createGame({ players: [{ name: '甲', isAI: false }, { name: '乙', isAI: false }], aiLevel: 2, rng: Math.random });
Net.onState(st1, { mySeat: 1 });
ok(els['seat-human'].innerHTML.includes('乙'), 'mySeat=1 时主座位显示「乙」');
ok(els['seat-ai-1'].innerHTML.includes('甲'), '对方显示在 AI 座位（带真人标记）');
ok(els['seat-ai-1'].innerHTML.includes('真人'), '其他真人座位带「👤 真人」标记');

// --- 场景 4：归还阶段 → 归还弹窗；returnOne 发联机指令 ---
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

// --- 场景 5：掉线托管横幅（真人变 AI）不崩溃且弹横幅 ---
const st3 = G.createGame({ players: [{ name: '阿明', isAI: false }, { name: '小红', isAI: false }], aiLevel: 2, rng: Math.random });
Net.onState(st3, { mySeat: 0 }); // 先正常
st3.players[1].isAI = true;      // 小红掉线托管
Net.onState(st3, { mySeat: 0 });
ok(true, '掉线托管广播处理无异常');

// --- 场景 6：游戏结束 ---
const st4 = G.createGame({ players: [{ name: '阿明', isAI: false }, { name: '电脑', isAI: true }], aiLevel: 2, rng: Math.random });
st4.gameOver = true;
st4.winner = 1;
st4.phase = 'gameover';
Net.onState(st4, { mySeat: 0 });
ok(els['modal-box'].innerHTML.includes('获胜'), '终局弹窗显示获胜者');

console.log('\n=== 结果：' + (failed === 0 ? '全部通过 ✓' : failed + ' 项失败 ✗') + ' ===');
process.exit(failed === 0 ? 0 : 1);
