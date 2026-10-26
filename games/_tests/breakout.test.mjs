import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WIDTH,
  HEIGHT,
  ROWS,
  COLS,
  MAX_LEVEL,
  PADDLE_W,
  PADDLE_TOP,
  BALL_R,
  createGame,
  setPaddle,
  launch,
  step,
  togglePause,
  buildBricks,
  bricksRemaining,
} from '../breakout/logic.mjs';

function runningState(overrides = {}) {
  const game = createGame({ rng: () => 0.5 });
  return {
    ...game,
    ...overrides,
    status: 'running',
    events: [],
  };
}

function brickAt(state, row) {
  return state.bricks.find((brick) => brick.row === row);
}

test('打砖块：初始局面 ready，砖块 / 生命 / 球位置正确', () => {
  const game = createGame();
  assert.equal(game.status, 'ready');
  assert.equal(game.lives, 3);
  assert.equal(game.level, 1);
  assert.equal(game.bricks.length, ROWS * COLS);
  assert.equal(bricksRemaining(game), ROWS * COLS);
  assert.equal(game.ball.vx, 0);
  assert.equal(game.ball.vy, 0);
  assert.equal(game.ball.y, PADDLE_TOP - BALL_R);
  assert.ok(buildBricks(2).length === ROWS * COLS);
});

test('打砖块：挡板会被限制在屏幕内，ready 时球跟着挡板', () => {
  const game = createGame();
  const left = setPaddle(game, -500);
  assert.equal(left.paddleX, PADDLE_W / 2);
  const right = setPaddle(game, WIDTH + 500);
  assert.equal(right.paddleX, WIDTH - PADDLE_W / 2);
  assert.equal(right.ball.x, right.paddleX);
  assert.equal(right.ball.y, PADDLE_TOP - BALL_R);
});

test('打砖块：发球后状态为 running，速度等于当前关卡速度且向上', () => {
  const game = createGame();
  const launched = launch(game, () => 0.5);
  assert.equal(launched.status, 'running');
  assert.equal(launched.ball.vy, -game.speed);
  assert.ok(Math.abs(launched.ball.vx) < 1e-9);
  const speed = Math.hypot(launched.ball.vx, launched.ball.vy);
  assert.ok(Math.abs(speed - game.speed) < 1e-9);
});

test('打砖块：左右墙和顶墙会反弹', () => {
  const left = step(runningState({
    ball: { x: BALL_R + 2, y: 250, vx: -400, vy: 0, r: BALL_R },
  }), 0.02);
  assert.ok(left.ball.vx > 0, '左墙应反弹');
  assert.ok(left.ball.x >= BALL_R);

  const right = step(runningState({
    ball: { x: WIDTH - BALL_R - 2, y: 250, vx: 400, vy: 0, r: BALL_R },
  }), 0.02);
  assert.ok(right.ball.vx < 0, '右墙应反弹');

  const top = step(runningState({
    ball: { x: WIDTH / 2, y: BALL_R + 2, vx: 0, vy: -400, r: BALL_R },
  }), 0.02);
  assert.ok(top.ball.vy > 0, '顶墙应反弹');
  assert.ok(top.ball.y >= BALL_R);
});

test('打砖块：挡板反弹后球向上，且靠右击中会向右飞', () => {
  const base = createGame();
  const state = {
    ...base,
    status: 'running',
    events: [],
    ball: { x: base.paddleX + 30, y: PADDLE_TOP - BALL_R - 5, vx: 0, vy: 300, r: BALL_R },
  };
  const after = step(state, 0.05);
  assert.ok(after.ball.vy < 0, '挡板应把球弹回去');
  assert.ok(after.ball.vx > 0, '击中挡板右侧后球应向右');
  assert.ok(after.ball.y < PADDLE_TOP, '球不能陷进挡板');
  assert.ok(after.events.some((e) => e.type === 'paddle'));
});

test('打砖块：撞砖块会扣血、加分、反弹，砖块碎掉后标记死亡', () => {
  const base = createGame();
  const brick = brickAt(base, 4); // 最下面一排只有 1 点血、下方是空地
  const state = {
    ...base,
    status: 'running',
    events: [],
    ball: {
      x: brick.x + brick.w / 2,
      y: brick.y + brick.h + BALL_R + 0.5,
      vx: 0,
      vy: -300,
      r: BALL_R,
    },
  };
  const after = step(state, 0.02);
  const hit = after.bricks.find((b) => b.id === brick.id);
  assert.equal(hit.alive, false);
  assert.equal(hit.hp, 0);
  assert.ok(after.score >= 15, `得分应至少 15，实际 ${after.score}`);
  assert.ok(after.ball.vy > 0, '撞到砖底后球应向下反弹');
  assert.equal(bricksRemaining(after), base.bricks.length - 1);
  assert.ok(after.events.some((e) => e.type === 'brickBreak'));
});

