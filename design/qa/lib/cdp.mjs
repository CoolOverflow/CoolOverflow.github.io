#!/usr/bin/env node
/**
 * design/qa/lib/cdp.mjs — tiny zero-dependency Chrome DevTools Protocol client.
 *
 * Node >= 22 has a global `WebSocket`, so we only need `child_process` + `fetch`.
 * Used by cdp-audit.mjs (real interaction tests) and could be reused by shots.mjs.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Users/YH-01783/AppData/Local/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error('no Chrome/Chromium found; set CHROME_PATH');
  return found;
}

/** Launch a headless browser with CDP enabled. Returns { child, port, profileDir }. */
export function launchChrome({ port = 9433, profileDir } = {}) {
  const chrome = findChrome();
  const dir = profileDir || path.join(os.tmpdir(), 'dsh-qa-profile-' + port);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const child = spawn(
    chrome,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-device-scale-factor=1',
      '--force-color-profile=srgb',
      '--mute-audio',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${dir}`,
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true }
  );
  return { child, port, profileDir: dir };
}

export async function waitForDevtools(port, timeoutMs = 20000) {
  const t0 = Date.now();
  let lastErr = null;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch (e) {
      lastErr = e;
    }
    await sleep(100);
  }
  throw new Error('devtools not reachable: ' + (lastErr && lastErr.message));
}

/** A single page target (tab). Wraps one CDP websocket. */
export class Page {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.waiters = [];
    this.records = {
      console: [],
      exceptions: [],
      logEntries: [],
      failedRequests: [],
      badResponses: [],
      requests: 0,
    };
    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
      } catch (e) {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      if (!msg.method) return;
      this._collect(msg.method, msg.params);
      for (let i = 0; i < this.waiters.length; i++) {
        const w = this.waiters[i];
        if (w.method !== msg.method) continue;
        if (w.predicate && !w.predicate(msg.params)) continue;
        this.waiters.splice(i, 1);
        w.resolve(msg.params);
        break;
      }
    });
  }

  _collect(method, params) {
    if (method === 'Runtime.consoleAPICalled') {
      const text = (params.args || [])
        .map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type))
        .join(' ');
      this.records.console.push({ type: params.type, text, url: (params.stackTrace && params.stackTrace.callFrames[0] && params.stackTrace.callFrames[0].url) || '' });
    } else if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails || {};
      this.records.exceptions.push({ text: d.exception ? d.exception.description || d.exception.value : d.text, url: d.url, line: d.lineNumber });
    } else if (method === 'Log.entryAdded') {
      this.records.logEntries.push({ level: params.entry.level, text: params.entry.text, url: params.entry.url, source: params.entry.source });
    } else if (method === 'Network.loadingFailed') {
      this.records.failedRequests.push({ url: params.documentURL || '', error: params.errorText, type: params.type });
    } else if (method === 'Network.responseReceived') {
      this.records.requests++;
      if (params.response && params.response.status >= 400) {
        this.records.badResponses.push({ url: params.response.url, status: params.response.status, type: params.type });
      }
    }
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP timeout: ' + method));
        }
      }, timeoutMs);
    });
  }

  waitForEvent(method, predicate, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const waiter = { method, predicate, resolve };
      this.waiters.push(waiter);
      setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) {
          this.waiters.splice(i, 1);
          reject(new Error('event timeout: ' + method));
        }
      }, timeoutMs);
    });
  }

  async init() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Log.enable');
    await this.send('Network.enable');
  }

  async setViewport(width, height = 900) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 500,
      screenWidth: width,
      screenHeight: height,
    });
  }

  /** Navigate and wait for the load event (best effort, then settle). */
  async goto(url, { settle = 450, timeoutMs = 25000 } = {}) {
    const loaded = this.waitForEvent('Page.loadEventFired', null, timeoutMs).catch(() => null);
    await this.send('Page.navigate', { url });
    await loaded;
    await sleep(settle);
    return this;
  }

  async reload({ settle = 500 } = {}) {
    const loaded = this.waitForEvent('Page.loadEventFired', null, 15000).catch(() => null);
    await this.send('Page.reload', { ignoreCache: false });
    await loaded;
    await sleep(settle);
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('page evaluate failed: ' + ((d.exception && d.exception.description) || d.text));
    }
    return r.result ? r.result.value : undefined;
  }

  async click(selector) {
    const ok = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.scrollIntoView({block:'center'});
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error('click: element not found: ' + selector);
  }

  /** Real trusted key event through the input pipeline. */
  async key(key, code, windowsVirtualKeyCode, { text } = {}) {
    const base = { key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode };
    await this.send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      ...base,
      ...(text ? { text } : {}),
    });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(60);
  }

  async typeInto(selector, text) {
    await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.focus();
      return true;
    })()`);
    await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.value = ${JSON.stringify(text)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return el.value;
    })()`);
    await sleep(180);
  }

  async waitFor(expression, timeoutMs = 4000, interval = 80) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try {
        if (await this.evaluate(expression)) return true;
      } catch (e) {}
      await sleep(interval);
    }
    return false;
  }

  resetRecords() {
    this.records = { console: [], exceptions: [], logEntries: [], failedRequests: [], badResponses: [], requests: 0 };
  }

  close() {
    try {
      this.ws.close();
    } catch (e) {}
  }
}

/** Open a fresh page target on the browser. */
export async function newPage(port) {
  let target;
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  if (res.ok) target = await res.json();
  else {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('ws connect failed')), { once: true });
  });
  const page = new Page(ws);
  await page.init();
  return { page, targetId: target.id };
}

export async function closePage(port, targetId) {
  try {
    await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`);
  } catch (e) {}
}

/** Turn raw CDP records into error/warning lists (ignores noise we do not care about). */
export function summarizeRecords(records) {
  const errors = [];
  const warnings = [];
  for (const c of records.console) {
    if (c.type === 'error' || c.type === 'assert') errors.push('console.error: ' + c.text);
    else if (c.type === 'warning') warnings.push('console.warn: ' + c.text);
  }
  for (const e of records.exceptions) errors.push('uncaught: ' + e.text);
  for (const l of records.logEntries) {
    if (l.level === 'error') errors.push('log.error: ' + l.text + (l.url ? ' (' + l.url + ')' : ''));
    else if (l.level === 'warning') warnings.push('log.warn: ' + l.text);
  }
  for (const b of records.badResponses) errors.push(`http ${b.status}: ${b.url}`);
  for (const f of records.failedRequests) {
    if (f.error === 'net::ERR_ABORTED') continue; // navigation aborts are normal
    errors.push(`request failed: ${f.error} ${f.url}`);
  }
  return { errors, warnings };
}
