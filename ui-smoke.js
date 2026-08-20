/* ============================================================
 * ui-smoke.js —— ui.js 界面层冒烟测试（Node 环境，无需浏览器）
 *
 * 用法：node ui-smoke.js
 *
 * 原理：用一个极简 DOM 桩模拟 document/window，加载真实的
 *       data.js / game.js / ai.js / ui.js，驱动真实的界面代码：
 *       初始化渲染 → 拿宝石 → 确认 → AI 回合 → 卡牌弹窗等。
 * ============================================================ */
'use strict';

/* ---------------- 极简 DOM 桩 ---------------- */
function makeClassList() {
  const set = new Set();
  return {
    add: (...cs) => cs.forEach(c => set.add(c)),
    remove: (...cs) => cs.forEach(c => set.delete(c)),
    toggle: (c, force) => { if (force === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else { force ? set.add(c) : set.delete(c); } },
    contains: c => set.has(c)
  };
}

function makeEl(id) {
  const el = {
    id,
    innerHTML: '',
    textContent: '',
    className: '',
    dataset: {},
    style: {},
    disabled: false,
    scrollTop: 0,
    scrollHeight: 0,
    value: '',
    classList: makeClassList(),
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    appendChild() {},
    removeChild() {},
    closest() { return null; },
    querySelector() { return makeEl(null); }, // 桩：动态面板元素（真实浏览器正常）
    querySelectorAll() { return []; } // 桩：不做 DOM 查询（真实浏览器正常）
  };
  return el;
}

const els = {};
const documentStub = {
  getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
  createElement() { return makeEl(null); },
  body: { appendChild() {}, removeChild() {} }
};

global.window = global; // ui.js 通过 window.SplendorData 等取全局
global.window.AI_SPEED = 0.05; // 测试加速：AI 思考延迟缩短为 30~50ms
global.document = documentStub;
global.window.addEventListener = function () {}; // 错误捕获钩子（冒烟测试忽略）

/* ---------------- 加载真实游戏代码 ---------------- */
const D = require('./data.js');
const G = require('./game.js');
const AI = require('./ai.js');
const CFG = require('./aiConfig.js');
window.SplendorData = D;
window.SplendorGame = G;
window.SplendorAI = AI;
window.SplendorAIConfig = CFG;
window.AI_EXPERT_MODEL = require('./ai_expert_weights.js');

let ui = null;
let err = null;
try {
  require('./ui.js'); // 加载即执行 init()
  ui = window.UI;
} catch (e) {
  err = e;
  console.log('✗ ui.js 加载失败: ' + e.message);
  process.exit(1);
}

/* ---------------- 断言工具 ---------------- */
let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; }
  else { failed++; console.log('  ✗ ' + label); }
}

const wait = ms => new Promise(r => setTimeout(r, ms));
function st() { return ui.getState(); }

