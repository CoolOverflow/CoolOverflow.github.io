/**
 * 2048 —— 纯规则逻辑（ES module，源码）
 *
 * 页面不直接加载本文件（headless file:// 下 type="module" 受限），
 * 而是加载由 games/_tools/sync-logic.mjs 生成的 logic.classic.js。
 * 修改本文件后请运行：node games/_tools/sync-logic.mjs
 *
 * 棋盘里的每个非空格子是一个不可变对象 { id, value }：
 * id 让页面能对同一块瓷砖做位移动画，value 是 2 的幂。
 * 所有函数都是纯函数；随机性通过 rng 注入。
 */

export const SIZE = 4;
export const TARGET = 2048;
/** 最多保留几步撤回 */
export const HISTORY_LIMIT = 20;
export const DIRECTIONS = ['left', 'right', 'up', 'down'];

function emptyGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function randInt(rng, n) {
  return Math.min(n - 1, Math.max(0, Math.floor(rng() * n)));
}

/** 新开一局，随机放两块初始瓷砖。 */
export function createGame(options = {}) {
  const size = options.size ?? SIZE;
  const rng = options.rng ?? Math.random;
  const target = options.target ?? TARGET;
  let state = {
    size,
    target,
    grid: emptyGrid(size),
    score: 0,
    status: 'playing', // playing | won | lost
    won: false,
    history: [],
    nextId: 1,
    lastSpawn: null,
    lastMoves: [],
    lastMerges: [],
    moved: false,
  };
  state = spawnRandomTile(state, rng);
  state = spawnRandomTile(state, rng);
  return state;
}

/** 从数值二维数组构造棋盘（方便测试 / 恢复存档）。 */
export function gridFromValues(vals) {
  let id = 1;
  return vals.map((row) =>
    row.map((value) => (value > 0 ? { id: id++, value } : null)),
  );
}

/** 导出数值二维数组（测试和调试用）。 */
export function values(state) {
  return state.grid.map((row) => row.map((tile) => (tile ? tile.value : 0)));
}

/** 在随机空格生成 2（90%）或 4（10%）。棋盘已满时原样返回。 */
export function spawnRandomTile(state, rng = Math.random) {
  const empties = [];
  for (let r = 0; r < state.size; r += 1) {
    for (let c = 0; c < state.size; c += 1) {
      if (!state.grid[r][c]) empties.push([r, c]);
    }
  }
  if (empties.length === 0) return state;
  const [r, c] = empties[randInt(rng, empties.length)];
  const value = rng() < 0.9 ? 2 : 4;
  const tile = { id: state.nextId, value };
  const grid = state.grid.map((row) => row.slice());
  grid[r][c] = tile;
  return {
    ...state,
    grid,
    nextId: state.nextId + 1,
    lastSpawn: { id: tile.id, r, c, value },
  };
}

/**
 * 把一行瓷砖朝索引 0 的方向压缩合并。
 * 规则：先压缩空格，再从前往后两两合并，每块瓷砖每步最多参与一次合并。
 * 返回 { line, gained, merged, moved }，line 长度与入参一致（尾部补 null）。
 */
export function slideLine(line) {
  const tiles = line.filter(Boolean);
  const result = [];
  const merges = [];
  let gained = 0;

  for (let i = 0; i < tiles.length; i += 1) {
    const cur = tiles[i];
    const nxt = tiles[i + 1];
    if (nxt && nxt.value === cur.value) {
      const value = cur.value * 2;
      gained += value;
      merges.push({
        survivorId: cur.id,
        consumedId: nxt.id,
        value,
        index: result.length,
      });
      result.push({ id: cur.id, value, merged: true });
      i += 1;
    } else {
      result.push({ id: cur.id, value: cur.value, merged: false });
    }
  }

  const padded = result.concat(Array(line.length - result.length).fill(null));
  const moved = padded.some((tile, i) => (tile ? tile.id : null) !== (line[i] ? line[i].id : null));
  return { line: padded, gained, merges, moved };
}

