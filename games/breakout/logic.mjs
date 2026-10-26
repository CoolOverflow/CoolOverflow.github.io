/**
 * 打砖块 —— 纯规则逻辑（ES module，源码）
 *
 * 页面不直接加载本文件（headless file:// 下 type="module" 受限），
 * 而是加载由 games/_tools/sync-logic.mjs 生成的 logic.classic.js。
 * 修改本文件后请运行：node games/_tools/sync-logic.mjs
 *
 * 逻辑坐标固定为 720×405（16:9），页面只负责等比缩放绘制，
 * 所以窗口 resize 不需要重置局面。物理用固定小步长子步进，
 * 避免高速球穿过砖块或挡板。
 */

export const WIDTH = 720;
export const HEIGHT = 405;
export const PADDLE_W = 108;
export const PADDLE_H = 13;
export const PADDLE_BOTTOM_MARGIN = 34;
export const PADDLE_TOP = HEIGHT - PADDLE_BOTTOM_MARGIN - PADDLE_H;
export const BALL_R = 5;
export const BASE_SPEED = 320;
export const MAX_LEVEL = 6;
export const START_LIVES = 3;

export const ROWS = 5;
export const COLS = 9;
export const BRICK_SIDE = 44;
export const BRICK_TOP = 64;
/** 砖缝要比球的直径大，否则球贴着上一排时会被判成同时撞到下一排 */
export const BRICK_GAP = 12;
export const BRICK_H = 19;
export const BRICK_W = (WIDTH - BRICK_SIDE * 2 - (COLS - 1) * BRICK_GAP) / COLS;

/** 球离开挡板的最大角度（相对竖直方向），越靠边角度越大。 */
const MAX_PADDLE_ANGLE = Math.PI * 0.4;
/** 发球时随机角度的最大偏移 */
const LAUNCH_SPREAD = Math.PI * 0.2;
const SQUARED = (n) => n * n;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** 按关卡生成砖块：前两排是两格血，越靠上分越高。 */
export function buildBricks(level = 1) {
  const bricks = [];
  let id = 0;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const hp = row < 2 ? 2 : 1;
      bricks.push({
        id: id += 1,
        row,
        col,
        x: BRICK_SIDE + col * (BRICK_W + BRICK_GAP),
        y: BRICK_TOP + row * (BRICK_H + BRICK_GAP),
        w: BRICK_W,
        h: BRICK_H,
        hp,
        maxHp: hp,
        alive: true,
      });
    }
  }
  return bricks;
}

function makeRestingBall(state) {
  return { x: state.paddleX, y: PADDLE_TOP - BALL_R, vx: 0, vy: 0, r: BALL_R };
}

function levelSpeed(level) {
  return BASE_SPEED * (1 + 0.08 * (level - 1));
}

/** 新开一局。状态为 ready —— 等玩家按空格 / 点一下发球。 */
export function createGame(options = {}) {
  const level = options.level ?? 1;
  const state = {
    width: WIDTH,
    height: HEIGHT,
    status: 'ready', // ready | running | paused | over | won
    level,
    paddleX: WIDTH / 2,
    ball: { x: WIDTH / 2, y: PADDLE_TOP - BALL_R, vx: 0, vy: 0, r: BALL_R },
    bricks: buildBricks(level),
    score: 0,
    lives: options.lives ?? START_LIVES,
    speed: levelSpeed(level),
    events: [],
  };
  return state;
}

/** 移动挡板（传入挡板中心 x，逻辑坐标）。ready 时贴着的球会跟着走。 */
export function setPaddle(state, x) {
  const paddleX = clamp(x, PADDLE_W / 2, state.width - PADDLE_W / 2);
  const ball = state.ball && state.ball.vx === 0 && state.ball.vy === 0
    ? { ...state.ball, x: paddleX, y: PADDLE_TOP - state.ball.r }
    : state.ball;
  return { ...state, paddleX, ball };
}

/** 发球：从挡板中央向上，带一点随机角度。 */
export function launch(state, rng = Math.random) {
  if (state.status !== 'ready' || !state.ball) return state;
  const angle = (rng() * 2 - 1) * LAUNCH_SPREAD;
  const speed = state.speed;
  return {
    ...state,
    status: 'running',
    ball: {
      ...state.ball,
      vx: Math.sin(angle) * speed,
      vy: -Math.cos(angle) * speed,
    },
    events: [],
  };
}

/** 暂停 / 继续。 */
export function togglePause(state) {
  if (state.status === 'running') return { ...state, status: 'paused' };
  if (state.status === 'paused') return { ...state, status: 'running' };
  return state;
}

function circleHitsRect(x, y, r, rect) {
  const nearestX = clamp(x, rect.x, rect.x + rect.w);
  const nearestY = clamp(y, rect.y, rect.y + rect.h);
  return SQUARED(x - nearestX) + SQUARED(y - nearestY) <= SQUARED(r);
}

function aliveBricks(bricks) {
  return bricks.filter((brick) => brick.alive);
}

function resetAfterLifeLost(state, events) {
  return {
    ...state,
    events,
    ball: makeRestingBall(state),
    status: 'ready',
  };
}

function advanceLevel(state, events) {
  const nextLevel = state.level + 1;
  return {
    ...state,
    events,
    level: nextLevel,
    bricks: buildBricks(nextLevel),
    speed: levelSpeed(nextLevel),
    ball: makeRestingBall(state),
    status: 'ready',
  };
}

