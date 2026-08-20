/* ============================================================
 * ai.js —— 《璀璨宝石》六档电脑 AI 引擎
 *
 * 架构（遵循《六档电脑AI难度系统开发提示词》）：
 *   统一合法行动生成器 legalActions
 *        ↓
 *   统一局面评价系统 scoreAction（即时分/折扣/目标/贵族/资源/黄金/发动机/终局/对手/封锁）
 *        ↓
 *   长期目标规划 pickGoal（含目标稳定性）
 *        ↓
 *   对手分析 opponentInfo（Level 5/6 启用）
 *        ↓
 *   按难度参数（aiConfig）调整 → 选择行动
 *
 * 关键设计：
 *   - Level 1~5 共用同一套评分框架，仅由难度参数形成差异；
 *   - Level 6 使用 ai_expert_weights.js 训练得到的权重；
 *   - 防作弊：buildObservableState 只向 AI 暴露公开信息
 *     （对手预留卡只暴露数量、不暴露牌堆内容）；
 *   - AI_DEBUG 打开后控制台输出评分分解。
 * 兼容浏览器 <script> 与 Node.js require()。
 * ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'), require('./game.js'), require('./aiConfig.js'));
  } else {
    root.SplendorAI = factory(root.SplendorData, root.SplendorGame, root.SplendorAIConfig);
  }
})(typeof self !== 'undefined' ? self : this, function (D, G, CFG) {
  'use strict';

  var COLORS = D.COLORS;

  // ---------- 评估工具 ----------
  function totalTokens(p) { return G.tokenTotal(p.tokens); }

  /** 单张卡的基础价值评分（越高越优先） */
  function cardValue(card) {
    return card.points * 100 + (card.tier * 5) - D.costTotal(card.cost);
  }

  /** 距离贵族的接近程度：0 = 已满足；越小越接近 */
  function nobleGap(p, noble) {
    var gap = 0;
    for (var c in noble.req) {
      var need = noble.req[c] - (p.permanents[c] || 0);
      if (need > 0) gap += need;
    }
    return gap;
  }

  /** 距最近贵族还缺几枚永久宝石（Infinity = 无贵族） */
  function bestNobleGap(p, state) {
    var best = Infinity;
    (state.nobles || []).forEach(function (n) {
      var gap = nobleGap(p, n);
      if (gap < best) best = gap;
    });
    return best;
  }

  /** 该卡是否补某贵族的缺口色（帮助判断贵族路线） */
  function cardHelpsNoble(p, state, card, maxGap) {
    var g = bestNobleGap(p, state);
    if (g > maxGap) return false;
    for (var i = 0; i < state.nobles.length; i++) {
      var n = state.nobles[i];
      if ((n.req[card.bonus] || 0) > (p.permanents[card.bonus] || 0)) return true;
    }
    return false;
  }

  /** 买一张卡后，所有贵族 gap 之和的下降量（0~10） */
  function nobleGainByBuy(p, state, card) {
    var gain = 0;
    (state.nobles || []).forEach(function (n) {
      if ((n.req[card.bonus] || 0) > (p.permanents[card.bonus] || 0)) gain += 1;
    });
    return Math.min(10, gain * 3.3);
  }

  /** 某颜色在 AI 永久宝石中的稀缺度 0~1（0=最多，1=最少） */
  function colorScarcity(p, color) {
    var min = Infinity, max = -Infinity;
    COLORS.forEach(function (c) {
      var v = p.permanents[c] || 0;
      if (v < min) min = v;
      if (v > max) max = v;
    });
    var v = p.permanents[color] || 0;
    if (max === min) return 0.5;
    return (max - v) / (max - min);
  }

  // ---------- 防作弊：AI 可观察状态 ----------
  /**
   * 只暴露当前 AI 理论上可见的信息：
   *   - 桌面公开卡、公共宝石池、贵族（公开）
   *   - 双方得分/筹码/永久宝石/已购卡（公开）
   *   - 对手预留卡：只暴露「数量」（官方规则预留牌面朝下）
   *   - 牌堆：只暴露剩余张数（不暴露下一张内容）
   */
  function buildObservableState(state, aiIdx) {
    return {
      players: state.players.map(function (p, i) {
        var base = {
          name: p.name, isAI: !!p.isAI,
          tokens: p.tokens, permanents: p.permanents,
          cards: p.cards, nobles: p.nobles,
          score: p.score, turnCount: p.turnCount,
          reservedCount: p.reserved.length
        };
        if (i === aiIdx) base.reserved = p.reserved; // 自己预留的卡自己可见
        else base.reserved = [];                     // 对手预留卡不可见
        return base;
      }),
      currentPlayer: state.currentPlayer,
      bank: state.bank,
      board: state.board,
      nobles: state.nobles,
      deckSizes: { 1: state.decks[1].length, 2: state.decks[2].length, 3: state.decks[3].length },
      aiLevel: state.players[aiIdx] ? (state.players[aiIdx].aiLevel || state.aiLevel || 3) : (state.aiLevel || 3),
      aiWeights: state.players[aiIdx] ? (state.players[aiIdx].aiWeights || null) : null,
      aiAccuracy: state.players[aiIdx] ? (state.players[aiIdx].aiAccuracy !== undefined ? state.players[aiIdx].aiAccuracy : null) : null,
      goal: state.aiGoal, // AI 自身的目标记忆（非隐藏信息）
      rng: state.rng
    };
  }

  // ---------- 统一合法行动生成器 ----------
  function findCardFor(obs, idx, cardId) {
    for (var t = 1; t <= 3; t++) {
      for (var i = 0; i < obs.board[t].length; i++) {
        var c0 = obs.board[t][i];
        if (c0 && c0.id === cardId) return c0;
      }
    }
    var rs = obs.players[idx].reserved || [];
    for (var j = 0; j < rs.length; j++) {
      if (rs[j].id === cardId) return rs[j];
    }
    return null;
  }

  /** 全部合法行动（严格遵守正式规则；含买入/拿宝石/预留/盲抽预留） */
  function legalActions(obs, idx) {
    var p = obs.players[idx];
    var acts = [];
    // 购买：桌面公开卡（跳过空位）+ 自己预留卡
    [1, 2, 3].forEach(function (t) {
      obs.board[t].forEach(function (c) {
        if (c && G.canAfford(p, c)) acts.push({ type: 'buy', cardId: c.id });
      });
    });
    (p.reserved || []).forEach(function (c) {
      if (G.canAfford(p, c)) acts.push({ type: 'buy', cardId: c.id });
    });
    // 拿宝石：3 种不同（公共区均有货）
    for (var i = 0; i < COLORS.length; i++) {
      for (var j = i + 1; j < COLORS.length; j++) {
        for (var k = j + 1; k < COLORS.length; k++) {
          if (obs.bank[COLORS[i]] > 0 && obs.bank[COLORS[j]] > 0 && obs.bank[COLORS[k]] > 0) {
            acts.push({ type: 'take', colors: [COLORS[i], COLORS[j], COLORS[k]] });
          }
        }
      }
    }
    // 拿宝石：同色 2 枚（公共区 >= 4）
    COLORS.forEach(function (c) {
      if (obs.bank[c] >= 4) acts.push({ type: 'take', colors: [c, c] });
    });
    // 预留：桌面公开卡（跳过空位）+ 盲抽（牌堆非空）
    if (p.reservedCount < G.MAX_RESERVED) {
      [1, 2, 3].forEach(function (t) {
        obs.board[t].forEach(function (c) { if (c) acts.push({ type: 'reserve', cardId: c.id }); });
      });
      [3, 2, 1].forEach(function (t) {
        if (obs.deckSizes[t] > 0) acts.push({ type: 'reserve', fromDeck: t });
      });
    }
    return acts;
  }

  // ---------- 长期目标规划 ----------
  /** 某颜色在桌面目标卡中的需求占比（0~1）——发动机评估用 */
  function colorDemand(obs, color) {
    var total = 0, cnt = 0;
    [1, 2, 3].forEach(function (t) {
      obs.board[t].forEach(function (card) {
        if (!card) return;
        total += D.costTotal(card.cost);
        cnt += card.cost[color] || 0;
      });
    });
    return total > 0 ? cnt / total : 0;
  }

  /** 目标卡评分（价值密度：分/还需成本，贵族与可达性修正） */
  function goalScore(obs, p, card, cfg) {
    var rem = G.remainingCost(p, card);
    var remTotal = D.costTotal(rem);
    var base = card.points * 10 + (4 - card.tier) * 3 - D.costTotal(card.cost);
    var nobleBonus = cardHelpsNoble(p, obs, card, 3) ? 15 * cfg.nobleAwareness : 0;
    var reach = remTotal <= 4 ? 8 : 0;
    return (base + nobleBonus + reach) / (remTotal + 1);
  }

  /**
   * 选择长期目标卡（含目标稳定性：targetStability 低时容易临时换目标）。
   * 通过 obs.goal 读写 AI 的目标记忆。
   */
  function pickGoal(obs, idx, cfg) {
    var p = obs.players[idx];
    var list = [];
    [1, 2, 3].forEach(function (t) { obs.board[t].forEach(function (c) { if (c) list.push(c); }); });
    (p.reserved || []).forEach(function (c) { list.push(c); });
    if (list.length === 0) return null;
    list.sort(function (a, b) {
      var sa = goalScore(obs, p, a, cfg), sb = goalScore(obs, p, b, cfg);
      if (sb !== sa) return sb - sa;
      return a.id - b.id;
    });
    var best = list[0];
    var cur = obs.goal;
    // 稳定性：旧目标仍在场且概率保持
    if (cur && cur.cardId !== best.id && list.some(function (c) { return c.id === cur.cardId; })) {
      if (obs.rng() < cfg.targetStability) return { cardId: cur.cardId, score: cur.score };
    }
    if (cur) { cur.cardId = best.id; cur.score = goalScore(obs, p, best, cfg); }
    return { cardId: best.id, score: goalScore(obs, p, best, cfg) };
  }

  // ---------- 对手分析（Level 5/6） ----------
  function opponentInfo(obs, idx, cfg) {
    if (cfg.opponentAwareness <= 0) return null;
    // 多玩家模式：评估所有对手，取威胁最高的作为主要威胁源
    var best = null;
    for (var oi = 0; oi < obs.players.length; oi++) {
      if (oi === idx) continue;
      var rival = obs.players[oi];
      var info = { threat: 0, keyCards: [], rival: rival };
      // 威胁：分数
      if (rival.score >= 13) info.threat = 1;
      else if (rival.score >= 11) info.threat = 0.7;
      else if (rival.score >= 8) info.threat = 0.4;
      else if (rival.score >= 5) info.threat = 0.2;
      // 威胁：距贵族很近
      var rgap = bestNobleGap(rival, obs);
      if (rgap <= 1) info.threat = Math.max(info.threat, 0.85);
      else if (rgap <= 2) info.threat = Math.max(info.threat, 0.55);
      // 对手可买的高价值桌面卡（关键卡）
      [1, 2, 3].forEach(function (t) {
        obs.board[t].forEach(function (c) {
          if (c && G.canAfford(rival, c)) {
            var val = c.points * 3 + (c.points >= 3 ? 2 : 0) +
              (cardHelpsNoble(rival, obs, c, 3) ? 3 : 0);
            if (val >= 6) info.keyCards.push({ card: c, val: val });
          }
        });
      });
      if (!best || info.threat > best.threat) best = info;
    }
    return best;
  }

  /** 某张卡对封锁对手的价值（0~10；仅当对手威胁非常高、且卡对其价值大时） */
  function blockScore(opp, card) {
    if (!opp || opp.threat < 0.75) return 0; // 门槛：玩家 ≥12 分或距贵族 ≤1
    for (var i = 0; i < opp.keyCards.length; i++) {
      if (opp.keyCards[i].card.id === card.id) {
        return Math.min(6, opp.threat * opp.keyCards[i].val);
      }
    }
    return 0;
  }

  // ---------- 统一行动评分 ----------
  function remainingMap(p, card) { return G.remainingCost(p, card); }

  function scoreAction(obs, idx, act, cfg, goal, opp) {
    var p = obs.players[idx];
    var w = cfg.weights;
    if (act.type === 'buy') return scoreBuy(obs, idx, act, cfg, goal, opp);
    if (act.type === 'take') return scoreTake(obs, idx, act, cfg, goal);
    return scoreReserve(obs, idx, act, cfg, goal, opp);
  }

  function scoreBuy(obs, idx, act, cfg, goal, opp) {
    var p = obs.players[idx];
    var card = findCardFor(obs, idx, act.cardId);
    var b = { type: 'buy', cardId: act.cardId };
    if (!card) return { total: -1e9, breakdown: b };
    var rem = remainingMap(p, card);
    var payTotal = D.costTotal(rem);
    var w = cfg.weights;

    b.pts = card.points * 3;
    // 发动机：低层廉价卡 + 该永久色在目标卡中的真实需求频率（折扣链价值）
    b.engine = (4 - card.tier) * 1.2 + colorDemand(obs, card.bonus) * 3 + (payTotal <= 3 ? 1.5 : 0);
    b.noble = nobleGainByBuy(p, obs, card) * (0.5 + cfg.nobleAwareness * 0.5);
    b.target = (goal && card.id === goal.cardId) ? 8 : 0;
    b.resource = Math.max(0, 6 - payTotal); // 少花钱 → 资源效率高
    b.gold = 0;
    b.endgame = (p.score >= 12 && card.points >= 3) ? card.points * 2 : 0;
    b.opponent = opp ? blockScore(opp, card) : 0;
    b.block = b.opponent;
    b.cost = payTotal;

    b.total = w.pts * b.pts + w.engine * b.engine + w.noble * b.noble +
      w.target * b.target + w.resource * b.resource + w.gold * b.gold +
      w.endgame * b.endgame + w.opponent * b.opponent + w.block * b.block +
      w.cost * b.cost;
    return { total: b.total, breakdown: b };
  }

  function scoreTake(obs, idx, act, cfg, goal) {
    var p = obs.players[idx];
    var w = cfg.weights;
    var b = { type: 'take', colors: act.colors.slice() };
    var myTokens = totalTokens(p);
    // 需求色集合（按目标卡 top3 缺口 + 贵族缺口）
    var need = targetNeed(obs, p, cfg);
    var targetVal = 0;
    var cnt = {};
    act.colors.forEach(function (c) { cnt[c] = (cnt[c] || 0) + 1; });
    var isSame2 = act.colors[0] === act.colors[1];
    for (var c in cnt) {
      var nd = need[c] || 0;
      var factor = 1;
      if (isSame2) factor = 0.5;                    // 同色 2 枚：目标收益打折（2 人局易枯竭）
      if (myTokens >= 8) factor *= 0.5;             // 临近上限：不再死盯目标（防囤积）
      targetVal += Math.min(nd, cnt[c]) * 2.2 * factor;
      if ((need[c] || 0) >= 1 && cnt[c] === 2) targetVal += 1 * factor;
    }
    b.target = Math.min(8, targetVal);
    // 贵族需求色命中
    var nobleHit = 0;
    (obs.nobles || []).forEach(function (n) {
      for (var c2 in n.req) {
        if (n.req[c2] > (p.permanents[c2] || 0) && (cnt[c2] || 0) > 0) nobleHit++;
      }
    });
    b.noble = Math.min(6, nobleHit * 1.5) * cfg.nobleAwareness;
    // 资源效率：拿公共区存量大的色（不耗尽稀缺）；避免单色囤积；
    // 公共区保护：拿后会枯竭（<2）的色重罚（允许负值，惩罚真实生效）
    var stock = 0, over = 0, deplete = 0;
    act.colors.forEach(function (c) {
      stock += obs.bank[c] >= 3 ? 1.2 : (obs.bank[c] === 2 ? 0.6 : 0.2);
      if ((p.tokens[c] || 0) + (cnt[c] || 0) >= 4) over += 2.5; // 同一色过多 → 惩罚
      if (obs.bank[c] - (cnt[c] || 0) < 2) deplete += 8;        // 会把公共区拿枯竭 → 重罚
    });
    b.resource = stock - over - deplete;
    b.gold = 0;
    b.pts = 0; b.engine = 0; b.endgame = 0; b.opponent = 0; b.block = 0; b.cost = 0;
    // 难度随机性 → 评分噪声（模拟"资源组合不够最优"）
    b.noise = cfg.randomness > 0 ? (obs.rng() - 0.5) * 8 * (cfg.randomness / 0.3) : 0;

    b.total = w.pts * b.pts + w.engine * b.engine + w.noble * b.noble +
      w.target * b.target + w.resource * b.resource + w.gold * b.gold +
      w.endgame * b.endgame + w.opponent * b.opponent + w.block * b.block +
      w.cost * b.cost + b.noise;
    // 持币上限保护：已持 9~10 枚时拿宝石整体打折（避免囤积到公共区枯竭）
    if (myTokens >= 9) b.total *= 0.5;
    return { total: b.total, breakdown: b };
  }

  function scoreReserve(obs, idx, act, cfg, goal, opp) {
    var p = obs.players[idx];
    var w = cfg.weights;
    var b = { type: 'reserve' };
    if (act.cardId !== undefined) b.cardId = act.cardId;
    if (act.fromDeck !== undefined) b.fromDeck = act.fromDeck;

    var card = act.cardId !== undefined ? findCardFor(obs, idx, act.cardId) : null;
    b.target = card ? Math.min(10, card.points * 2 + (4 - card.tier) * 1.2) : 3;
    // 可达性：接近买得起才值得预留
    if (card) {
      var rem = D.costTotal(G.remainingCost(p, card));
      if (rem > 0 && rem - totalTokens(p) <= 4) b.target += 3;
    }
    // 黄金收益（盲抽/预留都获得黄金）
    b.gold = obs.bank.gold > 0 ? 5 : 0;
    b.noble = 0;
    b.engine = 0;
    b.pts = 0;
    b.resource = 0;
    // 槽位成本：预留越多越贵
    b.cost = p.reservedCount >= 2 ? 2 : 0;
    b.endgame = 0;
    b.opponent = opp ? blockScore(opp, card || { id: -1 }) : 0;
    b.block = b.opponent;
    b.noise = cfg.randomness > 0 ? (obs.rng() - 0.5) * 6 * (cfg.randomness / 0.3) : 0;

    b.total = w.pts * b.pts + w.engine * b.engine + w.noble * b.noble +
      w.target * b.target + w.resource * b.resource + w.gold * b.gold +
      w.endgame * b.endgame + w.opponent * b.opponent + w.block * b.block +
      w.cost * b.cost + b.noise;
    return { total: b.total, breakdown: b };
  }

  /** 目标需求：top3 目标卡缺口 + 贵族缺口（可及性优先） */
  function targetNeed(obs, p, cfg) {
    var need = {};
    var list = [];
    [1, 2, 3].forEach(function (t) { obs.board[t].forEach(function (c) { if (c) list.push(c); }); });
    (p.reserved || []).forEach(function (c) { list.push(c); });
    list.sort(function (a, b) {
      var ra = D.costTotal(G.remainingCost(p, a));
      var rb = D.costTotal(G.remainingCost(p, b));
      if (ra !== rb) return ra - rb;
      return a.id - b.id;
    });
    list.slice(0, 3).forEach(function (card) {
      var rem = G.remainingCost(p, card);
      var remTotal = 0;
      for (var cc in rem) remTotal += rem[cc];
      // 单色大目标（如 L2/L3 的单色 6/7 成本卡）缺口打折，避免死盯单色导致囤积枯竭
      var factor = remTotal > 4 ? 0.5 : 1;
      for (var c in rem) {
        var d = rem[c] - (p.tokens[c] || 0);
        if (d > 0) need[c] = (need[c] || 0) + d * factor;
      }
    });
    (obs.nobles || []).forEach(function (n) {
      for (var c2 in n.req) {
        var gap = n.req[c2] - (p.permanents[c2] || 0);
        if (gap > 0) need[c2] = (need[c2] || 0) + 1;
      }
    });
    return need;
  }

  // ---------- 选择机制：按难度参数（accuracy/随机性）选择 ----------
  /**
   * scores: [{action,total}] 降序。
   * 分档选择（参考需求文档 L1 建议比例 55/30/12/3）：
   *   accuracy 概率 → 最优；次优比例 → 第二优 / 第三优；其余 → 更差行动中加权抽样。
   */
  function chooseByScores(scores, cfg, rng) {
    if (!scores || scores.length === 0) return null;
    if (scores.length === 1 || cfg.accuracy >= 1) return scores[0].action;
    var r = rng();
    var p1 = cfg.accuracy;
    var p2 = (1 - p1) * 0.62;  // 第二优
    var p3 = (1 - p1) * 0.25;  // 第三优
    // p4 = 其余
    if (r < p1) return scores[0].action;
    if (r < p1 + p2) {
      return scores.length >= 2 ? scores[1].action : scores[0].action;
    }
    if (r < p1 + p2 + p3) {
      return scores.length >= 3 ? scores[2].action : scores[1].action;
    }
    // 其他：从更差行动（第 4 名起）加权抽样（排除明显愚蠢：分数过低者权重极低）
    var rest = scores.slice(3);
    if (rest.length === 0) return scores[Math.min(2, scores.length - 1)].action;
    var min = scores[scores.length - 1].total;
    var weights = rest.map(function (s) { return Math.max(0.05, s.total - min + 1); });
    var sum = 0;
    weights.forEach(function (wgt) { sum += wgt; });
    var x = rng() * sum;
    for (var i = 0; i < rest.length; i++) {
      x -= weights[i];
      if (x <= 0) return rest[i].action;
    }
    return rest[rest.length - 1].action;
  }

  /** 专家前瞻（Level 6）：对 top 候选的购买行动做轻量前瞻修正 */
  function foresightAdjust(obs, idx, scored, cfg) {
    if (cfg.level < 6 || scored.length === 0) return;
    var p = obs.players[idx];
    var limit = Math.min(3, scored.length);
    for (var i = 0; i < limit; i++) {
      var s = scored[i];
      if (s.action.type !== 'buy') continue;
      var card = findCardFor(obs, idx, s.action.cardId);
      if (!card) continue;
      // 浅模拟：支付后永久+1
      var pay = G.paymentFor(p, card);
      var tokens = {};
      for (var c in p.tokens) tokens[c] = p.tokens[c];
      for (var c2 in pay.tokens) tokens[c2] -= pay.tokens[c2];
      tokens[G.GOLD] -= pay.gold;
      var perm = {};
      for (var c3 in p.permanents) perm[c3] = p.permanents[c3];
      perm[card.bonus] = (perm[card.bonus] || 0) + 1;
      // 买后：离贵族更近？目标更可达？
      var nobleGain = 0;
      (obs.nobles || []).forEach(function (n) {
        for (var c4 in n.req) {
          if (n.req[c4] > (perm[c4] || 0)) { nobleGain--; break; } // 仍不满足
        }
      });
      // 简化：买后剩余筹码 + 折扣对「最可及目标」的改善
      var simP = { tokens: tokens, permanents: perm, cards: p.cards, reserved: p.reserved };
      var simRem = 0;
      var bestList = [];
      [1, 2, 3].forEach(function (t) { obs.board[t].forEach(function (c) { if (c) bestList.push(c); }); });
      var minRem = Infinity;
      bestList.forEach(function (c) {
        var r = D.costTotal(G.remainingCost(simP, c));
        if (r < minRem) minRem = r;
      });
      simRem = minRem === Infinity ? 99 : minRem;
      s.total += (12 - simRem) * 0.5; // 买后更容易买下一张 → 加分
    }
  }

  // ---------- 主决策 ----------
  /**
   * 多人局（3/4 人）策略适配：与 2 人局共用同一套难度参数（L1~L6），
   * 仅按人数做竞争性微调：
   *   - 竞争更激烈 → 折扣引擎与终局节奏权重更高（更快建引擎、更早冲分）
   *   - 桌面好卡被抢得快 → 预留更积极
   *   - 贵族竞争激烈 → 贵族执念略微降低（不过度押注单一贵族）
   */
  function adjustForPlayers(obs, cfg) {
    var n = obs.players.length;
    if (n <= 2) return cfg;
    var f = n - 2; // 3 人局 f=1，4 人局 f=2
    var w = {};
    for (var k in cfg.weights) w[k] = cfg.weights[k];
    w.engine = w.engine * (1 + 0.12 * f);
    w.endgame = w.endgame * (1 + 0.10 * f);
    w.noble = w.noble * (1 - 0.06 * f);
    if (cfg.reserveMin !== undefined) cfg.reserveMin = Math.min(cfg.reserveMin, 190 - f * 20);
    cfg.nobleAwareness = Math.max(0.4, cfg.nobleAwareness * (1 - 0.06 * f));
    cfg.weights = w;
    return cfg;
  }

  /**
   * 返回 AI 行动：{ type:'buy'|'reserve'|'take', ... }
   * 可接收真实 gameState 或 buildObservableState 生成的可观察状态。
   */
  function chooseAiAction(state, idx) {
    var obs = (state && state.deckSizes) ? state : buildObservableState(state, idx);
    var cfg = obs.aiWeights ? CFG.makeConfig(obs.aiLevel, obs.aiWeights) : CFG.getConfig(obs.aiLevel, obs.players.length);
    if (obs.aiAccuracy !== undefined && obs.aiAccuracy !== null) cfg.accuracy = obs.aiAccuracy;
    cfg = adjustForPlayers(obs, cfg);
    var acts = legalActions(obs, idx);
    if (acts.length === 0) return null;
    var goal = pickGoal(obs, idx, cfg);
    var opp = opponentInfo(obs, idx, cfg);
    var scored = acts.map(function (a) {
      var s = scoreAction(obs, idx, a, cfg, goal, opp);
      return { action: a, total: s.total, breakdown: s.breakdown };
    });
    scored.sort(function (a, b) { return b.total - a.total; });
    foresightAdjust(obs, idx, scored, cfg);
    scored.sort(function (a, b) { return b.total - a.total; });

    if (CFG.isDebug()) {
      var lines = ['[AI Decision] Level ' + cfg.level + ' ' + cfg.name + ' 目标卡=' + (goal ? goal.cardId : '无') +
        ' 对手威胁=' + (opp ? opp.threat.toFixed(2) : 0)];
      scored.slice(0, 6).forEach(function (s) {
        lines.push('  ' + describeAction(s.action) + ' → ' + s.total.toFixed(1) +
          ' [' + JSON.stringify(s.breakdown) + ']');
      });
      lines.push('  Chosen: ' + describeAction(scored[0].action));
      console.log(lines.join('\n'));
    }
    return chooseByScores(scored, cfg, obs.rng);
  }

  function describeAction(a) {
    if (a.type === 'buy') return 'Buy #' + a.cardId;
    if (a.type === 'take') return 'Take ' + a.colors.join('+');
    if (a.type === 'reserve') return a.fromDeck !== undefined ? 'Reserve deck' + a.fromDeck : 'Reserve #' + a.cardId;
    return '?';
  }

  // ---------- 归还决策 ----------
  /** 归还顺序：不急需的先还；公共区稀缺且自己持有较多的先还；黄金最后 */
  function aiDiscardPlan(state, idx) {
    var p = state.players[idx];
    var obs = buildObservableState(state, idx);
    var need = targetNeed(obs, p, CFG.getConfig(state.aiLevel));
    var colors = COLORS.slice();
    colors.sort(function (a, b) {
      var needA = need[a] ? 1 : 0, needB = need[b] ? 1 : 0;
      if (needA !== needB) return needA - needB;
      var scarA = (state.bank[a] <= 1 && p.tokens[a] >= 3) ? 1 : 0;
      var scarB = (state.bank[b] <= 1 && p.tokens[b] >= 3) ? 1 : 0;
      if (scarB !== scarA) return scarB - scarA;
      var na = p.tokens[a] || 0, nb = p.tokens[b] || 0;
      if (nb !== na) return nb - na;
      return a < b ? -1 : 1;
    });
    var plan = [];
    colors.forEach(function (c) { if (p.tokens[c] > 0) plan.push(c); });
    if (p.tokens[G.GOLD] > 0) plan.push(G.GOLD);
    return plan;
  }

  /** 执行 AI 归还：循环归还到 <= 10 */
  function aiDiscard(state, idx) {
    var p = state.players[idx];
    var plan = aiDiscardPlan(state, idx);
    var returned = {};
    while (totalTokens(p) > G.MAX_TOKENS) {
      var done = false;
      for (var i = 0; i < plan.length; i++) {
        var c = plan[i];
        if (p.tokens[c] > 0) {
          G.returnTokens(state, idx, c, 1);
          returned[c] = (returned[c] || 0) + 1;
          done = true;
          break;
        }
      }
      if (!done) break;
    }
    return returned;
  }

  /** AI 选择待选贵族（确定性：取第一个） */
  function aiChooseNoble(state, idx) {
    var list = state.pendingNobles.slice();
    list.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    return list[0] ? list[0].id : null;
  }

  // ---------- 完整执行一个 AI 回合 ----------
  /** 决策使用「可观察状态」（防作弊）；执行使用真实状态 */
  function executeAiTurn(state, idx) {
    while (state.pendingNobles.length > 0) {
      G.chooseNoble(state, idx, aiChooseNoble(state, idx));
    }
    var action = chooseAiAction(state, idx);
    var res = null, acted = false;
    if (action && action.type === 'buy') {
      res = G.buyCard(state, idx, action.cardId);
      acted = !!(res && res.ok);
    } else if (action && action.type === 'reserve') {
      res = action.fromDeck
        ? G.reserveCard(state, idx, null, action.fromDeck)
        : G.reserveCard(state, idx, action.cardId);
      acted = !!(res && res.ok);
    } else if (action && action.type === 'take') {
      res = G.takeTokens(state, idx, action.colors);
      acted = !!(res && res.ok);
    }
    // 兜底 1：盲抽预留
    if (!acted && state.players[idx].reserved.length < G.MAX_RESERVED) {
      for (var t = 3; t >= 1; t--) {
        if (state.decks[t].length > 0) {
          res = G.reserveCard(state, idx, null, t);
          if (res && res.ok) { acted = true; break; }
        }
      }
    }
    // 兜底 2：罕见死局 → 归还 1 枚筹码（应急规则）
    if (!acted) {
      var plan = aiDiscardPlan(state, idx);
      for (var i = 0; i < plan.length; i++) {
        var c = plan[i];
        if (state.players[idx].tokens[c] > 0) {
          G.returnTokens(state, idx, c, 1);
          G.log(state, state.players[idx].name + '（罕见局面）无合法行动，自动归还 1 枚筹码');
          acted = true;
          break;
        }
      }
    }
    while (state.pendingNobles.length > 0) {
      G.chooseNoble(state, idx, aiChooseNoble(state, idx));
    }
    if (G.needDiscard(state, idx)) aiDiscard(state, idx);
    G.completeTurn(state);
  }

  return {
    chooseAiAction: chooseAiAction,
    executeAiTurn: executeAiTurn,
    aiDiscard: aiDiscard,
    aiDiscardPlan: aiDiscardPlan,
    aiChooseNoble: aiChooseNoble,
    legalActions: legalActions,
    buildObservableState: buildObservableState,
    adjustForPlayers: adjustForPlayers,
    scoreAction: scoreAction,
    pickGoal: pickGoal,
    opponentInfo: opponentInfo,
    targetNeed: targetNeed,
    cardValue: cardValue,
    cardHelpsNoble: cardHelpsNoble
  };
});
