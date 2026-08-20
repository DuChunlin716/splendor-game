/* ============================================================
 * data.js —— 《璀璨宝石》数据定义
 * 内容：宝石定义、官方基础版发展卡牌库（L1×40 / L2×30 / L3×20）、
 *       10 位官方贵族、卡牌插画（Unicode 图标池）。
 *
 * 牌库数值来源：splendor_base_data.js（Splendor 基础版官方数据）。
 * 兼容浏览器 <script> 与 Node.js require() 两种加载方式。
 * ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SplendorData = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- 五种普通宝石 + 黄金（Joker） ----
  var COLORS = ['white', 'blue', 'green', 'red', 'black'];

  var COLOR_META = {
    white: { name: '白钻石', short: '白', en: 'Diamond' },
    blue:  { name: '蓝宝石', short: '蓝', en: 'Sapphire' },
    green: { name: '祖母绿', short: '绿', en: 'Emerald' },
    red:   { name: '红宝石', short: '红', en: 'Ruby' },
    black: { name: '玛瑙',   short: '黑', en: 'Onyx' },
    gold:  { name: '黄金',   short: '金', en: 'Gold' }
  };

  // ---- 10 位官方贵族（数值来源：splendor_base_data.js；每位 3 分） ----
  var NOBLES = [
    { id: 'n1',  req: { white: 3, blue: 3, black: 3 },            points: 3, name: '亚历珊德拉女王' },
    { id: 'n2',  req: { blue: 3, green: 3, red: 3 },              points: 3, name: '萨拉丁苏丹' },
    { id: 'n3',  req: { white: 3, red: 3, black: 3 },             points: 3, name: '伊莎贝拉王后' },
    { id: 'n4',  req: { green: 4, red: 4 },                       points: 3, name: '玛格丽特皇后' },
    { id: 'n5',  req: { blue: 4, green: 4 },                      points: 3, name: '凯瑟琳女伯爵' },
    { id: 'n6',  req: { red: 4, black: 4 },                       points: 3, name: '卡西米尔公爵' },
    { id: 'n7',  req: { white: 4, black: 4 },                     points: 3, name: '弗雷德里克公爵' },
    { id: 'n8',  req: { white: 3, blue: 3, green: 3 },            points: 3, name: '詹姆斯国王' },
    { id: 'n9',  req: { green: 3, red: 3, black: 3 },             points: 3, name: '索菲亚大公' },
    { id: 'n10', req: { white: 4, blue: 4 },                      points: 3, name: '玛利亚公爵夫人' }
  ];

  // ---- 卡牌插画池（按永久宝石颜色主题，Unicode 图标） ----
  var ART_POOL = {
    white: ['🕊️', '❄️', '🪶', '⭐', '🌙', '🦢'],
    blue:  ['💧', '🌊', '🐬', '🦋', '🧊', '🐳'],
    green: ['🍀', '🌿', '🐸', '🦎', '🦜', '🐢'],
    red:   ['🔥', '🌹', '🦊', '🐞', '🍎', '🦩'],
    black: ['🌑', '🐈‍⬛', '🦇', '🐺', '🐾', '🕷️']
  };
  var NOBLE_ART = ['👑', '🤴', '👸', '🧙‍♀️', '🐉', '🦅', '🦁', '🦚', '🐎', '⚜️'];

  // ---- 官方基础版发展卡 90 张（数值来源：splendor_base_data.js） ----
  // 字段：t=层数 1/2/3，b=永久宝石颜色，p=威望分，c=成本{颜色:数量}
  var OFFICIAL_CARDS = [
    { "t": 1, "b": "white", "p": 0, "c": { "blue": 1, "green": 1, "red": 1, "black": 1 } },
    { "t": 1, "b": "white", "p": 0, "c": { "blue": 1, "green": 2, "red": 1, "black": 1 } },
    { "t": 1, "b": "white", "p": 0, "c": { "blue": 2, "green": 2, "black": 1 } },
    { "t": 1, "b": "white", "p": 0, "c": { "white": 3, "blue": 1, "black": 1 } },
    { "t": 1, "b": "white", "p": 0, "c": { "red": 2, "black": 1 } },
    { "t": 1, "b": "white", "p": 0, "c": { "blue": 2, "black": 2 } },
    { "t": 1, "b": "white", "p": 0, "c": { "blue": 3 } },
    { "t": 1, "b": "white", "p": 1, "c": { "green": 4 } },
    { "t": 1, "b": "blue", "p": 0, "c": { "white": 1, "green": 1, "red": 1, "black": 1 } },
    { "t": 1, "b": "blue", "p": 0, "c": { "white": 1, "green": 1, "red": 2, "black": 1 } },
    { "t": 1, "b": "blue", "p": 0, "c": { "white": 1, "green": 2, "red": 2 } },
    { "t": 1, "b": "blue", "p": 0, "c": { "blue": 1, "green": 3, "red": 1 } },
    { "t": 1, "b": "blue", "p": 0, "c": { "white": 1, "black": 2 } },
    { "t": 1, "b": "blue", "p": 0, "c": { "green": 2, "black": 2 } },
    { "t": 1, "b": "blue", "p": 0, "c": { "black": 3 } },
    { "t": 1, "b": "blue", "p": 1, "c": { "red": 4 } },
    { "t": 1, "b": "green", "p": 0, "c": { "white": 1, "blue": 1, "red": 1, "black": 1 } },
    { "t": 1, "b": "green", "p": 0, "c": { "white": 1, "blue": 1, "red": 1, "black": 2 } },
    { "t": 1, "b": "green", "p": 0, "c": { "blue": 1, "red": 2, "black": 2 } },
    { "t": 1, "b": "green", "p": 0, "c": { "white": 1, "blue": 3, "green": 1 } },
    { "t": 1, "b": "green", "p": 0, "c": { "white": 2, "blue": 1 } },
    { "t": 1, "b": "green", "p": 0, "c": { "blue": 2, "red": 2 } },
    { "t": 1, "b": "green", "p": 0, "c": { "red": 3 } },
    { "t": 1, "b": "green", "p": 1, "c": { "black": 4 } },
    { "t": 1, "b": "red", "p": 0, "c": { "white": 1, "blue": 1, "green": 1, "black": 1 } },
    { "t": 1, "b": "red", "p": 0, "c": { "white": 2, "blue": 1, "green": 1, "black": 1 } },
    { "t": 1, "b": "red", "p": 0, "c": { "white": 2, "green": 1, "black": 2 } },
    { "t": 1, "b": "red", "p": 0, "c": { "white": 1, "red": 1, "black": 3 } },
    { "t": 1, "b": "red", "p": 0, "c": { "blue": 2, "green": 1 } },
    { "t": 1, "b": "red", "p": 0, "c": { "white": 2, "red": 2 } },
    { "t": 1, "b": "red", "p": 0, "c": { "white": 3 } },
    { "t": 1, "b": "red", "p": 1, "c": { "white": 4 } },
    { "t": 1, "b": "black", "p": 0, "c": { "white": 1, "blue": 1, "green": 1, "red": 1 } },
    { "t": 1, "b": "black", "p": 0, "c": { "white": 1, "blue": 2, "green": 1, "red": 1 } },
    { "t": 1, "b": "black", "p": 0, "c": { "white": 2, "blue": 2, "red": 1 } },
    { "t": 1, "b": "black", "p": 0, "c": { "green": 1, "red": 3, "black": 1 } },
    { "t": 1, "b": "black", "p": 0, "c": { "green": 2, "red": 1 } },
    { "t": 1, "b": "black", "p": 0, "c": { "white": 2, "green": 2 } },
    { "t": 1, "b": "black", "p": 0, "c": { "green": 3 } },
    { "t": 1, "b": "black", "p": 1, "c": { "blue": 4 } },
    { "t": 2, "b": "white", "p": 1, "c": { "green": 3, "red": 2, "black": 2 } },
    { "t": 2, "b": "white", "p": 1, "c": { "white": 2, "blue": 3, "red": 3 } },
    { "t": 2, "b": "white", "p": 2, "c": { "green": 1, "red": 4, "black": 2 } },
    { "t": 2, "b": "white", "p": 2, "c": { "red": 5, "black": 3 } },
    { "t": 2, "b": "white", "p": 2, "c": { "red": 5 } },
    { "t": 2, "b": "white", "p": 3, "c": { "white": 6 } },
    { "t": 2, "b": "blue", "p": 1, "c": { "blue": 2, "green": 2, "red": 3 } },
    { "t": 2, "b": "blue", "p": 1, "c": { "blue": 2, "green": 3, "black": 3 } },
    { "t": 2, "b": "blue", "p": 2, "c": { "white": 5, "blue": 3 } },
    { "t": 2, "b": "blue", "p": 2, "c": { "white": 2, "red": 1, "black": 4 } },
    { "t": 2, "b": "blue", "p": 2, "c": { "blue": 5 } },
    { "t": 2, "b": "blue", "p": 3, "c": { "blue": 6 } },
    { "t": 2, "b": "green", "p": 1, "c": { "white": 3, "green": 2, "red": 3 } },
    { "t": 2, "b": "green", "p": 1, "c": { "white": 2, "blue": 3, "black": 2 } },
    { "t": 2, "b": "green", "p": 2, "c": { "white": 4, "blue": 2, "black": 1 } },
    { "t": 2, "b": "green", "p": 2, "c": { "blue": 5, "green": 3 } },
    { "t": 2, "b": "green", "p": 2, "c": { "green": 5 } },
    { "t": 2, "b": "green", "p": 3, "c": { "green": 6 } },
    { "t": 2, "b": "red", "p": 1, "c": { "white": 2, "red": 2, "black": 3 } },
    { "t": 2, "b": "red", "p": 1, "c": { "blue": 3, "red": 2, "black": 3 } },
    { "t": 2, "b": "red", "p": 2, "c": { "white": 1, "blue": 4, "green": 2 } },
    { "t": 2, "b": "red", "p": 2, "c": { "white": 3, "black": 5 } },
    { "t": 2, "b": "red", "p": 2, "c": { "black": 5 } },
    { "t": 2, "b": "red", "p": 3, "c": { "red": 6 } },
    { "t": 2, "b": "black", "p": 1, "c": { "white": 3, "blue": 2, "green": 2 } },
    { "t": 2, "b": "black", "p": 1, "c": { "white": 3, "green": 3, "black": 2 } },
    { "t": 2, "b": "black", "p": 2, "c": { "blue": 1, "green": 4, "red": 2 } },
    { "t": 2, "b": "black", "p": 2, "c": { "green": 5, "red": 3 } },
    { "t": 2, "b": "black", "p": 2, "c": { "white": 5 } },
    { "t": 2, "b": "black", "p": 3, "c": { "black": 6 } },
    { "t": 3, "b": "white", "p": 3, "c": { "blue": 3, "green": 3, "red": 5, "black": 3 } },
    { "t": 3, "b": "white", "p": 4, "c": { "black": 7 } },
    { "t": 3, "b": "white", "p": 4, "c": { "white": 3, "red": 3, "black": 6 } },
    { "t": 3, "b": "white", "p": 5, "c": { "white": 3, "black": 7 } },
    { "t": 3, "b": "blue", "p": 3, "c": { "white": 3, "green": 3, "red": 3, "black": 5 } },
    { "t": 3, "b": "blue", "p": 4, "c": { "white": 7 } },
    { "t": 3, "b": "blue", "p": 4, "c": { "white": 6, "blue": 3, "black": 3 } },
    { "t": 3, "b": "blue", "p": 5, "c": { "white": 7, "blue": 3 } },
    { "t": 3, "b": "green", "p": 3, "c": { "white": 5, "blue": 3, "red": 3, "black": 3 } },
    { "t": 3, "b": "green", "p": 4, "c": { "blue": 7 } },
    { "t": 3, "b": "green", "p": 4, "c": { "white": 3, "blue": 6, "green": 3 } },
    { "t": 3, "b": "green", "p": 5, "c": { "blue": 7, "green": 3 } },
    { "t": 3, "b": "red", "p": 3, "c": { "white": 3, "blue": 5, "green": 3, "black": 3 } },
    { "t": 3, "b": "red", "p": 4, "c": { "green": 7 } },
    { "t": 3, "b": "red", "p": 4, "c": { "blue": 3, "green": 6, "red": 3 } },
    { "t": 3, "b": "red", "p": 5, "c": { "green": 7, "red": 3 } },
    { "t": 3, "b": "black", "p": 3, "c": { "white": 3, "blue": 3, "green": 5, "red": 3 } },
    { "t": 3, "b": "black", "p": 4, "c": { "red": 7 } },
    { "t": 3, "b": "black", "p": 4, "c": { "green": 3, "red": 6, "black": 3 } },
    { "t": 3, "b": "black", "p": 5, "c": { "red": 7, "black": 3 } }
  ];

  /** 构建发展卡牌库（转为游戏对象并分配插画） */
  function buildDeck() {
    var cards = [];
    for (var i = 0; i < OFFICIAL_CARDS.length; i++) {
      var s = OFFICIAL_CARDS[i];
      var cost = {};
      for (var c in s.c) { if (Object.prototype.hasOwnProperty.call(s.c, c)) cost[c] = s.c[c]; }
      cards.push({
        id: i,
        tier: s.t,
        bonus: s.b,        // 永久宝石颜色
        cost: cost,        // { color: 数量 }
        points: s.p,       // 威望分
        art: pickArt(s.b, i) // 卡面插画（按卡 id 确定性分配）
      });
    }
    return cards;
  }

  /** 插画分配：按颜色主题池 + 卡 id 轮转 */
  function pickArt(bonus, idx) {
    var pool = ART_POOL[bonus] || ['💎'];
    return pool[idx % pool.length];
  }

  /** 贵族插画（按贵族序号） */
  function nobleArt(nobleIdx) {
    return NOBLE_ART[nobleIdx % NOBLE_ART.length];
  }

  /** 成本总额 */
  function costTotal(cost) {
    var s = 0;
    for (var c in cost) { if (Object.prototype.hasOwnProperty.call(cost, c)) s += cost[c]; }
    return s;
  }

  /** 按成本排序（从小到大），返回成本数组副本 */
  function costEntries(cost) {
    var arr = [];
    for (var c in cost) {
      if (Object.prototype.hasOwnProperty.call(cost, c) && cost[c] > 0) arr.push({ color: c, n: cost[c] });
    }
    arr.sort(function (a, b) { return a.n - b.n; });
    return arr;
  }

  return {
    COLORS: COLORS,
    COLOR_META: COLOR_META,
    NOBLES: NOBLES,
    ART_POOL: ART_POOL,
    OFFICIAL_CARDS: OFFICIAL_CARDS,
    buildDeck: buildDeck,
    nobleArt: nobleArt,
    costTotal: costTotal,
    costEntries: costEntries
  };
});