test('打砖块：两格血的砖需要打两次', () => {
  const base = createGame();
  const brick = brickAt(base, 0); // 顶排 2 点血，从上方打不会连带撞到别的砖
  const ballAbove = (state) => ({
    ...state,
    ball: {
      x: brick.x + brick.w / 2,
      y: brick.y - BALL_R - 0.5,
      vx: 0,
      vy: 300,
      r: BALL_R,
    },
  });
  const first = step(ballAbove({ ...base, status: 'running', events: [] }), 0.02);
  const afterFirst = first.bricks.find((b) => b.id === brick.id);
  assert.equal(afterFirst.hp, 1);
  assert.equal(afterFirst.alive, true);
  assert.equal(first.score, 5);

  const second = step(ballAbove({ ...first, status: 'running', events: [] }), 0.02);
  const afterSecond = second.bricks.find((b) => b.id === brick.id);
  assert.equal(afterSecond.alive, false);
  assert.ok(second.score > first.score);
});

test('打砖块：高速球不会穿过砖块', () => {
  const base = createGame();
  const brick = brickAt(base, 4);
  const state = {
    ...base,
    status: 'running',
    events: [],
    ball: {
      x: brick.x + brick.w / 2,
      y: brick.y + brick.h + 1,
      vx: 0,
      vy: -720,
      r: BALL_R,
    },
  };
  const after = step(state, 0.05);
  assert.equal(after.bricks.find((b) => b.id === brick.id).alive, false, '高速球也应撞碎砖块');
  assert.ok(after.ball.y > brick.y, '球应被挡在砖块下方而不是穿过去');
  assert.ok(after.ball.vy > 0, '反弹方向应朝下');
});

test('打砖块：掉到底部扣命并回到 ready，命用完就结束', () => {
  const base = createGame();
  const lost = step({
    ...base,
    status: 'running',
    events: [],
    ball: { x: 200, y: HEIGHT + 50, vx: 10, vy: 300, r: BALL_R },
  }, 0.016);
  assert.equal(lost.lives, 2);
  assert.equal(lost.status, 'ready');
  assert.equal(lost.ball.y, PADDLE_TOP - BALL_R);
  assert.ok(lost.events.some((e) => e.type === 'lifeLost'));

  const over = step({
    ...base,
    lives: 1,
    status: 'running',
    events: [],
    ball: { x: 200, y: HEIGHT + 50, vx: 10, vy: 300, r: BALL_R },
  }, 0.016);
  assert.equal(over.lives, 0);
  assert.equal(over.status, 'over');
  assert.equal(over.ball, null);
});

test('打砖块：清空砖块进入下一关，速度和砖块重建', () => {
  const base = createGame();
  const state = {
    ...base,
    status: 'running',
    events: [],
    bricks: buildBricks(1).map((brick) => ({ ...brick, alive: false, hp: 0 })),
    ball: { x: WIDTH / 2, y: 250, vx: 0, vy: -100, r: BALL_R },
  };
  const after = step(state, 0.016);
  assert.equal(after.level, 2);
  assert.equal(after.status, 'ready');
  assert.equal(after.bricks.length, ROWS * COLS);
  assert.ok(after.speed > base.speed);
  assert.equal(after.ball.vx, 0);
  assert.ok(after.events.some((e) => e.type === 'level'));
});

test('打砖块：最后一关清空后通关', () => {
  const base = createGame({ level: MAX_LEVEL });
  const state = {
    ...base,
    status: 'running',
    events: [],
    bricks: buildBricks(MAX_LEVEL).map((brick) => ({ ...brick, alive: false, hp: 0 })),
    ball: { x: WIDTH / 2, y: 250, vx: 0, vy: -100, r: BALL_R },
  };
  const after = step(state, 0.016);
  assert.equal(after.status, 'won');
  assert.ok(after.events.some((e) => e.type === 'win'));
});

test('打砖块：暂停后物理不推进', () => {
  const game = launch(createGame(), () => 0.5);
  const paused = togglePause(game);
  assert.equal(paused.status, 'paused');
  assert.equal(step(paused, 0.1), paused);
});