/** 按移动方向拆出每一条线的坐标（索引 0 是移动方向的最前方）。 */
export function collectLines(size, dir) {
  const lines = [];
  if (dir === 'left' || dir === 'right') {
    for (let r = 0; r < size; r += 1) {
      const coords = [];
      for (let i = 0; i < size; i += 1) {
        coords.push([r, dir === 'left' ? i : size - 1 - i]);
      }
      lines.push(coords);
    }
  } else {
    for (let c = 0; c < size; c += 1) {
      const coords = [];
      for (let i = 0; i < size; i += 1) {
        coords.push([dir === 'up' ? i : size - 1 - i, c]);
      }
      lines.push(coords);
    }
  }
  return lines;
}

/** 执行一次移动：滑行 → 合并 → 计分 → 生成新瓷砖 → 判定胜负。 */
export function move(state, dir, rng = Math.random) {
  if (state.status !== 'playing' || !DIRECTIONS.includes(dir)) {
    return { ...state, moved: false, lastMoves: [], lastMerges: [], lastSpawn: null };
  }
  if (!canMove(state)) {
    return {
      ...state,
      status: 'lost',
      moved: false,
      lastMoves: [],
      lastMerges: [],
      lastSpawn: null,
    };
  }

  const { size } = state;
  const grid = state.grid.map((row) => row.slice());
  const lines = collectLines(size, dir);
  const lastMoves = [];
  const lastMerges = [];
  let moved = false;
  let gained = 0;

  for (const coords of lines) {
    const line = coords.map(([r, c]) => grid[r][c]);
    const fromById = new Map();
    coords.forEach(([r, c], i) => {
      const tile = state.grid[r][c];
      if (tile) fromById.set(tile.id, [r, c]);
      line[i] = tile;
    });

    const result = slideLine(line);
    if (result.moved) moved = true;
    gained += result.gained;

    result.line.forEach((tile, i) => {
      const [r, c] = coords[i];
      grid[r][c] = tile;
      if (tile) {
        lastMoves.push({ id: tile.id, from: fromById.get(tile.id) || [r, c], to: [r, c] });
      }
    });
    for (const merge of result.merges) {
      const [r, c] = coords[merge.index];
      lastMerges.push({ ...merge, r, c });
    }
  }

  if (!moved) {
    return { ...state, moved: false, lastMoves: [], lastMerges: [], lastSpawn: null };
  }

  const snapshot = {
    grid: state.grid.map((row) => row.slice()),
    score: state.score,
    status: state.status,
    won: state.won,
    nextId: state.nextId,
  };

  let next = {
    ...state,
    grid,
    score: state.score + gained,
    moved: true,
    lastMoves,
    lastMerges,
    lastSpawn: null,
    history: [...state.history, snapshot].slice(-HISTORY_LIMIT),
  };
  next = spawnRandomTile(next, rng);

  if (!next.won && next.grid.some((row) => row.some((tile) => tile && tile.value >= state.target))) {
    next.won = true;
    next.status = 'won';
  } else if (!canMove(next)) {
    next.status = 'lost';
  }
  return next;
}

/** 是否还有任何合法移动（空格或相邻同值）。 */
export function canMove(state) {
  const { grid, size } = state;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const tile = grid[r][c];
      if (!tile) return true;
      if (c + 1 < size && grid[r][c + 1] && grid[r][c + 1].value === tile.value) return true;
      if (r + 1 < size && grid[r + 1][c] && grid[r + 1][c].value === tile.value) return true;
    }
  }
  return false;
}

/** 撤回一步（可连续撤回，最多 HISTORY_LIMIT 步）。 */
export function undo(state) {
  if (state.history.length === 0) {
    return { ...state, moved: false, lastMoves: [], lastMerges: [], lastSpawn: null };
  }
  const snapshot = state.history[state.history.length - 1];
  return {
    ...state,
    grid: snapshot.grid.map((row) => row.slice()),
    score: snapshot.score,
    status: snapshot.status,
    won: snapshot.won,
    nextId: snapshot.nextId,
    history: state.history.slice(0, -1),
    moved: false,
    lastMoves: [],
    lastMerges: [],
    lastSpawn: null,
  };
}

/** 达成 2048 后继续玩。 */
export function continueGame(state) {
  if (state.status !== 'won') return state;
  return { ...state, status: 'playing' };
}

/** 棋盘上最大的数字。 */
export function maxTile(state) {
  let max = 0;
  for (const row of state.grid) {
    for (const tile of row) {
      if (tile && tile.value > max) max = tile.value;
    }
  }
  return max;
}
