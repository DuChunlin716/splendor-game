/* ============================================================
 * ui-strict-check.js —— 严格 DOM 桩验证
 * getElementById 找不到返回 null（模拟真实浏览器），
 * 从 index.html 解析静态 id 注册到桩。
 * 用法：node ui-strict-check.js
 * ============================================================ */
'use strict';
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const staticIds = Array.from(html.matchAll(/id="([^"]+)"/g)).map(m => m[1]);

function cls() {
  const s = new Set();
  return {
    add: (...c) => c.forEach(x => s.add(x)),
    remove: (...c) => c.forEach(x => s.delete(x)),
    toggle: (c, f) => { if (f === undefined) { s.has(c) ? s.delete(c) : s.add(c); } else { f ? s.add(c) : s.delete(c); } },
    contains: c => s.has(c)
  };
}
function el(id) {
  return {
    id, innerHTML: '', textContent: '', className: '', dataset: {}, style: {},
    disabled: false, scrollTop: 0, scrollHeight: 0, value: '',
    classList: cls(), listeners: {},
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    appendChild() {}, removeChild() {}, closest() { return null; }, querySelectorAll() { return []; }
  };
}
const els = {};
staticIds.forEach(id => { els[id] = el(id); });

const sb = { console, setTimeout, clearTimeout, Math, JSON, Object, Array, String, Number, Date, window: null };
sb.window = sb;
sb.AI_SPEED = 0.05;
sb.document = {
  getElementById: id => els[id] || null, // 严格：不存在返回 null
  createElement: () => el(null),
  body: { appendChild() {}, removeChild() {} }
};
sb.addEventListener = function () {};
vm.createContext(sb);

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.log('✗ ' + msg); } }

try {
  for (const f of ['data.js', 'game.js', 'aiConfig.js', 'ai_expert_weights.js', 'ai.js', 'ui.js']) {
    vm.runInContext(fs.readFileSync(f, 'utf8'), sb, { filename: f });
  }
  ok(true, '脚本加载');
} catch (e) { ok(false, '加载失败: ' + e.message); }

try {
  const manifestPaths = [
    'assets/art/v1/nobles/manifest.json',
    'assets/art/v1/cards/manifest.json',
    'assets/art/v1/decks/manifest.json',
    'assets/art/v1/gems/manifest.json',
    'assets/art/v1/table/manifest.json'
  ];
  for (const manifestPath of manifestPaths) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const base = manifestPath.replace(/manifest\.json$/, '');
    ok((manifest.assets || []).length > 0, '美术清单非空：' + manifestPath);
    for (const asset of manifest.assets || []) ok(fs.existsSync(base + asset.file), '美术文件存在：' + base + asset.file);
  }
  const css = fs.readFileSync('style.css', 'utf8');
  ok(css.includes('deck-tier-1-green-compass.webp') && css.includes('deck-tier-2-oxblood-compass.webp') && css.includes('deck-tier-3-navy-compass.webp'), '三级独立牌背已接入 CSS');
  ok(css.includes('assets/art/v1/gems/web/gem-green.webp') && css.includes('assets/art/v1/table/web/mobile-table-navy.webp'), '正式筹码与牌桌 WebP 已接入 CSS');
  ok(css.includes('grid-template-rows: 34px clamp(310px, 52vh, 370px)') && css.includes('position: relative; min-height: 166px;'),
    '手机布局保留旧安卓浏览器 vh 回退与玩家区最低高度');
  ok(css.includes('align-items: center; justify-content: center;') && css.includes('grid-template-columns: repeat(3, auto); justify-content: center;'),
    '手机玩家卡片及其信息行显式居中');
} catch (e) { ok(false, '正式美术资源检查失败：' + e.message); }

try {
  els['btn-menu-start'].listeners.click[0]();
  const humanHtml = els['seat-human'].innerHTML;
  ok(humanHtml.includes('ph-head'), '玩家主座位渲染');
  ok(els['take-ops'].innerHTML.includes('btn-confirm-take') && els['take-ops'].innerHTML.includes('sel-list'),
    '确认/取消/已选列表位于宝石池操作区');
  ok(!els['take-ops'].innerHTML.includes('btn-skip'), '正式操作区不再显示测试用跳过按钮');
  ok(els['seat-ai-1'].innerHTML.includes('pp-head'), '电脑座位渲染');
  ok(els['bank'].innerHTML.includes('bank-gem'), '宝石筹码渲染');
  ok(els['table-bank'] && els['bank'], '宝石池容器位于桌面');
  ok(els['tier-3'].innerHTML.includes('deck-stack'), '牌堆背面（盲抽）元素渲染');

  // 等人类回合（AI 先手时等它走完）
  let guard = 0;
  const waitHuman = () => {
    const st0 = sb.UI.getState();
    if (st0.currentPlayer === 0 || st0.gameOver || guard++ > 60) { doInteraction(); }
    else setTimeout(waitHuman, 100);
  };
  const doInteraction = () => {
    const doTake = () => {
      // 拿宝石：点桌面宝石池 → 选中 3 色
      const clickBank = color => els['bank'].listeners.click[0]({ target: { closest: () => ({ dataset: { color: color } }) } });
      clickBank('white'); clickBank('blue'); clickBank('green');
      const st = sb.UI.getState();
      ok(st.selection.length === 3, '选择 3 色宝石');
      // 委托点击「确认拿取」（按钮在宝石池操作区）
      els['table-scene'].listeners.click[0]({ target: { id: 'btn-confirm-take', closest: () => null } });
      ok(st.players[0].tokens.white === 1, '拿宝石生效（委托按钮）');

      setTimeout(() => {
        try {
          ok(sb.UI.getState().log.length > 0, '游戏日志有记录');
          ok(els['log'].innerHTML.includes('log-line'), '日志渲染到右侧信息栏');
          ok(els['status-line'].textContent.length > 0, '操作说明渲染');
          ok(els['btn-undo'] && els['btn-undo'].textContent.includes('撤销'), '撤销按钮可用');
          ok(els['diff-label'].textContent.length > 0, '难度标签显示');
        } catch (e) { ok(false, 'AI 回合后异常: ' + e.message); }
        console.log(failed === 0 ? '=== 严格 DOM 验证全部通过 ===' : '失败 ' + failed + ' 项');
        process.exit(failed === 0 ? 0 : 1);
      }, 500);
    };
    doTake();
  };
  setTimeout(waitHuman, 100);
} catch (e) {
  console.log('✗ 交互异常: ' + e.message);
  console.log(e.stack.split('\n').slice(0, 4).join('\n'));
  process.exit(1);
}
