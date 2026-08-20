/* ============================================================
 * game.js —— 《璀璨宝石》核心游戏逻辑（纯逻辑，不依赖 DOM）
 *
 * 状态集中在 gameState 中；所有关键操作通过函数处理：
 *   takeTokens / reserveCard / buyCard / checkNobles / grantNoble /
 *   returnTokens / completeTurn / aiTurn / checkVictory 等。
 * 兼容浏览器 <script> 与 Node.js require() 两种加载方式，
 * 以便在 Node 中直接做自动化逻辑测试。
 * ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'));
  } else {
    root.SplendorGame = factory(root.SplendorData);
  }
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  var COLORS = D.COLORS;
  var GOLD = 'gold';
  var MAX_RESERVED = 3;   // 预留上限
  var MAX_TOKENS = 10;    // 筹码上限（含黄金）
  var WIN_SCORE = 15;     // 终局触发分
  var BOARD_SIZE = 4;     // 每层公开卡数量
  // 各人数局：每色普通宝石 / 黄金 / 贵族数（官方规则）
  var BANK_BY_PLAYERS = {
    2: { white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 5 },
    3: { white: 5, blue: 5, green: 5, red: 5, black: 5, gold: 5 },
    4: { white: 7, blue: 7, green: 7, red: 7, black: 7, gold: 5 }
  };
  function bankStartFor(playerCount) {
    return BANK_BY_PLAYERS[playerCount] || BANK_BY_PLAYERS[2];
  }

  // ---------- 工具 ----------
  function shuffle(arr, rng) {
    var r = rng || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function zeroTokens() {
    var t = {};
    COLORS.forEach(function (c) { t[c] = 0; });
    t[GOLD] = 0;
    return t;
  }

  function tokenTotal(t) {
    var s = 0;
    for (var c in t) { if (Object.prototype.hasOwnProperty.call(t, c)) s += t[c]; }
    return s;
  }

  function copyTokens(t) {
    var o = zeroTokens();
    for (var c in t) { if (Object.prototype.hasOwnProperty.call(t, c)) o[c] = t[c]; }
    return o;
  }

  // ---------- 建局 ----------
  /**
   * 创建一局全新游戏状态。
   * opts: { rng, firstPlayer(0..n-1), aiLevel(1~6), playerCount(2|3|4),
   *         players:[{name,isAI,aiLevel,...},...]（自定义时优先） }
   * 默认 players 按 playerCount 生成：1 名玩家 + (N-1) 名电脑。
   */
  function createGame(opts) {
    opts = opts || {};
    var playerCount = opts.playerCount || (opts.players ? opts.players.length : 2);
    var players = opts.players || defaultPlayers(playerCount);
    var state = {
      players: players.map(function (p) {
        return {
          name: p.name,
          isAI: !!p.isAI,
          aiLevel: p.aiLevel || opts.aiLevel || 3, // 每个 AI 玩家可单独指定难度
          aiWeights: p.aiWeights || null,          // 自定义评分权重（训练/专家用）
          aiAccuracy: p.aiAccuracy !== undefined ? p.aiAccuracy : null, // 自定义准确度（实验/训练用）
          tokens: zeroTokens(),
          permanents: zeroTokens(),      // 永久宝石（发展卡提供）
          cards: [],                     // 已购买发展卡
          reserved: [],                  // 预留的发展卡
          nobles: [],                    // 已获得贵族
          score: 0,
          turnCount: 0,                  // 已完成的回合数
          lastAction: null               // 上一回合行动（结构化，UI 精确展示用）
        };
      }),
      currentPlayer: 0,
      phase: 'action',                   // action | discard | gameover
      bank: copyTokens(bankStartFor(playerCount)),
      decks: { 1: [], 2: [], 3: [] },
      board: { 1: [], 2: [], 3: [] },
      nobles: [],
      pendingNobles: [],                 // 待玩家选择的贵族（同一回合满足多个）
      turn: 1,                           // 回合序号（已完成回合数 + 1）
      endTriggerTurn: null,              // 达到 15 分时的回合数（终局判定用）
      gameOver: false,
      winner: null,                      // 玩家索引或 null（平局）
      log: [],
      selection: [],                     // 人类玩家本回合选择拿取的宝石（UI 用）
      aiLevel: opts.aiLevel || 3,        // 电脑默认难度 1~6（玩家级 aiLevel 优先）
      aiGoal: null,                      // AI 长期目标记忆（决策内部用）
      undoLeft: 3,                       // 单局可撤销上回合的次数
      snapshots: [],                     // 回合快照（撤销用）
      rng: opts.rng || Math.random
    };
    setupGame(state, opts);
    return state;
  }

  /** 默认玩家：1 名玩家 + (N-1) 名电脑 */
  function defaultPlayers(playerCount) {
    var list = [{ name: '玩家', isAI: false }];
    for (var i = 1; i < playerCount; i++) {
      list.push({ name: playerCount === 2 ? '电脑' : '电脑' + i, isAI: true });
    }
    return list;
  }

  /** 初始化：洗牌、发公开卡、放贵族、定先手 */
  function setupGame(state, opts) {
    opts = opts || {};
    // 洗牌
    var deck = D.buildDeck();
    state.decks = { 1: [], 2: [], 3: [] };
    deck.forEach(function (card) { state.decks[card.tier].push(card); });
    [1, 2, 3].forEach(function (t) { shuffle(state.decks[t], state.rng); });

    // 发公开卡：每层固定 4 个卡位（空位为 null，购买/预留后原位补牌）
    state.board = { 1: [null, null, null, null], 2: [null, null, null, null], 3: [null, null, null, null] };
    [1, 2, 3].forEach(function (t) { refillBoard(state, t); });

    // 贵族：玩家数 + 1 位
    var need = state.players.length + 1;
    var nobles = shuffle(D.NOBLES.slice(), state.rng).slice(0, need);
    state.nobles = nobles.map(function (n) {
      return { id: n.id, req: Object.assign({}, n.req), points: n.points, name: n.name };
    });

    // 先手
    state.currentPlayer = (opts.firstPlayer !== undefined) ? opts.firstPlayer
      : Math.floor(state.rng() * state.players.length);
    state.phase = 'action';
    state.pendingNobles = [];
    state.turn = 1;
    state.endTriggerTurn = null;
    state.gameOver = false;
    state.winner = null;
    state.selection = [];
    state.undoLeft = 3;          // 单局撤销次数
    state.snapshots = [];
    takeSnapshot(state);         // 开局快照（供撤销第一回合用）
  }

  // ---------- 回合撤销（容错） ----------
  /** 保存当前状态快照（纯数据深拷贝，最多保留最近 10 份） */
  function takeSnapshot(state) {
    var snap = JSON.parse(JSON.stringify({
      players: state.players,
      bank: state.bank,
      decks: state.decks,
      board: state.board,
      nobles: state.nobles,
      pendingNobles: state.pendingNobles,
      turn: state.turn,
      endTriggerTurn: state.endTriggerTurn,
      gameOver: state.gameOver,
      winner: state.winner,
      log: state.log,
      currentPlayer: state.currentPlayer,
      phase: state.phase,
      selection: state.selection
    }));
    state.snapshots.push(snap);
    if (state.snapshots.length > 10) state.snapshots.shift();
  }

  /**
   * 撤销上一回合：回到「上一个人类回合开始」的状态
   * （回滚人类最近一次操作及随后的 AI 行动），单局限 undoLeft 次。
   * 快照栈顶是当前人类回合开始的快照，先丢弃它，再恢复上一个。
   */
  function undoLastTurn(state) {
    if (state.undoLeft <= 0) return { ok: false, reason: '本局撤销次数已用完' };
    if (state.snapshots.length < 2) return { ok: false, reason: '当前没有可撤销的回合' };
    state.snapshots.pop(); // 丢弃当前人类回合的快照
    var snap = state.snapshots.pop(); // 恢复上一个人类回合开始
    var keys = ['players', 'bank', 'decks', 'board', 'nobles', 'pendingNobles',
      'turn', 'endTriggerTurn', 'gameOver', 'winner', 'log', 'currentPlayer', 'phase', 'selection'];
    for (var i = 0; i < keys.length; i++) state[keys[i]] = snap[keys[i]];
    state.undoLeft--;
    state.phase = 'action';
    state.selection = [];
    log(state, '—— 撤销上一回合（本局剩余 ' + state.undoLeft + ' 次）——');
    return { ok: true, left: state.undoLeft };
  }

  /** 从牌堆顶补一张公开卡（牌堆空则不再补） */
  function drawCard(state, tier) {
    if (state.decks[tier].length === 0) return null;
    return state.decks[tier].pop();
  }

  /**
   * 原位补牌：遍历 4 个固定卡位，空位（null）用牌堆顶新牌补上。
   * 哪一格被拿走，新牌就在哪一格出现；其余卡完全不动。
   */
  function refillBoard(state, tier) {
    for (var i = 0; i < BOARD_SIZE; i++) {
      if (state.board[tier][i] === null) {
        if (state.decks[tier].length > 0) {
          state.board[tier][i] = drawCard(state, tier);
        } else {
          break; // 牌堆已空：该槽保持空位
        }
      }
    }
  }

  // ---------- 日志 ----------
  function log(state, text) {
    state.log.push({ turn: state.turn, text: text });
    if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
  }

  // ---------- 拿宝石 ----------
  /**
   * 行动A/B：拿宝石。
   * colors: ['white','blue','green'] 或 ['red','red']（同色 2 枚）
   * 返回 { ok, reason? }
   */
  function takeTokens(state, playerIdx, colors) {
    var p = state.players[playerIdx];
    if (state.gameOver) return { ok: false, reason: '游戏已结束' };
    if (!Array.isArray(colors) || colors.length === 0) return { ok: false, reason: '未选择宝石' };

    // 校验：要么 3 种不同颜色，要么同色 2 枚
    var distinct = {};
    var total = 0;
    colors.forEach(function (c) {
      if (c === GOLD || COLORS.indexOf(c) < 0) return;
      distinct[c] = (distinct[c] || 0) + 1;
      total++;
    });
    var kinds = Object.keys(distinct).length;
    if (!(kinds === 3 && total === 3) && !(kinds === 1 && total === 2)) {
      return { ok: false, reason: '只能拿 3 种不同颜色各 1 枚，或同色 2 枚' };
    }
    if (kinds === 1 && total === 2) {
      var c = Object.keys(distinct)[0];
      if (state.bank[c] < 4) return { ok: false, reason: '公共区该颜色不足 4 枚，不能拿 2 枚' };
    }
    // 公共区数量检查
    for (var color in distinct) {
      if (state.bank[color] < distinct[color]) return { ok: false, reason: '公共区 ' + D.COLOR_META[color].name + ' 不足' };
    }
    // 应用
    colors.forEach(function (c) {
      if (c === GOLD || COLORS.indexOf(c) < 0) return;
      p.tokens[c]++;
      state.bank[c]--;
    });
    var names = Object.keys(distinct).map(function (c) { return D.COLOR_META[c].short + '×' + distinct[c]; }).join('、');
    log(state, p.name + ' 拿取宝石：' + names);
    // 结构化记录「上一回合行动」（UI 精确展示用）
    p.lastAction = { type: 'takeTokens', tokens: Object.assign({}, distinct) };
    return { ok: true };
  }

  // ---------- 预留 ----------
  /**
   * 行动C：预留发展卡。
   * cardId: 公开卡 id；或 fromDeck: 1|2|3 表示从该层牌堆盲抽。
   */
  function reserveCard(state, playerIdx, cardId, fromDeck) {
    var p = state.players[playerIdx];
    if (state.gameOver) return { ok: false, reason: '游戏已结束' };
    if (p.reserved.length >= MAX_RESERVED) return { ok: false, reason: '最多只能预留 ' + MAX_RESERVED + ' 张卡' };

    var card = null;
    var source = null; // 'board' | 'deck'
    if (fromDeck !== undefined && fromDeck !== null) {
      if (!state.decks[fromDeck] || state.decks[fromDeck].length === 0) {
        return { ok: false, reason: '该牌堆已空' };
      }
      card = state.decks[fromDeck].pop();
      source = 'deck';
    } else {
      var found = findCardInBoard(state, cardId);
      if (!found) return { ok: false, reason: '该卡不在场面上' };
      card = found;
      source = 'board';
      // 原位清空该卡位（固定卡位：哪格被拿走，新牌就在哪格补）
      var idx = state.board[card.tier].indexOf(card);
      if (idx >= 0) state.board[card.tier][idx] = null;
      refillBoard(state, card.tier);
    }

    p.reserved.push(card);
    // 预留获得黄金（公共区黄金仍有剩余时）
    var gotGold = false;
    if (state.bank[GOLD] > 0) {
      state.bank[GOLD]--;
      p.tokens[GOLD]++;
      gotGold = true;
    }
    log(state, p.name + ' 预留：第' + card.tier + '层发展卡' + (source === 'deck' ? '（盲抽）' : '') + (gotGold ? '，获得黄金×1' : ''));
    // 结构化记录「上一回合行动」（盲抽不泄露隐藏卡内容）
    if (source === 'deck') {
      p.lastAction = { type: 'reserveCard', hidden: true, level: card.tier, gainedGold: gotGold };
    } else {
      p.lastAction = {
        type: 'reserveCard', hidden: false,
        card: { id: card.id, tier: card.tier, bonus: card.bonus, points: card.points, cost: Object.assign({}, card.cost) },
        gainedGold: gotGold
      };
    }
    return { ok: true, gotGold: gotGold, card: card };
  }

  function findCardInBoard(state, cardId) {
    for (var t = 1; t <= 3; t++) {
      for (var i = 0; i < state.board[t].length; i++) {
        var c = state.board[t][i];
        if (c && c.id === cardId) return c;
      }
    }
    return null;
  }

  /** 查找卡牌所在位置：{ owner:'board'|'reserved', playerIdx, card } */
  function locateCard(state, cardId) {
    var b = findCardInBoard(state, cardId);
    if (b) return { owner: 'board', card: b };
    for (var i = 0; i < state.players.length; i++) {
      var r = state.players[i].reserved.filter(function (c) { return c.id === cardId; });
      if (r.length) return { owner: 'reserved', playerIdx: i, card: r[0] };
    }
    return null;
  }

  // ---------- 购买 ----------
  /** 某张卡对某玩家的实际剩余成本（扣除永久宝石折扣后） */
  function remainingCost(p, card) {
    var rem = {};
    for (var c in card.cost) {
      if (!Object.prototype.hasOwnProperty.call(card.cost, c)) continue;
      var need = card.cost[c] - (p.permanents[c] || 0);
      if (need > 0) rem[c] = need;
    }
    return rem;
  }

  /** 是否买得起（普通宝石先抵，缺口用黄金补） */
  function canAfford(p, card) {
    var rem = remainingCost(p, card);
    var goldNeed = 0;
    for (var c in rem) {
      var d = rem[c] - (p.tokens[c] || 0);
      if (d > 0) goldNeed += d;
    }
    return goldNeed <= (p.tokens[GOLD] || 0);
  }

  /** 实际支付方案（最少使用黄金）：{ tokens:{}, gold } */
  function paymentFor(p, card) {
    var rem = remainingCost(p, card);
    var pay = { tokens: {}, gold: 0 };
    var goldNeed = 0;
    for (var c in rem) {
      var use = Math.min(rem[c], p.tokens[c] || 0);
      if (use > 0) pay.tokens[c] = use;
      goldNeed += rem[c] - use;
    }
    pay.gold = goldNeed;
    return pay;
  }

  /**
   * 购买发展卡（场面上公开卡 或 自己预留的卡）。
   * 返回 { ok, reason?, nobles? }；nobles 为本次购买触发的贵族列表。
   */
  function buyCard(state, playerIdx, cardId) {
    var p = state.players[playerIdx];
    if (state.gameOver) return { ok: false, reason: '游戏已结束' };
    var loc = locateCard(state, cardId);
    if (!loc) return { ok: false, reason: '找不到这张卡' };
    if (loc.owner === 'reserved' && loc.playerIdx !== playerIdx) {
      return { ok: false, reason: '这是对方预留的卡' };
    }
    var card = loc.card;

    if (!canAfford(p, card)) {
      return { ok: false, reason: '资源不足，无法购买', rem: remainingCost(p, card) };
    }

    // 支付
    var pay = paymentFor(p, card);
    for (var c in pay.tokens) {
      p.tokens[c] -= pay.tokens[c];
      state.bank[c] += pay.tokens[c];
    }
    if (pay.gold > 0) {
      p.tokens[GOLD] -= pay.gold;
      state.bank[GOLD] += pay.gold;
    }

    // 移除卡牌（固定卡位：原位清空并原位补牌）
    if (loc.owner === 'board') {
      var idx = state.board[card.tier].indexOf(card);
      if (idx >= 0) state.board[card.tier][idx] = null;
      refillBoard(state, card.tier); // 立刻原位补牌
    } else {
      p.reserved = p.reserved.filter(function (c) { return c.id !== card.id; });
    }

    // 落袋
    p.cards.push(card);
    p.permanents[card.bonus]++;
    p.score += card.points;
    log(state, p.name + ' 购买：第' + card.tier + '层 ' + D.COLOR_META[card.bonus].name + '发展卡'
      + (card.points > 0 ? '（+' + card.points + '分）' : ''));

    // 结构化记录「上一回合行动」（含卡牌原始印刷成本，用于精确识别）
    p.lastAction = {
      type: 'buyCard',
      card: { id: card.id, tier: card.tier, bonus: card.bonus, points: card.points, cost: Object.assign({}, card.cost) },
      gainedNoble: null
    };

    // 购买后立即检查贵族
    var nobles = checkNobles(state, playerIdx);
    return { ok: true, nobles: nobles, card: card };
  }

  // ---------- 贵族 ----------
  /** 购买后调用：返回满足条件的贵族；1 位自动获得，多位进入待选 */
  function checkNobles(state, playerIdx) {
    var p = state.players[playerIdx];
    var eligible = state.nobles.filter(function (n) {
      for (var c in n.req) {
        if (!Object.prototype.hasOwnProperty.call(n.req, c)) continue;
        if ((p.permanents[c] || 0) < n.req[c]) return false;
      }
      return true;
    });
    if (eligible.length === 0) return [];
    if (eligible.length === 1) {
      grantNoble(state, playerIdx, eligible[0].id);
      return [eligible[0]];
    }
    state.pendingNobles = eligible.slice();
    return eligible.slice();
  }

  function grantNoble(state, playerIdx, nobleId) {
    var p = state.players[playerIdx];
    var idx = -1;
    for (var i = 0; i < state.nobles.length; i++) {
      if (state.nobles[i].id === nobleId) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, reason: '该贵族不存在' };
    var noble = state.nobles.splice(idx, 1)[0];
    p.nobles.push(noble);
    p.score += noble.points;
    state.pendingNobles = state.pendingNobles.filter(function (n) { return n.id !== nobleId; });
    log(state, p.name + ' 获得贵族：' + noble.name + '（+3分）');
    // 若是购买触发的贵族，追加到「上回合行动」（AI 区域可显示“并获得贵族”）
    if (p.lastAction && p.lastAction.type === 'buyCard') {
      p.lastAction.gainedNoble = { id: noble.id, name: noble.name, req: Object.assign({}, noble.req), points: noble.points };
    }
    return { ok: true, noble: noble };
  }

  /** 从待选贵族中选定一位（人类用弹窗，AI 自动选） */
  function chooseNoble(state, playerIdx, nobleId) {
    if (state.pendingNobles.length === 0) return { ok: false, reason: '当前没有待选贵族' };
    var found = state.pendingNobles.some(function (n) { return n.id === nobleId; });
    if (!found) return { ok: false, reason: '该贵族不在待选列表中' };
    // 只保留所选，其余留在公共区
    state.pendingNobles = state.pendingNobles.filter(function (n) { return n.id === nobleId; });
    return grantNoble(state, playerIdx, nobleId);
  }

  // ---------- 归还筹码 ----------
  /** 校验当前玩家是否存在任何合法行动（购买 / 预留 / 拿宝石） */
  function hasAnyLegalAction(state, playerIdx) {
    var p = state.players[playerIdx];
    // 购买（公开卡 + 自己预留卡）
    for (var t = 1; t <= 3; t++) {
      for (var i = 0; i < state.board[t].length; i++) {
        var c = state.board[t][i];
        if (c && canAfford(p, c)) return true;
      }
    }
    for (var j = 0; j < p.reserved.length; j++) {
      if (canAfford(p, p.reserved[j])) return true;
    }
    // 预留（公开卡或盲抽）
    if (p.reserved.length < MAX_RESERVED) {
      for (var t2 = 1; t2 <= 3; t2++) {
        var hasBoard = state.board[t2].some(function (cc) { return cc !== null; });
        if (hasBoard || state.decks[t2].length > 0) return true;
      }
    }
    // 拿宝石（3 种不同色各 1 枚，或某色 >=4 拿同色 2 枚）
    var countWith1 = 0, has4 = false;
    COLORS.forEach(function (c) {
      if (state.bank[c] >= 1) countWith1++;
      if (state.bank[c] >= 4) has4 = true;
    });
    if (countWith1 >= 3 || has4) return true;
    return false;
  }

  /**
   * 归还筹码（归还阶段使用）。
   * count 为负数时表示「撤销归还」：从公共区拿回 |count| 枚给玩家。
   */
  function returnTokens(state, playerIdx, color, count) {
    var p = state.players[playerIdx];
    count = count || 1;
    if (count < 0) {
      var back = -count;
      if ((state.bank[color] || 0) < back) return { ok: false, reason: '公共区该筹码不足' };
      p.tokens[color] += back;
      state.bank[color] -= back;
      return { ok: true, undid: true };
    }
    if ((p.tokens[color] || 0) < count) return { ok: false, reason: '没有足够的' + D.COLOR_META[color].name };
    p.tokens[color] -= count;
    state.bank[color] += count;
    return { ok: true };
  }

  /** 回合结束前的归还检查：返回是否必须归还 */
  function needDiscard(state, playerIdx) {
    return tokenTotal(state.players[playerIdx].tokens) > MAX_TOKENS;
  }

  /** 玩家手动确认归还完毕（总筹码 <= 10）后结束回合 */
  function finishDiscard(state, playerIdx) {
    if (tokenTotal(state.players[playerIdx].tokens) > MAX_TOKENS) {
      return { ok: false, reason: '筹码仍超过 ' + MAX_TOKENS + ' 枚' };
    }
    completeTurn(state);
    return { ok: true };
  }

  // ---------- 回合流转与终局 ----------
  /** 结束当前玩家的回合：切换玩家、计数、检查终局 */
  function completeTurn(state) {
    var p = state.players[state.currentPlayer];
    p.turnCount++;
    state.turn++;

    // 达到 15 分：记录触发回合，不立即结束
    if (state.endTriggerTurn === null && p.score >= WIN_SCORE) {
      state.endTriggerTurn = p.turnCount;
      log(state, p.name + ' 达到 ' + WIN_SCORE + ' 分！双方完成相同回合数后终局');
    }

    // 终局判定：所有玩家都完成了 >= 触发者回合数的回合
    if (state.endTriggerTurn !== null && state.players.every(function (pl) {
      return pl.turnCount >= state.endTriggerTurn;
    })) {
      finishGame(state);
      return;
    }

    // 下一位
    state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
    state.phase = 'action';
    state.pendingNobles = [];
    log(state, '—— 轮到 ' + state.players[state.currentPlayer].name + ' ——');
    // 人类回合开始：保存快照，供「撤销上一回合」使用
    if (!state.players[state.currentPlayer].isAI) {
      takeSnapshot(state);
    }
  }

  /** 终局结算 */
  function finishGame(state) {
    state.gameOver = true;
    state.phase = 'gameover';
    var best = null; // { idx, score, cards }
    var winnerIdx = null;
    var draw = false;
    state.players.forEach(function (p, i) {
      if (!best) { best = { score: p.score, cards: p.cards.length, idx: i }; winnerIdx = i; return; }
      if (p.score > best.score) {
        best = { score: p.score, cards: p.cards.length, idx: i };
        winnerIdx = i;
        draw = false;
      } else if (p.score === best.score) {
        if (p.cards.length < best.cards) {
          best = { score: p.score, cards: p.cards.length, idx: i };
          winnerIdx = i;
        } else if (p.cards.length === best.cards) {
          draw = true;
        }
      }
    });
    state.winner = draw ? null : winnerIdx;
    log(state, '游戏结束！' + (state.winner === null ? '双方平局' : state.players[state.winner].name + ' 获胜'));
  }

  // ---------- 重开 ----------
  /** 重新开始：彻底重置所有状态（保留难度与玩家设置） */
  function resetGame(state, opts) {
    var players = state.players.map(function (p) { return { name: p.name, isAI: p.isAI }; });
    var fresh = createGame(Object.assign({}, opts, { players: players, aiLevel: state.aiLevel }));
    for (var k in fresh) { state[k] = fresh[k]; }
    return state;
  }

  /** 校验一局状态的完整性（测试与调试用） */
  function checkInvariants(state) {
    var errs = [];
    // 无负数
    var allTokens = [state.bank].concat(state.players.map(function (p) { return p.tokens; }));
    allTokens.forEach(function (t, i) {
      for (var c in t) {
        if (t[c] < 0) errs.push('筹码为负: ' + (i === 0 ? 'bank' : 'player') + '.' + c + '=' + t[c]);
      }
    });
    // 牌堆 + 公开卡（仅非空卡位）+ 已购 + 预留 数量守恒
    var deckCount = { 1: 0, 2: 0, 3: 0 };
    [1, 2, 3].forEach(function (t) {
      deckCount[t] += state.decks[t].length;
      state.board[t].forEach(function (c) { if (c) deckCount[t]++; });
    });
    state.players.forEach(function (p) {
      p.cards.forEach(function (c) { deckCount[c.tier]++; });
      p.reserved.forEach(function (c) { deckCount[c.tier]++; });
    });
    var total = { 1: 40, 2: 30, 3: 20 };
    [1, 2, 3].forEach(function (t) {
      if (deckCount[t] !== total[t]) errs.push('第' + t + '层卡牌数量不守恒: ' + deckCount[t] + ' != ' + total[t]);
      if (state.board[t].length !== BOARD_SIZE) errs.push('第' + t + '层卡位数不等于 ' + BOARD_SIZE);
    });
    // 卡牌唯一性
    var ids = {};
    [1, 2, 3].forEach(function (t) {
      state.board[t].forEach(function (c) { if (c) ids[c.id] = (ids[c.id] || 0) + 1; });
    });
    state.players.forEach(function (p) {
      p.cards.forEach(function (c) { ids[c.id] = (ids[c.id] || 0) + 1; });
      p.reserved.forEach(function (c) { ids[c.id] = (ids[c.id] || 0) + 1; });
    });
    for (var id in ids) {
      if (ids[id] > 1) errs.push('卡牌重复: id=' + id + ' 出现 ' + ids[id] + ' 次');
    }
    // 分数 = 卡牌威望 + 贵族威望
    state.players.forEach(function (p, i) {
      var calc = 0;
      p.cards.forEach(function (c) { calc += c.points; });
      p.nobles.forEach(function (n) { calc += n.points; });
      if (p.score !== calc) errs.push('玩家' + i + ' 分数不符: ' + p.score + ' != ' + calc);
    });
    // 预留上限
    state.players.forEach(function (p, i) {
      if (p.reserved.length > MAX_RESERVED) errs.push('玩家' + i + ' 预留超过上限');
    });
    // 筹码守恒（普通宝石总数按人数：2人=20，3人=25，4人=35；黄金恒为 5）
    var norm = 0, gold = 0;
    allTokens.forEach(function (t) {
      COLORS.forEach(function (c) { norm += t[c]; });
      gold += t[GOLD];
    });
    var expectNorm = { 2: 20, 3: 25, 4: 35 }[state.players.length] || 20;
    if (norm !== expectNorm) errs.push('普通宝石总数不符: ' + norm + ' != ' + expectNorm);
    if (gold !== 5) errs.push('黄金总数不符: ' + gold);
    return errs;
  }

  return {
    COLORS: COLORS,
    GOLD: GOLD,
    MAX_RESERVED: MAX_RESERVED,
    MAX_TOKENS: MAX_TOKENS,
    WIN_SCORE: WIN_SCORE,
    BOARD_SIZE: BOARD_SIZE,
    BANK_BY_PLAYERS: BANK_BY_PLAYERS,
    bankStartFor: bankStartFor,
    createGame: createGame,
    setupGame: setupGame,
    shuffle: shuffle,
    takeTokens: takeTokens,
    reserveCard: reserveCard,
    locateCard: locateCard,
    findCardInBoard: findCardInBoard,
    remainingCost: remainingCost,
    canAfford: canAfford,
    paymentFor: paymentFor,
    buyCard: buyCard,
    checkNobles: checkNobles,
    grantNoble: grantNoble,
    chooseNoble: chooseNoble,
    returnTokens: returnTokens,
    needDiscard: needDiscard,
    finishDiscard: finishDiscard,
    hasAnyLegalAction: hasAnyLegalAction,
    takeSnapshot: takeSnapshot,
    undoLastTurn: undoLastTurn,
    completeTurn: completeTurn,
    finishGame: finishGame,
    resetGame: resetGame,
    checkInvariants: checkInvariants,
    tokenTotal: tokenTotal,
    log: log
  };
});
