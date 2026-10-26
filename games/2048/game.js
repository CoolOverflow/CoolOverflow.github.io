/**
 * 2048 —— 渲染 / 输入 / 动画
 * 规则在 logic.classic.js（window.GameLogic）；这里用 DOM 瓷砖做滑动与合并动画。
 */
(function () {
  'use strict';

  var Logic = window.GameLogic;
  var Shell = window.GameShell;
  if (!Logic || !Shell) return;

  var BEST_KEY = 'cooloverflow.2048.best';
  var SWIPE_THRESHOLD = 22;

  var board = document.querySelector('[data-board]');
  var gridEl = document.querySelector('[data-grid]');
  var tilesEl = document.querySelector('[data-tiles]');
  var stage = document.querySelector('[data-stage]');

  var el = {
    score: document.querySelector('[data-score]'),
    best: document.querySelector('[data-best]'),
    moves: document.querySelector('[data-moves]'),
    max: document.querySelector('[data-max]'),
    scoreStat: document.querySelector('.shell-stat--accent'),
    undoBtn: document.querySelector('[data-action="undo"]'),
    restartBtn: document.querySelector('[data-action="restart"]'),
    overlay: document.querySelector('[data-overlay]'),
    overlayKicker: document.querySelector('[data-overlay-kicker]'),
    overlayTitle: document.querySelector('[data-overlay-title]'),
    overlayText: document.querySelector('[data-overlay-text]'),
    overlayPrimary: document.querySelector('[data-overlay-primary]'),
  };

  var state = {
    game: Logic.createGame(),
    best: Shell.best(BEST_KEY),
    moves: 0,
    tileEls: new Map(),
    layout: { pad: 12, gap: 10, cell: 80 },
    overlayMode: null,
    swipe: null,
  };

  var KEY_DIRS = {
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
  };

  /* ---------------- 布局 ---------------- */

  function measure() {
    var size = board.clientWidth;
    if (!size) return;
    var pad = Math.max(9, Math.round(size * 0.03));
    var gap = Math.max(7, Math.round(size * 0.026));
    var cell = (size - pad * 2 - gap * (Logic.SIZE - 1)) / Logic.SIZE;
    state.layout = { pad: pad, gap: gap, cell: cell, size: size };
    board.style.setProperty('--pad', pad + 'px');
    board.style.setProperty('--gap', gap + 'px');
  }

  function fontSizeFor(value, cell) {
    var digits = String(value).length;
    var ratio = digits <= 2 ? 0.44 : digits === 3 ? 0.38 : digits === 4 ? 0.32 : 0.26;
    return Math.max(11, Math.round(cell * ratio)) + 'px';
  }

  function placeTile(tileEl, pos) {
    var layout = state.layout;
    var x = layout.pad + pos.c * (layout.cell + layout.gap);
    var y = layout.pad + pos.r * (layout.cell + layout.gap);
    tileEl.style.width = layout.cell + 'px';
    tileEl.style.height = layout.cell + 'px';
    tileEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    tileEl.style.fontSize = fontSizeFor(pos.value, layout.cell);
  }

  function setTileValue(tileEl, value) {
    if (Number(tileEl.dataset.value) === value) return false;
    tileEl.dataset.value = String(value);
    tileEl.textContent = String(value);
    return true;
  }

  function clearTiles() {
    state.tileEls.forEach(function (tileEl) {
      tileEl.remove();
    });
    state.tileEls.clear();
  }

  /* ---------------- 渲染 ---------------- */

  function collectPositions() {
    var positions = new Map();
    for (var r = 0; r < Logic.SIZE; r += 1) {
      for (var c = 0; c < Logic.SIZE; c += 1) {
        var tile = state.game.grid[r][c];
        if (tile) positions.set(tile.id, { r: r, c: c, value: tile.value });
      }
    }
    return positions;
  }

  function createTile(tileEl, pos) {
    tileEl.className = 'tile is-new';
    setTileValue(tileEl, pos.value);
    placeTile(tileEl, pos);
    tilesEl.appendChild(tileEl);
    window.setTimeout(function () {
      tileEl.classList.remove('is-new');
    }, 240);
  }

  function syncTiles() {
    var positions = collectPositions();
    var merges = state.game.lastMerges || [];

    positions.forEach(function (pos, id) {
      var tileEl = state.tileEls.get(id);
      if (!tileEl) {
        tileEl = document.createElement('div');
        tileEl.dataset.id = String(id);
        state.tileEls.set(id, tileEl);
        createTile(tileEl, pos);
        return;
      }
      var changed = setTileValue(tileEl, pos.value);
      placeTile(tileEl, pos);
      if (changed) {
        tileEl.classList.remove('is-merged');
        void tileEl.offsetWidth;
        tileEl.classList.add('is-merged');
        window.setTimeout(function () {
          tileEl.classList.remove('is-merged');
        }, 220);
      }
    });

    state.tileEls.forEach(function (tileEl, id) {
      if (positions.has(id)) return;
      if (tileEl.dataset.removing === '1') return;

      var merge = null;
      for (var i = 0; i < merges.length; i += 1) {
        if (merges[i].consumedId === id) {
          merge = merges[i];
          break;
        }
      }

      if (merge) {
        /* 被合并掉的那块：先滑到目标格，再缩小消失 */
        tileEl.dataset.removing = '1';
        tileEl.style.zIndex = '1';
        placeTile(tileEl, { r: merge.r, c: merge.c, value: Number(tileEl.dataset.value) });
        tileEl.classList.add('is-vanishing');
        window.setTimeout(function () {
          if (state.tileEls.get(id) === tileEl) state.tileEls.delete(id);
          tileEl.remove();
        }, 160);
      } else {
        state.tileEls.delete(id);
        tileEl.remove();
      }
    });

    refreshHud();
  }

  function refreshHud() {
    var game = state.game;
    if (game.score > state.best) {
      state.best = Shell.saveBest(BEST_KEY, game.score);
    }
    el.score.textContent = String(game.score);
    el.best.textContent = String(state.best);
    el.moves.textContent = String(state.moves);
    el.max.textContent = String(Logic.maxTile(game));
    el.undoBtn.disabled = game.history.length === 0;
  }

  function bumpScore() {
    if (!el.scoreStat) return;
    el.scoreStat.classList.remove('is-bump');
    void el.scoreStat.offsetWidth;
    el.scoreStat.classList.add('is-bump');
  }

  function relayout() {
    if (!board.clientWidth) return;
    measure();
    var positions = collectPositions();
    positions.forEach(function (pos, id) {
      var tileEl = state.tileEls.get(id);
      if (tileEl) placeTile(tileEl, pos);
    });
  }

  /* ---------------- 遮罩 ---------------- */

  function showOverlay(mode) {
    state.overlayMode = mode;
    el.overlay.classList.add('is-open');
    if (mode === 'won') {
      el.overlayKicker.textContent = '2048';
      el.overlayTitle.textContent = '达成 2048！';
      el.overlayText.textContent =
        '本局得分 ' + state.game.score + '。还可以继续挑战 4096、8192。';
      el.overlayPrimary.textContent = '继续玩';
    } else {
      el.overlayKicker.textContent = 'Game Over';
      el.overlayTitle.textContent = '无路可走了';
      el.overlayText.textContent =
        '本局得分 ' + state.game.score + '，最高分 ' + state.best + '。再来一局？';
      el.overlayPrimary.textContent = '再来一局';
    }
  }

  function hideOverlay() {
    state.overlayMode = null;
    el.overlay.classList.remove('is-open');
  }

  /* ---------------- 操作 ---------------- */

  function doMove(dir) {
    if (state.overlayMode === 'won' || state.overlayMode === 'lost') return;
    if (state.game.status !== 'playing') return;

    var before = state.game.score;
    var next = Logic.move(state.game, dir);
    if (!next.moved) return;

    state.game = next;
    state.moves += 1;
    if (next.score > before) bumpScore();
    syncTiles();

    if (next.status === 'lost') showOverlay('lost');
    else if (next.status === 'won') showOverlay('won');
  }

  function restart() {
    state.game = Logic.createGame();
    state.moves = 0;
    clearTiles();
    hideOverlay();
    measure();
    syncTiles();
  }

  function undo() {
    if (state.game.history.length === 0) return;
    state.game = Logic.undo(state.game);
    if (state.moves > 0) state.moves -= 1;
    hideOverlay();
    syncTiles();
  }

  function continueGame() {
    state.game = Logic.continueGame(state.game);
    hideOverlay();
    syncTiles();
  }

  el.undoBtn.addEventListener('click', undo);
  el.restartBtn.addEventListener('click', restart);
  el.overlayPrimary.addEventListener('click', function () {
    if (state.overlayMode === 'won') continueGame();
    else if (state.overlayMode === 'lost') restart();
  });

  /* ---------------- 输入 ---------------- */

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var dir = KEY_DIRS[event.code];
    if (dir) {
      event.preventDefault();
      if (event.repeat) return;
      doMove(dir);
      return;
    }
    if (event.code === 'KeyU' || event.code === 'Backspace') {
      event.preventDefault();
      if (event.repeat) return;
      undo();
      return;
    }
    if (event.code === 'KeyR') {
      event.preventDefault();
      if (event.repeat) return;
      restart();
    }
  });

  /* 触屏 / 鼠标拖动：在棋盘上滑动 */
  stage.addEventListener('pointerdown', function (event) {
    if (state.game.status !== 'playing') return;
    state.swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });

  stage.addEventListener('pointermove', function (event) {
    var swipe = state.swipe;
    if (!swipe || event.pointerId !== swipe.id) return;
    var dx = event.clientX - swipe.x;
    var dy = event.clientY - swipe.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 'right' : 'left');
    else doMove(dy > 0 ? 'down' : 'up');
    swipe.x = event.clientX;
    swipe.y = event.clientY;
  });

  function endSwipe(event) {
    if (state.swipe && event.pointerId === state.swipe.id) state.swipe = null;
  }
  stage.addEventListener('pointerup', endSwipe);
  stage.addEventListener('pointercancel', endSwipe);

  /* 背景格 */
  for (var i = 0; i < Logic.SIZE * Logic.SIZE; i += 1) {
    var cell = document.createElement('div');
    cell.className = 'board-cell';
    gridEl.appendChild(cell);
  }

  measure();
  if (window.ResizeObserver) {
    new window.ResizeObserver(relayout).observe(board);
  } else {
    window.addEventListener('resize', relayout);
  }
  syncTiles();
})();
