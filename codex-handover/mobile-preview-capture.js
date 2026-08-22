/* 使用真实 Chromium 手机视口生成 UI 验收截图。手动运行：node mobile-preview-capture.js */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const browserPath = process.env.SPLENDOR_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const debugPort = 9333;
const projectDir = path.resolve(__dirname, '..');
const profileDir = path.join(__dirname, '.mobile-preview-profile');
const outputPath = path.join(__dirname, 'mobile-ui-preview.png');
const pageUrl = process.env.SPLENDOR_PREVIEW_URL || 'http://127.0.0.1:3000/';
const viewportWidth = Math.max(320, Number(process.env.SPLENDOR_PREVIEW_WIDTH) || 390);
const viewportHeight = Math.max(560, Number(process.argv[2] || process.env.SPLENDOR_PREVIEW_HEIGHT) || 844);
const playerCount = Math.max(2, Math.min(4, Number(process.env.SPLENDOR_PREVIEW_PLAYERS) || 4));

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    req.setTimeout(1000, () => req.destroy(new Error('DevTools timeout')));
  });
}

async function findPage() {
  for (let i = 0; i < 50; i++) {
    try {
      const pages = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
      const page = pages.find(item => item.type === 'page');
      if (page) return page;
    } catch (_) {}
    await delay(100);
  }
  throw new Error('浏览器 DevTools 未就绪');
}

async function main() {
  fs.mkdirSync(profileDir, { recursive: true });
  const browser = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=' + viewportWidth + ',' + viewportHeight,
    pageUrl
  ], { cwd: projectDir, stdio: 'ignore' });

  try {
    const page = await findPage();
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });

    let nextId = 0;
    const pending = new Map();
    socket.on('message', raw => {
      const message = JSON.parse(String(raw));
      if (!message.id || !pending.has(message.id)) return;
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task.reject(new Error(message.error.message));
      else task.resolve(message.result || {});
    });

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: viewportWidth,
      screenHeight: viewportHeight
    });

    for (let i = 0; i < 50; i++) {
      const ready = await send('Runtime.evaluate', {
        expression: "document.readyState === 'complete' && !!window.UI"
      });
      if (ready.result && ready.result.value) break;
      await delay(100);
    }
    await send('Runtime.evaluate', {
      expression: "(function(){var slider=document.getElementById('players-slider');slider.value='" + playerCount + "';slider.dispatchEvent(new Event('input',{bubbles:true}));window.UI.startGame();})()"
    });
    await delay(500);

    const screenshot = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false
    });
    fs.writeFileSync(outputPath, Buffer.from(screenshot.data, 'base64'));
    socket.close();
    process.stdout.write(`${outputPath}\n`);
  } finally {
    browser.kill();
  }
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
