/* ============================================================
 * ui.js —— 《璀璨宝石》界面层（DOM 渲染 + 事件 + 弹窗 + 音效）
 *
 * 游戏逻辑全部在 game.js / ai.js 中，本文件只负责：
 *   - 根据 gameState 渲染界面
 *   - 把用户点击翻译成 game.js 的函数调用
 *   - 弹窗（购买/预留/贵族选择/归还筹码/规则/结算）
 *   - 简易 WebAudio 音效（可开关）
 * ============================================================ */
(function () {
  'use strict';

  var D = window.SplendorData;
  var G = window.SplendorGame;
  var AI = window.SplendorAI;
  var CFG = window.SplendorAIConfig || null;

  var st = null;          // 当前 gameState
  var currentLevel = 2;   // 主菜单选择的难度（默认「简单」，文档要求）
  var currentPlayers = 2; // 主菜单选择的人数（2/3/4）
  var netMode = false;    // 联机模式（服务器权威，操作改为发送指令）
  var mySeat = 0;         // 联机时我的座位号（服务器广播；单机恒为 0）
  var netLevel = 2;       // 联机大厅：AI 难度
  var netPlayers = 2;     // 联机大厅：房间人数
  var lastNetAIMask = null; // 上次广播各座位 AI 标记（识别「掉线托管」）
  var discardOpen = false;  // 归还弹窗是否打开（联机广播驱动，防重复打开）
  var nobleOpen = false;    // 贵族选择弹窗是否打开
  var artPreloadImages = [];
  var ART_MANIFESTS = [
    'assets/art/v1/nobles/manifest.json',
    'assets/art/v1/cards/manifest.json',
    'assets/art/v1/decks/manifest.json',
    'assets/art/v1/gems/manifest.json',
    'assets/art/v1/table/manifest.json'
  ];

  function preloadArtAssets() {
    if (typeof fetch !== 'function' || typeof Image === 'undefined') return;
    var warm = function () {
      ART_MANIFESTS.forEach(function (manifestPath) {
        fetch(manifestPath).then(function (res) {
          if (!res.ok) throw new Error('美术清单加载失败：' + manifestPath);
          return res.json();
        }).then(function (manifest) {
          var base = manifestPath.replace(/manifest\.json$/, '');
          (manifest.assets || []).forEach(function (asset) {
            if (!asset.file) return;
            var img = new Image();
            img.decoding = 'async';
            img.src = base + asset.file;
            artPreloadImages.push(img);
          });
        }).catch(function () { /* 预加载失败不阻断游戏，CSS仍会按需加载。 */ });
      });
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 1200 });
    else setTimeout(warm, 80);
  }
  var netActionPending = false; // 联机操作提交后等待服务器状态，防止高延迟下重复点击
  var gen = 0;            // 代际计数：重开时 +1，作废旧的 AI 定时器
  var lastBoardSlots = {}; // 每层各卡位上一帧的卡 id（识别原位补的新牌）
  var aiTimer = null;
  var soundOn = true;
  var audioCtx = null;
  var endBannerShown = false; // 终局横幅只显示一次

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function humanIdx() { return mySeat; } // 单机固定 0；联机为服务器广播的座位号

  function netConnected() {
    var net = window.SplendorNet;
    return !netMode || !!(net && net.connected);
  }
  function isHumanTurn() {
    return !st.gameOver && st.currentPlayer === humanIdx() && st.phase === 'action' &&
      netConnected() && !netActionPending;
  }
  function isAITurn() { return !st.gameOver && st.players[st.currentPlayer].isAI; }

  /* ---------------- 音效 ---------------- */
  function playSound(kind) {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var cfg = {
        take: [660, 520], buy: [523, 784], noble: [523, 659, 784],
        win: [523, 659, 784, 1046], lose: [330, 262], click: [880], error: [200]
      };
      var notes = cfg[kind] || cfg.click;
      var t = audioCtx.currentTime;
      notes.forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        o.connect(g); g.connect(audioCtx.destination);
        var tt = t + i * 0.09;
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.12, tt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.22);
        o.start(tt); o.stop(tt + 0.25);
      });
    } catch (e) { /* 忽略音效错误 */ }
  }

  /* ---------------- 回合横幅（回合开始/结束反馈） ---------------- */
  var bannerRoot = null;
  var lastBanner = '';
  function showBanner(text, type) {
    if (!bannerRoot) {
      bannerRoot = document.createElement('div');
      bannerRoot.className = 'banner-root';
      document.body.appendChild(bannerRoot);
    }
    if (text === lastBanner) return; // 同一内容不重复弹
    lastBanner = text;
    var el = document.createElement('div');
    el.className = 'banner ' + (type || 'info');
    el.innerHTML = text;
    bannerRoot.appendChild(el);
    el.addEventListener('animationend', function () { el.remove(); });
  }

  /* ---------------- 提示浮层 ---------------- */
  var toastTimer = null;
  function flash(msg) {
    var el = $('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  /* ---------------- 弹窗 ---------------- */
  function showModal(html, closeable) {
    var mask = $('modal-mask'), box = $('modal-box');
    box.innerHTML = html;
    mask.classList.remove('hidden');
    mask.dataset.closeable = closeable === false ? '0' : '1';
  }
  function hideModal() {
    $('modal-mask').classList.add('hidden');
    discardOpen = false;
    nobleOpen = false;
  }
  function modalOpen() { return !$('modal-mask').classList.contains('hidden'); }

  /* ---------------- 渲染：牌/宝石/贵族 HTML ---------------- */
  function gemHTML(color, sizeClass) {
    return '<i class="gem g-' + color + (sizeClass ? ' ' + sizeClass : '') + '"></i>';
  }

  function noblePortraitClass(n) {
    var id = String(n && n.id || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (/^n(?:10|[1-9])$/.test(id)) return 'portrait-' + id;
    return /女|王后|皇后|伯爵|索菲亚|玛利亚|亚历珊德拉|伊莎贝拉|玛格丽特|凯瑟琳/.test(n.name)
      ? 'portrait-female' : 'portrait-male';
  }

  function cardHTML(card, opts) {
    opts = opts || {};
    var meta = D.COLOR_META[card.bonus];
    var artKey = String(card.artKey || ('t' + card.tier + '-' + card.bonus)).replace(/[^a-z0-9_-]/g, '');
    var cls = 'card tier-' + card.tier + ' art-tier-' + card.tier + ' art-' + artKey + ' bonus-' + card.bonus;
    if (opts.affordable) cls += ' affordable';
    if (opts.mine) cls += ' mine';
    if (opts.fresh) cls += ' fresh';
    var costHtml = D.costEntries(card.cost).map(function (e) {
      return '<span class="cost-item"><i class="gem g-' + e.color + '"></i><b>' + e.n + '</b></span>';
    }).join('');
    if (opts.mini) {
      // 迷你卡（预留区）：紧凑布局，绝不裁剪，可点击查看详情
      return '<div class="' + cls + ' mini" data-card-id="' + card.id + '" title="点击查看卡牌详情">' +
        '<div class="card-top">' +
        '<span class="pts">' + card.points + '</span>' +
        '<span class="bonus">' + gemHTML(card.bonus) + '</span>' +
        '</div>' +
        '<div class="card-cost">' + (costHtml || '<span class="free">免费</span>') + '</div>' +
        '</div>';
    }
    return '<div class="' + cls + '" data-card-id="' + card.id + '">' +
      '<div class="card-top">' +
      '<span class="pts">' + card.points + '</span>' +
      '<span class="bonus">' + gemHTML(card.bonus) + '</span>' +
      '</div>' +
      '<div class="card-art" title="' + esc(meta.name) + '发展卡">' +
      '<span class="card-art-fallback">' + (card.art || '💎') + '</span>' +
      '</div>' +
      '<div class="card-mid"><span class="tier-tag">L' + card.tier + '</span>' +
      '<span class="bonus-name">' + meta.name + '</span></div>' +
      '<div class="card-cost">' + (costHtml || '<span class="free">免费</span>') + '</div>' +
      '</div>';
  }

  function nobleHTML(n, idx) {
    var reqs = D.costEntries(n.req).map(function (e) {
      return '<span class="nreq"><i class="gem g-' + e.color + '"></i><b>' + e.n + '</b></span>';
    }).join('');
    return '<div class="noble" data-noble-id="' + n.id + '" title="满足要求自动获得，+3 分">' +
      '<div class="noble-art ' + noblePortraitClass(n) + '"></div>' +
      '<div class="noble-name">' + esc(n.name) + '</div>' +
      '<div class="noble-pts">+3 分</div>' +
      '<div class="noble-req">' + reqs + '</div>' +
      '</div>';
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    renderHeader();
    renderStatus();
    renderNobles();
    renderTiers();
    renderBank();
    renderPlayers();   // 先渲染座位（其中包含操作按钮/已选列表）
    renderSelection(); // 再更新选择区
    renderLog();
    renderMobile();    // 手机端独立渲染层，与桌面端共享同一 gameState
  }

  function renderHeader() {
    $('turn-num').textContent = st.turn;
    var tp = $('turn-player');
    if (st.gameOver) { tp.textContent = '游戏结束'; }
    else if (st.phase === 'discard') { tp.textContent = st.players[st.currentPlayer].name + ' · 归还筹码'; }
    else if (isAITurn()) { tp.textContent = st.players[st.currentPlayer].name + ' · 思考中…'; }
    else { tp.textContent = st.players[st.currentPlayer].name + ' · 行动中'; }
    // 动态分数徽章（2/3/4 人）
    var sb = $('scoreboard');
    var badges = st.players.map(function (p, i) {
      return '<div class="scorechip' + (p.isAI ? ' ai' : ' human') + (st.currentPlayer === i ? ' active' : '') + '" data-pidx="' + i + '">' +
        '<span class="who">' + esc(p.name) + '</span>' +
        '<span class="pts">' + p.score + '</span></div>';
    }).join('');
    if (sb.innerHTML !== badges) sb.innerHTML = badges;
    // 顶栏难度标签（成就感）
    var dl = $('diff-label');
    if (dl) {
      var lv = st.players.filter(function (p) { return p.isAI; }).map(function (p) { return p.aiLevel; })[0];
      dl.textContent = '难度 · ' + levelLabel(lv || currentLevel);
    }
    // 撤销按钮状态（联机模式服务器权威，不支持撤销）
    var undoBtn = $('btn-undo');
    if (undoBtn) {
      if (netMode) { undoBtn.style.display = 'none'; }
      else {
        undoBtn.style.display = '';
        undoBtn.textContent = '↩ 撤销 ×' + st.undoLeft;
        undoBtn.disabled = st.gameOver || st.phase !== 'action' ||
          st.currentPlayer !== humanIdx() || st.undoLeft <= 0;
      }
    }
    var restartBtn = $('btn-restart');
    if (restartBtn) {
      var roomNet = window.SplendorNet;
      restartBtn.style.display = netMode && (!roomNet || roomNet.mySeat !== 0) ? 'none' : '';
    }
    // 联机房间码徽章
    var nb = $('net-badge');
    if (nb) {
      var net = window.SplendorNet;
      nb.textContent = '🌐 房间 ' + (net && net.roomId ? net.roomId : '—');
      nb.style.display = netMode ? '' : 'none';
    }
  }

  function renderStatus() {
    var el = $('status-line');
    var bankPanel = $('table-bank') || null;
    if (st.gameOver) { el.textContent = '游戏已结束，点击「重新开始」再来一局'; el.className = 'statusline over'; if (bankPanel) bankPanel.classList.remove('your-turn'); return; }
    if (st.phase === 'discard') { el.textContent = '筹码超过 10 枚，请归还筹码'; el.className = 'statusline warn'; if (bankPanel) bankPanel.classList.remove('your-turn'); return; }
    if (!netConnected()) { el.textContent = '网络连接正在恢复，暂时不能操作'; el.className = 'statusline warn'; if (bankPanel) bankPanel.classList.remove('your-turn'); return; }
    if (netActionPending) { el.textContent = '操作已提交，正在等待服务器确认…'; el.className = 'statusline ai'; if (bankPanel) bankPanel.classList.remove('your-turn'); return; }
    if (isAITurn()) { el.textContent = '电脑正在思考……'; el.className = 'statusline ai'; if (bankPanel) bankPanel.classList.remove('your-turn'); return; }
    if (st.currentPlayer !== humanIdx()) { el.textContent = '等待 ' + st.players[st.currentPlayer].name + ' 行动…'; el.className = 'statusline ai'; if (bankPanel) bankPanel.classList.remove('your-turn'); return; }
    el.textContent = '轮到你行动：拿宝石 / 预留卡 / 购买卡'; el.className = 'statusline go';
    if (bankPanel) bankPanel.classList.add('your-turn'); // 轮到玩家时宝石池脉冲提示
  }

  function renderNobles() {
    var box = $('nobles');
    $('nobles-count').textContent = st.nobles.length > 0 ? '（余 ' + st.nobles.length + ' 位）' : '';
    box.innerHTML = st.nobles.length === 0
      ? '<div class="nobles-empty">无</div>'
      : st.nobles.map(function (n, i) { return nobleHTML(n, i); }).join('');
  }

  function renderTiers() {
    var tiers = [3, 2, 1];
    tiers.forEach(function (t) {
      var box = $('tier-' + t);
      var deckLeft = st.decks[t].length;
      // 固定卡位：记录上一帧各槽卡 id，识别「原位补的新牌」做淡入动画
      var prevSlots = lastBoardSlots[t] || [null, null, null, null];
      var freshIds = {};
      for (var s = 0; s < G.BOARD_SIZE; s++) {
        if (!prevSlots[s] && st.board[t][s]) freshIds[st.board[t][s].id] = true;
      }
      lastBoardSlots[t] = st.board[t].map(function (c) { return c ? c.id : null; });
      // 渲染 4 个固定卡位（空位 = null 槽）
      var cards = '';
      for (var i = 0; i < G.BOARD_SIZE; i++) {
        var card = st.board[t][i];
        if (card) {
          var afford = isHumanTurn() && G.canAfford(st.players[humanIdx()], card);
          cards += cardHTML(card, { affordable: afford, fresh: !!freshIds[card.id] });
        } else {
          cards += '<div class="card slot-empty"></div>';
        }
      }
      // 盲抽预留：点击「牌堆背面」摸一张（与牌堆关联，仅玩家回合可用）
      var blindDisabled = !isHumanTurn() || deckLeft === 0 || st.players[humanIdx()].reserved.length >= G.MAX_RESERVED;
      box.innerHTML =
        '<div class="tier-head">' +
        '<span class="tier-name">第 ' + t + ' 层</span>' +
        '<span class="deck-count">剩余 ' + deckLeft + ' 张</span>' +
        '</div>' +
        '<div class="deck-stack tier-' + t + '"' + (blindDisabled ? ' style="opacity:.35;cursor:default;pointer-events:none"' : '') +
        ' onclick="UI.openBlindReserveConfirm(' + t + ')" title="从牌堆顶盲抽一张预留（获得黄金）"></div>' +
        '<div class="tier-cards">' + cards + '</div>';
    });
  }

  function renderBank() {
    var box = $('bank');
    var html = '';
    G.COLORS.forEach(function (c) {
      var sel = st.selection.indexOf(c) >= 0 ? ' selected' : '';
      html += '<button class="bank-gem' + sel + '" data-color="' + c + '" title="' + D.COLOR_META[c].name + '">' +
        gemHTML(c, 'big') + '<span class="cnt">' + st.bank[c] + '</span></button>';
    });
    var goldSel = st.selection.indexOf(G.GOLD) >= 0 ? ' selected' : '';
    html += '<button class="bank-gem gold' + goldSel + '" data-color="gold" title="黄金（预留获得，不能直接拿）">' +
      gemHTML('gold', 'big') + '<span class="cnt">' + st.bank.gold + '</span></button>';
    box.innerHTML = html;
    // 操作区（与宝石池同处，靠近拿取操作）
    var ops = $('take-ops');
    if (ops) {
      ops.innerHTML =
        '<div class="sel-hint">本回合已选择：<span id="sel-list">（无）</span></div>' +
        '<div class="sel-btns">' +
        '<button id="btn-confirm-take" class="btn primary" disabled>确认拿取</button>' +
        '<button id="btn-clear-take" class="btn ghost">取消选择</button>' +
        '</div>';
    }
  }

  /** 选宝石即时反馈：高亮已选 + 点击弹跳动画（不重建整个宝石池） */
  function updateBankSelection(clickedColor) {
    var box = $('bank');
    var gems = box.querySelectorAll('.bank-gem');
    for (var i = 0; i < gems.length; i++) {
      var c = gems[i].dataset.color;
      var isSel = st.selection.indexOf(c) >= 0;
      gems[i].classList.toggle('selected', isSel);
      if (c === clickedColor) {
        gems[i].classList.remove('picked');
        void gems[i].offsetWidth; // 强制重排以重启动画
        gems[i].classList.add('picked');
      }
    }
    renderSelection(true);
    renderMobileBank();
    renderMobileSelection();
  }

  function selectionValid() {
    var s = st.selection;
    if (s.length === 3) {
      var uniq = {};
      s.forEach(function (c) { uniq[c] = true; });
      return Object.keys(uniq).length === 3 && s.every(function (c) { return st.bank[c] > 0; });
    }
    if (s.length === 2) return s[0] === s[1] && st.bank[s[0]] >= 4;
    return false;
  }

  function renderSelection(pulse) {
    var s = st.selection;
    var txt;
    if (s.length === 0) txt = '（无）';
    else {
      var cnt = {};
      s.forEach(function (c) { cnt[c] = (cnt[c] || 0) + 1; });
      txt = Object.keys(cnt).map(function (c) { return D.COLOR_META[c].short + '×' + cnt[c]; }).join('、');
    }
    var listEl = $('sel-list');
    var btn = $('btn-confirm-take');
    if (!listEl || !btn) return; // 座位尚未渲染时安全跳过
    listEl.textContent = txt;
    if (pulse) {
      listEl.classList.remove('pulse');
      void listEl.offsetWidth;
      listEl.classList.add('pulse');
    }
    var ok = selectionValid();
    btn.disabled = !ok || netActionPending || !netConnected();
    btn.classList.toggle('ready', ok);
    if (netActionPending) btn.textContent = '提交中…';
    else if (!netConnected()) btn.textContent = '等待连接恢复';
    else if (!ok && s.length > 0) btn.textContent = '还需选择（3 种不同 或 同色 2 枚）';
    else btn.textContent = '确认拿取';
  }

  function renderPlayers() {
    // 围桌座位：玩家主座位（底部中央）+ 其他玩家（左侧两席/右侧一席）
    var humanSeat = $('seat-human');
    if (!humanSeat) return;
    var seats = { 1: $('seat-ai-1'), 2: $('seat-ai-2'), 3: $('seat-ai-3') };
    if (netMode) {
      // 联机：主座位显示「我」，其余座位按索引顺序填其他玩家（真人/AI 混合）
      renderSeat(humanSeat, mySeat, true);
      var others = [];
      for (var i = 0; i < st.players.length; i++) {
        if (i !== mySeat) others.push(i);
      }
      var pos = [1, 2, 3];
      for (var j = 0; j < pos.length; j++) {
        var s = seats[pos[j]];
        if (!s) continue;
        if (j < others.length) {
          renderSeat(s, others[j], false);
          s.style.display = '';
        } else {
          s.style.display = 'none';
        }
      }
      return;
    }
    renderSeat(humanSeat, 0, true);
    for (var i = 1; i < st.players.length; i++) {
      if (seats[i]) { renderSeat(seats[i], i, false); seats[i].style.display = ''; }
    }
    for (var k = st.players.length; k <= 3; k++) {
      if (seats[k]) seats[k].style.display = 'none';
    }
  }

  /** 将结构化的「上一回合行动」渲染成紧凑信息块（电脑座位区展示） */
  function lastActionHtml(act) {
    if (!act) return '<span class="none">—</span>';
    if (act.type === 'takeTokens') {
      var parts = [];
      for (var c in act.tokens) {
        if (act.tokens[c] > 0) parts.push(gemHTML(c) + '×' + act.tokens[c]);
      }
      return '<span class="la-row">拿取 ' + (parts.join(' ') || '—') + '</span>';
    }
    if (act.type === 'buyCard') {
      var card = act.card;
      var cost = D.costEntries(card.cost).map(function (e) { return gemHTML(e.color) + e.n; }).join(' ');
      var html = '<span class="la-row">购买 ' + gemHTML(card.bonus) + D.COLOR_META[card.bonus].name + '卡 · ' + card.points + '分</span>' +
        '<span class="la-row la-cost">成本 ' + (cost || '免费') + '</span>';
      if (act.gainedNoble) html += '<span class="la-row la-noble">并获得贵族 +3分</span>';
      return html;
    }
    if (act.type === 'reserveCard') {
      if (act.hidden) {
        // 盲抽预留：隐藏信息不泄露（只显示层级与黄金）
        return '<span class="la-row">盲抽预留 第' + act.level + '层</span>' +
          (act.gainedGold ? '<span class="la-row">获黄金×1</span>' : '');
      }
      var rc = act.card;
      var rcost = D.costEntries(rc.cost).map(function (e) { return gemHTML(e.color) + e.n; }).join(' ');
      return '<span class="la-row">预留 第' + rc.tier + '层 ' + gemHTML(rc.bonus) + D.COLOR_META[rc.bonus].name + '卡 · ' + rc.points + '分</span>' +
        '<span class="la-row la-cost">成本 ' + (rcost || '免费') + '</span>' +
        (act.gainedGold ? '<span class="la-row">获黄金×1</span>' : '');
    }
    return '';
  }

  function renderSeat(panel, idx, isHuman) {
    var p = st.players[idx];
    var active = st.currentPlayer === idx && !st.gameOver;
    panel.className = 'seat' + (isHuman ? ' seat-human' : ' seat-ai') + (active ? ' active' : '');

    var tokens = '';
    G.COLORS.concat([G.GOLD]).forEach(function (c) {
      tokens += '<span class="ptok' + (p.tokens[c] > 0 ? '' : ' zero') + '">' + gemHTML(c) + '×' + p.tokens[c] + '</span>';
    });
    var perms = '';
    G.COLORS.forEach(function (c) {
      perms += '<span class="perm' + (p.permanents[c] > 0 ? '' : ' zero') + '">' + gemHTML(c) + '×' + p.permanents[c] + '</span>';
    });

    if (isHuman) {
      var reserved = p.reserved.length === 0
        ? '<span class="none">无</span>'
        : p.reserved.map(function (c) { return cardHTML(c, { mini: true, mine: true }); }).join('');
      panel.innerHTML =
        '<div class="ph-head">' +
        '<span class="ph-avatar">🧑</span>' +
        '<span class="ph-name">' + esc(p.name) + '</span>' +
        '<span class="ph-score">' + p.score + ' 分</span>' +
        (active && !st.gameOver ? '<span class="ph-status">● 行动中</span>' : '') +
        '</div>' +
        '<div class="ph-res">' +
        '<div class="ph-row"><span class="lbl">筹码 ' + G.tokenTotal(p.tokens) + '/10</span><div class="ph-inline">' + tokens + '</div></div>' +
        '<div class="ph-row"><span class="lbl">永久宝石</span><div class="ph-inline">' + perms + '</div></div>' +
        '<div class="ph-row"><span class="lbl">发展卡 ' + p.cards.length + ' · 贵族 ' + p.nobles.length + '</span></div>' +
        '<div class="ph-row"><span class="lbl">预留 ' + p.reserved.length + '/3</span><div class="ph-inline pp-reserved">' + reserved + '</div></div>' +
        '</div>' +
        '<div class="ph-ops">' +
        '<div class="ph-op-hint">选择宝石：点击左侧桌面宝石池；确认拿取按钮在宝石池下方。</div>' +
        '</div>';
    } else {
      // 联机模式下其他座位可能是真人玩家；AI 座位显示难度
      var isManaged = netMode && p.seatType === 'human' && p.connected === false;
      var whoTag = isManaged
        ? '<span class="pp-human">💤 掉线托管</span>'
        : (p.isAI ? levelLabel(p.aiLevel) : (netMode ? '<span class="pp-human">👤 真人</span>' : ''));
      var nameHtml = esc(p.name) + ' <span class="pp-level">' + whoTag + '</span>';
      panel.innerHTML =
        '<div class="pp-head"><h3>' + nameHtml + '</h3>' +
        (active && !st.gameOver ? '<span class="pp-active">● 行动中</span>' : '') +
        '<span class="pp-score">' + p.score + ' 分</span></div>' +
        '<div class="pp-row"><span class="pp-label">筹码</span>' + tokens + '</div>' +
        '<div class="pp-row"><span class="pp-label">永久宝石</span>' + perms + '</div>' +
        '<div class="pp-row"><span class="pp-label">发展卡 ' + p.cards.length + ' · 贵族 ' + p.nobles.length + ' · 预留 ' + p.reserved.length + '/3</span></div>' +
        '<div class="pp-row la"><span class="pp-label">上回合</span><div class="la-box">' + lastActionHtml(p.lastAction) + '</div></div>';
    }
  }

  function renderLog() {
    var box = $('log');
    var from = Math.max(0, st.log.length - 120);
    var html = '';
    for (var i = from; i < st.log.length; i++) {
      var e = st.log[i];
      html += '<div class="log-line"><span class="log-turn">第' + e.turn + '回合</span> ' + esc(e.text) + '</div>';
    }
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
  }

  /* ---------------- 手机端高密度圆桌渲染 ---------------- */
  function mobileGemCounts(values, colors, perm) {
    return colors.map(function (c) {
      return '<span class="' + (perm ? 'mobile-perm' : 'mobile-token') + '">' +
        gemHTML(c) + '<b>' + (values[c] || 0) + '</b></span>';
    }).join('');
  }

  function mobileNobleHTML(n) {
    var reqs = D.costEntries(n.req).map(function (e) {
      return '<span>' + gemHTML(e.color) + '<b>' + e.n + '</b></span>';
    }).join('');
    return '<div class="mobile-noble ' + noblePortraitClass(n) + '" title="' + esc(n.name) + '，满足要求获得 3 分">' +
      '<strong>3</strong><div>' + reqs + '</div></div>';
  }

  function renderMobileHeader() {
    var room = $('mobile-room');
    var connection = $('mobile-connection');
    var turn = $('mobile-turn');
    if (!room || !connection || !turn) return;
    var net = window.SplendorNet;
    room.textContent = netMode ? ('房间 ' + (net && net.roomId ? net.roomId : '—')) : '单机对战';
    var offline = netMode && (!net || !net.connected);
    connection.className = 'mobile-connection' + (offline ? ' offline' : '');
    connection.innerHTML = '<i></i>' + (netMode ? (offline ? '恢复中' : '已连接') : '本地');
    turn.textContent = '第 ' + st.turn + ' 回合';
  }

  function renderMobileNobles() {
    var box = $('mobile-nobles');
    if (!box) return;
    box.innerHTML = st.nobles.length
      ? st.nobles.map(mobileNobleHTML).join('')
      : '<span class="mobile-empty">贵族已全部获得</span>';
  }

  function renderMobileTiers() {
    var romans = { 1: 'Ⅰ', 2: 'Ⅱ', 3: 'Ⅲ' };
    [3, 2, 1].forEach(function (tier) {
      var box = $('mobile-tier-' + tier);
      if (!box) return;
      var deckLeft = st.decks[tier].length;
      var player = st.players[humanIdx()];
      var blindDisabled = !isHumanTurn() || deckLeft === 0 || player.reserved.length >= G.MAX_RESERVED;
      var cards = '';
      for (var i = 0; i < G.BOARD_SIZE; i++) {
        var card = st.board[tier][i];
        cards += card
          ? cardHTML(card, { affordable: isHumanTurn() && G.canAfford(player, card) })
          : '<div class="card slot-empty"></div>';
      }
      box.innerHTML =
        '<span class="mobile-tier-label">' + romans[tier] + '</span>' +
        '<button class="mobile-deck tier-' + tier + '" type="button" onclick="UI.openBlindReserveConfirm(' + tier + ')" ' +
        (blindDisabled ? 'disabled' : '') + ' title="盲抽预留第 ' + tier + ' 层">' +
        '<b>抽</b><span>' + deckLeft + '</span></button>' + cards;
    });
  }

  function renderMobileBank() {
    var box = $('mobile-bank');
    if (!box) return;
    var colors = G.COLORS.concat([G.GOLD]);
    box.innerHTML = colors.map(function (c) {
      var selected = st.selection.indexOf(c) >= 0 ? ' selected' : '';
      var disabled = c === G.GOLD || !isHumanTurn() || st.bank[c] <= 0;
      return '<button class="mobile-bank-gem' + selected + (c === G.GOLD ? ' gold' : '') + '" type="button" ' +
        'data-color="' + c + '"' + (disabled ? ' disabled' : '') + '>' +
        gemHTML(c, 'big') + '<b>' + st.bank[c] + '</b></button>';
    }).join('');
  }

  function mobilePlayerHTML(p, idx, isSelf) {
    var active = st.currentPlayer === idx && !st.gameOver;
    var isManaged = netMode && p.seatType === 'human' && p.connected === false;
    var role = isManaged ? '托管›' : (p.isAI ? ('AI ' + (p.aiLevel || '') + '›') : (isSelf ? '你›' : '真人›'));
    return '<div class="mobile-player-head">' +
      '<span class="mobile-avatar">' + (isManaged ? '💤' : (p.isAI ? '🤖' : '🧑')) + '</span>' +
      '<strong>' + esc(p.name) + '</strong><em>' + role + '</em>' +
      '<b class="mobile-score">' + p.score + '</b>' +
      (active ? '<span class="mobile-active-dot">●</span>' : '') + '</div>' +
      '<div class="mobile-player-meta"><span>贵族 ' + p.nobles.length + '</span><span>已购 ' + p.cards.length + '</span><span>保留 ' + p.reserved.length + '</span></div>' +
      '<div class="mobile-resource-row"><small>筹</small>' + mobileGemCounts(p.tokens, G.COLORS.concat([G.GOLD]), false) + '</div>' +
      '<div class="mobile-resource-row permanent"><small>折</small>' + mobileGemCounts(p.permanents, G.COLORS, true) + '</div>';
  }

  function renderMobileSeat(panel, idx, isSelf) {
    if (!panel) return;
    if (idx === null || idx === undefined) {
      panel.style.display = 'none';
      panel.dataset.playerIndex = '';
      return;
    }
    panel.style.display = '';
    panel.dataset.playerIndex = String(idx);
    panel.className = 'mobile-player-seat ' + panel.dataset.position +
      (isSelf ? ' is-self' : '') +
      (st.currentPlayer === idx && !st.gameOver ? ' active' : '');
    panel.innerHTML = mobilePlayerHTML(st.players[idx], idx, isSelf);
  }

  function renderMobilePlayers() {
    var top = $('mobile-seat-top'), left = $('mobile-seat-left'), right = $('mobile-seat-right');
    var self = $('mobile-seat-self'), hub = $('mobile-turn-hub');
    if (!top || !left || !right || !self || !hub) return;
    top.dataset.position = 'pos-top';
    left.dataset.position = 'pos-left';
    right.dataset.position = 'pos-right';
    self.dataset.position = 'pos-self';
    var others = [];
    for (var i = 0; i < st.players.length; i++) if (i !== humanIdx()) others.push(i);
    renderMobileSeat(top, null, false);
    renderMobileSeat(left, null, false);
    renderMobileSeat(right, null, false);
    if (others.length === 1) renderMobileSeat(top, others[0], false);
    else if (others.length === 2) {
      renderMobileSeat(left, others[0], false);
      renderMobileSeat(right, others[1], false);
    } else if (others.length >= 3) {
      renderMobileSeat(top, others[0], false);
      renderMobileSeat(left, others[1], false);
      renderMobileSeat(right, others[2], false);
    }
    renderMobileSeat(self, humanIdx(), true);
    var current = st.players[st.currentPlayer];
    var actionText = st.gameOver ? '游戏结束' : (st.currentPlayer === humanIdx() ? '轮到你' : esc(current.name));
    hub.innerHTML = '<span>回合 ' + st.turn + '</span><strong>' + actionText + '</strong>';
    hub.className = 'mobile-turn-hub' + (st.currentPlayer === humanIdx() && !st.gameOver ? ' your-turn' : '');
  }

  function renderMobileSelection() {
    var label = $('mobile-selection'), confirm = $('mobile-confirm'), clear = $('mobile-clear');
    if (!label || !confirm || !clear) return;
    var counts = {};
    st.selection.forEach(function (c) { counts[c] = (counts[c] || 0) + 1; });
    var text = Object.keys(counts).map(function (c) {
      return gemHTML(c) + D.COLOR_META[c].short + '×' + counts[c];
    }).join(' ');
    label.innerHTML = '<span>已选</span>' + (text || '<em>无</em>');
    var valid = selectionValid();
    confirm.disabled = !valid || netActionPending || !netConnected();
    confirm.textContent = netActionPending ? '提交中…' : (!netConnected() ? '等待连接' : '确认拿取');
    confirm.classList.toggle('ready', valid);
    clear.disabled = st.selection.length === 0 || netActionPending;
  }

  function renderMobile() {
    if (!$('mobile-game') || !st) return;
    renderMobileHeader();
    renderMobileNobles();
    renderMobileTiers();
    renderMobileBank();
    renderMobilePlayers();
    renderMobileSelection();
  }

  function sendNetAction(action) {
    var net = window.SplendorNet;
    if (!net || !net.connected) {
      flash('连接尚未恢复，请稍候再操作');
      playSound('error');
      renderMobile();
      return false;
    }
    if (netActionPending) {
      flash('上一项操作正在提交，请稍候');
      return false;
    }
    netActionPending = true;
    var sent = net.action(action);
    if (sent === false) {
      netActionPending = false;
      flash('操作未提交，请等待连接恢复');
      playSound('error');
      renderMobile();
      return false;
    }
    renderMobile();
    return true;
  }

  function openMobilePlayer(idx) {
    idx = Number(idx);
    if (!st || !st.players[idx]) return;
    var p = st.players[idx];
    var isSelf = idx === humanIdx();
    var reserved = isSelf && p.reserved.length
      ? '<p class="mobile-reserved-hint">点按预留卡可查看并购买</p><div class="mobile-detail-cards">' +
        p.reserved.map(function (c) {
          return '<button class="mobile-reserved-card" type="button" data-card-id="' + c.id + '">' +
            cardHTML(c, { mini: true, mine: true }) + '</button>';
        }).join('') + '</div>'
      : '<p>预留卡：' + p.reserved.length + ' 张' + (isSelf ? '' : '（隐藏信息）') + '</p>';
    showModal(
      '<h2>' + esc(p.name) + ' · ' + p.score + ' 分</h2>' +
      '<div class="mobile-player-detail">' +
      '<p>贵族 ' + p.nobles.length + ' 位 · 已购发展卡 ' + p.cards.length + ' 张</p>' +
      '<div class="mobile-detail-row"><b>筹码</b>' + mobileGemCounts(p.tokens, G.COLORS.concat([G.GOLD]), false) + '</div>' +
      '<div class="mobile-detail-row"><b>永久折扣</b>' + mobileGemCounts(p.permanents, G.COLORS, true) + '</div>' +
      reserved +
      (!isSelf ? '<div class="mobile-last-action"><b>上回合</b>' + lastActionHtml(p.lastAction) + '</div>' : '') +
      '</div><div class="modal-btns"><button class="btn ghost" onclick="UI.hideModal()">关闭</button></div>'
    );
  }

  function openMobileMenu() {
    var canRestart = !netMode || (window.SplendorNet && window.SplendorNet.mySeat === 0);
    showModal(
      '<h2>游戏菜单</h2><div class="mobile-menu-list">' +
      '<button class="btn" onclick="UI.openRules()">游戏规则</button>' +
      '<button class="btn" onclick="UI.toggleSound()">' + (soundOn ? '关闭音效' : '开启音效') + '</button>' +
      (canRestart ? '<button class="btn" onclick="UI.openRestartConfirm()">重新开始</button>' : '') +
      '<button class="btn ghost" onclick="UI.backToMenu()">返回主菜单</button>' +
      '<button class="btn ghost" onclick="UI.hideModal()">取消</button></div>'
    );
  }

  /* ---------------- 交互：拿宝石 ---------------- */
  function toggleGem(color) {
    if (!isHumanTurn()) return;
    if (color === G.GOLD) {
      flash('黄金不能直接拿取，只能通过「预留卡牌」获得');
      playSound('error');
      return;
    }
    if (st.bank[color] <= 0) { flash('公共区' + D.COLOR_META[color].name + '已空'); return; }
    var s = st.selection;
    var idx = s.indexOf(color);
    if (idx === -1) {
      if (s.length >= 3) {
        flash('最多选 3 枚：3 种不同色各 1 枚，或同色 2 枚（点击已选宝石可取消）');
        playSound('error');
        return;
      }
      if (s.length === 2 && s[0] === s[1]) {
        flash('已选择同色 2 枚，如需其他颜色请先点击已选宝石取消');
        playSound('error');
        return;
      }
      s.push(color);
    } else {
      if (s.length === 1) {
        // 同色第 2 枚
        if (st.bank[color] < 4) {
          flash('公共区该颜色不足 4 枚，不能拿 2 枚');
          playSound('error');
          return;
        }
        s.push(color);
      } else {
        s.splice(idx, 1);
      }
    }
    playSound('click');
    updateBankSelection(color);
    renderStatus();
  }

  function clearSelection() {
    st.selection = [];
    renderSelection(false);
    var gems = $('bank').querySelectorAll('.bank-gem');
    for (var i = 0; i < gems.length; i++) gems[i].classList.remove('selected');
    renderMobileBank();
    renderMobileSelection();
    renderStatus();
  }

  function confirmTake() {
    if (!selectionValid()) return;
    if (netMode) {
      // 联机：发送拿取指令，等服务器校验并广播
      var colors = st.selection.slice();
      if (!sendNetAction({ type: 'take', colors: colors })) return;
      st.selection = [];
      render();
      playSound('click');
      return;
    }
    var res = G.takeTokens(st, humanIdx(), st.selection.slice());
    if (!res.ok) { flash(res.reason); playSound('error'); return; }
    st.selection = [];
    playSound('take');
    afterHumanAction();
  }

  /* ---------------- 交互：回合流转 ---------------- */
  function afterHumanAction() {
    render();
    if (G.needDiscard(st, humanIdx())) { openDiscardModal(); return; }
    G.completeTurn(st);
    postTurn();
  }

  function postTurn() {
    render();
    if (st.gameOver) { openGameOver(); return; }
    if (st.endTriggerTurn && !endBannerShown) {
      endBannerShown = true;
      showBanner('⚔️ 已触发 15 分终局！双方完成相同回合数后结算', 'over');
    }
    if (isAITurn()) {
      showBanner('轮到 <b>' + st.players[st.currentPlayer].name + '</b> · 电脑思考中…', 'ai');
      aiTurn();
    } else {
      renderStatus();
      checkHumanStuck();
      if (!st.gameOver) showBanner('第 <b>' + st.turn + '</b> 回合 · 轮到 <b>' + st.players[st.currentPlayer].name + '</b>，请行动', 'go');
    }
  }

  /* ---------------- 罕见死局应急（防御性规则） ---------------- */
  function checkHumanStuck() {
    if (netMode) return; // 联机：服务器会自动救济
    if (!isHumanTurn()) return;
    if (G.hasAnyLegalAction(st, humanIdx())) return;
    showModal(
      '<h2>⚠️ 罕见局面</h2>' +
      '<p>当前没有任何合法行动（预留已满、买不起、公共区宝石不足）。' +
      '按应急规则将自动归还 1 枚筹码并结束回合。</p>' +
      '<div class="modal-btns"><button class="btn primary" onclick="UI.humanRelief()">继续</button></div>',
      false
    );
  }

  function humanRelief() {
    var p = st.players[humanIdx()];
    var order = G.COLORS.slice().sort(function (a, b) { return (p.tokens[b] || 0) - (p.tokens[a] || 0); });
    var acted = false;
    for (var i = 0; i < order.length; i++) {
      if (p.tokens[order[i]] > 0) {
        G.returnTokens(st, humanIdx(), order[i], 1);
        G.log(st, '（罕见局面）无合法行动，自动归还 1 枚' + D.COLOR_META[order[i]].name);
        acted = true;
        break;
      }
    }
    if (!acted && p.tokens[G.GOLD] > 0) {
      G.returnTokens(st, humanIdx(), G.GOLD, 1);
      G.log(st, '（罕见局面）无合法行动，自动归还 1 枚黄金');
      acted = true;
    }
    hideModal();
    afterHumanAction();
  }

  /* ---------------- 交互：卡牌弹窗 ---------------- */
  function openCardModal(cardId) {
    var loc = G.locateCard(st, cardId);
    if (!loc) return;
    var card = loc.card;
    var p = st.players[humanIdx()];
    var isMine = loc.owner === 'reserved' && loc.playerIdx === humanIdx();
    var isOtherReserved = loc.owner === 'reserved' && !isMine;

    // 查看别人预留的卡 / 非自己回合：只读弹窗
    if (isOtherReserved || !isHumanTurn()) {
      var ownerName = isOtherReserved ? st.players[loc.playerIdx].name : st.players[st.currentPlayer].name;
      var blockedText = isOtherReserved
        ? '这是 ' + esc(ownerName) + ' 预留的卡，其他人不能购买。'
        : (!netConnected() ? '网络连接正在恢复，恢复后才能操作。' :
          (netActionPending ? '上一项操作正在提交，请稍候。' : '当前是 ' + esc(ownerName) + ' 的行动回合，等待你行动时再操作。'));
      showModal(
        '<h2>发展卡 · 第 ' + card.tier + ' 层</h2>' +
        '<div class="modal-card">' + cardHTML(card) + '</div>' +
        '<p class="modal-info">永久宝石：' + D.COLOR_META[card.bonus].name + ' · 威望 ' + card.points + ' 分</p>' +
        '<p class="modal-note ' + (isOtherReserved ? 'bad' : '') + '">' +
        blockedText +
        '</p>' +
        '<div class="modal-btns"><button class="btn ghost" onclick="UI.hideModal()">关闭</button></div>'
      );
      return;
    }

    var afford = G.canAfford(p, card);
    var missing = missingText(p, card);

    var buyBtn;
    if (afford) {
      buyBtn = '<button class="btn primary" onclick="UI.buyFromModal(' + card.id + ')">购买</button>';
    } else {
      buyBtn = '<button class="btn primary" disabled>购买（' + esc(missing.reason) + '）</button>';
    }
    var reserveBtn = '';
    if (!isMine) {
      if (p.reserved.length >= G.MAX_RESERVED) {
        reserveBtn = '<button class="btn" disabled>预留（已满 3/3）</button>';
      } else {
        reserveBtn = '<button class="btn" onclick="UI.reserveFromModal(' + card.id + ')">预留（获黄金）</button>';
      }
    }
    var note = afford
      ? '<p class="modal-note ok">可以购买：' + payText(p, card) + '</p>'
      : '<p class="modal-note bad">还缺：' + esc(missing.reason) + '</p>';

    showModal(
      '<h2>发展卡 · 第 ' + card.tier + ' 层</h2>' +
      '<div class="modal-card">' + cardHTML(card, { affordable: afford }) + '</div>' +
      '<p class="modal-info">永久宝石：' + D.COLOR_META[card.bonus].name + '</p>' +
      note +
      '<div class="modal-btns">' + buyBtn + reserveBtn +
      '<button class="btn ghost" onclick="UI.hideModal()">取消</button></div>'
    );
  }

  function missingText(p, card) {
    var rem = G.remainingCost(p, card);
    var parts = [], goldNeed = 0;
    for (var c in rem) {
      var m = rem[c] - (p.tokens[c] || 0);
      if (m > 0) { parts.push(D.COLOR_META[c].short + '×' + m); goldNeed += m; }
    }
    if (parts.length === 0) return { text: '可支付', reason: '全部由永久宝石折扣覆盖' };
    var hasGold = p.tokens[G.GOLD] || 0;
    if (goldNeed <= hasGold) return { text: '可支付', reason: parts.join('、') + '（可用黄金补齐）' };
    return { text: '不足', reason: parts.join('、') + '，黄金不足' };
  }

  function payText(p, card) {
    var pay = G.paymentFor(p, card);
    var parts = [];
    for (var c in pay.tokens) parts.push(D.COLOR_META[c].short + '×' + pay.tokens[c]);
    if (pay.gold > 0) parts.push('金×' + pay.gold);
    return parts.length ? '支付：' + parts.join('、') : '无需支付（折扣覆盖）';
  }

  function buyFromModal(cardId) {
    if (netMode) {
      if (!sendNetAction({ type: 'buy', cardId: cardId })) return;
      hideModal();
      playSound('click');
      return;
    }
    var res = G.buyCard(st, humanIdx(), cardId);
    if (!res.ok) { flash(res.reason); playSound('error'); return; }
    hideModal();
    playSound('buy');
    if (res.nobles && res.nobles.length > 1) { openNobleModal(); return; }
    afterHumanAction();
  }

  function reserveFromModal(cardId) {
    if (netMode) {
      if (!sendNetAction({ type: 'reserve', cardId: cardId })) return;
      hideModal();
      playSound('click');
      return;
    }
    var res = G.reserveCard(st, humanIdx(), cardId);
    if (!res.ok) { flash(res.reason); playSound('error'); return; }
    hideModal();
    playSound('take');
    afterHumanAction();
  }

  function openBlindReserveConfirm(tier) {
    if (!isHumanTurn()) return;
    var deckLeft = st.decks[tier] ? st.decks[tier].length : 0;
    if (deckLeft <= 0) { flash('该牌堆已经没有卡牌'); return; }
    var p = st.players[humanIdx()];
    if (p.reserved.length >= G.MAX_RESERVED) { flash('预留区已满 3/3'); return; }
    var getsGold = (st.bank[G.GOLD] || 0) > 0;
    showModal(
      '<h2>确认盲抽预留</h2>' +
      '<p class="modal-info">从第 ' + tier + ' 层牌堆抽取 1 张未知发展卡并放入你的预留区。</p>' +
      '<p class="modal-note">牌堆剩余 ' + deckLeft + ' 张；' +
      (getsGold ? '本次可同时获得 1 枚黄金。' : '公共区已无黄金，本次只预留卡牌。') + '</p>' +
      '<div class="modal-btns">' +
      '<button class="btn primary" onclick="UI.blindReserve(' + tier + ')">确认抽取</button>' +
      '<button class="btn ghost" onclick="UI.hideModal()">取消</button></div>'
    );
  }

  function blindReserve(tier) {
    if (!isHumanTurn()) return;
    if (netMode) {
      if (!sendNetAction({ type: 'blindReserve', tier: tier })) return;
      hideModal();
      playSound('click');
      return;
    }
    var res = G.reserveCard(st, humanIdx(), null, tier);
    if (!res.ok) { flash(res.reason); playSound('error'); return; }
    hideModal();
    playSound('take');
    afterHumanAction();
  }

  /* ---------------- 交互：贵族选择 ---------------- */
  function openNobleModal() {
    if (nobleOpen) return; // 联机广播驱动，防重复打开
    nobleOpen = true;
    var list = st.pendingNobles;
    var choices = list.map(function (n) {
      var reqs = D.costEntries(n.req).map(function (e) {
        return '<span class="nreq"><i class="gem g-' + e.color + '"></i><b>' + e.n + '</b></span>';
      }).join('');
      return '<button class="noble-choice" onclick="UI.chooseNobleModal(\'' + n.id + '\')">' +
        '<span class="nc-name">' + esc(n.name) + '</span>' +
        '<span class="nc-req">' + reqs + '</span>' +
        '<span class="nc-pts">+3 分</span></button>';
    }).join('');
    showModal(
      '<h2>👑 贵族降临</h2>' +
      '<p>你同时满足了 ' + list.length + ' 位贵族的要求，但每回合只能获得 1 位，请选择：</p>' +
      '<div class="noble-choices">' + choices + '</div>',
      false
    );
  }

  function chooseNobleModal(nobleId) {
    if (netMode) {
      if (!sendNetAction({ type: 'chooseNoble', nobleId: nobleId })) return;
      playSound('click');
      return;
    }
    var res = G.chooseNoble(st, humanIdx(), nobleId);
    if (!res.ok) { flash(res.reason); playSound('error'); return; }
    hideModal();
    playSound('noble');
    showBanner('👑 获得贵族「' + esc(res.noble.name) + '」 +3 分！', 'noble');
    afterHumanAction();
  }

  /* ---------------- 交互：归还筹码 ---------------- */
  var returning = {}; // 本次归还阶段已归还的筹码 { color: n }，可点击撤销加回

  function openDiscardModal() {
    st.phase = 'discard'; // 进入归还阶段（returnOne/状态行依赖该标记）
    if (!discardOpen) returning = {}; // 首次进入才重置；联机广播刷新时保留记录
    discardOpen = true;
    renderDiscardModal();
  }

  function renderDiscardModal() {
    var p = st.players[humanIdx()];
    var total = G.tokenTotal(p.tokens);
    var excess = Math.max(0, total - G.MAX_TOKENS);
    var chips = G.COLORS.concat([G.GOLD]).map(function (c) {
      return '<button class="dchip" onclick="UI.returnOne(\'' + c + '\')" ' +
        (p.tokens[c] <= 0 || netActionPending || !netConnected() ? 'disabled' : '') + '>' +
        gemHTML(c) + '<b>' + p.tokens[c] + '</b>' +
        ((returning[c] || 0) > 0 ? '<span class="dchip-returned">已还×' + returning[c] + '</span>' : '') +
        '</button>';
    }).join('');
    // 已归还的筹码：点击可撤销（加回）
    var undoneColors = G.COLORS.concat([G.GOLD]).filter(function (c) { return (returning[c] || 0) > 0; });
    var undoneRow = undoneColors.length > 0
      ? '<div class="drow undone"><span class="undone-tip">已归还（点错可点击加回）：</span>' +
        undoneColors.map(function (c) {
          return '<button class="dchip undo" ' + (netActionPending || !netConnected() ? 'disabled ' : '') +
            'onclick="UI.undoReturn(\'' + c + '\')" title="点击加回 1 枚">' +
            gemHTML(c) + '<b>' + returning[c] + '</b></button>';
        }).join('') + '</div>'
      : '';
    var okBtn = total <= G.MAX_TOKENS
      ? '<button class="btn primary" ' + (netActionPending || !netConnected() ? 'disabled ' : '') +
        'onclick="UI.confirmDiscard()">' + (netActionPending ? '提交中…' : '确认归还（结束回合）') + '</button>'
      : '<button class="btn primary" disabled>还需归还 ' + excess + ' 枚</button>';
    showModal(
      '<h2>归还筹码</h2>' +
      '<p>筹码上限 10 枚（含黄金）。当前持有 <b>' + total + '</b> 枚，' +
      '点击筹码归还；点错了可点下方「已归还」加回：</p>' +
      '<div class="drow">' + chips + '</div>' +
      undoneRow +
      '<div class="modal-btns">' + okBtn + '</div>',
      false
    );
  }

  function returnOne(color) {
    if (st.phase !== 'discard') return;
    if (netMode) {
      // 联机：发归还指令，服务器执行后广播（本地先乐观记录，供「已归还」标记即时显示）
      if (!sendNetAction({ type: 'returnToken', color: color, n: 1 })) return;
      returning[color] = (returning[color] || 0) + 1;
      playSound('click');
      renderDiscardModal();
      return;
    }
    var res = G.returnTokens(st, humanIdx(), color, 1);
    if (!res.ok) { flash(res.reason); return; }
    returning[color] = (returning[color] || 0) + 1;
    playSound('click');
    renderDiscardModal();
    render();
  }

  /** 撤销归还：从公共区加回 1 枚 */
  function undoReturn(color) {
    if (st.phase !== 'discard') return;
    if (!returning[color]) return;
    if (netMode) {
      if (!sendNetAction({ type: 'returnToken', color: color, n: -1 })) return;
      returning[color]--;
      if (returning[color] <= 0) delete returning[color];
      playSound('click');
      renderDiscardModal();
      return;
    }
    var res = G.returnTokens(st, humanIdx(), color, -1);
    if (!res.ok) { flash(res.reason); playSound('error'); return; }
    returning[color]--;
    if (returning[color] <= 0) delete returning[color];
    playSound('click');
    renderDiscardModal();
    render();
  }

  function confirmDiscard() {
    if (netMode) {
      if (!sendNetAction({ type: 'finishDiscard' })) return;
      playSound('click');
      return;
    }
    var res = G.finishDiscard(st, humanIdx());
    if (!res.ok) { flash(res.reason); playSound('error'); return; }
    hideModal();
    playSound('take');
    postTurn();
  }

  /* ---------------- 交互：AI 回合 ---------------- */
  function aiTurn() {
    if (!isAITurn()) return;
    var myGen = ++gen;
    renderStatus();
    // 600~1000ms 视觉延迟（测试可设置 window.AI_SPEED < 1 加速）
    var speed = (typeof window !== 'undefined' && window.AI_SPEED) || 1;
    var delay = (600 + Math.random() * 400) * speed;
    aiTimer = setTimeout(function () {
      if (myGen !== gen || st.gameOver) return;
      AI.executeAiTurn(st, st.currentPlayer);
      playSound('click');
      postTurn();
    }, delay);
  }

  /* ---------------- 交互：重开 / 撤销 / 主菜单 / 规则 / 音效 ---------------- */
  function restart() {
    if (netMode) {
      // 联机：仅房主可重新开始（服务器校验）
      var net = window.SplendorNet;
      if (!net || net.mySeat !== 0) { flash('只有房主可以重新开始'); return; }
      hideModal();
      playSound('click');
      net.restart();
      return;
    }
    gen++;
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    G.resetGame(st, { rng: Math.random });
    st.selection = [];
    endBannerShown = false;
    hideModal();
    render();
    if (isAITurn()) aiTurn();
    else { renderStatus(); checkHumanStuck(); }
    flash('新游戏已开始');
    showBanner('🔮 新游戏开始！', 'go');
  }

  /** 撤销上一回合（单局最多 3 次，人类回合可用；联机模式不支持） */
  function undoTurn() {
    if (netMode) { flash('联机模式不支持撤销上一回合'); return; }
    if (st.gameOver || st.currentPlayer !== humanIdx() || st.phase !== 'action') return;
    var res = G.undoLastTurn(st);
    if (!res.ok) { flash(res.reason); playSound('error'); return; }
    gen++;
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    hideModal();
    endBannerShown = false;
    playSound('click');
    render();
    renderStatus();
    checkHumanStuck();
    flash('已撤销上一回合（本局剩余 ' + res.left + ' 次）');
  }

  /* ---------------- 主菜单 ---------------- */
  function showMainMenu() { $('main-menu').classList.remove('hidden'); }
  function hideMainMenu() { $('main-menu').classList.add('hidden'); }

  /** 从主菜单开始一局新游戏 */
  function startGame() {
    netMode = false; // 确保单机模式
    mySeat = 0;
    st = G.createGame({ rng: Math.random, aiLevel: currentLevel, playerCount: currentPlayers });
    st.selection = [];
    endBannerShown = false;
    hideMainMenu();
    hideModal();
    render();
    if (isAITurn()) aiTurn();
    else { renderStatus(); checkHumanStuck(); }
  }

  /* ---------------- 主菜单：难度/人数拉条（直接选择） ---------------- */
  // 难度名称表（与 aiConfig.js 一致）
  var DIFF_UI = {
    1: { name: '新手', desc: '会认真思考，但经常做出新手式判断错误，适合第一次玩。' },
    2: { name: '简单', desc: '会规划自己的目标牌，但很少关注你的行动。' },
    3: { name: '标准', desc: '能合理规划得分、折扣和贵族路线。' },
    4: { name: '困难', desc: '很擅长建立高效的发展卡发动机。' },
    5: { name: '高手', desc: '会观察你的计划，并在关键时刻抢牌或封锁。' },
    6: { name: '专家', desc: '使用自我对弈和参数优化得到的最强AI。' }
  };

  function updateMenuControls() {
    var dv = $('diff-value');
    if (dv) dv.textContent = currentLevel + ' ' + DIFF_UI[currentLevel].name;
    var ds = $('diff-slider');
    if (ds) ds.value = currentLevel;
    var pv = $('players-value');
    if (pv) pv.textContent = currentPlayers + ' 人局';
    var ps = $('players-slider');
    if (ps) ps.value = currentPlayers;
  }

  function onDiffInput(e) {
    var v = parseInt((e && e.target && e.target.value) || 3, 10);
    currentLevel = Math.max(1, Math.min(6, isNaN(v) ? 3 : v));
    playSound('click');
    updateMenuControls();
  }

  function onPlayersInput(e) {
    var v = parseInt((e && e.target && e.target.value) || 2, 10);
    currentPlayers = Math.max(2, Math.min(4, isNaN(v) ? 2 : v));
    playSound('click');
    updateMenuControls();
  }

  function stepDiff(d) {
    currentLevel = Math.max(1, Math.min(6, currentLevel + d));
    playSound('click');
    updateMenuControls();
  }

  function stepPlayers(d) {
    currentPlayers = Math.max(2, Math.min(4, currentPlayers + d));
    playSound('click');
    updateMenuControls();
  }

  /** 难度名称（游戏中显示用） */
  function levelLabel(lv) {
    var d = DIFF_UI[lv];
    return d ? 'Level ' + lv + ' · ' + d.name : '';
  }

  /** 返回主菜单（保留当前对局在内存中，但重新开始会覆盖） */
  function backToMenu() {
    if (netMode) {
      // 联机：断开连接并回到主菜单
      netMode = false;
      lastNetAIMask = null;
      if (window.SplendorNet) window.SplendorNet.close();
      hideModal();
      showMainMenu();
      return;
    }
    gen++;
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    hideModal();
    showMainMenu();
  }

  /** 占位弹窗（尚未实现的功能） */
  function openPlaceholder(title, msg) {
    showModal(
      '<h2>' + esc(title) + '</h2>' +
      '<p>' + esc(msg) + '</p>' +
      '<div class="modal-btns"><button class="btn ghost" onclick="UI.hideModal()">关闭</button></div>'
    );
  }

  function openRestartConfirm() {
    showModal(
      '<h2>重新开始</h2>' +
      '<p>确定要重新开始吗？本局进度将丢失。</p>' +
      '<div class="modal-btns">' +
      '<button class="btn primary" onclick="UI.restart()">确定重开</button>' +
      '<button class="btn ghost" onclick="UI.backToMenu()">返回主菜单</button>' +
      '<button class="btn ghost" onclick="UI.hideModal()">取消</button></div>'
    );
  }

  function openRules() {
    showModal(
      '<h2>📜 游戏规则</h2>' +
      '<div class="rules-text">' +
      '<p><b>目标：</b>先获得 <b>15 分</b> 并保持优势。威望来自发展卡与贵族。</p>' +
      '<p><b>每回合三选一：</b></p>' +
      '<ul>' +
      '<li><b>拿宝石</b>：3 种不同颜色各 1 枚；或同色 2 枚（该色公共区需 ≥4）。</li>' +
      '<li><b>预留卡</b>：拿 1 张公开卡（或盲抽牌堆顶），若公共区有黄金则同时获得 1 黄金；最多预留 3 张。</li>' +
      '<li><b>购买卡</b>：支付「卡面成本 − 永久宝石折扣」，缺口可用黄金代替任意颜色。</li>' +
      '</ul>' +
      '<p><b>永久宝石：</b>购买的发展卡提供对应颜色的永久折扣，永久生效。</p>' +
      '<p><b>筹码上限：</b>回合结束时最多持有 10 枚（含黄金），超出必须归还。</p>' +
      '<p><b>贵族：</b>永久宝石达到要求自动获得（+3 分）；同时满足多位时只能选 1 位。</p>' +
      '<p><b>终局：</b>某玩家达到 15 分后不立即结束，双方完成相同回合数后比较：分数高者胜；同分时发展卡少者胜；仍相同则平局。</p>' +
      '</div>' +
      '<div class="modal-btns"><button class="btn ghost" onclick="UI.hideModal()">关闭</button></div>'
    );
  }

  function toggleSound() {
    soundOn = !soundOn;
    $('btn-sound').textContent = soundOn ? '🔊' : '🔇';
    if (soundOn) playSound('click');
  }

  /* ---------------- 结算 ---------------- */
  function openGameOver() {
    var w = st.winner;
    var title, sub;
    if (w === null) {
      title = '🤝 平局！';
      sub = '没有人获胜';
      playSound('lose');
    } else if (w === humanIdx()) {
      title = '🎉 你赢了！';
      sub = '恭喜获胜';
      playSound('win');
    } else if (netMode) {
      title = '🏆 ' + esc(st.players[w].name) + ' 获胜';
      sub = '再接再厉，下次赢回来';
      playSound('lose');
    } else {
      title = '💀 电脑获胜';
      sub = '再接再厉，下次赢回来';
      playSound('lose');
    }
    // 最终排名（分高者胜；同分时发展卡少者胜）
    var rank = st.players.map(function (p, i) {
      return { idx: i, name: p.name, score: p.score, cards: p.cards.length };
    }).sort(function (a, b) { return b.score - a.score || a.cards - b.cards; });
    var medals = ['🥇', '🥈', '🥉'];
    var rows = rank.map(function (r, ri) {
      var you = r.idx === humanIdx() ? '（你）' : '';
      var who = netMode && !st.players[r.idx].isAI && r.idx !== humanIdx() ? ' · 真人' : '';
      return '<div class="fs-item"><span>' + (medals[ri] || '·') + ' ' + esc(r.name) + you + who + '</span>' +
        '<b>' + r.score + '</b> 分 · ' + r.cards + ' 卡</div>';
    }).join('');
    var btns;
    if (netMode) {
      btns = '<button class="btn ghost" onclick="UI.backToMenu()">返回主菜单</button>' +
        '<button class="btn ghost" onclick="UI.hideModal()">查看终局</button>';
    } else {
      btns = '<button class="btn primary" onclick="UI.restart()">再来一局</button>' +
        '<button class="btn ghost" onclick="UI.backToMenu()">返回主菜单</button>' +
        '<button class="btn ghost" onclick="UI.hideModal()">查看终局</button>';
    }
    showModal(
      '<h2>' + title + '</h2>' +
      '<p>' + sub + '</p>' +
      '<div class="final-scores">' + rows + '</div>' +
      '<div class="modal-btns">' + btns + '</div>',
      true
    );
  }

  /* ---------------- 联机模式 ---------------- */
  var netBannerShown = false; // 联机回合横幅去重

  /** 联机大厅：创建/加入房间 + 等待区 */
  function openNetLobby() {
    hideMainMenu();
    $('net-lobby').classList.remove('hidden');
    showNetForms();
    updateNetControls();
    // 提前建立连接；用户立即点击创建/加入时，消息会在连接成功后自动发送。
    if (window.SplendorNet) window.SplendorNet.connect();
  }
  function showNetForms() {
    $('net-forms').classList.remove('hidden');
    $('net-wait').classList.add('hidden');
  }
  function showNetWait() {
    $('net-forms').classList.add('hidden');
    $('net-wait').classList.remove('hidden');
  }
  function resumeNetOnLoad() {
    var Net = window.SplendorNet;
    if (!Net || !Net.hasResumeSession || !Net.hasResumeSession()) return false;
    hideMainMenu();
    $('net-lobby').classList.remove('hidden');
    showNetWait();
    $('net-room-code').textContent = Net.roomId || '—';
    $('net-seats').innerHTML = '';
    $('btn-net-start').classList.add('hidden');
    $('net-wait-hint').textContent = '正在恢复房间 ' + (Net.roomId || '') + '、原座位与当前对局…';
    Net.connect();
    return true;
  }
  function backFromNet() {
    if (window.SplendorNet) window.SplendorNet.close();
    $('net-lobby').classList.add('hidden');
    showMainMenu();
  }
  function netCreate() {
    var name = ($('net-name').value || '').trim() || '玩家';
    if (!window.SplendorNet || !window.SplendorNet.createRoom(netPlayers, netLevel, name)) {
      flash('无法连接联机服务器，请检查网络后重试'); playSound('error');
    }
  }
  function netJoin() {
    var name = ($('net-name').value || '').trim() || '玩家';
    var code = ($('net-roomcode').value || '').trim();
    if (!code) { flash('请输入房间码'); playSound('error'); return; }
    if (!window.SplendorNet || !window.SplendorNet.joinRoom(code, name)) {
      flash('无法连接联机服务器，请检查网络后重试'); playSound('error');
    }
  }
  function netStartGame() {
    if (window.SplendorNet) window.SplendorNet.startGame();
  }
  function netLeave() {
    if (window.SplendorNet) window.SplendorNet.close();
    showNetForms();
  }
  function renderNetSeats(seats) {
    var el = $('net-seats');
    var html = seats.map(function (s, i) {
      return '<div class="net-seat' + (s.connected ? '' : ' off') + '">' +
        '<span class="ns-icon">' + (s.connected ? '🧑' : '💤') + '</span>' +
        '<span class="ns-name">' + esc(s.name) + '</span>' +
        (i === 0 ? '<span class="ns-host">房主</span>' : '') +
        (s.connected ? '' : '<span class="ns-off">已掉线</span>') +
        '</div>';
    }).join('');
    // 空位显示电脑补位
    for (var i = seats.length; i < netPlayers; i++) {
      html += '<div class="net-seat empty"><span class="ns-icon">🤖</span>' +
        '<span class="ns-name">电脑补位</span></div>';
    }
    el.innerHTML = html;
  }
  function updateNetControls() {
    var dv = $('net-diff-value');
    if (dv) dv.textContent = netLevel + ' ' + DIFF_UI[netLevel].name;
    var ds = $('net-diff-slider');
    if (ds) ds.value = netLevel;
    var pv = $('net-players-value');
    if (pv) pv.textContent = netPlayers + ' 人局';
    var ps = $('net-players-slider');
    if (ps) ps.value = netPlayers;
  }
  function onNetDiffInput(e) {
    var v = parseInt((e && e.target && e.target.value) || 3, 10);
    netLevel = Math.max(1, Math.min(6, isNaN(v) ? 3 : v));
    playSound('click');
    updateNetControls();
  }
  function onNetPlayersInput(e) {
    var v = parseInt((e && e.target && e.target.value) || 2, 10);
    netPlayers = Math.max(2, Math.min(4, isNaN(v) ? 2 : v));
    playSound('click');
    updateNetControls();
  }
  function stepNetDiff(d) {
    netLevel = Math.max(1, Math.min(6, netLevel + d));
    playSound('click');
    updateNetControls();
  }
  function stepNetPlayers(d) {
    netPlayers = Math.max(2, Math.min(4, netPlayers + d));
    playSound('click');
    updateNetControls();
  }

  /** 服务器状态广播驱动（联机） */
  function onNetState(state, meta) {
    var prev = st;
    var prevCur = prev ? prev.currentPlayer : -1;
    var prevGameOver = prev ? prev.gameOver : false;
    st = state;
    netActionPending = false;
    mySeat = meta.mySeat;
    if (!st.selection) st.selection = [];
    endBannerShown = false;

    // 首次收到状态：进入联机游戏界面
    if (!netMode) {
      netMode = true;
      hideMainMenu();
      var nl = $('net-lobby');
      if (nl) nl.classList.add('hidden');
    }

    // 掉线托管提示（真人座位变 AI）
    if (prev && lastNetAIMask) {
      for (var i = 0; i < st.players.length; i++) {
        if (lastNetAIMask[i] === false && st.players[i].isAI) {
          showBanner('🔌 ' + esc(st.players[i].name) + ' 掉线，已由电脑托管', 'over');
        }
      }
    }
    lastNetAIMask = st.players.map(function (p) { return !!p.isAI; });

    render();

    // 弹窗流程：终局 / 归还 / 贵族选择（由服务器状态驱动）
    if (st.gameOver) {
      if (!prevGameOver) openGameOver();
      return;
    }
    if (st.currentPlayer === mySeat && st.phase === 'discard') {
      if (!discardOpen) openDiscardModal(); else renderDiscardModal();
      return;
    }
    if (st.currentPlayer === mySeat && st.pendingNobles.length > 0) {
      if (!nobleOpen) openNobleModal();
      return;
    }
    discardOpen = false;
    nobleOpen = false;
    // 其他玩家行动时关闭遗留弹窗（避免旧弹窗干扰）
    if (prev && prevCur !== st.currentPlayer && modalOpen()) hideModal();

    // 回合切换横幅
    if (prev && prevCur !== st.currentPlayer) {
      var p = st.players[st.currentPlayer];
      if (st.currentPlayer === mySeat) {
        showBanner('第 <b>' + st.turn + '</b> 回合 · 轮到你了，请行动', 'go');
        renderStatus();
        checkHumanStuck();
      } else if (p.isAI) {
        showBanner('轮到 <b>' + esc(p.name) + '</b> · 电脑思考中…', 'ai');
      } else {
        showBanner('轮到 <b>' + esc(p.name) + '</b>，请行动', 'go');
      }
    }
    renderStatus();
  }

  /** 注册联机客户端回调（net-client.js 存在时） */
  function bindNet() {
    var Net = window.SplendorNet;
    if (!Net) return;
    Net.onRoomInfo = function (info) {
      showNetWait();
      $('net-room-code').textContent = info.roomId;
      renderNetSeats(info.seats);
      var startBtn = $('btn-net-start');
      var isHost = info.mySeat === 0;
      if (startBtn) startBtn.classList.toggle('hidden', !isHost);
      var hint = $('net-wait-hint');
      if (hint) {
        hint.textContent = isHost
          ? ('房间已创建，等待其他玩家加入（共 ' + info.playerCount + ' 人，不足由电脑补位）…')
          : ('已加入房间 ' + info.roomId + '，等待房主开始…');
      }
    };
    Net.onState = onNetState;
    Net.onError = function (msg, code) {
      netActionPending = false;
      flash(msg);
      playSound('error');
      if (code === 'RESUME_FAILED') {
        st = null;
        netMode = false;
        hideMainMenu();
        $('net-lobby').classList.remove('hidden');
        showNetForms();
        updateNetControls();
        return;
      }
      if (st) {
        renderMobile();
        renderStatus();
        if (discardOpen) renderDiscardModal();
      }
    };
    Net.onStatus = function (msg) {
      if (!Net.connected) netActionPending = false;
      flash(msg);
      if (st) {
        renderMobile();
        renderStatus();
        if (discardOpen) renderDiscardModal();
      }
    };
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    // 公共宝石池点击
    $('bank').addEventListener('click', function (e) {
      var el = e.target.closest('.bank-gem');
      if (el) toggleGem(el.dataset.color);
    });
    // 桌面卡牌点击
    $('board-wrap').addEventListener('click', function (e) {
      var el = e.target.closest('.card[data-card-id]');
      if (el) openCardModal(Number(el.dataset.cardId));
    });
    // 座位区事件委托：操作按钮（确认/取消）+ 预留卡点击（自己的可购买，别人的可查看）
    $('table-scene').addEventListener('click', function (e) {
      var t = e.target;
      if (t.id === 'btn-confirm-take') { confirmTake(); return; }
      if (t.id === 'btn-clear-take') { clearSelection(); return; }
      var el = t.closest('.card[data-card-id]');
      if (el) openCardModal(Number(el.dataset.cardId));
    });
    // 手机端公共宝石池与发展卡使用同一套游戏操作。
    $('mobile-bank').addEventListener('click', function (e) {
      var el = e.target.closest('.mobile-bank-gem');
      if (el && !el.disabled) toggleGem(el.dataset.color);
    });
    $('mobile-board').addEventListener('click', function (e) {
      var el = e.target.closest('.card[data-card-id]');
      if (el) openCardModal(Number(el.dataset.cardId));
    });
    $('modal-box').addEventListener('click', function (e) {
      var el = e.target.closest('.mobile-reserved-card[data-card-id]');
      if (el) openCardModal(Number(el.dataset.cardId));
    });
    $('mobile-clear').addEventListener('click', clearSelection);
    $('mobile-confirm').addEventListener('click', confirmTake);
    $('mobile-menu-button').addEventListener('click', openMobileMenu);
    $('desktop-menu-button').addEventListener('click', openMobileMenu);
    ['mobile-seat-top', 'mobile-seat-left', 'mobile-seat-right', 'mobile-seat-self'].forEach(function (id) {
      $(id).addEventListener('click', function () {
        if (this.dataset.playerIndex !== '') openMobilePlayer(this.dataset.playerIndex);
      });
    });
    // 顶栏按钮
    $('btn-restart').addEventListener('click', openRestartConfirm);
    $('btn-rules').addEventListener('click', openRules);
    $('btn-sound').addEventListener('click', toggleSound);
    $('btn-undo').addEventListener('click', undoTurn);
    // 主菜单按钮
    $('btn-menu-start').addEventListener('click', startGame);
    $('btn-menu-rules').addEventListener('click', openRules);
    $('btn-menu-contact').addEventListener('click', function () {
      openPlaceholder('联系开发者', '联系开发者功能正在制作中，敬请期待！');
    });
    // 联机大厅按钮
    $('btn-menu-net').addEventListener('click', openNetLobby);
    $('btn-net-create').addEventListener('click', netCreate);
    $('btn-net-join').addEventListener('click', netJoin);
    $('btn-net-start').addEventListener('click', netStartGame);
    $('btn-net-leave').addEventListener('click', netLeave);
    $('btn-net-back').addEventListener('click', backFromNet);
    $('net-diff-slider').addEventListener('input', onNetDiffInput);
    $('net-players-slider').addEventListener('input', onNetPlayersInput);
    $('net-diff-prev').addEventListener('click', function () { stepNetDiff(-1); });
    $('net-diff-next').addEventListener('click', function () { stepNetDiff(1); });
    $('net-players-prev').addEventListener('click', function () { stepNetPlayers(-1); });
    $('net-players-next').addEventListener('click', function () { stepNetPlayers(1); });
    bindNet();
    // 主菜单难度/人数拉条
    $('diff-slider').addEventListener('input', onDiffInput);
    $('players-slider').addEventListener('input', onPlayersInput);
    $('diff-prev').addEventListener('click', function () { stepDiff(-1); });
    $('diff-next').addEventListener('click', function () { stepDiff(1); });
    $('players-prev').addEventListener('click', function () { stepPlayers(-1); });
    $('players-next').addEventListener('click', function () { stepPlayers(1); });
    // 弹窗遮罩：可关闭时点击关闭
    $('modal-mask').addEventListener('click', function (e) {
      if (e.target === this && this.dataset.closeable === '1') hideModal();
    });
  }

  /* ---------------- 错误捕获（便于排查） ---------------- */
  window.addEventListener('error', function (e) {
    var el = document.getElementById('js-error');
    if (el) el.textContent = 'JS错误: ' + (e.message || e) + ' @ ' + (e.filename || '') + ':' + (e.lineno || '');
  });

  /* ---------------- 启动 ---------------- */
  function init() {
    bind();
    preloadArtAssets();
    updateMenuControls();
    showMainMenu(); // 先显示主菜单，点「开始游戏」后进入对局
    resumeNetOnLoad();
  }

  var UI = {
    init: init,
    preloadArtAssets: preloadArtAssets,
    startGame: startGame,
    backToMenu: backToMenu,
    toggleGem: toggleGem,
    confirmTake: confirmTake,
    clearSelection: clearSelection,
    buyFromModal: buyFromModal,
    reserveFromModal: reserveFromModal,
    openBlindReserveConfirm: openBlindReserveConfirm,
    blindReserve: blindReserve,
    chooseNobleModal: chooseNobleModal,
    returnOne: returnOne,
    undoReturn: undoReturn,
    confirmDiscard: confirmDiscard,
    humanRelief: humanRelief,
    undoTurn: undoTurn,
    onDiffInput: onDiffInput,
    onPlayersInput: onPlayersInput,
    stepDiff: stepDiff,
    stepPlayers: stepPlayers,
    restart: restart,
    hideModal: hideModal,
    openRules: openRules,
    toggleSound: toggleSound,
    openRestartConfirm: openRestartConfirm,
    openMobilePlayer: openMobilePlayer,
    openMobileMenu: openMobileMenu,
    openNetLobby: openNetLobby,
    backFromNet: backFromNet,
    netCreate: netCreate,
    netJoin: netJoin,
    netStartGame: netStartGame,
    netLeave: netLeave,
    getState: function () { return st; }
  };
  window.UI = UI;
  window.SplendorUI = UI;

  init();
})();
