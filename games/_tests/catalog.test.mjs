import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const gamesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.resolve(gamesRoot, '..');
const catalogPath = path.join(siteRoot, 'data', 'games.json');

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const ACCENTS = new Set(['#7cffb2', '#5ce1e6', '#ffc857']);

test('游戏清单：JSON 合法、id 唯一、状态只有 playable / soon', () => {
  assert.ok(Array.isArray(catalog));
  assert.ok(catalog.length >= 4, '至少要有 3 个游戏 + 1 个即将上线占位');
  const ids = new Set();
  for (const game of catalog) {
    assert.equal(typeof game.id, 'string');
    assert.ok(game.id.length > 0);
    assert.ok(!ids.has(game.id), `id 重复：${game.id}`);
    ids.add(game.id);
    assert.ok(['playable', 'soon'].includes(game.status), `未知状态：${game.status}`);
    assert.equal(typeof game.title, 'string');
    assert.equal(typeof game.desc, 'string');
    assert.ok(game.desc.length >= 10, `${game.id} 的描述太短`);
  }
});

test('游戏清单：每个 playable 条目都指向真实、可离线打开的页面', () => {
  for (const game of catalog.filter((item) => item.status === 'playable')) {
    assert.match(game.path, /^\/games\/[a-z0-9-]+\/$/, `${game.id} 的 path 格式不对`);
    const dirName = game.path.split('/')[2];
    const dir = path.join(gamesRoot, dirName);
    assert.ok(existsSync(path.join(dir, 'index.html')), `${game.id} 缺少 index.html`);
    assert.ok(existsSync(path.join(dir, 'logic.mjs')), `${game.id} 缺少 logic.mjs`);
    assert.ok(existsSync(path.join(dir, 'logic.classic.js')), `${game.id} 缺少 logic.classic.js`);
    assert.ok(existsSync(path.join(dir, 'game.js')), `${game.id} 缺少 game.js`);
    assert.ok(existsSync(path.join(dir, 'style.css')), `${game.id} 缺少 style.css`);

    const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
    assert.ok(html.includes(`<title>${game.title}`), `${game.id} 的 title 与清单不一致`);
    assert.ok(html.includes('data-game="' + dirName + '"'), `${game.id} 的外壳 data-game 不一致`);

    const accent = String(game.accent || '').toLowerCase();
    assert.ok(ACCENTS.has(accent), `${game.id} 的 accent 不在站点色板内：${game.accent}`);
    const css = readFileSync(path.join(dir, 'style.css'), 'utf8');
    assert.ok(
      css.toLowerCase().includes('--accent: ' + accent),
      `${game.id} 的 style.css 主题色应与 data/games.json 的 accent 一致`,
    );
  }
});

test('游戏清单：即将上线占位没有 path、不可点击', () => {
  const soon = catalog.filter((item) => item.status === 'soon');
  assert.ok(soon.length >= 1, '至少保留一个"即将上线"占位');
  for (const item of soon) {
    assert.ok(!item.path, `${item.id} 是占位卡，不应该有 path`);
  }
});

test('样式：所有 CSS 花括号成对（防止手改后语法破损）', () => {
  const cssFiles = [
    path.join(gamesRoot, '_shared', 'game-shell.css'),
    ...catalog
      .filter((item) => item.status === 'playable')
      .map((item) => path.join(gamesRoot, item.path.split('/')[2], 'style.css')),
  ];
  for (const file of cssFiles) {
    const css = readFileSync(file, 'utf8');
    const opens = (css.match(/{/g) || []).length;
    const closes = (css.match(/}/g) || []).length;
    assert.equal(opens, closes, `${file} 的花括号数量不匹配`);
  }
});

test('页面脚本：querySelector 用到的元素 / 数据属性都存在于 HTML', () => {
  for (const item of catalog.filter((entry) => entry.status === 'playable')) {
    const dir = path.join(gamesRoot, item.path.split('/')[2]);
    const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
    const scripts = ['game.js'].map((name) => readFileSync(path.join(dir, name), 'utf8'));
    const shell = readFileSync(path.join(gamesRoot, '_shared', 'game-shell.js'), 'utf8');
    scripts.push(shell);

    for (const source of scripts) {
      const selectors = [...source.matchAll(/querySelector(?:All)?\(\s*'([^']+)'\s*\)/g)].map(
        (match) => match[1],
      );
      for (const selector of selectors) {
        const present = (() => {
          if (selector.startsWith('[')) {
            const attr = selector.match(/^\[([\w-]+)/)[1];
            return new RegExp('\\b' + attr + '(?=[\\s=>])').test(html);
          }
          if (selector.startsWith('.')) {
            return selector
              .split(/\s+/)
              .filter((part) => part.startsWith('.'))
              .every((part) => new RegExp('\\b' + part.slice(1) + '\\b').test(html));
          }
          return html.includes(selector);
        })();
        assert.ok(present, `${item.id}: 脚本里查询了 ${selector}，但 HTML 里没有`);
      }
    }
  }
});

test('页面脚本：不发起网络请求（离线可用）', () => {
  for (const item of catalog.filter((entry) => entry.status === 'playable')) {
    const dir = path.join(gamesRoot, item.path.split('/')[2]);
    const files = ['game.js', 'logic.mjs', 'logic.classic.js'].map((name) =>
      readFileSync(path.join(dir, name), 'utf8'),
    );
    files.push(readFileSync(path.join(gamesRoot, '_shared', 'game-shell.js'), 'utf8'));
    for (const source of files) {
      assert.ok(!/\bfetch\s*\(/.test(source), `${item.id}: 不应使用 fetch`);
      assert.ok(!/XMLHttpRequest/.test(source), `${item.id}: 不应使用 XMLHttpRequest`);
      assert.ok(!/https?:\/\//.test(source), `${item.id}: 脚本里不应出现外部 URL`);
    }
  }
});
