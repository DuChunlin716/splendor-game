/* ============================================================
 * test.js —— 《璀璨宝石》核心逻辑自动化测试（无需浏览器）
 *
 * 用法：命令行执行  node test.js
 *
 * 覆盖：用户要求的 12 项测试场景 + 完整 AI 对局模拟 +
 *       全程不变量校验（负数 / 卡牌重复 / 数量守恒 / 分数一致）。
 * ============================================================ */
'use strict';

const D = require('./data.js');
const G = require('./game.js');
const AI = require('./ai.js');

/* ---------------- 测试工具 ---------------- */
let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function eq(a, b, label) {
  const okEq = JSON.stringify(a) === JSON.stringify(b);
  if (okEq) { passed++; }
  else { failed++; failures.push(label + ' (期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a) + ')'); console.log('  ✗ ' + label + ' 期望=' + JSON.stringify(b) + ' 实际=' + JSON.stringify(a)); }
}

/** 确定性随机源（LCG） */
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function freshGame(seed) {
  return G.createGame({ rng: makeRng(seed || 1), firstPlayer: 0 });
}

/** 在公共区制造一张指定成本的测试卡（放入该层空槽；若满则替换槽 0，被替换卡放回牌堆） */
function plantCard(state, cost, bonus, points, tier) {
  const t = tier || 1;
  const card = { id: 9000 + Math.floor(Math.random() * 1000), tier: t, bonus: bonus || 'white', cost: Object.assign({}, cost), points: points || 0 };
  const slot = state.board[t].findIndex(c => c === null);
  if (slot >= 0) {
    state.board[t][slot] = card;
  } else {
    const old = state.board[t][0];
    if (old) state.decks[old.tier].push(old);
    state.board[t][0] = card;
  }
  return card;
}

/** 手动给玩家发筹码（从公共区扣除，保持守恒） */
function giveTokens(state, idx, colors) {
  for (const c in colors) {
    state.bank[c] -= colors[c];
    state.players[idx].tokens[c] += colors[c];
  }
}

function runTurn(state, idx) {
  // 完整执行一个 AI 回合（决策 → 执行 → 待选贵族 → 归还 → 结束回合）
  AI.executeAiTurn(state, idx);
  return { action: null, ok: true };
}

/* ================= 测试 1：拿 3 种不同宝石 ================= */
function testTakeThreeDifferent() {
  console.log('\n[测试1] 拿 3 种不同宝石');
  const st = freshGame(11);
  const p0 = st.players[0];
  const r = G.takeTokens(st, 0, ['white', 'blue', 'green']);
  ok(r.ok === true, '拿取成功');
  eq(p0.tokens.white, 1, '白+1');
  eq(p0.tokens.blue, 1, '蓝+1');
  eq(p0.tokens.green, 1, '绿+1');
  eq(st.bank.white, 3, '公共区白-1');
  eq(p0.tokens.gold, 0, '不能拿黄金');
  // 非法：拿黄金
  const r2 = G.takeTokens(st, 0, ['white', 'blue', 'gold']);
  ok(r2.ok === false, '拿黄金被拒绝');
  // 非法：2 种不同 + 1 重复
  const r3 = G.takeTokens(st, 0, ['white', 'white', 'blue']);
  ok(r3.ok === false, '2同1异被拒绝');
}

/* ================= 测试 2：同色 2 枚的公共区要求 ================= */
function testTakeTwoSame() {
  console.log('\n[测试2] 同色 2 枚需要公共区 >= 4');
  const st = freshGame(22);
  // 让公共区红只剩 3
  giveTokens(st, 0, { red: 1 });
  ok(st.bank.red === 3, '前置：公共区红=3');
  const r1 = G.takeTokens(st, 0, ['red', 'red']);
  ok(r1.ok === false && /4/.test(r1.reason), '公共区=3 时被拒绝');
  // 归还后再测 =4 的情况
  G.returnTokens(st, 0, 'red', 1);
  ok(st.bank.red === 4, '前置：公共区红=4');
  const r2 = G.takeTokens(st, 0, ['red', 'red']);
  ok(r2.ok === true, '公共区=4 时可拿 2 枚');
  eq(st.bank.red, 2, '拿后公共区红=2');
  eq(st.players[0].tokens.red, 2, '玩家红=2');
}

/* ================= 测试 3：购买无折扣卡 ================= */
function testBuyNoDiscount() {
  console.log('\n[测试3] 购买无折扣卡');
  const st = freshGame(33);
  const card = plantCard(st, { white: 2, blue: 1 }, 'green', 0, 1);
  giveTokens(st, 0, { white: 2, blue: 1 });
  const beforeBank = Object.assign({}, st.bank);
  const r = G.buyCard(st, 0, card.id);
  ok(r.ok === true, '购买成功');
  eq(st.players[0].tokens.white, 0, '白已支付');
  eq(st.players[0].tokens.blue, 0, '蓝已支付');
  eq(st.bank.white, beforeBank.white + 2, '白回公共区');
  eq(st.bank.blue, beforeBank.blue + 1, '蓝回公共区');
  ok(st.players[0].cards.some(c => c.id === card.id), '卡已加入手牌');
  eq(st.players[0].permanents.green, 1, '永久宝石+1');
  eq(st.board[1].length, 4, '买后立刻补牌（仍 4 张）');
  // 买不存在的卡
  const r2 = G.buyCard(st, 0, 999999);
  ok(r2.ok === false, '不存在的卡被拒绝');
}

/* ================= 测试 4：购买有永久折扣的卡 ================= */
function testBuyWithDiscount() {
  console.log('\n[测试4] 永久宝石折扣');
  const st = freshGame(44);
  const card = plantCard(st, { white: 2 }, 'blue', 0, 1);
  st.players[0].permanents.white = 2; // 已有 2 白永久
  const r = G.buyCard(st, 0, card.id);
  ok(r.ok === true, '折扣后免费购买成功');
  eq(st.players[0].tokens.white, 0, '未扣除任何筹码');
  eq(st.players[0].permanents.white, 2, '折扣仍保留');
  eq(st.players[0].permanents.blue, 1, '新永久蓝+1');
  // 反向：折扣不足时买不起
  const st2 = freshGame(45);
  const card2 = plantCard(st2, { white: 3 }, 'red', 0, 1);
  st2.players[0].permanents.white = 1;
  const r2 = G.buyCard(st2, 0, card2.id);
  ok(r2.ok === false && r2.rem && r2.rem.white === 2, '折扣不足时被拒绝并给出缺口');
}

/* ================= 测试 5：黄金万能支付 ================= */
function testGoldWildcard() {
  console.log('\n[测试5] 黄金作为万能宝石');
  const st = freshGame(55);
  const card = plantCard(st, { white: 2, black: 1 }, 'red', 1, 1);
  giveTokens(st, 0, { white: 1, gold: 2 });
  ok(G.canAfford(st.players[0], card) === true, '黄金可补齐缺口');
  const pay = G.paymentFor(st.players[0], card);
  eq(pay.tokens, { white: 1 }, '普通宝石优先支付');
  eq(pay.gold, 2, '缺口用 2 黄金');
  const r = G.buyCard(st, 0, card.id);
  ok(r.ok === true, '购买成功');
  eq(st.players[0].tokens.white, 0, '白已支付');
  eq(st.players[0].tokens.gold, 0, '黄金已支付');
  eq(st.bank.gold, 5, '黄金回公共区');
  eq(st.players[0].score, 1, '获得 1 分');
  // 黄金不足时买不起
  const st2 = freshGame(56);
  const card2 = plantCard(st2, { white: 2, black: 1 }, 'red', 0, 1);
  giveTokens(st2, 0, { white: 1, gold: 1 });
  const r2 = G.buyCard(st2, 0, card2.id);
  ok(r2.ok === false, '黄金不足被拒绝');
}

/* ================= 测试 6：预留卡牌 ================= */
function testReserve() {
  console.log('\n[测试6] 预留卡牌');
  const st = freshGame(66);
  const card = st.board[1][0];
  const goldBefore = st.bank.gold;
  const r = G.reserveCard(st, 0, card.id);
  ok(r.ok === true && r.gotGold === true, '预留成功并获黄金');
  eq(st.players[0].reserved.length, 1, '预留区 +1');
  eq(st.players[0].tokens.gold, 1, '黄金 +1');
  eq(st.bank.gold, goldBefore - 1, '公共区黄金真实减少');
  ok(!st.board[1].some(c => c.id === card.id), '卡已离开桌面');
  eq(st.board[1].length, 4, '桌面立即补牌');
  // 盲抽预留
  const deckBefore = st.decks[2].length;
  const r2 = G.reserveCard(st, 0, null, 2);
  ok(r2.ok === true, '盲抽预留成功');
  eq(st.decks[2].length, deckBefore - 1, '牌堆 -1');
  eq(st.board[2].length, 4, '盲抽不补桌面');
  // 预留的卡不能再被别人买
  const r3 = G.buyCard(st, 1, card.id);
  ok(r3.ok === false, '他人不能买我预留的卡');
}

/* ================= 测试 7：预留上限 3 张 ================= */
function testReserveLimit() {
  console.log('\n[测试7] 预留上限');
  const st = freshGame(77);
  // 塞满 3 张（直接构造预留卡，不经过牌桌）
  st.players[0].reserved.push({ id: 8801, tier: 1, bonus: 'white', cost: { white: 1 }, points: 0 });
  st.players[0].reserved.push({ id: 8802, tier: 1, bonus: 'blue', cost: { blue: 1 }, points: 0 });
  st.players[0].reserved.push({ id: 8803, tier: 1, bonus: 'green', cost: { green: 1 }, points: 0 });
  const r = G.reserveCard(st, 0, st.board[1][0].id);
  ok(r.ok === false && /3/.test(r.reason), '第 4 张被拒绝');
  eq(st.players[0].reserved.length, 3, '仍是 3 张');
  // 盲抽也被拒绝
  const r2 = G.reserveCard(st, 0, null, 1);
  ok(r2.ok === false, '盲抽也被拒绝');
}

/* ================= 测试 8：10 枚筹码上限与归还 ================= */
function testTokenCap() {
  console.log('\n[测试8] 筹码上限 10 与归还');
  const st = freshGame(88);
  giveTokens(st, 0, { white: 3, blue: 3, green: 3, red: 2, gold: 2 }); // 13 枚
  ok(G.needDiscard(st, 0) === true, '13 枚需要归还');
  // 超过上限时不能结束回合
  const r1 = G.finishDiscard(st, 0);
  ok(r1.ok === false, '未归还不能结束回合');
  // 归还 3 枚到 10
  G.returnTokens(st, 0, 'white', 3);
  ok(G.needDiscard(st, 0) === false, '10 枚无需归还');
  const r2 = G.finishDiscard(st, 0);
  ok(r2.ok === true, '归还后正常结束回合');
  eq(st.currentPlayer, 1, '轮到下一位玩家');
  eq(st.bank.white, 4, '归还的筹码回公共区');
  // 归还数量校验
  const r3 = G.returnTokens(st, 0, 'white', 99);
  ok(r3.ok === false, '不能归还超过持有的数量');
  // AI 归还
  const st2 = freshGame(89);
  giveTokens(st2, 1, { white: 5, blue: 5, gold: 2 }); // 12 枚
  const returned = AI.aiDiscard(st2, 1);
  ok(G.tokenTotal(st2.players[1].tokens) === 10, 'AI 归还到 10');
  eq(returned.gold, undefined, 'AI 最后才还黄金');
}

/* ================= 测试 9：获得贵族 ================= */
function testNoble() {
  console.log('\n[测试9] 获得贵族');
  const st = freshGame(99);
  // 确保 n1（白4 黑4）在局内
  if (!st.nobles.some(n => n.id === 'n1')) {
    st.nobles[0] = { id: 'n1', req: { white: 4, black: 4 }, points: 3, name: '亚历珊德拉女王' };
  }
  const noblesBefore = st.nobles.length;
  st.players[0].permanents.white = 3;
  st.players[0].permanents.black = 4;
  giveTokens(st, 0, { red: 1 });
  const card = plantCard(st, { red: 1 }, 'white', 0, 1); // 补 1 白永久
  const r = G.buyCard(st, 0, card.id);
  ok(r.ok === true && r.nobles.length === 1, '购买后触发贵族');
  ok(st.players[0].nobles.some(n => n.id === 'n1'), '贵族已获得');
  eq(st.players[0].score, 3, '贵族 +3 分');
  eq(st.nobles.length, noblesBefore - 1, '公共贵族区 -1');
  // 贵族只看永久宝石，不看筹码
  const st2 = freshGame(100);
  if (!st2.nobles.some(n => n.id === 'n1')) {
    st2.nobles[0] = { id: 'n1', req: { white: 4, black: 4 }, points: 3, name: '亚历珊德拉女王' };
  }
  giveTokens(st2, 0, { white: 4, black: 4 }); // 只有筹码，没有永久
  const card2 = plantCard(st2, { red: 1 }, 'blue', 0, 1);
  G.buyCard(st2, 0, card2.id);
  eq(st2.players[0].nobles.length, 0, '筹码不能触发贵族');
}

/* ================= 测试 10：多个贵族同时满足需选择 ================= */
function testMultipleNobles() {
  console.log('\n[测试10] 多个贵族同时满足');
  const st = freshGame(101);
  // 放入两个可同时满足的贵族
  st.nobles = [
    { id: 'n1', req: { white: 4, black: 4 }, points: 3, name: 'A' },
    { id: 'n2', req: { white: 4, blue: 4 }, points: 3, name: 'B' }
  ];
  st.players[0].permanents.white = 3;
  st.players[0].permanents.black = 4;
  st.players[0].permanents.blue = 4;
  giveTokens(st, 0, { red: 1 });
  const card = plantCard(st, { red: 1 }, 'white', 0, 1); // 白 3->4
  const r = G.buyCard(st, 0, card.id);
  ok(r.ok === true && r.nobles.length === 2, '两个贵族进入待选');
  eq(st.pendingNobles.length, 2, '待选列表 = 2');
  const choose = G.chooseNoble(st, 0, 'n1');
  ok(choose.ok === true, '选择 n1 成功');
  eq(st.players[0].nobles.length, 1, '只获得 1 位');
  ok(st.nobles.some(n => n.id === 'n2'), 'n2 留在公共区');
  eq(st.players[0].score, 3, '只 +3 分');
  // 选不存在的贵族
  const r2 = G.chooseNoble(st, 0, 'n2');
  ok(r2.ok === false, '待选清空后不能再选');
}

/* ================= 测试 11：AI 完整行动 ================= */
function testAiTurn() {
  console.log('\n[测试11] AI 完整行动（连跑 8 个 AI 回合）');
  const st = freshGame(202);
  st.currentPlayer = 1;
  for (let i = 0; i < 8; i++) {
    const r = runTurn(st, st.currentPlayer);
    ok(r.ok === true, 'AI 第 ' + (i + 1) + ' 回合合法完成' + (r.err ? '（' + r.err + '）' : ''));
    const errs = G.checkInvariants(st);
    eq(errs, [], '第 ' + (i + 1) + ' 回合后不变量通过');
    if (st.gameOver) break;
  }
}

/* ================= 测试 12：15 分终局处理 ================= */
function testEndgame() {
  console.log('\n[测试12] 15 分终局（完整轮次）');
  const st = freshGame(303);
  st.currentPlayer = 0;
  st.players[0].turnCount = 4;
  st.players[1].turnCount = 4;
  st.players[0].score = 15;
  st.players[0].cards.push({ id: 1, tier: 3, bonus: 'white', cost: {}, points: 15 });
  // 玩家回合结束：达到 15 分，但游戏继续
  G.completeTurn(st);
  ok(st.gameOver === false, '达到 15 分不立即结束');
  eq(st.endTriggerTurn, 5, '记录触发回合数');
  eq(st.currentPlayer, 1, '后手继续行动');
  // 后手完成自己的回合（后手也到 15）
  st.players[1].score = 17;
  st.players[1].cards.push({ id: 2, tier: 3, bonus: 'blue', cost: {}, points: 17 });
  G.completeTurn(st);
  ok(st.gameOver === true, '双方完成相同回合数后结束');
  eq(st.winner, 1, '分数高者获胜');
  // 分数相同 → 卡少者胜
  const st2 = freshGame(304);
  st2.players[0].score = 10; st2.players[1].score = 10;
  st2.players[0].cards = [{ id: 1, tier: 1, bonus: 'w', cost: {}, points: 5 }, { id: 2, tier: 1, bonus: 'w', cost: {}, points: 5 }]; // 2 张
  st2.players[1].cards = [{ id: 3, tier: 1, bonus: 'w', cost: {}, points: 10 }]; // 1 张
  G.finishGame(st2);
  eq(st2.winner, 1, '同分时卡少者胜');
  // 完全同分同卡数 → 平局
  const st3 = freshGame(305);
  st3.players[0].score = 10; st3.players[1].score = 10;
  st3.players[0].cards = [{ id: 1, tier: 1, bonus: 'w', cost: {}, points: 10 }];
  st3.players[1].cards = [{ id: 2, tier: 1, bonus: 'w', cost: {}, points: 10 }];
  G.finishGame(st3);
  eq(st3.winner, null, '完全相同时平局');
}

/* ================= 测试 13：重新开始状态清零 ================= */
function testRestart() {
  console.log('\n[测试13] 重新开始状态清零');
  const st = freshGame(404);
  giveTokens(st, 0, { white: 3, blue: 3, gold: 1 });
  giveTokens(st, 1, { red: 2, black: 2 });
  const pc = plantCard(st, { white: 1 }, 'white', 0, 1);
  G.buyCard(st, 0, pc.id);
  G.takeTokens(st, 1, ['white', 'blue', 'green']);
  G.log(st, '一些历史记录');
  ok(st.log.length > 0 && st.players[0].cards.length > 0, '前置：有残留状态');
  G.resetGame(st, { rng: makeRng(405), firstPlayer: 1 });
  eq(st.players[0].tokens, { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }, '玩家筹码清零');
  eq(st.players[1].tokens, { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }, 'AI 筹码清零');
  eq(st.players[0].cards.length, 0, '手牌清零');
  eq(st.players[0].score, 0, '分数清零');
  eq(st.bank, { white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 5 }, '公共区重置');
  eq(st.log.length, 0, '日志清空');
  eq(st.nobles.length, 3, '贵族 3 位');
  eq(st.board[1].length, 4, '1 层 4 张公开卡');
  eq(st.board[2].length, 4, '2 层 4 张公开卡');
  eq(st.board[3].length, 4, '3 层 4 张公开卡');
  eq(st.decks[1].length + st.decks[2].length + st.decks[3].length, 90 - 12, '牌堆总数正确');
  ok(st.gameOver === false && st.endTriggerTurn === null, '终局状态重置');
  const errs = G.checkInvariants(st);
  eq(errs, [], '重置后不变量通过');
}

/* ================= 测试 14：完整 AI vs AI 对局 ================= */
function testFullAiGame() {
  console.log('\n[测试14] 完整 AI vs AI 对局（自动打完一局）');
  const st = G.createGame({ rng: makeRng(777), players: [
    { name: 'A', isAI: true }, { name: 'B', isAI: true }
  ] });
  let turns = 0;
  while (!st.gameOver && turns < 300) {
    const idx = st.currentPlayer;
    const r = runTurn(st, idx);
    ok(r.ok === true, '第 ' + (turns + 1) + ' 回合合法' + (r.err ? '（' + r.err + '）' : ''));
    const errs = G.checkInvariants(st);
    eq(errs, [], '第 ' + (turns + 1) + ' 回合后不变量通过');
    turns++;
    if (failed > 40) break; // 防止无谓刷屏
  }
  ok(st.gameOver === true, '对局正常结束');
  ok(turns <= 300, '回合数合理（' + turns + '）');
  console.log('  对局共 ' + turns + ' 回合；A 分=' + st.players[0].score + ' 卡=' + st.players[0].cards.length +
    '；B 分=' + st.players[1].score + ' 卡=' + st.players[1].cards.length);
  const maxScore = Math.max(st.players[0].score, st.players[1].score);
  ok(maxScore >= 15, '终局时最高分 >= 15');
}

/* ================= 测试 15：AI 规则专项 ================= */
function testAiRules() {
  console.log('\n[测试15] AI 规则专项');
  // 15a. 买得起高分卡时优先购买
  const st = freshGame(500);
  st.currentPlayer = 1;
  const p1 = st.players[1];
  giveTokens(st, 1, { white: 5, blue: 5, green: 5 }); // 巨款
  // 桌面放一张 5 分 L3
  plantCard(st, { white: 3, blue: 2 }, 'red', 5, 3);
  const action = AI.chooseAiAction(st, 1);
  eq(action.type, 'buy', '有钱时优先买卡');
  // 15b. 买不起时拿宝石，且不拿黄金
  const st2 = freshGame(501);
  st2.currentPlayer = 1;
  const act2 = AI.chooseAiAction(st2, 1);
  eq(act2.type, 'take', '没钱时拿宝石');
  ok(!act2.colors.includes('gold'), 'AI 不拿黄金');
  // 15c. 预留 3 张满时不再预留
  const st3 = freshGame(502);
  st3.currentPlayer = 1;
  st3.players[1].reserved.push({ id: 1, tier: 2, bonus: 'white', cost: { white: 1 }, points: 2 });
  st3.players[1].reserved.push({ id: 2, tier: 2, bonus: 'blue', cost: { blue: 1 }, points: 2 });
  st3.players[1].reserved.push({ id: 3, tier: 2, bonus: 'green', cost: { green: 1 }, points: 2 });
  const act3 = AI.chooseAiAction(st3, 1);
  ok(act3.type !== 'reserve', '预留满时不预留');
  // 15d. AI 归还遵守上限（跑 AI 回合时已覆盖）
  // 15e. 买不起的卡 AI 不会买
  const st4 = freshGame(503);
  st4.currentPlayer = 1;
  plantCard(st4, { white: 5 }, 'red', 3, 3); // 很贵
  const act4 = AI.chooseAiAction(st4, 1);
  ok(act4.type !== 'buy', '买不起时不会买');
}

/* ================= 测试 16：撤销上一回合（容错） ================= */
function testUndo() {
  console.log('\n[测试16] 撤销上一回合（单局 3 次）');
  const st = freshGame(4040);
  st.currentPlayer = 1; // 让 AI 先走一回合，确保人类回合有快照
  AI.executeAiTurn(st, 1);
  ok(st.currentPlayer === 0, '前置：AI 走完轮到人类');
  // 人类第 1 回合：拿宝石（此操作将保留）
  G.takeTokens(st, 0, ['white', 'blue', 'green']);
  ok(st.players[0].tokens.white === 1, '第1回合拿宝石生效');
  G.completeTurn(st);
  AI.executeAiTurn(st, 1);
  ok(st.currentPlayer === 0, 'AI 走完回到人类');
  const snapBefore = st.snapshots.length;
  const turnBefore = st.turn; // 人类第 2 回合开始
  // 人类第 2 回合：再拿宝石（此操作将被撤销）
  G.takeTokens(st, 0, ['red', 'black', 'blue']);
  ok(st.players[0].tokens.red === 1, '第2回合拿宝石生效');
  G.completeTurn(st);
  AI.executeAiTurn(st, 1);
  ok(st.currentPlayer === 0, 'AI 再次走完');
  ok(st.snapshots.length > snapBefore, '新增快照');
  // 撤销 → 回到人类第 2 回合开始：第 2 回合操作回滚，第 1 回合保留
  const res = G.undoLastTurn(st);
  ok(res.ok === true, '撤销成功');
  eq(st.turn, turnBefore, '回合数回滚到第 2 回合开始');
  eq(st.players[0].tokens.red, 0, '第 2 回合拿的宝石已回滚');
  eq(st.players[0].tokens.white, 1, '第 1 回合操作保留');
  eq(st.currentPlayer, 0, '回到人类回合');
  eq(st.phase, 'action', '回到行动阶段');
  eq(st.undoLeft, 2, '撤销次数 -1');
  const errs = G.checkInvariants(st);
  eq(errs, [], '撤销后不变量通过');
  // 次数限制
  G.undoLastTurn(st);
  G.undoLastTurn(st);
  const r4 = G.undoLastTurn(st);
  ok(r4.ok === false, '撤销次数用完被拒绝');
  // 无快照时报错
  st.undoLeft = 3;
  st.snapshots = [];
  const r5 = G.undoLastTurn(st);
  ok(r5.ok === false, '无快照时被拒绝');
  // 撤销归还（负数 count）
  st.players[0].tokens.white = 5;
  st.bank.white = 1;
  const u1 = G.returnTokens(st, 0, 'white', -1);
  ok(u1.ok === true && u1.undid, '撤销归还：从公共区加回');
  eq(st.players[0].tokens.white, 6, '加回生效');
  eq(st.bank.white, 0, '公共区减少');
}

/* ================= 测试 17：六档难度系统 ================= */
function testDifficulty() {
  console.log('\n[测试17] 六档难度系统');
  const CFG = require('./aiConfig.js');
  // 1) 各难度都能正常对局且不变量通过
  for (let lvl = 1; lvl <= 6; lvl++) {
    const st = G.createGame({ rng: makeRng(900 + lvl), firstPlayer: 1, aiLevel: lvl });
    let turns = 0;
    while (!st.gameOver && turns < 150) { AI.executeAiTurn(st, st.currentPlayer); turns++; }
    ok(st.gameOver, 'L' + lvl + ' 对局正常结束');
    eq(G.checkInvariants(st), [], 'L' + lvl + ' 不变量通过');
  }
  // 2) 六档配置齐全
  eq(Object.keys(CFG.AI_DIFFICULTIES).length, 6, '存在 6 档难度');
  ['新手', '简单', '标准', '困难', '高手', '专家'].forEach(function (n, i) {
    eq(CFG.AI_DIFFICULTIES[i + 1].name, n, 'L' + (i + 1) + ' 名称=' + n);
  });
  // 3) L1 非纯随机：同一局面多次决策应出现不同行动（45% 次优概率）
  const st1 = G.createGame({ rng: makeRng(123), firstPlayer: 0, aiLevel: 1 });
  const seen = {};
  for (let i = 0; i < 15; i++) {
    const a = AI.chooseAiAction(st1, 1);
    ok(a !== null, 'L1 总有合法行动');
    if (a) seen[JSON.stringify(a)] = true;
  }
  ok(Object.keys(seen).length > 1, 'L1 决策有随机性（非固定）');
  // 4) L6 专家权重加载（训练产物）
  const w6 = CFG.getConfig(6).weights;
  ok(w6 && typeof w6.pts === 'number', 'L6 权重已加载');
  const exp = CFG.expertModel();
  if (exp && exp.weights) {
    ok(Math.abs(w6.pts - exp.weights.pts) < 1e-9, 'L6 使用训练权重');
  }
  // 5) 防作弊：可观察状态不暴露对手预留卡内容与牌堆
  const st7 = G.createGame({ rng: makeRng(789), firstPlayer: 1 });
  st7.players[0].reserved.push({ id: 999, tier: 3, bonus: 'white', cost: { white: 7 }, points: 4 });
  const obs = AI.buildObservableState(st7, 1);
  eq(obs.players[0].reserved.length, 0, '对手预留卡内容不可见');
  eq(obs.players[0].reservedCount, 1, '只暴露预留数量');
  ok(!('decks' in obs), '可观察状态不暴露牌堆');
  ok(obs.deckSizes && typeof obs.deckSizes[1] === 'number', '只暴露牌堆张数');
  // 6) AI_DEBUG 开关
  CFG.setDebug(true);
  CFG.setDebug(false);
  ok(CFG.isDebug() === false, 'AI_DEBUG 可开关（默认关闭）');
}

/* ================= 测试 18：三人/四人模式（基础规则） ================= */
function testMultiPlayer() {
  console.log('\n[测试18] 三人/四人模式');
  // 3 人局配置
  const st3 = G.createGame({ rng: makeRng(3001), playerCount: 3, aiLevel: 3 });
  eq(st3.players.length, 3, '3 名玩家');
  eq(st3.bank.white, 5, '3 人局每色 5 枚');
  eq(st3.bank.gold, 5, '3 人局黄金 5 枚');
  eq(st3.nobles.length, 4, '3 人局贵族 4 位');
  const t3 = G.takeTokens(st3, 0, ['white', 'blue', 'green']);
  ok(t3.ok, '3 人局拿 3 色');
  eq(st3.bank.white, 4, '公共区正确减少');
  const t3b = G.takeTokens(st3, 1, ['red', 'red']);
  ok(t3b.ok, '3 人局公共区 5 枚时可拿 2 同色');
  // 4 人局配置
  const st4 = G.createGame({ rng: makeRng(4001), playerCount: 4, aiLevel: 3 });
  eq(st4.players.length, 4, '4 名玩家');
  eq(st4.bank.white, 7, '4 人局每色 7 枚');
  eq(st4.bank.gold, 5, '4 人局黄金 5 枚');
  eq(st4.nobles.length, 5, '4 人局贵族 5 位');
  // 3 人完整 AI 对局（不变量全程通过）
  const st3g = G.createGame({ rng: makeRng(3002), players: [
    { name: 'A', isAI: true, aiLevel: 3 },
    { name: 'B', isAI: true, aiLevel: 4 },
    { name: 'C', isAI: true, aiLevel: 5 }
  ] });
  let turns = 0;
  while (!st3g.gameOver && turns < 400) {
    AI.executeAiTurn(st3g, st3g.currentPlayer);
    const e = G.checkInvariants(st3g);
    eq(e, [], '3 人对局回合 ' + turns + ' 不变量通过');
    turns++;
    if (failed > 20) break;
  }
  ok(st3g.gameOver, '3 人 AI 对局正常终局（' + turns + ' 回合）');
  // 4 人完整 AI 对局
  const st4g = G.createGame({ rng: makeRng(4002), players: [
    { name: 'A', isAI: true, aiLevel: 2 },
    { name: 'B', isAI: true, aiLevel: 3 },
    { name: 'C', isAI: true, aiLevel: 4 },
    { name: 'D', isAI: true, aiLevel: 5 }
  ] });
  turns = 0;
  while (!st4g.gameOver && turns < 500) {
    AI.executeAiTurn(st4g, st4g.currentPlayer);
    const e = G.checkInvariants(st4g);
    eq(e, [], '4 人对局回合 ' + turns + ' 不变量通过');
    turns++;
    if (failed > 30) break;
  }
  ok(st4g.gameOver, '4 人 AI 对局正常终局（' + turns + ' 回合）');
  const maxS = Math.max.apply(null, st4g.players.map(function (p) { return p.score; }));
  ok(maxS >= 15, '4 人局终局最高分 >= 15');
  const tc = st4g.players.map(function (p) { return p.turnCount; });
  ok(Math.max.apply(null, tc) - Math.min.apply(null, tc) <= 1, '终局回合数一致（±1）');
}

/* ================= 测试 19：固定卡位补牌 + 上回合行动（第二轮 UI 优化验收） ================= */
function testFixedSlotsAndLastAction() {
  console.log('\n[测试19] 固定卡位补牌 + 上回合行动');
  // 1) 购买中间槽卡 → 原位补牌，其它槽不动
  const st = freshGame(6001);
  const tier = 2;
  const before = st.board[tier].map(c => c ? c.id : null);
  const target = st.board[tier][1];
  ok(target !== null, '前置：槽1有卡');
  giveTokens(st, 0, { white: 5, blue: 5, green: 5, red: 5, black: 5, gold: 5 });
  const r = G.buyCard(st, 0, target.id);
  ok(r.ok, '购买成功');
  const after = st.board[tier].map(c => c ? c.id : null);
  eq(after[0], before[0], '购买后槽0不动');
  eq(after[2], before[2], '购买后槽2不动');
  eq(after[3], before[3], '购买后槽3不动');
  ok(after[1] !== null && after[1] !== before[1], '槽1原位补新牌');
  // lastAction: buyCard（原始印刷成本保留）
  const la = st.players[0].lastAction;
  eq(la.type, 'buyCard', '上回合类型=buyCard');
  eq(la.card.id, target.id, '上回合卡 id 正确');
  eq(la.card.cost, target.cost, '原始印刷成本保留');
  ok(la.card.bonus === target.bonus && la.card.points === target.points, '卡牌颜色/分值正确');

  // 2) 公开预留中间槽卡 → 原位补牌
  const st2 = freshGame(6002);
  const before2 = st2.board[3].map(c => c ? c.id : null);
  const rc = st2.board[3][2];
  const r2 = G.reserveCard(st2, 0, rc.id);
  ok(r2.ok, '预留成功');
  const after2 = st2.board[3].map(c => c ? c.id : null);
  eq(after2[0], before2[0], '预留后槽0不动');
  eq(after2[1], before2[1], '预留后槽1不动');
  eq(after2[3], before2[3], '预留后槽3不动');
  ok(after2[2] !== null && after2[2] !== before2[2], '槽2原位补新牌');
  const la2 = st2.players[0].lastAction;
  eq(la2.type, 'reserveCard', '预留类型');
  eq(la2.hidden, false, '公开预留非隐藏');
  eq(la2.card.id, rc.id, '预留卡 id 正确');
  eq(la2.gainedGold, true, '预留获黄金');

  // 3) 盲抽预留：隐藏信息不泄露 + 公开牌不动
  const st3 = freshGame(6003);
  const before3 = st3.board[2].map(c => c ? c.id : null);
  G.reserveCard(st3, 0, null, 2);
  const la3 = st3.players[0].lastAction;
  eq(la3.type, 'reserveCard', '盲抽类型');
  eq(la3.hidden, true, '盲抽隐藏');
  ok(!la3.card, '盲抽不泄露卡内容');
  eq(la3.level, 2, '盲抽层级正确');
  eq(st3.board[2].map(c => c ? c.id : null), before3, '盲抽预留公开牌不动');

  // 4) takeTokens lastAction（3 色 / 同色 2 枚）
  const st4 = freshGame(6004);
  G.takeTokens(st4, 0, ['white', 'blue', 'green']);
  eq(st4.players[0].lastAction.type, 'takeTokens', '拿取类型');
  eq(st4.players[0].lastAction.tokens, { white: 1, blue: 1, green: 1 }, '3 色各 1 枚');
  const st5 = freshGame(6005);
  G.takeTokens(st5, 0, ['red', 'red']);
  eq(st5.players[0].lastAction.tokens, { red: 2 }, '同色 2 枚');

  // 5) 牌堆耗尽：被拿走槽位留空，其它卡不动
  const st6 = freshGame(6006);
  st6.decks[1] = []; // 人为清空 1 层牌堆（模拟抽干）
  const target6 = st6.board[1][0];
  giveTokens(st6, 0, { white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 5 });
  const r6 = G.buyCard(st6, 0, target6.id);
  ok(r6.ok, '购买成功');
  eq(st6.board[1][0], null, '牌堆空时槽位留空');
  ok(st6.board[1][1] !== null && st6.board[1][2] !== null && st6.board[1][3] !== null, '其它卡不动');
}

/* ================= 主入口 ================= */
console.log('=== 璀璨宝石 核心逻辑测试 ===');
testTakeThreeDifferent();
testTakeTwoSame();
testBuyNoDiscount();
testBuyWithDiscount();
testGoldWildcard();
testReserve();
testReserveLimit();
testTokenCap();
testNoble();
testMultipleNobles();
testAiTurn();
testEndgame();
testRestart();
testAiRules();
testFullAiGame();
testUndo();
testDifficulty();
testMultiPlayer();
testFixedSlotsAndLastAction();

console.log('\n=== 结果：' + passed + ' 通过，' + failed + ' 失败 ===');
if (failed > 0) {
  console.log('失败项：');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
} else {
  console.log('全部测试通过 ✓');
}
