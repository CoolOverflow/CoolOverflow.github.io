/**
 * 贪吃蛇 —— 渲染 / 输入 / 循环
 * 纯规则全部来自 logic.classic.js（window.GameLogic），本文件只管画面和交互。
 */
(function () {
  'use strict';

  var Logic = window.GameLogic;
  var Shell = window.GameShell;
  if (!Logic || !Shell) return;

  var BEST_KEY = 'cooloverflow.snake.best';
  var COUNTDOWN_SECONDS = 2;

  var canvas = document.querySelector('[data-canvas]');
  var stage = document.querySelector('[data-stage]');
  var ctx = canvas.getContext('2d');

  var el = {
    score: document.querySelector('[data-score]'),
    best: document.querySelector('[data-best]'),
    length: document.querySelector('[data-length]'),
    speed: document.querySelector('[data-speed]'),
    scoreStat: document.querySelector('.shell-stat--accent'),
    overlay: document.querySelector('[data-overlay]'),
    overlayKicker: document.querySelector('[data-overlay-kicker]'),
    overlayTitle: document.querySelector('[data-overlay-title]'),
    overlayText: document.querySelector('[data-overlay-text]'),
    overlayPrimary: document.querySelector('[data-overlay-primary]'),
    pauseBtn: document.querySelector('[data-action="pause"]'),
    speedBtn: document.querySelector('[data-action="speed"]'),
    restartBtn: document.querySelector('[data-action="restart"]'),
  };

  var state = {
    game: Logic.createGame(),
    prevSnake: null,
    best: Shell.best(BEST_KEY),
    accumulator: 0,
    countdown: 0,
    countdownShown: null,
    overlayMode: null,
    lastFrame: 0,
    lastDir: null,
    scoreFlash: 0,
    pausedAt: 0,
  };
  state.prevSnake = state.game.snake;

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

  /* ---------------- UI 同步 ---------------- */

  function refreshHud() {
    var game = state.game;
    el.score.textContent = String(game.score);
    el.best.textContent = String(state.best);
    el.length.textContent = String(game.snake.length);
    el.speed.textContent = '×' + Logic.SPEED_STEPS[game.speedIndex];
    el.speedBtn.textContent = '速度 ×' + Logic.SPEED_STEPS[game.speedIndex];
    el.pauseBtn.textContent = game.status === 'paused' ? '继续' : '暂停';
    el.pauseBtn.disabled = game.status === 'over' || game.status === 'won';
  }

  function bumpScore() {
    if (!el.scoreStat) return;
    el.scoreStat.classList.remove('is-bump');
    /* 强制回流以便重复触发动画 */
    void el.scoreStat.offsetWidth;
    el.scoreStat.classList.add('is-bump');
  }

  function showOverlay(mode, kicker, title, text, primaryLabel) {
    state.overlayMode = mode;
    el.overlayKicker.textContent = kicker;
    el.overlayTitle.textContent = title;
    el.overlayTitle.className = mode === 'countdown' ? 'shell-countdown' : '';
    el.overlayText.textContent = text;
    el.overlayPrimary.textContent = primaryLabel;
    el.overlayPrimary.hidden = !primaryLabel;
    el.overlay.classList.add('is-open');
  }

  function hideOverlay() {
    state.overlayMode = null;
    el.overlay.classList.remove('is-open');
  }

  /* ---------------- 流程控制 ---------------- */

  function startRun() {
    state.game = Logic.start(state.game);
    state.prevSnake = state.game.snake;
    state.accumulator = 0;
    state.countdown = 0;
    state.countdownShown = null;
    hideOverlay();
    refreshHud();
  }

  function beginCountdown() {
    state.game = Logic.createGame();
    state.prevSnake = state.game.snake;
    state.accumulator = 0;
    state.countdown = COUNTDOWN_SECONDS;
    state.countdownShown = null;
    refreshHud();
    showOverlay(
      'countdown',
      'Ready',
      String(COUNTDOWN_SECONDS),
      '方向键 / WASD 转向，或直接在屏幕上滑动。空格暂停，R 重开。',
      '立即开始',
    );
  }

  function restart() {
    beginCountdown();
  }

  function pause() {
    if (state.game.status !== 'running') return;
    state.game = Logic.togglePause(state.game);
    state.pausedAt = performance.now();
    showOverlay('paused', 'Paused', '已暂停', '按空格或点「继续」回到棋盘。', '继续');
    refreshHud();
  }

  function resume() {
    if (state.game.status !== 'paused') return;
    state.game = Logic.togglePause(state.game);
    state.accumulator = 0;
    hideOverlay();
    refreshHud();
  }

  function onGameEnd() {
    state.best = Shell.saveBest(BEST_KEY, state.game.score);
    var won = state.game.status === 'won';
    refreshHud();
    if (won) {
      showOverlay('won', 'Perfect', '通关！', '整个棋盘都是你的了。分数 ' + state.game.score + '。', '再来一局');
    } else {
      showOverlay(
        'over',
        'Game Over',
        '游戏结束',
        '本局得分 ' + state.game.score + '，最高分 ' + state.best + '。',
        '再来一局',
      );
    }
  }

  function primaryAction() {
    if (state.overlayMode === 'countdown') {
      startRun();
    } else if (state.overlayMode === 'paused') {
      resume();
    } else if (state.overlayMode === 'over' || state.overlayMode === 'won') {
      restart();
    } else if (state.game.status === 'ready') {
      startRun();
    } else if (state.game.status === 'running') {
      pause();
    } else if (state.game.status === 'paused') {
      resume();
    } else {
      restart();
    }
  }

  function cycleSpeed() {
    state.game = Logic.cycleSpeed(state.game);
    refreshHud();
  }

  /* ---------------- 输入 ---------------- */

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var dir = KEY_DIRS[event.code];
    if (dir) {
      event.preventDefault();
      if (state.game.status === 'ready') startRun();
      if (state.game.status === 'running' || state.game.status === 'paused') {
        state.game = Logic.queueDirection(state.game, dir);
      }
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (event.repeat) return;
      primaryAction();
      return;
    }
    if (event.code === 'KeyP') {
      if (event.repeat) return;
      if (state.game.status === 'running') pause();
      else if (state.game.status === 'paused') resume();
      return;
    }
    if (event.code === 'KeyR') {
      if (event.repeat) return;
      restart();
    }
  });

  el.restartBtn.addEventListener('click', restart);
  el.speedBtn.addEventListener('click', cycleSpeed);
  el.pauseBtn.addEventListener('click', function () {
    if (state.game.status === 'paused') resume();
    else pause();
  });
  el.overlayPrimary.addEventListener('click', primaryAction);

  /* 触屏：连续滑动转向；点一下遮罩 = 主按钮 */
  var swipe = { active: false, x: 0, y: 0, id: null };

  function swipeMove(x, y) {
    if (!swipe.active) return;
    var dx = x - swipe.x;
    var dy = y - swipe.y;
    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
    var dir;
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
    else dir = dy > 0 ? 'down' : 'up';
    if (state.game.status === 'ready') startRun();
    if (state.game.status === 'running' || state.game.status === 'paused') {
      state.game = Logic.queueDirection(state.game, dir);
    }
    swipe.x = x;
    swipe.y = y;
  }

  stage.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'mouse') {
      /* 只点遮罩背景才开始；点按钮交给 click 事件，避免"开始后立刻暂停" */
      var target = event.target;
      var onBackdrop = target === el.overlay || target === stage || target === canvas;
      if (state.overlayMode === 'countdown' && onBackdrop) startRun();
      return;
    }
    swipe.active = true;
    swipe.id = event.pointerId;
    swipe.x = event.clientX;
    swipe.y = event.clientY;
  });

  stage.addEventListener('pointermove', function (event) {
    if (event.pointerType === 'mouse' || !swipe.active || event.pointerId !== swipe.id) return;
    swipeMove(event.clientX, event.clientY);
  });

  function endSwipe(event) {
    if (event.pointerId !== swipe.id) return;
    swipe.active = false;
    swipe.id = null;
  }
  stage.addEventListener('pointerup', endSwipe);
  stage.addEventListener('pointercancel', endSwipe);

  /* 失焦 / 切标签页自动暂停，避免"回来就撞墙" */
  function autoPause() {
    if (state.game.status === 'running') pause();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) autoPause();
  });
  window.addEventListener('blur', autoPause);

  /* ---------------- 主循环 ---------------- */

  function update(dt) {
    var game = state.game;

    if (game.status === 'ready' && state.countdown > 0) {
      state.countdown = Math.max(0, state.countdown - dt);
      var shown = Math.max(1, Math.ceil(state.countdown));
      if (shown !== state.countdownShown) {
        state.countdownShown = shown;
        el.overlayTitle.textContent = String(shown);
      }
      if (state.countdown <= 0) startRun();
      return;
    }

    if (game.status !== 'running') return;

    state.accumulator += Math.min(dt, 0.1) * 1000;
    var interval = Logic.stepInterval(game);
    var guard = 0;
    var scoreBefore = game.score;

    while (state.accumulator >= interval && state.game.status === 'running' && guard < 8) {
      state.prevSnake = state.game.snake;
      state.game = Logic.step(state.game);
      state.accumulator -= interval;
      guard += 1;
    }

    if (state.game.score !== scoreBefore) bumpScore();
    if (state.game.status !== 'running') {
      state.accumulator = 0;
      onGameEnd();
    }
  }

  function cellCenter(cell, ox, oy, x, y) {
    return {
      x: ox + (x + 0.5) * cell,
      y: oy + (y + 0.5) * cell,
    };
  }

  function drawBoard(w, h, cols, rows, cell, ox, oy) {
    var boardW = cell * cols;
    var boardH = cell * rows;

    /* 棋盘底色比页面稍亮一档 */
    var bg = ctx.createLinearGradient(0, oy, 0, oy + boardH);
    bg.addColorStop(0, '#0b1219');
    bg.addColorStop(1, '#080d12');
    ctx.fillStyle = bg;
    ctx.fillRect(ox, oy, boardW, boardH);

    /* 细网格 */
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, boardW, boardH);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var c = 1; c < cols; c += 1) {
      var gx = Math.round(ox + c * cell) + 0.5;
      ctx.moveTo(gx, oy);
      ctx.lineTo(gx, oy + boardH);
    }
    for (var r = 1; r < rows; r += 1) {
      var gy = Math.round(oy + r * cell) + 0.5;
      ctx.moveTo(ox, gy);
      ctx.lineTo(ox + boardW, gy);
    }
    ctx.stroke();
    ctx.restore();

    /* 内侧一圈微弱描边 */
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, boardW - 1, boardH - 1);
  }

  function drawFood(now, cell, ox, oy, food) {
    if (!food) return;
    var center = cellCenter(cell, ox, oy, food.x, food.y);
    var pulse = 0.5 + 0.5 * Math.sin(now / 320);
    var radius = cell * (0.28 + 0.05 * pulse);

    var glow = ctx.createRadialGradient(
      center.x,
      center.y,
      radius * 0.2,
      center.x,
      center.y,
      radius * 3.1,
    );
    glow.addColorStop(0, 'rgba(255, 200, 87, 0.5)');
    glow.addColorStop(0.45, 'rgba(255, 200, 87, 0.14)');
    glow.addColorStop(1, 'rgba(255, 200, 87, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius * 3.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffc857';
    ctx.shadowColor = 'rgba(255, 200, 87, 0.9)';
    ctx.shadowBlur = cell * 0.5;
    var size = radius * 1.42;
    var box = -size / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(box, box, size, size, size * 0.22);
    else ctx.rect(box, box, size, size);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 248, 224, 0.92)';
    ctx.beginPath();
    ctx.arc(-size * 0.08, -size * 0.08, size * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSnake(game, cell, ox, oy, t) {
    var snake = game.snake;
    var prev = state.prevSnake || snake;
    var points = [];

    for (var i = 0; i < snake.length; i += 1) {
      var target = snake[i];
      var from = prev[i] || target;
      var x = from.x + (target.x - from.x) * t;
      var y = from.y + (target.y - from.y) * t;
      points.push({
        x: ox + (x + 0.5) * cell,
        y: oy + (y + 0.5) * cell,
      });
    }

    if (points.length === 0) return;

    var head = points[0];
    var tail = points[points.length - 1];
    var gradient = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
    gradient.addColorStop(0, '#d9ffe9');
    gradient.addColorStop(0.18, '#7cffb2');
    gradient.addColorStop(0.72, '#3ecf8c');
    gradient.addColorStop(1, 'rgba(28, 120, 82, 0.75)');

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(124, 255, 178, 0.45)';
    ctx.shadowBlur = cell * 0.55;
    ctx.strokeStyle = gradient;
    ctx.lineWidth = cell * 0.72;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var p = 1; p < points.length; p += 1) {
      ctx.lineTo(points[p].x, points[p].y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    /* 高光内芯 */
    ctx.strokeStyle = 'rgba(235, 255, 244, 0.2)';
    ctx.lineWidth = cell * 0.26;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var q = 1; q < points.length; q += 1) {
      ctx.lineTo(points[q].x, points[q].y);
    }
    ctx.stroke();
    ctx.restore();

    /* 蛇头 */
    var dir = Logic.DIR_VECTORS[game.dir] || { x: 1, y: 0 };
    ctx.save();
    ctx.fillStyle = '#c9ffe0';
    ctx.shadowColor = 'rgba(124, 255, 178, 0.8)';
    ctx.shadowBlur = cell * 0.45;
    ctx.beginPath();
    ctx.arc(head.x, head.y, cell * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    /* 眼睛：沿朝向前方两侧 */
    var forwardX = dir.x;
    var forwardY = dir.y;
    var sideX = -forwardY;
    var sideY = forwardX;
    var eyeForward = cell * 0.13;
    var eyeSide = cell * 0.15;
    var eyeRadius = Math.max(1.4, cell * 0.072);
    var pupilRadius = Math.max(0.8, cell * 0.036);
    for (var s = -1; s <= 1; s += 2) {
      var ex = head.x + forwardX * eyeForward + sideX * eyeSide * s;
      var ey = head.y + forwardY * eyeForward + sideY * eyeSide * s;
      ctx.fillStyle = '#07130d';
      ctx.beginPath();
      ctx.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(ex + forwardX * 0.8, ey + forwardY * 0.8, pupilRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw(now) {
    var size = Shell.syncCanvas(canvas);
    var dpr = size.dpr;
    var w = size.width;
    var h = size.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var game = state.game;
    var cell = Math.min(w / game.cols, h / game.rows);
    var boardW = cell * game.cols;
    var boardH = cell * game.rows;
    var ox = (w - boardW) / 2;
    var oy = (h - boardH) / 2;

    drawBoard(w, h, game.cols, game.rows, cell, ox, oy);

    var t = game.status === 'running'
      ? Math.min(1, state.accumulator / Logic.stepInterval(game))
      : 1;

    drawFood(now, cell, ox, oy, game.food);
    drawSnake(game, cell, ox, oy, t);

    /* 游戏结束时给棋盘压一层暖色 */
    if (game.status === 'over') {
      ctx.fillStyle = 'rgba(255, 120, 100, 0.045)';
      ctx.fillRect(ox, oy, boardW, boardH);
    }
  }

  function frame(now) {
    var dt = state.lastFrame ? Math.min(0.05, (now - state.lastFrame) / 1000) : 1 / 60;
    state.lastFrame = now;
    update(dt);
    draw(now);
    window.requestAnimationFrame(frame);
  }

  refreshHud();
  beginCountdown();
  window.requestAnimationFrame(frame);
})();
