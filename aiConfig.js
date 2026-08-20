/* ============================================================
 * aiConfig.js —— 《璀璨宝石》六档电脑 AI 难度配置
 *
 * AI_DIFFICULTIES：Level 1~6 的参数表。
 *   accuracy          决策准确度（选最优行动的概率）
 *   planning          长期规划程度（0~1，影响目标卡与提前量）
 *   targetStability   目标稳定性（0~1，越低越容易临时换目标）
 *   nobleAwareness    贵族意识（0~1，追贵族意愿）
 *   opponentAwareness 对手意识（0~1，观察玩家）
 *   blocking          封锁意识（0~1，仅在收益高时抢卡/预留）
 *   randomness        决策随机性（评分噪声幅度）
 *   weights           行动评分各项权重（人工配置；Level 6 用训练结果覆盖）
 *     pts       即时得分
 *     engine    发动机/折扣价值
 *     noble     贵族价值
 *     target    目标卡接近程度
 *     resource  资源效率
 *     gold      黄金价值
 *     endgame   终局价值
 *     opponent  对手威胁
 *     block     封锁收益
 *     cost      支付成本惩罚
 *
 * Level 6（专家）：weights 由自我对弈训练得到，
 *   运行时优先读取 ai_expert_weights.js 的 AI_EXPERT_MODEL；
 *   若不存在则回退为 Level 5 的配置。
 * 兼容浏览器 <script> 与 Node.js require()。
 * ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SplendorAIConfig = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** AI 调试模式（默认关闭；打开后在控制台输出各行动评分分解） */
  var AI_DEBUG = false;

  // 专家模型：惰性加载（浏览器 script 顺序不敏感；Node require 亦可用）
  var EXPERT_CACHE = null;
  function expertModel() {
    if (EXPERT_CACHE) return EXPERT_CACHE;
    if (typeof window !== 'undefined' && window.AI_EXPERT_MODEL) EXPERT_CACHE = window.AI_EXPERT_MODEL;
    else if (typeof module !== 'undefined' && module.exports) {
      try { EXPERT_CACHE = require('./ai_expert_weights.js'); } catch (e) { EXPERT_CACHE = null; }
    }
    return EXPERT_CACHE;
  }

  /**
   * 按人数取专家权重：
   *   兼容两种结构 —— 旧版 { weights } 单组；新版 { '2':{weights}, '3':{weights}, '4':{weights} }。
   *   找不到对应人数时回退到 2 人局权重。
   */
  function expertWeightsFor(playerCount) {
    var m = expertModel();
    if (!m) return null;
    if (m.weights) return m.weights;
    var key = String(playerCount || 2);
    if (m[key] && m[key].weights) return m[key].weights;
    if (m['2'] && m['2'].weights) return m['2'].weights;
    return null;
  }

  var AI_DIFFICULTIES = {
    1: {
      name: '新手',
      desc: '会认真思考，但经常做出新手式判断错误，适合第一次玩。',
      accuracy: 0.55, planning: 0.30, targetStability: 0.40,
      nobleAwareness: 0.40, opponentAwareness: 0, blocking: 0, randomness: 0.20,
      // 简化评分：严重高估眼前得分，几乎不建发动机、不做长期规划
      weights: {
        pts: 20, engine: 0, noble: 6, target: 2, resource: 2,
        gold: 2, endgame: 1, opponent: 0, block: 0, cost: -3
      }
    },
    2: {
      name: '简单',
      desc: '会规划自己的目标牌，但很少关注你的行动。',
      accuracy: 0.72, planning: 0.55, targetStability: 0.65,
      nobleAwareness: 0.60, opponentAwareness: 0, blocking: 0, randomness: 0.12,
      // 部分简化：偏重眼前分，发动机/规划意识较弱
      weights: {
        pts: 14, engine: 2, noble: 7, target: 3.5, resource: 2.5,
        gold: 3, endgame: 2.5, opponent: 0, block: 0, cost: -2.5
      }
    },
    3: {
      name: '标准',
      desc: '能合理规划得分、折扣和贵族路线。',
      accuracy: 0.88, planning: 0.70, targetStability: 0.80,
      nobleAwareness: 0.75, opponentAwareness: 0, blocking: 0, randomness: 0.08,
      weights: {
        pts: 10, engine: 4, noble: 8, target: 4, resource: 3,
        gold: 4, endgame: 4, opponent: 0, block: 0, cost: -2
      }
    },
    4: {
      name: '困难',
      desc: '很擅长建立高效的发展卡发动机。',
      accuracy: 0.97, planning: 0.90, targetStability: 0.95,
      nobleAwareness: 0.90, opponentAwareness: 0.10, blocking: 0.05, randomness: 0.02,
      weights: {
        pts: 10, engine: 5.5, noble: 8, target: 4, resource: 3.5,
        gold: 4.5, endgame: 6, opponent: 0.5, block: 0.3, cost: -2
      }
    },
    5: {
      name: '高手',
      desc: '会观察你的计划，并在关键时刻抢牌或封锁。',
      accuracy: 1.00, planning: 1.00, targetStability: 1.00,
      nobleAwareness: 1.00, opponentAwareness: 0.75, blocking: 0.55, randomness: 0.01,
      // 终局节奏更强；封锁权重视为微量（仅极端关键时触发）
      weights: {
        pts: 10, engine: 5.5, noble: 8, target: 4, resource: 3.5,
        gold: 4.5, endgame: 8, opponent: 1.5, block: 1.2, cost: -2
      }
    },
    6: {
      name: '专家',
      desc: '使用自我对弈和参数优化得到的最强AI。',
      accuracy: 1.00, planning: 1.00, targetStability: 1.00,
      nobleAwareness: 1.00, opponentAwareness: 1.00, blocking: 0.90, randomness: 0,
      weights: null // 运行时由 getConfig 动态合并训练权重
    }
  };

  /** 难度默认值：主菜单默认「简单」 */
  var DEFAULT_LEVEL = 2;

  /** 根据 aiLevel 返回难度配置；playerCount 用于专家权重按人数选择 */
  function getConfig(level, playerCount) {
    var lvl = Math.max(1, Math.min(6, Math.floor(level || DEFAULT_LEVEL)));
    var cfg = AI_DIFFICULTIES[lvl];
    var weights = cfg.weights;
    if (lvl === 6) {
      // 专家：以 Level 5 权重为基准，用训练模型覆盖（按人数取对应权重）
      weights = {};
      var base = AI_DIFFICULTIES[5].weights;
      for (var k in base) weights[k] = base[k];
      weights.opponent = 2;
      weights.block = 1.5;
      var expW = expertWeightsFor(playerCount);
      if (expW) {
        for (var k2 in expW) weights[k2] = expW[k2];
      }
    }
    return {
      level: lvl,
      name: cfg.name,
      desc: cfg.desc,
      accuracy: cfg.accuracy,
      planning: cfg.planning,
      targetStability: cfg.targetStability,
      nobleAwareness: cfg.nobleAwareness,
      opponentAwareness: cfg.opponentAwareness,
      blocking: cfg.blocking,
      randomness: cfg.randomness,
      weights: weights
    };
  }

  /** 供训练脚本直接构造任意权重配置 */
  function makeConfig(level, weightsOverride) {
    var cfg = getConfig(level);
    if (weightsOverride) {
      var w = {};
      for (var k in cfg.weights) w[k] = cfg.weights[k];
      for (var k2 in weightsOverride) w[k2] = weightsOverride[k2];
      cfg.weights = w;
    }
    return cfg;
  }

  function setDebug(on) { AI_DEBUG = !!on; }
  function isDebug() { return AI_DEBUG; }

  return {
    AI_DIFFICULTIES: AI_DIFFICULTIES,
    expertModel: expertModel,
    expertWeightsFor: expertWeightsFor,
    DEFAULT_LEVEL: DEFAULT_LEVEL,
    getConfig: getConfig,
    makeConfig: makeConfig,
    setDebug: setDebug,
    isDebug: isDebug
  };
});