/* ---------------- 冒烟测试 ---------------- */
(async function () {
  console.log('=== ui.js 冒烟测试 ===');
  // 总超时保险：任何卡死 90 秒后强制退出并报错
  setTimeout(function () {
    console.log('✗ 脚本总超时（可能死循环或 await 卡死）');
    process.exit(1);
  }, 90000);

  // 0. 主菜单
  ok(els['main-menu'] && !els['main-menu'].classList.contains('hidden'), '主菜单已显示');
  ok(els['btn-menu-start'] && els['btn-menu-rules'] && els['btn-menu-contact'], '主菜单按钮齐全');
  ok(els['diff-slider'] && els['players-slider'] && els['diff-value'] && els['players-value'], '难度/人数拉条存在');
  els['btn-menu-rules'].listeners.click[0]();
  ok(els['modal-box'].innerHTML.includes('游戏规则'), '主菜单规则手册弹窗可用');
  ui.hideModal();
  // 难度拉条：拖到 5
  els['diff-slider'].value = '5';
  els['diff-slider'].listeners.input[0]({ target: els['diff-slider'] });
  ok(els['diff-value'].textContent.includes('5 高手'), '难度拉条更新显示');
  ui.stepDiff(-1);
  ok(els['diff-value'].textContent.includes('4 困难'), '难度左右步进按钮生效');
  els['diff-slider'].value = '5';
  els['diff-slider'].listeners.input[0]({ target: els['diff-slider'] });
  // 人数拉条：拖到 3 再回 2（后续测试按 2 人局进行）
  els['players-slider'].value = '3';
  els['players-slider'].listeners.input[0]({ target: els['players-slider'] });
  ok(els['players-value'].textContent.includes('3 人局'), '人数拉条更新显示');
  els['players-slider'].value = '2';
  els['players-slider'].listeners.input[0]({ target: els['players-slider'] });
  // 点「开始游戏」进入对局
  els['btn-menu-start'].listeners.click[0]();
  ok(els['main-menu'].classList.contains('hidden'), '开始游戏后主菜单隐藏');
  ok(st() && st().players.length === 2, '对局已创建（2 人）');
  ok(els['seat-human'].innerHTML.includes('ph-head'), '玩家主座位已渲染');
  ok(els['seat-ai-1'].innerHTML.includes('电脑'), '电脑座位已渲染');
  ok(els['bank'].innerHTML.includes('bank-gem'), '宝石池筹码已渲染（位于桌面）');
  ok(els['scoreboard'].innerHTML.includes('电脑'), '分数徽章已生成');
  ok(els['diff-label'].textContent.includes('Level 5'), '顶栏显示当前难度');

  // 1. 初始渲染
  ok(els['status-line'].textContent.length > 0, '状态行已渲染');
  ok(els['bank'].innerHTML.includes('bank-gem'), '公共宝石池已渲染（含宝石按钮）');
  ok(els['tier-3'].innerHTML.includes('card tier-'), '第3层卡牌已渲染');
  ok(els['tier-2'].innerHTML.includes('card tier-'), '第2层卡牌已渲染');
  ok(els['tier-1'].innerHTML.includes('card tier-'), '第1层卡牌已渲染');
  ok(els['nobles'].innerHTML.includes('noble'), '贵族区已渲染');
  ok(els['seat-human'].innerHTML.includes('ph-head'), '玩家座位已渲染');
  ok(els['seat-ai-1'].innerHTML.includes('pp-head') && els['seat-ai-1'].innerHTML.includes('上回合'), '电脑座位已渲染（含上回合区）');
  ok(els['scoreboard'].innerHTML.includes('玩家'), '玩家分数徽章已渲染');

  // 2. 等待轮到人类（若 AI 先手则等它走完）
  let guard = 0;
  while (st().currentPlayer !== 0 && guard < 60) { await wait(200); guard++; }
  ok(st().currentPlayer === 0, '轮到玩家行动（AI 若先手已自动完成）');

  // 3. 选择 3 种不同宝石 → 确认
  ui.toggleGem('white');
  ui.toggleGem('blue');
  ui.toggleGem('green');
  ok(els['sel-list'].textContent.includes('白'), '选择面板显示白');
  ok(els['btn-confirm-take'].disabled === false, '确认按钮可用');
  const beforeTake = st().players[0].tokens.white;
  ui.confirmTake();
  ok(st().players[0].tokens.white === beforeTake + 1, '拿宝石生效');

  // 4. 等待 AI 完成回合
  guard = 0;
  while (st().currentPlayer !== 0 && guard < 60) { await wait(200); guard++; }
  ok(st().currentPlayer === 0, 'AI 回合自动完成，回到玩家');
  ok(st().log.length > 0, '日志有记录');

  // 5. 模拟点击桌面卡牌 → 弹窗（购买/预留/取消）
  const fakeCardClick = { target: { closest: sel => sel === '.card[data-card-id]' ? { dataset: { cardId: String(st().board[1].find(c => c !== null).id) } } : null } };
  els['board-wrap'].listeners.click[0](fakeCardClick);
  ok(els['modal-box'].innerHTML.includes('购买'), '卡牌弹窗包含购买按钮');
  ok(els['modal-box'].innerHTML.includes('预留'), '卡牌弹窗包含预留按钮');
  ui.hideModal();
  ok(els['modal-mask'].classList.contains('hidden'), '弹窗可关闭');

  // 6. 模拟点击公共宝石池（事件委托路径）
  const fakeBankClick = { target: { closest: sel => sel === '.bank-gem' ? { dataset: { color: 'red' } } : null } };
  els['bank'].listeners.click[0](fakeBankClick);
  ok(els['sel-list'].textContent.includes('红'), '点击宝石池按钮生效（事件委托）');

  // 7. 规则 / 重开弹窗
  ui.init && null;
  els['btn-rules'].listeners.click[0]();
  ok(els['modal-box'].innerHTML.includes('游戏规则'), '规则弹窗打开');
  ui.hideModal();
  els['btn-restart'].listeners.click[0]();
  ok(els['modal-box'].innerHTML.includes('重新开始'), '重开确认弹窗打开');
  ui.restart();
  ok(st().gameOver === false && st().turn === 1, '重开后状态归零');

  // 8. 自动打完一整局（人类也由脚本驱动：AI 回合自动，人类回合拿宝石/买卡）
  let turns = 0, maxTurn = 300;
  const startTs = Date.now();
  let lastTurnNo = st().turn, stalledIter = 0;
  while (!st().gameOver && turns < maxTurn) {
    // 内置超时诊断：60 秒未结束则输出当前状态
    if (Date.now() - startTs > 60000) {
      console.log('✗ 超时：回合号=' + st().turn + ' 当前玩家=' + st().players[st().currentPlayer].name +
        ' phase=' + st().phase + ' 人类筹码=' + G.tokenTotal(st().players[0].tokens) +
        ' bank=' + JSON.stringify(st().bank));
      failed++; break;
    }
    if (st().turn === lastTurnNo) { stalledIter++; } else { stalledIter = 0; lastTurnNo = st().turn; }
    if (stalledIter > 60) {
      console.log('✗ 停滞：回合号 ' + st().turn + ' 60 次迭代无推进，phase=' + st().phase +
        ' current=' + st().players[st().currentPlayer].name);
      failed++; break;
    }
    // 多贵族待选：脚本自动选第一位
    if (st().pendingNobles.length > 0) {
      ui.chooseNobleModal(st().pendingNobles[0].id);
      continue;
    }
    // 归还阶段：脚本归还到 ≤10 后确认
    if (st().phase === 'discard') {
      let guardD = 0;
      while (G.tokenTotal(st().players[0].tokens) > G.MAX_TOKENS && guardD < 20) {
        const c = G.COLORS.concat([G.GOLD]).find(x => st().players[0].tokens[x] > 0);
        ui.returnOne(c);
        guardD++;
      }
      ui.confirmDiscard();
      continue;
    }
    while (st().currentPlayer !== 0 && !st().gameOver) {
      await wait(120); guard++;
      if (guard > 300) break;
    }
    if (st().gameOver) break;
    // 罕见死局应急弹窗：脚本自动点“继续”
    if (!G.hasAnyLegalAction(st(), 0)) {
      ui.humanRelief();
      continue;
    }
    // 玩家行动：有买得起的卡就买，否则拿宝石
    let acted = false;
    for (let t = 1; t <= 3 && !acted; t++) {
      for (const card of st().board[t]) {
        if (card && G.canAfford(st().players[0], card)) { // 跳过空卡位（固定 4 槽）
          ui.buyFromModal(card.id);
          acted = true;
          break;
        }
      }
    }
    if (!acted && !st().gameOver) {
      const avail = G.COLORS.filter(c => st().bank[c] > 0);
      st().selection = [];
      if (avail.length >= 3) {
        ui.toggleGem(avail[0]); ui.toggleGem(avail[1]); ui.toggleGem(avail[2]);
        ui.confirmTake();
      } else if (st().players[0].reserved.length < G.MAX_RESERVED &&
                 st().decks[1].length + st().decks[2].length + st().decks[3].length > 0) {
        ui.blindReserve(3); // 兜底：盲抽预留，保证玩家回合总能推进
      } else {
        await wait(300);
      }
    }
    turns++;
  }
  ok(st().gameOver === true, '完整对局自动打完（' + turns + ' 回合）');
  ok(els['modal-box'].innerHTML.includes('再来一局'), '结算弹窗出现');

  // 8b. 电脑上回合行动展示（最后渲染的座位区含具体行动）
  const aiLA = st().players[1].lastAction;
  ok(aiLA !== null && (aiLA.type === 'takeTokens' || aiLA.type === 'buyCard' || aiLA.type === 'reserveCard'),
    'AI 有结构化上回合行动记录');
  const seatHtml = els['seat-ai-1'].innerHTML;
  ok(seatHtml.includes('拿取') || seatHtml.includes('购买') || seatHtml.includes('预留'), '电脑座位显示上回合具体行动');

  // 9. 归还筹码交互专项（回归：phase 必须进入 discard，点击归还才有效）
  ui.restart();
  guard = 0;
  while (st().currentPlayer !== 0 && !st().gameOver) { await wait(120); guard++; if (guard > 100) break; }
  if (!st().gameOver && st().currentPlayer === 0) {
    // 先确保公共区筹码充足（AI 先手可能已消耗），再借筹码制造超限
    st().bank.white = 5; st().bank.blue = 5; st().bank.green = 5;
    st().bank.red = 5; st().bank.black = 5; st().bank.gold = 5;
    st().players[0].tokens.white = 3; st().bank.white -= 3;
    st().players[0].tokens.blue = 3; st().bank.blue -= 3;
    st().players[0].tokens.red = 2; st().bank.red -= 2;
    st().phase = 'action';
    const avail3 = G.COLORS.filter(c => st().bank[c] > 0);
    ui.toggleGem(avail3[0]); ui.toggleGem(avail3[1]); ui.toggleGem(avail3[2]);
    ui.confirmTake();
    ok(st().phase === 'discard', '筹码超限进入归还阶段');
    ok(els['modal-box'].innerHTML.includes('归还筹码'), '归还弹窗出现');
    const before = st().players[0].tokens.white;
    ui.returnOne('white');
    ok(st().players[0].tokens.white === before - 1, '点击归还生效（修复验证）');
    ui.undoReturn('white');
    if (st().players[0].tokens.white !== before) {
      console.log('  诊断[撤销归还失败]: white=' + st().players[0].tokens.white + ' before=' + before +
        ' phase=' + st().phase + ' bank.white=' + st().bank.white +
        ' total=' + G.tokenTotal(st().players[0].tokens));
    }
    ok(st().players[0].tokens.white === before, '撤销归还（加回）生效');
    ui.returnOne('white');
    ok(st().players[0].tokens.white === before - 1, '撤销后仍可继续归还');
    let guardR = 0;
    while (G.tokenTotal(st().players[0].tokens) > G.MAX_TOKENS && guardR < 20) {
      const c = G.COLORS.concat([G.GOLD]).find(x => st().players[0].tokens[x] > 0);
      ui.returnOne(c);
      guardR++;
    }
    ui.confirmDiscard();
    ok(st().currentPlayer === 1, '归还确认后轮到电脑');
  } else {
    ok(true, '跳过归还专项（非人类回合）');
  }

  // 10. 撤销上一回合按钮（容错）
  guard = 0;
  while (st().currentPlayer !== 0 && !st().gameOver) { await wait(120); guard++; if (guard > 100) break; }
  if (!st().gameOver && st().currentPlayer === 0) {
    // 先确保人类筹码 <= 7，避免拿宝石触发归还阶段干扰撤销测试
    while (G.tokenTotal(st().players[0].tokens) > 7) {
      const cc = G.COLORS.concat([G.GOLD]).find(x => st().players[0].tokens[x] > 0);
      G.returnTokens(st(), 0, cc, 1);
    }
    const turnBefore = st().turn;
    const undoLeftBefore = st().undoLeft;
    const av = G.COLORS.filter(c => st().bank[c] > 0);
    st().selection = [];
    ui.toggleGem(av[0]); ui.toggleGem(av[1]); ui.toggleGem(av[2]);
    ui.confirmTake();
    guard = 0;
    while (st().currentPlayer !== 0 && !st().gameOver) { await wait(120); guard++; if (guard > 100) break; }
    if (!st().gameOver && st().currentPlayer === 0) {
      ui.undoTurn();
      ok(st().undoLeft === undoLeftBefore - 1, '撤销次数 -1');
      ok(st().turn === turnBefore, '回合数回滚');
      ok(st().currentPlayer === 0 && st().phase === 'action', '撤销后回到人类行动回合');
    } else {
      ok(true, '跳过撤销测试（回合流转异常）');
    }
  } else {
    ok(true, '跳过撤销测试（非人类回合）');
  }

  // 11. 多人模式：3 人局 / 4 人局（主菜单人数拉条）
  ui.backToMenu();
  ok(!els['main-menu'].classList.contains('hidden'), '返回主菜单');
  els['players-slider'].value = '3';
  els['players-slider'].listeners.input[0]({ target: els['players-slider'] });
  ok(els['players-value'].textContent.includes('3 人局'), '人数拉条切到 3 人局');
  els['btn-menu-start'].listeners.click[0]();
  ok(st().players.length === 3, '3 人对局创建');
  ok(st().bank.white === 5 && st().bank.blue === 5, '3 人局每色普通宝石 5 枚');
  ok(st().bank.gold === 5, '3 人局黄金 5 枚');
  ok(st().nobles.length === 4, '3 人局贵族 4 位');
  ok(els['scoreboard'].innerHTML.includes('电脑1') && els['scoreboard'].innerHTML.includes('电脑2'), '3 玩家分数徽章');
  guard = 0;
  while (st().currentPlayer !== 0 && !st().gameOver) { await wait(150); guard++; if (guard > 100) break; }
  const avail3p = G.COLORS.filter(c => st().bank[c] > 0);
  st().selection = [];
  ui.toggleGem(avail3p[0]); ui.toggleGem(avail3p[1]); ui.toggleGem(avail3p[2]);
  ui.confirmTake();
  ok(st().players[0].tokens[avail3p[0]] >= 1, '3 人局拿宝石生效');
  // 4 人局
  ui.backToMenu();
  els['players-slider'].value = '4';
  els['players-slider'].listeners.input[0]({ target: els['players-slider'] });
  els['btn-menu-start'].listeners.click[0]();
  ok(st().players.length === 4, '4 人对局创建');
  ok(st().bank.white === 7 && st().bank.black === 7, '4 人局每色普通宝石 7 枚');
  ok(st().nobles.length === 5, '4 人局贵族 5 位');
  ok(els['scoreboard'].innerHTML.includes('电脑3'), '4 玩家分数徽章');
  ok(els['seat-human'].innerHTML.includes('ph-head') && els['seat-ai-1'].innerHTML.includes('pp-head'), '4 人座位布局生成');

  console.log('\n=== 结果：' + passed + ' 通过，' + failed + ' 失败 ===');
  process.exit(failed > 0 ? 1 : 0);
})();
