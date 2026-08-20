/* ============================================================
 * ai_expert_weights.js —— 专家 AI（Level 6）权重参数（训练产物）
 * 由 training/train_expert.js 通过自我对弈 + 进化策略训练得到。
 * 按人数分组：{ "2": {...}, "3": {...}, "4": {...} }。
 * ============================================================ */
(function (root) {
  var MODEL = {
  "2": {
    "weights": {
      "pts": 9.169293061282955,
      "engine": 5.908101982314045,
      "noble": 12.604962277179192,
      "target": 4.742667127692222,
      "resource": 1.4890238205542259,
      "gold": 1.3724026225607429,
      "endgame": 13.012889790333883,
      "opponent": 3.443306803322058,
      "block": 2.115754580952845,
      "cost": -0.5792049418783143
    }
  },
  "3": {
    "weights": {
      "pts": 15.80768598860403,
      "engine": 7.880581149094694,
      "noble": 14.046586479018988,
      "target": 1.4242903605819468,
      "resource": 0.5296379421497743,
      "gold": 7.694916482181291,
      "endgame": 13.118508495062025,
      "opponent": 2.5427536935466306,
      "block": -0.7727967254697796,
      "cost": -1.387402892249059
    }
  },
  "4": {
    "weights": {
      "pts": 9.92160819238482,
      "engine": 1.801363206016148,
      "noble": 10.334396327205926,
      "target": 2.417276815405498,
      "resource": 1.2465992142428988,
      "gold": 1.456497920326824,
      "endgame": 5.166823819090939,
      "opponent": 1.2949040118175232,
      "block": -0.20985797305537385,
      "cost": -0.8365003450455334
    }
  },
  "meta": {
    "version": 3,
    "note": "按人数分组的专家权重",
    "3p": {
      "trained": true,
      "generations": 10,
      "gamesPerEval": 40,
      "popSize": 24,
      "opponents": 2,
      "opponentLevel": 5,
      "winRate": "82.5",
      "trainedAt": "2026-08-16T13:16:20.121Z"
    },
    "4p": {
      "trained": true,
      "generations": 8,
      "gamesPerEval": 30,
      "popSize": 20,
      "opponents": 3,
      "opponentLevel": 5,
      "winRate": "60.0",
      "trainedAt": "2026-08-16T13:17:32.043Z"
    }
  }
};
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MODEL;
  }
  if (typeof window !== 'undefined') {
    window.AI_EXPERT_MODEL = MODEL;
  }
})(typeof self !== 'undefined' ? self : this);
