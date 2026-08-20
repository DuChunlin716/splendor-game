/* ============================================================
 * training/simulate_games.js —— AI 自动对战测试系统
 *
 * 用法：node training/simulate_games.js [每对局数，默认 200]
 *
 * 批量模拟多个难度对阵，统计：
 *   胜率 / 平均得分 / 平均回合数 / 平均购卡数 / 平均贵族数
 * 用于验证难度梯度（理想：Expert > L5 > L4 > L3 > L2 > L1）。
 * ============================================================ */
'use strict';

const G = require('../game.js');
const AI = require('../ai.js');
const CFG = require('../aiConfig.js');

function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 进行一局对战。
 * levelA/levelB：数字难度 或 { aiLevel, weights } 自定义权重（训练用）。
 */
function playGame(seedBase, levelA, levelB, firstA) {
  const pA = typeof levelA === 'number'
    ? { name: 'A', isAI: true, aiLevel: levelA }
    : { name: 'A', isAI: true, aiLevel: levelA.aiLevel || 6, aiWeights: levelA.weights };
  const pB = typeof levelB === 'number'
    ? { name: 'B', isAI: true, aiLevel: levelB }
    : { name: 'B', isAI: true, aiLevel: levelB.aiLevel || 6, aiWeights: levelB.weights };
  const st = G.createGame({
    rng: makeRng(seedBase),
    players: [pA, pB],
    firstPlayer: firstA ? 0 : 1
  });
  let turns = 0;
  while (!st.gameOver && turns < 400) {
    AI.executeAiTurn(st, st.currentPlayer);
    turns++;
  }
  return {
    gameOver: st.gameOver,
    turns,
    winner: st.winner, // 0=A, 1=B, null=平局
    score: [st.players[0].score, st.players[1].score],
    cards: [st.players[0].cards.length, st.players[1].cards.length],
    nobles: [st.players[0].nobles.length, st.players[1].nobles.length]
  };
}

/** 批量模拟：返回统计 */
function simulate(levelA, levelB, games, seedBase) {
  let aWins = 0, bWins = 0, draws = 0, turns = 0;
  const scores = [0, 0], cards = [0, 0], nobles = [0, 0];
  for (let i = 0; i < games; i++) {
    const r = playGame(seedBase + i * 977, levelA, levelB, i % 2 === 0);
    if (r.winner === 0) aWins++; else if (r.winner === 1) bWins++; else draws++;
    turns += r.turns;
    scores[0] += r.score[0]; scores[1] += r.score[1];
    cards[0] += r.cards[0]; cards[1] += r.cards[1];
    nobles[0] += r.nobles[0]; nobles[1] += r.nobles[1];
  }
  const n = games;
  return {
    levelA, levelB, n,
    winRateA: (aWins / n * 100).toFixed(1),
    winRateB: (bWins / n * 100).toFixed(1),
    drawRate: (draws / n * 100).toFixed(1),
    avgTurns: (turns / n).toFixed(1),
    avgScore: [(scores[0] / n).toFixed(1), (scores[1] / n).toFixed(1)],
    avgCards: [(cards[0] / n).toFixed(1), (cards[1] / n).toFixed(1)],
    avgNobles: [(nobles[0] / n).toFixed(1), (nobles[1] / n).toFixed(1)]
  };
}

function label(l) {
  if (typeof l === 'number') {
    const d = CFG.AI_DIFFICULTIES[l];
    return 'L' + l + ' ' + (d ? d.name : '?');
  }
  return '自定义';
}

function main() {
  const games = parseInt(process.argv[2] || '200', 10);
  const pairs = [[1, 3], [2, 3], [3, 4], [4, 5], [3, 5], [5, 6]];
  console.log('=== 璀璨宝石 AI 自动对战测试（每对 ' + games + ' 局，轮流先手） ===');
  console.log('难度对照：1新手 2简单 3标准 4困难 5高手 6专家\n');
  const results = [];
  for (const [a, b] of pairs) {
    const r = simulate(a, b, games, a * 10000 + b * 100);
    results.push(r);
    console.log('[' + label(a) + ' vs ' + label(b) + ']');
    console.log('  胜率  ' + label(a) + ' ' + r.winRateA + '% ｜ ' + label(b) + ' ' + r.winRateB + '% ｜ 平局 ' + r.drawRate + '%');
    console.log('  平均回合 ' + r.avgTurns + ' ｜ 平均分 ' + r.avgScore[0] + ' : ' + r.avgScore[1] +
      ' ｜ 平均购卡 ' + r.avgCards[0] + ' : ' + r.avgCards[1] +
      ' ｜ 平均贵族 ' + r.avgNobles[0] + ' : ' + r.avgNobles[1] + '\n');
  }
  // 梯度检查
  console.log('--- 难度梯度检查（期望 L1<L2<L3<L4<L5<L6） ---');
  const seq = [1, 2, 3, 4, 5, 6];
  for (let i = 0; i < seq.length - 1; i++) {
    const r = simulate(seq[i], seq[i + 1], Math.max(80, Math.floor(games / 2)), seq[i] * 1000 + seq[i + 1] * 50);
    const higherWins = parseFloat(r.winRateB);
    console.log('  L' + seq[i + 1] + ' vs L' + seq[i] + '：L' + seq[i + 1] + ' 胜率 ' + higherWins + '%' +
      (higherWins > 50 ? ' ✓' : '（需调参）'));
  }
}

main();
