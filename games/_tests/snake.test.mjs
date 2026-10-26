import test from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32 } from './_rng.mjs';
import {
  COLS,
  ROWS,
  START_LENGTH,
  SCORE_PER_FOOD,
  BASE_INTERVAL,
  SPEED_STEPS,
  createGame,
  placeFood,
  queueDirection,
  effectiveDir,
  step,
  start,
  togglePause,
  cycleSpeed,
  stepInterval,
} from '../snake/logic.mjs';

function stateWith(overrides = {}) {
  return {
    cols: 10,
    rows: 10,
    snake: [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ],
    dir: 'right',
    queue: [],
    food: { x: 8, y: 8 },
    score: 0,
    eaten: 0,
    ticks: 0,
    status: 'running',
    speedIndex: 0,
    ...overrides,
  };
}

test('蛇：初始局面合法，食物不在蛇身上，等待开始', () => {
  const game = createGame({ rng: mulberry32(42) });
  assert.equal(game.status, 'ready');
  assert.equal(game.snake.length, START_LENGTH);
  assert.equal(game.score, 0);
  assert.ok(game.food, '应该有食物');
  assert.ok(
    !game.snake.some((seg) => seg.x === game.food.x && seg.y === game.food.y),
    '食物不能落在蛇身上',
  );
  const keys = new Set(game.snake.map((seg) => `${seg.x},${seg.y}`));
  assert.equal(keys.size, game.snake.length, '蛇身不能自我重叠');
});

test('蛇：吃到食物后长度 +1、分数 +10，并生成新食物', () => {
  const before = stateWith({ food: { x: 6, y: 5 } });
  const after = step(before, mulberry32(1));
  assert.equal(after.snake.length, before.snake.length + 1);
  assert.deepEqual(after.snake[0], { x: 6, y: 5 });
  assert.equal(after.score, SCORE_PER_FOOD);
  assert.equal(after.eaten, 1);
  assert.ok(after.food, '吃完应该生成新食物');
  assert.ok(
    !after.snake.some((seg) => seg.x === after.food.x && seg.y === after.food.y),
    '新食物不能在蛇身上',
  );
});

test('蛇：没吃到食物时长度不变，头前进一格', () => {
  const before = stateWith();
  const after = step(before, mulberry32(1));
  assert.equal(after.snake.length, before.snake.length);
  assert.deepEqual(after.snake[0], { x: 6, y: 5 });
  assert.equal(after.snake[after.snake.length - 1].x, 4);
  assert.equal(after.status, 'running');
});

test('蛇：撞墙立刻结束', () => {
  const before = stateWith({
    snake: [
      { x: COLS - 1, y: 5 },
      { x: COLS - 2, y: 5 },
      { x: COLS - 3, y: 5 },
    ],
  });
  const after = step(before, mulberry32(1));
  assert.equal(after.status, 'over');
});

test('蛇：撞到自身结束', () => {
  // 头朝下，会撞到身体第 4 节（不是尾巴）
  const before = stateWith({
    snake: [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
    ],
    dir: 'down',
  });
  const after = step(before, mulberry32(1));
  assert.equal(after.status, 'over');
});

test('蛇：可以走进本步即将腾空的尾巴格', () => {
  const before = stateWith({
    snake: [
      { x: 5, y: 5 },
      { x: 5, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 5 },
    ],
    dir: 'left',
    food: { x: 0, y: 0 },
  });
  const after = step(before, mulberry32(1));
  assert.equal(after.status, 'running');
  assert.deepEqual(after.snake[0], { x: 4, y: 5 });
  assert.equal(after.snake.length, 4);
});

test('蛇：反向输入被忽略，不会被自己秒杀', () => {
  const game = stateWith({ dir: 'right', queue: [] });
  const after = queueDirection(game, 'left');
  assert.equal(after, game, '反向输入应原样返回');
  assert.equal(effectiveDir(after), 'right');
});

test('蛇：连续两个转向输入按顺序执行', () => {
  let game = stateWith({ dir: 'right' });
  game = queueDirection(game, 'up');
  game = queueDirection(game, 'left');
  assert.deepEqual(game.queue, ['up', 'left']);
  game = start(game);
  game = step(game);
  assert.equal(game.dir, 'up');
  game = step(game);
  assert.equal(game.dir, 'left');
});

test('蛇：ready / paused 状态下 step 不动', () => {
  const ready = createGame({ rng: mulberry32(3) });
  assert.equal(step(ready), ready);
  const running = start(ready);
  const paused = togglePause(running);
  assert.equal(paused.status, 'paused');
  assert.equal(step(paused), paused);
  assert.equal(togglePause(paused).status, 'running');
});

test('蛇：速度档位循环，间隔按档位缩短', () => {
  let game = stateWith();
  assert.equal(stepInterval(game), BASE_INTERVAL);
  const seen = [];
  for (let i = 0; i < SPEED_STEPS.length; i += 1) {
    game = cycleSpeed(game);
    seen.push(stepInterval(game));
  }
  assert.deepEqual(
    seen,
    [SPEED_STEPS[1], SPEED_STEPS[2], SPEED_STEPS[0]].map((s) => BASE_INTERVAL / s),
  );
  // 转满一圈回到 1x
  assert.equal(game.speedIndex, 0);
});

test('蛇：棋盘放满时 placeFood 返回 null', () => {
  const full = {
    cols: 2,
    rows: 2,
    snake: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
  };
  assert.equal(placeFood(full, mulberry32(1)), null);
});

test('蛇：吃掉最后一个食物后判定通关', () => {
  let game = createGame({ cols: 5, rows: 3, length: 3, rng: mulberry32(9) });
  // 手动摆成只剩一个空格、且食物在空格上的局面
  const snake = [];
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      if (!(x === 4 && y === 2)) snake.push({ x, y });
    }
  }
  // 蛇头必须要能移动到 (4,2)：把蛇头放在 (3,2)，其余身体按蛇形排列
  const ordered = [
    { x: 3, y: 2 },
    { x: 2, y: 2 },
    { x: 1, y: 2 },
    { x: 0, y: 2 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 1 },
    { x: 4, y: 0 },
    { x: 3, y: 0 },
    { x: 2, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 0 },
  ];
  assert.equal(ordered.length, snake.length);
  game = {
    ...game,
    snake: ordered,
    dir: 'right',
    queue: [],
    food: { x: 4, y: 2 },
    status: 'running',
  };
  const after = step(game, mulberry32(1));
  assert.equal(after.food, null);
  assert.equal(after.status, 'won');
  assert.equal(after.snake.length, ordered.length + 1);
});

test('蛇：每帧只前进一格（速度不随帧率变化）', () => {
  let game = start(createGame({ cols: 20, rows: 10, rng: mulberry32(5) }));
  assert.equal(game.snake[0].x, 5);
  game = step(game);
  assert.equal(game.snake[0].x, 6);
  assert.equal(game.ticks, 1);
});
