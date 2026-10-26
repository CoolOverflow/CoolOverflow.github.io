import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createGamePage } from './_fake-dom.mjs';

const gamesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.resolve(gamesRoot, '..');

const GAMES = [
  { id: 'snake', title: '贪吃蛇' },
  { id: '2048', title: '2048' },
  { id: 'breakout', title: '打砖块' },
];

/* ---------------- 静态资源 / SEO / 离线约束 ---------------- */

for (const { id, title } of GAMES) {
  test(`页面：${id} 的 HTML 引用都存在且可离线运行`, () => {
    const dir = path.join(gamesRoot, id);
    const html = readFileSync(path.join(dir, 'index.html'), 'utf8');

    assert.ok(html.includes('<title>'), '缺少 <title>');
    assert.ok(html.includes(title), '<title> 里应包含游戏名');
    assert.match(html, /<meta name="description" content="[^"]{20,}">/, '缺少有效的 meta description');
    assert.ok(
      html.includes(`<link rel="canonical" href="https://cooloverflow.github.io/games/${id}/">`),
      'canonical 地址不正确',
    );
    assert.ok(!html.includes('type="module"'), '页面脚本不能用 type="module"（headless file:// 受限）');
    assert.ok(html.includes('logic.classic.js'), '页面应加载经典版逻辑脚本');

    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
    for (const ref of refs) {
      if (/^https?:\/\//.test(ref)) {
        assert.equal(
          ref,
          `https://cooloverflow.github.io/games/${id}/`,
          `页面不应引用外部网络资源：${ref}`,
        );
        continue;
      }
      if (ref.startsWith('#') || ref.startsWith('data:')) continue;
      const target = path.resolve(dir, ref.split('?')[0].split('#')[0]);
      assert.ok(existsSync(target), `引用的文件不存在：${ref}`);
    }

    const cssFiles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(
      (match) => path.resolve(dir, match[1]),
    );
    assert.ok(cssFiles.length >= 2, '应同时加载 game-shell.css 和游戏自己的 style.css');
    for (const cssFile of cssFiles) {
      const css = readFileSync(cssFile, 'utf8');
      assert.ok(!/@import\s+url\(\s*['"]?https?/.test(css), `CSS 不应 @import 网络字体：${cssFile}`);
      assert.ok(!/url\(\s*['"]?https?/.test(css), `CSS 不应引用网络资源：${cssFile}`);
    }
  });
}

/* ---------------- 真实页面脚本冒烟测试 ---------------- */

test('贪吃蛇：脚本可执行、2 秒倒计时开始、可暂停 / 重开、Canvas 有绘制', () => {
  const page = createGamePage(siteRoot, 'snake');
  page.run();
  assert.deepEqual(page.errors, []);

  const overlay = page.querySelector('[data-overlay]');
  const overlayTitle = page.querySelector('[data-overlay-title]');
  assert.ok(overlay.classList.contains('is-open'), '进入页面应显示倒计时遮罩');
  assert.equal(overlayTitle.textContent, '2');

  page.advance(1200);
  assert.equal(overlayTitle.textContent, '1', '1 秒后倒计时应变成 1');
  page.advance(1300);
  assert.equal(overlay.classList.contains('is-open'), false, '2 秒后应自动开始');
  assert.ok(page.drawCalls.count > 100, '应该持续绘制 Canvas');

  page.dispatchKey('Space');
  assert.ok(overlay.classList.contains('is-open'), '空格应暂停并弹出遮罩');
  assert.equal(overlayTitle.textContent, '已暂停');
  page.dispatchKey('Space');
  assert.equal(overlay.classList.contains('is-open'), false, '再按空格应继续');

  page.dispatchKey('ArrowUp');
  page.dispatchPointer('pointerdown', { clientX: 500, clientY: 300 });
  page.dispatchPointer('pointermove', { clientX: 340, clientY: 300 });
  page.dispatchPointer('pointerup', {});
  page.advance(400);

  page.dispatchKey('KeyR');
  page.advance(100);
  assert.equal(overlayTitle.textContent, '2', '重开后重新倒计时');
  assert.deepEqual(page.errors, []);

  const canvas = page.querySelector('[data-canvas]');
  assert.ok(canvas.width > 0 && canvas.height > 0, 'canvas 应按 DPR 设置像素尺寸');
});

test('2048：打开即可滑动、合并有动画数据、撤销 / 重开可用', () => {
  const page = createGamePage(siteRoot, '2048');
  page.run();
  assert.deepEqual(page.errors, []);

  const tiles = page.querySelector('[data-tiles]');
  const movesEl = page.querySelector('[data-moves]');
  const scoreEl = page.querySelector('[data-score]');
  const undoBtn = page.querySelector('[data-action="undo"]');

  assert.equal(tiles.children.length, 2, '开局应有 2 块瓷砖');
  assert.equal(scoreEl.textContent, '0');
  assert.equal(undoBtn.disabled, true, '没有历史时撤销按钮应禁用');
  for (const tileEl of tiles.children) {
    assert.match(tileEl.style.transform, /translate\(/, '瓷砖应通过 transform 定位');
    assert.ok(Number.parseFloat(tileEl.style.width) > 0, '瓷砖应有尺寸');
  }

  /* 依次四个方向，至少有一个能移动 */
  ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].forEach((code) => page.dispatchKey(code));
  const movesAfter = Number(movesEl.textContent);
  assert.ok(movesAfter >= 1, '方向键应能移动瓷砖');
  assert.equal(undoBtn.disabled, false, '移动后撤销按钮应可用');

  page.click('[data-action="undo"]');
  assert.equal(Number(movesEl.textContent), movesAfter - 1, '撤销应回退一步');

  page.dispatchKey('KeyR');
  assert.equal(tiles.children.length, 2, '重开后回到 2 块瓷砖');
  assert.equal(movesEl.textContent, '0');
  assert.equal(scoreEl.textContent, '0');
  assert.deepEqual(page.errors, []);
});

test('打砖块：空格发球、拖拽挡板、暂停、重开、Canvas 有绘制', () => {
  const page = createGamePage(siteRoot, 'breakout');
  page.run();
  assert.deepEqual(page.errors, []);

  const overlay = page.querySelector('[data-overlay]');
  const overlayTitle = page.querySelector('[data-overlay-title]');
  assert.ok(overlay.classList.contains('is-open'), '进入页面应显示开始遮罩');
  assert.equal(overlayTitle.textContent, '打砖块');

  page.advance(400);
  assert.ok(page.drawCalls.count > 100, '应该持续绘制 Canvas');

  page.dispatchKey('Space');
  assert.equal(overlay.classList.contains('is-open'), false, '空格应发球');

  page.dispatchPointer('pointermove', { clientX: 420, clientY: 500 });
  page.dispatchKey('ArrowLeft');
  page.advance(600);

  page.dispatchKey('Space');
  assert.ok(overlay.classList.contains('is-open'), '空格应暂停');
  assert.equal(overlayTitle.textContent, '已暂停');
  page.dispatchKey('Space');
  assert.equal(overlay.classList.contains('is-open'), false);

  page.dispatchKey('KeyR');
  assert.ok(overlay.classList.contains('is-open'), '重开后回到开始遮罩');
  assert.equal(overlayTitle.textContent, '打砖块');
  page.advance(300);
  assert.deepEqual(page.errors, []);
});
