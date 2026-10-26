#!/usr/bin/env node
/**
 * tools/shots.mjs — full-page screenshots via Chrome DevTools Protocol.
 *
 *   python -m http.server 8081 --bind 127.0.0.1 --directory .   # in one shell
 *   node tools/shots.mjs                                        # all pages, dark+light
 *   node tools/shots.mjs --only home,post --theme dark --width 1440
 *
 * Why CDP: headless Chrome's --screenshot only captures the viewport, and a very
 * tall --window-size produces compositing artifacts (ghost text, overlap). CDP's
 * captureBeyondViewport gives a real full-page PNG at a normal viewport size.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = getArg('--base', 'http://127.0.0.1:8081');
const OUT = getArg('--out', 'C:/Dev/Agents/cooloverflow-site/design/shots');
const ONLY = getArg('--only', '').split(',').filter(Boolean);
const THEMES = getArg('--theme', '') ? [getArg('--theme')] : ['dark', 'light'];

const candidates = [
  process.env.CHROME_PATH,
  'C:/Users/YH-01783/AppData/Local/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const chrome = candidates.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error('no headless browser found');
  process.exit(1);
}

const PAGES = [
  { name: 'home', path: '/', vw: 1440 },
  { name: 'home', path: '/', vw: 390 },
  { name: 'home', path: '/', vw: 768 },
  { name: 'blog', path: '/blog/', vw: 1440 },
  { name: 'blog', path: '/blog/', vw: 390 },
  { name: 'projects', path: '/projects/', vw: 1440 },
  { name: 'projects', path: '/projects/', vw: 390 },
  { name: 'games', path: '/games/', vw: 1440 },
  { name: 'games', path: '/games/', vw: 390 },
  { name: 'post', path: '/blog/angular-displacement-math/', vw: 1440 },
  { name: 'post', path: '/blog/angular-displacement-math/', vw: 390 },
  { name: 'post-code', path: '/blog/bresenham-line/', vw: 1440 },
  { name: '404', path: '/404.html', vw: 1440 },
  { name: 'snake', path: '/games/snake/', vw: 1280 },
  { name: 'snake', path: '/games/snake/', vw: 390 },
  { name: '2048', path: '/games/2048/', vw: 1280 },
  { name: '2048', path: '/games/2048/', vw: 390 },
  { name: 'breakout', path: '/games/breakout/', vw: 1280 },
  { name: 'breakout', path: '/games/breakout/', vw: 390 },
].filter((p) => !ONLY.length || ONLY.includes(p.name));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launchChrome(port) {
  const child = spawn(
    chrome,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--disable-extensions',
      '--force-device-scale-factor=1',
      '--allow-file-access-from-files',
      `--remote-debugging-port=${port}`,
      '--user-data-dir=' + path.join(process.env.TEMP || '/tmp', 'dsh-shots-profile-' + port),
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true, cwd: process.env.TEMP || process.cwd() }
  );
  return child;
}

async function waitForDevtools(port, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch (e) {}
    await sleep(120);
  }
  throw new Error('devtools not reachable');
}

/** minimal CDP client over a page websocket */
class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        const waiters = this.events.get(msg.method);
        if (waiters && waiters.length) waiters.shift()(msg.params);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('timeout ' + method));
        }
      }, 25000);
    });
  }
  once(method) {
    return new Promise((resolve) => {
      const arr = this.events.get(method) || [];
      arr.push(resolve);
      this.events.set(method, arr);
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluate failed');
    return r.result ? r.result.value : undefined;
  }
  close() {
    try { this.ws.close(); } catch (e) {}
  }
}

async function openPage(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const page = new Page(ws);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  return { page, targetId: target.id };
}

async function capture(port, page, { path: urlPath, vw, theme, file }) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: vw,
    height: 900,
    deviceScaleFactor: 1,
    mobile: vw < 500,
  });
  const url = `${BASE}${urlPath}?theme=${theme}&noanim=1`;
  const loaded = page.once('Page.loadEventFired');
  await page.send('Page.navigate', { url });
  await Promise.race([loaded, sleep(8000)]);
  await page.evaluate('document.fonts && document.fonts.ready ? document.fonts.ready.then(()=>1) : 1');
  await sleep(350);
  const h = await page.evaluate(
    'Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 900)'
  );
  const res = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: vw, height: Math.min(h, 12000), scale: 1 },
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  return fs.statSync(file).size;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const port = 9411;
  const child = launchChrome(port);
  let ok = 0;
  let fail = 0;
  try {
    await waitForDevtools(port);
    const { page, targetId } = await openPage(port);
    for (const theme of THEMES) {
      for (const p of PAGES) {
        const file = path.join(OUT, `${p.name}-${p.vw}-${theme}.png`);
        try {
          const size = await capture(port, page, { path: p.path, vw: p.vw, theme, file });
          ok++;
          console.log(`ok   ${path.basename(file)}  ${Math.round(size / 1024)} KB`);
        } catch (err) {
          fail++;
          console.log(`FAIL ${path.basename(file)}  ${err.message}`);
        }
      }
    }
    // cleanup target
    try { await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`); } catch (e) {}
  } finally {
    try { child.kill(); } catch (e) {}
  }
  console.log(`\n${ok} screenshots -> ${OUT}  (${fail} failed)`);
  process.exit(fail ? 1 : 0);
})();
