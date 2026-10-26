import test from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32 } from './_rng.mjs';
import {
  SIZE,
  TARGET,
  createGame,
  move,
  undo,
  slideLine,
  gridFromValues,
  values,
  canMove,
  maxTile,
  continueGame,
  spawnRandomTile,
} from '../2048/logic.mjs';

function tile(value, id) {
  return { id, value };
}

function lineOf(vals) {
  return vals.map((value, i) => (value ? tile(value, i + 1) : null));
}

function stateFrom(gridValues, extra = {}) {
  return {
    size: gridValues.length,
    target: TARGET,
    grid: gridFromValues(gridValues),
    score: 0,
    status: 'playing',
    won: false,
    history: [],
    nextId: 1000,
    lastSpawn: null,
    lastMoves: [],
    lastMerges: [],
    moved: false,
    ...extra,
  };
}

function countTiles(state) {
  return state.grid.flat().filter(Boolean).length;
}

test('2048：slideLine 基本合并规则', () => {
  const cases = [
    { input: [2, 2, 0, 0], output: [4, 0, 0, 0], gained: 4 },
    { input: [2, 2, 2, 2], output: [4, 4, 0, 0], gained: 8 },
    { input: [2, 2, 2, 0], output: [4, 2, 0, 0], gained: 4 },
    { input: [4, 4, 8, 8], output: [8, 16, 0, 0], gained: 24 },
    { input: [0, 0, 0, 2], output: [2, 0, 0, 0], gained: 0 },
    { input: [2, 0, 2, 0], output: [4, 0, 0, 0], gained: 4 },
    { input: [2, 4, 8, 16], output: [2, 4, 8, 16], gained: 0 },
  ];
  for (const { input, output, gained } of cases) {
    const result = slideLine(lineOf(input));
    assert.deepEqual(
      result.line.map((t) => (t ? t.value : 0)),
      output,
      `输入 ${input} 的合并结果不对`,
    );
    assert.equal(result.gained, gained, `输入 ${input} 的得分不对`);
  }
});

test('2048：单块瓷砖每步最多合并一次', () => {
  const result = slideLine(lineOf([2, 2, 2]));
  assert.deepEqual(result.line.map((t) => (t ? t.value : 0)), [4, 2, 0]);
  assert.equal(result.gained, 4);
  assert.equal(result.merges.length, 1);
});

test('2048：新开一局有两块瓷砖且都是 2 或 4', () => {
  const game = createGame({ rng: mulberry32(7) });
  assert.equal(game.size, SIZE);
  assert.equal(game.status, 'playing');
  assert.equal(countTiles(game), 2);
  assert.ok(game.grid.flat().every((t) => !t || t.value === 2 || t.value === 4));
});

test('2048：向左移动会滑行、合并并计分，同时生成一块新砖', () => {
  const game = stateFrom([
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const after = move(game, 'left', mulberry32(11));
  assert.equal(after.moved, true);
  assert.equal(after.grid[0][0].value, 4);
  assert.equal(after.score, 4);
  assert.equal(countTiles(after), 2, '合并后剩 1 块 + 新生成 1 块');
  assert.equal(after.history.length, 1);
  assert.ok(after.lastSpawn, '应该有 lastSpawn 供页面做出现动画');
  assert.ok(after.lastMoves.length >= 1, '应该有位移动画数据');
  assert.equal(after.lastMerges.length, 1);
});

test('2048：四个方向都能正确移动', () => {
  const left = move(stateFrom([
    [0, 2, 2, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]), 'left', mulberry32(1));
  assert.equal(left.grid[0][0].value, 4);

  const right = move(stateFrom([
    [0, 2, 2, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]), 'right', mulberry32(1));
  assert.equal(right.grid[0][3].value, 4);

  const up = move(stateFrom([
    [0, 0, 0, 0],
    [2, 0, 0, 0],
    [2, 0, 0, 0],
    [0, 0, 0, 0],
  ]), 'up', mulberry32(1));
  assert.equal(up.grid[0][0].value, 4);

  const down = move(stateFrom([
    [0, 0, 0, 0],
    [2, 0, 0, 0],
    [2, 0, 0, 0],
    [0, 0, 0, 0],
  ]), 'down', mulberry32(1));
  assert.equal(down.grid[3][0].value, 4);
});

test('2048：无法移动时不生成新砖、不写历史、状态不变', () => {
  const game = stateFrom([
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const before = values(game);
  const after = move(game, 'left', mulberry32(2));
  assert.equal(after.moved, false);
  assert.deepEqual(values(after), before);
  assert.equal(after.nextId, game.nextId);
  assert.equal(after.history.length, 0);
  assert.equal(after.lastSpawn, null);
});

test('2048：满盘且无相邻同值 → 不可移动 / 判定失败', () => {
  const game = stateFrom([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ]);
  assert.equal(canMove(game), false);
  const after = move(game, 'left', mulberry32(1));
  assert.equal(after.moved, false);
  assert.equal(after.status, 'lost');
});

test('2048：满盘但仍有相邻同值时仍可移动', () => {
  const game = stateFrom([
    [2, 2, 4, 8],
    [4, 8, 16, 32],
    [8, 16, 32, 64],
    [16, 32, 64, 128],
  ]);
  assert.equal(canMove(game), true);
});

test('2048：合出 2048 判定通关，continueGame 可继续', () => {
  const game = stateFrom([
    [1024, 1024, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const after = move(game, 'left', mulberry32(1));
  assert.equal(after.won, true);
  assert.equal(after.status, 'won');
  assert.equal(maxTile(after), 2048);
  const resumed = continueGame(after);
  assert.equal(resumed.status, 'playing');
});

test('2048：撤销一步可以恢复棋盘和分数', () => {
  const game = stateFrom([
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const original = values(game);
  const moved = move(game, 'left', mulberry32(3));
  assert.equal(moved.score, 4);
  const restored = undo(moved);
  assert.deepEqual(values(restored), original);
  assert.equal(restored.score, 0);
  assert.equal(restored.history.length, 0);
  const noHistory = undo(restored);
  assert.deepEqual(values(noHistory), original, '没有历史时撤销应原样返回棋盘');
  assert.equal(noHistory.history.length, 0);
});

test('2048：撤销可以连续撤回多步', () => {
  const game = stateFrom([
    [2, 0, 0, 0],
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const step1 = move(game, 'down', mulberry32(5));
  const step2 = move(step1, 'left', mulberry32(6));
  const back1 = undo(step2);
  assert.deepEqual(values(back1), values(step1));
  const back2 = undo(back1);
  assert.deepEqual(values(back2), values(game));
});

test('2048：生成新砖只落在空格，且值只能是 2 或 4', () => {
  const game = stateFrom([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 0, 2],
  ]);
  const after = spawnRandomTile(game, mulberry32(8));
  assert.equal(after.grid[3][2].value === 2 || after.grid[3][2].value === 4, true);
  assert.equal(countTiles(after), countTiles(game) + 1);
  assert.equal(after.lastSpawn.r, 3);
  assert.equal(after.lastSpawn.c, 2);
});