/** 单个物理子步（不要直接调用，用 step）。 */
function subStep(state, dt) {
  const events = state.events.slice();
  let score = state.score;
  let lives = state.lives;
  let bricks = state.bricks;
  let paddleX = state.paddleX;
  const ball = {
    x: state.ball.x + state.ball.vx * dt,
    y: state.ball.y + state.ball.vy * dt,
    vx: state.ball.vx,
    vy: state.ball.vy,
    r: state.ball.r,
  };

  // 左右墙 + 顶墙
  if (ball.x - ball.r < 0) {
    ball.x = ball.r;
    ball.vx = Math.abs(ball.vx);
    events.push({ type: 'wall' });
  } else if (ball.x + ball.r > state.width) {
    ball.x = state.width - ball.r;
    ball.vx = -Math.abs(ball.vx);
    events.push({ type: 'wall' });
  }
  if (ball.y - ball.r < 0) {
    ball.y = ball.r;
    ball.vy = Math.abs(ball.vy);
    events.push({ type: 'wall' });
  }

  // 挡板：按击中位置改变反弹角度
  const paddleLeft = paddleX - PADDLE_W / 2;
  const overlappingPaddle = ball.vy > 0
    && ball.y + ball.r >= PADDLE_TOP
    && ball.y - ball.r <= PADDLE_TOP + PADDLE_H
    && ball.x + ball.r >= paddleLeft
    && ball.x - ball.r <= paddleLeft + PADDLE_W;
  if (overlappingPaddle) {
    const rel = clamp((ball.x - paddleX) / (PADDLE_W / 2), -1, 1);
    const angle = rel * MAX_PADDLE_ANGLE;
    const speed = Math.hypot(ball.vx, ball.vy) || state.speed;
    ball.vx = Math.sin(angle) * speed;
    ball.vy = -Math.cos(angle) * speed;
    ball.y = PADDLE_TOP - ball.r - 0.01;
    events.push({ type: 'paddle' });
  }

  // 砖块：一个子步最多处理一块，避免一次撞两面产生抖动
  let hit = null;
  for (const brick of bricks) {
    if (brick.alive && circleHitsRect(ball.x, ball.y, ball.r, brick)) {
      hit = brick;
      break;
    }
  }
  if (hit) {
    const centerX = hit.x + hit.w / 2;
    const centerY = hit.y + hit.h / 2;
    const nearestX = clamp(ball.x, hit.x, hit.x + hit.w);
    const nearestY = clamp(ball.y, hit.y, hit.y + hit.h);
    let nx = ball.x - nearestX;
    let ny = ball.y - nearestY;
    const dist = Math.hypot(nx, ny);
    if (dist > 1e-6) {
      nx /= dist;
      ny /= dist;
      const dot = ball.vx * nx + ball.vy * ny;
      if (dot < 0) {
        ball.vx -= 2 * dot * nx;
        ball.vy -= 2 * dot * ny;
      }
      ball.x = nearestX + nx * (ball.r + 0.5);
      ball.y = nearestY + ny * (ball.r + 0.5);
    } else {
      // 球心已经陷进砖块内部（高速穿透）：沿穿透更浅的轴整颗推出去
      const dx = ball.x - centerX;
      const dy = ball.y - centerY;
      if (Math.abs(dx) / (hit.w / 2) > Math.abs(dy) / (hit.h / 2)) {
        nx = Math.sign(dx) || 1;
        ny = 0;
        ball.x = dx > 0 ? hit.x + hit.w + ball.r : hit.x - ball.r;
      } else {
        nx = 0;
        ny = Math.sign(dy) || 1;
        ball.y = dy > 0 ? hit.y + hit.h + ball.r : hit.y - ball.r;
      }
      const dot = ball.vx * nx + ball.vy * ny;
      if (dot < 0) {
        ball.vx -= 2 * dot * nx;
        ball.vy -= 2 * dot * ny;
      }
    }

    const nextHp = hit.hp - 1;
    const destroyed = nextHp <= 0;
    const points = destroyed ? 10 + (ROWS - hit.row) * 5 : 5;
    score += points;
    bricks = bricks.map((brick) => (brick.id === hit.id
      ? { ...brick, hp: nextHp, alive: !destroyed }
      : brick));
    events.push({
      type: destroyed ? 'brickBreak' : 'brickHit',
      id: hit.id,
      x: centerX,
      y: centerY,
      row: hit.row,
      points,
    });
  }

  // 掉到底部：掉一条命
  if (ball.y - ball.r > state.height) {
    lives -= 1;
    events.push({ type: 'lifeLost' });
    if (lives <= 0) {
      return { ...state, events, ball: null, lives: 0, score, status: 'over' };
    }
    return resetAfterLifeLost({ ...state, bricks, score, lives }, events);
  }

  // 清关
  if (aliveBricks(bricks).length === 0) {
    if (state.level >= MAX_LEVEL) {
      return {
        ...state,
        events: [...events, { type: 'win' }],
        bricks,
        score,
        lives,
        ball: null,
        status: 'won',
      };
    }
    return advanceLevel({ ...state, bricks, score, lives }, [...events, { type: 'level' }]);
  }

  return { ...state, ball, bricks, score, lives, paddleX, events };
}

/**
 * 推进物理。dt 单位秒；内部拆成最多 1/240 秒的子步，防止穿模。
 * 返回带 events 数组的新状态（事件供渲染层做粒子 / 音效）。
 */
export function step(state, dt) {
  if (state.status !== 'running' || !state.ball) return state;
  let next = { ...state, events: [] };
  const clamped = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
  const substeps = Math.max(1, Math.min(16, Math.ceil(clamped / (1 / 240))));
  const h = clamped / substeps;
  for (let i = 0; i < substeps; i += 1) {
    next = subStep(next, h);
    if (next.status !== 'running') break;
  }
  return next;
}

/** 剩余未打掉的砖块数量。 */
export function bricksRemaining(state) {
  return state.bricks.reduce((sum, brick) => (brick.alive ? sum + 1 : sum), 0);
}
