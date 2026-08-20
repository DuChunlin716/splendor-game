/* ============================================================
 * training/train_expert.js —— 专家 AI（Level 6）训练系统
 *
 * 方法：大规模自我对弈 + 进化策略（Evolution Strategy）
 *   1. 生成初始种群（基于 Level 5 权重加噪声）
 *   2. 每个个体作为「专家」与 Level 5 基准 AI 对战 N 局（轮流先手）
 *   3. 按胜率排序，保留精英，交叉/变异产生下一代
 *   4. 多代后保存最优权重到 ../ai_expert_weights.js
 *
 * 用法：node training/train_expert.js [种群数] [每个体局数] [代数] [随机种子]
 * 默认：node training/train_expert.js 20 50 8 12345
 * 训练后网页游戏直接读取 ai_expert_weights.js，无需重新训练。
 * 全程遵守正式规则（专家同样只使用可观察状态）。
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const G = require('../game.js');
const AI = require('../ai.js');
const CFG = require('../aiConfig.js');

const KEYS = ['pts', 'engine', 'noble', 'target', 'resource', 'gold', 'endgame', 'opponent', 'block', 'cost'];
const BASE = CFG.AI_DIFFICULTIES[5].weights; // 基准（Level 5 权重）
const OPPONENT_LEVEL = 5;                     // 对手难度

function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * 一局：专家（weights，玩家 0） vs (playerCount-1) 个 Level 5 对手。
 * 返回 0=专家胜 1..n-1=对手胜 null=平局。
 */
function playGame(seedBase, weightsA, playerCount, firstA) {
  const players = [{ name: 'E', isAI: true, aiLevel: 6, aiWeights: weightsA }];
  for (let i = 1; i < playerCount; i++) {
    players.push({ name: 'R' + i, isAI: true, aiLevel: OPPONENT_LEVEL });
  }
  const st = G.createGame({ rng: makeRng(seedBase), players, firstPlayer: firstA ? 0 : 1 });
  let t = 0;
  while (!st.gameOver && t < 500) {
    AI.executeAiTurn(st, st.currentPlayer);
    t++;
  }
  return st.winner;
}

function evaluate(weights, games, seedBase, playerCount) {
  let wins = 0;
  for (let i = 0; i < games; i++) {
    const w = playGame(seedBase + i * 977, weights, playerCount, i % 2 === 0);
    if (w === 0) wins++;
  }
  return wins / games;
}

function randomInd(rng) {
  const w = {};
  KEYS.forEach(k => { w[k] = BASE[k] * (0.25 + rng() * 1.5); });
  w.cost = -Math.max(1, BASE.cost * (0.5 + rng()));
  return w;
}

function mutate(ind, rng, sigma) {
  const w = {};
  KEYS.forEach(k => {
    let v = ind[k] + gauss(rng) * sigma;
    if (k === 'cost') v = Math.min(v, -0.5);
    w[k] = v;
  });
  return w;
}

function main() {
  const popSize = parseInt(process.argv[2] || '20', 10);
  const gamesPerEval = parseInt(process.argv[3] || '50', 10);
  const generations = parseInt(process.argv[4] || '8', 10);
  const playerCount = parseInt(process.argv[5] || '2', 10); // 2/3/4 人局
  const seedBase = parseInt(process.argv[6] || '12345', 10);
  const rng = makeRng(seedBase);

  console.log('=== 专家 AI 训练（自我对弈 + 进化策略） ===');
  console.log('人数 ' + playerCount + ' 人局 ｜ 种群 ' + popSize + ' × 每个体 ' + gamesPerEval +
    ' 局 × ' + generations + ' 代 ｜ 对手：' + (playerCount - 1) + ' × Level ' + OPPONENT_LEVEL);

  let pop = [];
  for (let i = 0; i < popSize; i++) pop.push(randomInd(rng));
  let best = { weights: Object.assign({}, BASE), score: -1 };
  const sigma0 = 1.6;

  for (let g = 1; g <= generations; g++) {
    const sigma = sigma0 * Math.pow(0.72, g - 1);
    const t0 = Date.now();
    const scored = pop.map(function (w, i) {
      return { w: w, score: evaluate(w, gamesPerEval, seedBase + g * 100000 + i * 1000, playerCount) };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    const elite = scored.slice(0, Math.max(2, Math.floor(popSize * 0.25)));
    if (elite[0].score > best.score) {
      best = { weights: Object.assign({}, elite[0].w), score: elite[0].score };
    }
    const next = elite.map(function (e) { return e.w; });
    while (next.length < popSize) {
      const parent = elite[Math.floor(rng() * elite.length)].w;
      next.push(mutate(parent, rng, sigma));
    }
    pop = next;
    const avg = scored.reduce(function (a, b) { return a + b.score; }, 0) / scored.length;
    console.log('第' + g + '代 用时' + ((Date.now() - t0) / 1000).toFixed(1) + 's ｜ 最佳胜率 ' +
      (elite[0].score * 100).toFixed(1) + '% ｜ 平均 ' + (avg * 100).toFixed(1) + '%');
  }

  // 保存：按人数分组写入模型（兼容旧版单 weights 结构）
  const file = path.join(__dirname, '..', 'ai_expert_weights.js');
  let model = { meta: {} };
  try { model = JSON.parse(JSON.stringify(require('../ai_expert_weights.js'))); } catch (e) { /* 新文件 */ }
  if (model.weights && !model['2']) {
    // 迁移旧版单组结构 → 2 人局分组
    model['2'] = { weights: model.weights };
    delete model.weights;
  }
  if (!model.meta) model.meta = {};
  model.meta[playerCount + 'p'] = {
    trained: true,
    generations: generations,
    gamesPerEval: gamesPerEval,
    popSize: popSize,
    opponents: playerCount - 1,
    opponentLevel: OPPONENT_LEVEL,
    winRate: (best.score * 100).toFixed(1),
    trainedAt: new Date().toISOString()
  };
  model[String(playerCount)] = { weights: best.weights };
  model.meta.version = 3;

  const content =
    '/* ============================================================\n' +
    ' * ai_expert_weights.js —— 专家 AI（Level 6）权重参数（训练产物）\n' +
    ' * 由 training/train_expert.js 通过自我对弈 + 进化策略训练得到。\n' +
    ' * 按人数分组：{ "2": {...}, "3": {...}, "4": {...} }。\n' +
    ' * ============================================================ */\n' +
    '(function (root) {\n' +
    '  var MODEL = ' + JSON.stringify(model, null, 2) + ';\n' +
    '  if (typeof module !== \'undefined\' && module.exports) {\n    module.exports = MODEL;\n  }\n' +
    '  if (typeof window !== \'undefined\') {\n    window.AI_EXPERT_MODEL = MODEL;\n  }\n' +
    '})(typeof self !== \'undefined\' ? self : this);\n';
  fs.writeFileSync(file, content);
  console.log('\n训练完成 → ' + file);
  console.log('[' + playerCount + ' 人局] 最终权重: ' + JSON.stringify(best.weights));
  console.log('验收（对 ' + (playerCount - 1) + ' × Level ' + OPPONENT_LEVEL + ' 胜率）: ' + (best.score * 100).toFixed(1) + '%');
  if (best.score < 0.55 && playerCount > 2) {
    console.log('⚠️ 多人局胜率未达 55%（1vN 劣势正常），建议增加代数继续训练。');
  } else if (best.score < 0.55) {
    console.log('⚠️ 胜率未达 55%，建议增加代数/局数继续训练。');
  } else {
    console.log('✅ Expert 明显强于 Level 5。');
  }
}

main();
