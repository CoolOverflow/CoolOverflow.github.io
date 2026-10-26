/**
 * 贪吃蛇 —— 纯规则逻辑（ES module，源码）
 *
 * 页面不直接加载本文件（headless file:// 下 type="module" 受限），
 * 而是加载由 games/_tools/sync-logic.mjs 生成的 logic.classic.js。
 * 修改本文件后请运行：node games/_tools/sync-logic.mjs
 *
 * 所有函数都是纯函数：接收 state，返回新 state，不触碰 DOM / 全局变量。
 * 随机性通过参数注入 rng（返回 [0,1) 的函数），方便用种子复现。
 */

export const COLS = 32;
export const ROWS = 18;
export const START_LENGTH = 4;
export const SCORE_PER_FOOD = 10;
/** 1x 速度下每走一格需要的毫秒数 */
export const BASE_INTERVAL = 135;
/** 可选速度档位（按钮循环切换） */
export const SPEED_STEPS = [1, 1.5, 2];

export const DIR_VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const OPPOSITE = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

function cellKey(x, y) {
  return x + ',' + y;
}

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function randInt(rng, n) {
  return Math.min(n - 1, Math.max(0, Math.floor(rng() * n)));
}

/** 在空格子里随机放食物；棋盘满了返回 null。 */
export function placeFood(state, rng = Math.random) {
  const occupied = new Set(state.snake.map((s) => cellKey(s.x, s.y)));
  const free = [];
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      if (!occupied.has(cellKey(x, y))) free.push({ x, y });
    }
  }
  if (free.length === 0) return null;
  return free[randInt(rng, free.length)];
}

/** 新开一局。蛇头在左侧、身体向右延伸，状态为 ready（页面负责倒计时）。 */
export function createGame(options = {}) {
  const cols = options.cols ?? COLS;
  const rows = options.rows ?? ROWS;
  const rng = options.rng ?? Math.random;
  const length = Math.max(3, Math.min(options.length ?? START_LENGTH, Math.floor(cols / 2)));
  const startY = Math.floor(rows / 2);
  const headX = Math.max(length, Math.floor(cols / 4));
  const snake = [];
  for (let i = 0; i < length; i += 1) snake.push({ x: headX - i, y: startY });

  let state = {
    cols,
    rows,
    snake,
    dir: 'right',
    /** 最多缓存两个待执行方向，避免一帧内连按导致自撞 */
    queue: [],
    food: null,
    score: 0,
    eaten: 0,
    ticks: 0,
    status: 'ready', // ready | running | paused | over | won
    speedIndex: 0,
  };
  state.food = placeFood(state, rng);
  if (!state.food) state.status = 'won';
  return state;
}

/** 当前生效方向：优先取输入队列里的第一个。 */
export function effectiveDir(state) {
  return state.queue.length > 0 ? state.queue[0] : state.dir;
}

/** 记录一个方向输入。反向 / 重复输入会被忽略。 */
export function queueDirection(state, name) {
  if (!DIR_VECTORS[name]) return state;
  if (state.status === 'over' || state.status === 'won') return state;
  const current = state.queue.length > 0 ? state.queue[state.queue.length - 1] : state.dir;
  if (name === current) return state;
  if (OPPOSITE[name] === current) return state;
  return { ...state, queue: [...state.queue, name].slice(-2) };
}

/** 开始 / 继续（从 ready 或 paused 进入 running）。 */
export function start(state) {
  if (state.status !== 'ready' && state.status !== 'paused') return state;
  return { ...state, status: 'running' };
}

/** 暂停 / 继续切换。 */
export function togglePause(state) {
  if (state.status === 'running') return { ...state, status: 'paused' };
  if (state.status === 'paused') return { ...state, status: 'running' };
  return state;
}

/** 1x → 1.5x → 2x → 1x */
export function cycleSpeed(state) {
  return { ...state, speedIndex: (state.speedIndex + 1) % SPEED_STEPS.length };
}

/** 当前档位下每格耗时（毫秒）。 */
export function stepInterval(state) {
  return BASE_INTERVAL / SPEED_STEPS[state.speedIndex];
}

/** 前进一格。撞墙或撞到自身都会把状态置为 over。 */
export function step(state, rng = Math.random) {
  if (state.status !== 'running') return state;

  const nextDir = effectiveDir(state);
  const queue = state.queue.slice(1);
  const vec = DIR_VECTORS[nextDir];
  const head = state.snake[0];
  const nx = head.x + vec.x;
  const ny = head.y + vec.y;

  if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) {
    return { ...state, dir: nextDir, queue: [], status: 'over' };
  }

  const willGrow = Boolean(state.food) && sameCell(state.food, { x: nx, y: ny });
  // 不吃食物时尾巴会移开，因此最后一节不算障碍
  const body = willGrow ? state.snake : state.snake.slice(0, -1);
  if (body.some((seg) => seg.x === nx && seg.y === ny)) {
    return { ...state, dir: nextDir, queue: [], status: 'over' };
  }

  const snake = [{ x: nx, y: ny }, ...state.snake];
  if (!willGrow) snake.pop();

  const next = { ...state, snake, dir: nextDir, queue, ticks: state.ticks + 1 };
  if (willGrow) {
    next.eaten = state.eaten + 1;
    next.score = state.score + SCORE_PER_FOOD;
    next.food = placeFood(next, rng);
    if (!next.food) next.status = 'won';
  }
  return next;
}
