import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { GAMES, transform } from '../_tools/sync-logic.mjs';

const gamesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const game of GAMES) {
  test(`同步：${game}/logic.classic.js 与 logic.mjs 一致`, () => {
    const dir = path.join(gamesRoot, game);
    const source = readFileSync(path.join(dir, 'logic.mjs'), 'utf8');
    const classic = readFileSync(path.join(dir, 'logic.classic.js'), 'utf8');
    const expected = transform(source).code;
    assert.equal(
      classic,
      expected,
      `${game}/logic.classic.js 过期了，请运行：node games/_tools/sync-logic.mjs`,
    );
  });

  test(`同步：${game}/logic.classic.js 不包含模块语法`, () => {
    const source = readFileSync(path.join(gamesRoot, game, 'logic.mjs'), 'utf8');
    const classic = transform(source).code;
    assert.ok(!/^\s*export\s/m.test(classic), '经典脚本里不能出现 export');
    assert.ok(!/^\s*import\s/m.test(classic), '经典脚本里不能出现 import');
    assert.match(classic, /global\.GameLogic\s*=/, '应把导出挂到 window.GameLogic');
  });
}
