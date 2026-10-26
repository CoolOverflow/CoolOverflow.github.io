/**
 * 打砖块 —— 渲染 / 输入 / 特效
 * 物理与判定在 logic.classic.js（window.GameLogic），绘制按 720×405 逻辑坐标
 * 等比缩放，窗口 resize 不需要重置局面。
 */
(function () {
  'use strict';

  var Logic = window.GameLogic;
  var Shell = window.GameShell;
  if (!Logic || !Shell) return;

  var W = Logic.WIDTH;
  var H = Logic.HEIGHT;
  var BEST_KEY = 'cooloverflow.breakout.best';
  var PADDLE_KEY_SPEED = 780; // 键盘移动挡板速度（逻辑像素 / 秒）
  var ROW_COLORS = ['#ffc857', '#ffb86b', '#5ce1e6', '#7cffb2', '#4ed8a0'];

  var canvas = document.querySelector('[data-canvas]');
  var ctx = canvas.getContext('2d');
  var stage = document.querySelector('[data-stage]');

  var el = {
    score: document.querySelector('[data-score]'),
    best: document.querySelector('[data-best]'),
    lives: document.querySelector('[data-lives]'),
    level: document.querySelector('[data-level]'),
    scoreStat: document.querySelector('.shell-stat--accent'),
    pauseBtn: document.querySelector('[data-action="pause"]'),
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
    overlayMode: 'ready',
    keys: { left: false, right: false },
    autoLaunchAt: 0,
    particles: [],
    popups: [],
    ballTrail: [],
    gradients: null,
    shake: 0,
    flash: 0,
    lastFrame: 0,
  };

  /* ---------------- HUD / 遮罩 ---------------- */

  function refreshHud() {
    var game = state.game;
    if (game.score > state.best) {
      state.best = Shell.saveBest(BEST_KEY, game.score);
    }
    el.score.textContent = String(game.score);
    el.best.textContent = String(state.best);
    el.lives.textContent = String(game.lives);
    el.level.textContent = game.level + ' / ' + Logic.MAX_LEVEL;
    el.pauseBtn.textContent = game.status === 'paused' ? '继续' : '暂停';
    el.pauseBtn.disabled = game.status === 'over' || game.status === 'won';
  }

  function showOverlay(mode) {
    var game = state.game;
    state.overlayMode = mode;
    el.overlay.classList.add('is-open');
    if (mode === 'ready') {
      el.overlayKicker.textContent = 'Ready';
      el.overlayTitle.textContent = '打砖块';
      el.overlayText.textContent =
        '按空格或点「开始」发球。移动鼠标 / 手指控制挡板，键盘 ← → 也可以。清空砖块进入下一关，共 6 关。';
      el.overlayPrimary.textContent = '开始';
    } else if (mode === 'paused') {
      el.overlayKicker.textContent = 'Paused';
      el.overlayTitle.textContent = '已暂停';
      el.overlayText.textContent = '按空格或点「继续」回到球场。';
      el.overlayPrimary.textContent = '继续';
    } else if (mode === 'level') {
      el.overlayKicker.textContent = 'Level ' + game.level;
      el.overlayTitle.textContent = '第 ' + game.level + ' 关';
      el.overlayText.textContent = '砖块已刷新，球速提升。按空格 / 点击继续。';
      el.overlayPrimary.textContent = '继续';
    } else if (mode === 'won') {
      el.overlayKicker.textContent = 'All Clear';
      el.overlayTitle.textContent = '全部通关！';
      el.overlayText.textContent =
        '6 关全清，最终得分 ' + game.score + '，最高分 ' + state.best + '。';
      el.overlayPrimary.textContent = '再来一局';
    } else {
      el.overlayKicker.textContent = 'Game Over';
      el.overlayTitle.textContent = '游戏结束';
      el.overlayText.textContent =
        '本局得分 ' + game.score + '，最高分 ' + state.best + '。再来一局？';
      el.overlayPrimary.textContent = '再来一局';
    }
  }

  function hideOverlay() {
    state.overlayMode = null;
    el.overlay.classList.remove('is-open');
  }

  /* ---------------- 流程 ---------------- */

  function startBall() {
    if (state.game.status !== 'ready') return;
    state.game = Logic.launch(state.game);
    state.autoLaunchAt = 0;
    state.ballTrail.length = 0;
    hideOverlay();
    refreshHud();
  }

  function restart() {
    state.game = Logic.createGame();
    state.particles.length = 0;
    state.popups.length = 0;
    state.ballTrail.length = 0;
    state.shake = 0;
    state.flash = 0;
    state.autoLaunchAt = 0;
    refreshHud();
    showOverlay('ready');
  }

  function pause() {
    if (state.game.status !== 'running') return;
    state.game = Logic.togglePause(state.game);
    showOverlay('paused');
    refreshHud();
  }

  function resume() {
    if (state.game.status !== 'paused') return;
    state.game = Logic.togglePause(state.game);
    hideOverlay();
    refreshHud();
  }

  function primaryAction() {
    if (state.game.status === 'paused') resume();
    else if (state.game.status === 'ready') startBall();
    else if (state.game.status === 'over' || state.game.status === 'won') restart();
  }

  /* ---------------- 特效（纯渲染层，不参与判定） ---------------- */

  function spawnDebris(x, y, row, count) {
    var color = ROW_COLORS[row] || ROW_COLORS[0];
    for (var i = 0; i < count && state.particles.length < 240; i += 1) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 40 + Math.random() * 220;
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.5,
        size: 1.6 + Math.random() * 3.4,
        color: color,
      });
    }
  }

  function spawnPopup(x, y, text) {
    state.popups.push({ x: x, y: y, text: text, life: 0, maxLife: 0.7 });
  }

  function bumpScore() {
    if (!el.scoreStat) return;
    el.scoreStat.classList.remove('is-bump');
    void el.scoreStat.offsetWidth;
    el.scoreStat.classList.add('is-bump');
  }

  function handleEvents(events) {
    var lifeLost = false;
    var levelUp = false;
    for (var i = 0; i < events.length; i += 1) {
      var event = events[i];
      if (event.type === 'brickBreak') {
        spawnDebris(event.x, event.y, event.row, 10);
        spawnPopup(event.x, event.y, '+' + event.points);
      } else if (event.type === 'brickHit') {
        spawnDebris(event.x, event.y, event.row, 4);
        spawnPopup(event.x, event.y, '+' + event.points);
      } else if (event.type === 'paddle') {
        if (state.game.ball) {
          spawnDebris(state.game.ball.x, Logic.PADDLE_TOP, 3, 2);
        }
      } else if (event.type === 'lifeLost') {
        lifeLost = true;
        state.shake = 1;
        state.flash = 1;
      } else if (event.type === 'level') {
        levelUp = true;
        state.flash = 0.6;
      } else if (event.type === 'win') {
        state.flash = 0.8;
      }
    }
    if (lifeLost) state.autoLaunchAt = performance.now() + 900;
    if (levelUp) showOverlay('level');
  }

  /* ---------------- 输入 ---------------- */

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var code = event.code;
    if (code === 'ArrowLeft' || code === 'KeyA') {
      event.preventDefault();
      state.keys.left = true;
      return;
    }
    if (code === 'ArrowRight' || code === 'KeyD') {
      event.preventDefault();
      state.keys.right = true;
      return;
    }
    if (code === 'Space') {
      event.preventDefault();
      if (event.repeat) return;
      if (state.game.status === 'running') pause();
      else primaryAction();
      return;
    }
    if (code === 'KeyP') {
      if (event.repeat) return;
      if (state.game.status === 'running') pause();
      else if (state.game.status === 'paused') resume();
      return;
    }
    if (code === 'KeyR') {
      if (event.repeat) return;
      restart();
    }
  });

  document.addEventListener('keyup', function (event) {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') state.keys.left = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') state.keys.right = false;
  });

  el.overlayPrimary.addEventListener('click', primaryAction);
  el.restartBtn.addEventListener('click', restart);
  el.pauseBtn.addEventListener('click', function () {
    if (state.game.status === 'paused') resume();
    else pause();
  });

  function pointerX(event) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) return state.game.paddleX;
    return ((event.clientX - rect.left) / rect.width) * W;
  }

  stage.addEventListener('pointerdown', function (event) {
    if (state.game.status === 'paused') return;
    state.game = Logic.setPaddle(state.game, pointerX(event));
  });

  stage.addEventListener('pointermove', function (event) {
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      /* 鼠标移动即可控制，不需要按住 */
    }
    if (state.game.status === 'paused' || state.game.status === 'over' || state.game.status === 'won') {
      return;
    }
    state.game = Logic.setPaddle(state.game, pointerX(event));
  });

  function autoPause() {
    if (state.game.status === 'running') pause();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) autoPause();
  });
  window.addEventListener('blur', autoPause);

  /* ---------------- 更新 ---------------- */

  function update(dt, now) {
    var game = state.game;

    if (game.status === 'running' || game.status === 'ready') {
      var dir = (state.keys.left ? -1 : 0) + (state.keys.right ? 1 : 0);
      if (dir !== 0) {
        state.game = Logic.setPaddle(state.game, game.paddleX + dir * PADDLE_KEY_SPEED * dt);
      }
    }

    if (state.game.status === 'running') {
      var scoreBefore = state.game.score;
      state.game = Logic.step(state.game, dt);
      handleEvents(state.game.events);
      if (state.game.score !== scoreBefore) bumpScore();
      if (state.game.status === 'over') showOverlay('over');
      else if (state.game.status === 'won') showOverlay('won');
      else if (state.game.status === 'ready' && !state.overlayMode) {
        state.autoLaunchAt = state.autoLaunchAt || now + 850;
      }
      refreshHud();
    }

    if (state.game.status === 'ready' && state.autoLaunchAt && now >= state.autoLaunchAt) {
      state.autoLaunchAt = 0;
      startBall();
    }

    /* 拖尾 */
    if (state.game.status === 'running' && state.game.ball) {
      state.ballTrail.push({ x: state.game.ball.x, y: state.game.ball.y });
      if (state.ballTrail.length > 14) state.ballTrail.shift();
    } else {
      state.ballTrail.length = 0;
    }

    /* 粒子 / 飘字 / 衰减 */
    for (var i = state.particles.length - 1; i >= 0; i -= 1) {
      var particle = state.particles[i];
      particle.life += dt;
      if (particle.life >= particle.maxLife) {
        state.particles.splice(i, 1);
        continue;
      }
      particle.vy += 620 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    for (var j = state.popups.length - 1; j >= 0; j -= 1) {
      var popup = state.popups[j];
      popup.life += dt;
      if (popup.life >= popup.maxLife) {
        state.popups.splice(j, 1);
        continue;
      }
      popup.y -= 34 * dt;
    }
    state.shake = Math.max(0, state.shake - dt * 3.2);
    state.flash = Math.max(0, state.flash - dt * 2.8);
  }

  /* ---------------- 绘制 ---------------- */

  function roundedRect(x, y, w, h, radius) {
    var r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBackground() {
    if (!state.gradients) {
      var gradient = ctx.createLinearGradient(0, 0, 0, H);
      gradient.addColorStop(0, '#0c1620');
      gradient.addColorStop(0.55, '#0a1017');
      gradient.addColorStop(1, '#060a0e');

      var topGlow = ctx.createRadialGradient(W / 2, -60, 20, W / 2, -60, 420);
      topGlow.addColorStop(0, 'rgba(255, 200, 87, 0.11)');
      topGlow.addColorStop(1, 'rgba(255, 200, 87, 0)');

      var bottomGlow = ctx.createRadialGradient(W / 2, H + 40, 10, W / 2, H + 40, 380);
      bottomGlow.addColorStop(0, 'rgba(92, 225, 230, 0.1)');
      bottomGlow.addColorStop(1, 'rgba(92, 225, 230, 0)');

      state.gradients = { bg: gradient, top: topGlow, bottom: bottomGlow };
    }

    ctx.fillStyle = state.gradients.bg;
    ctx.fillRect(0, 0, W, H);

    /* 顶部 / 底部两道光晕，制造球场纵深 */
    ctx.fillStyle = state.gradients.top;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = state.gradients.bottom;
    ctx.fillRect(0, 0, W, H);

    /* 视距线 */
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var y = 0; y <= H; y += 27) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();

    /* 底部危险线 */
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 120, 100, 0.22)';
    ctx.setLineDash([7, 9]);
    ctx.beginPath();
    ctx.moveTo(0, H - 3);
    ctx.lineTo(W, H - 3);
    ctx.stroke();
    ctx.restore();
  }

  function drawBricks() {
    var bricks = state.game.bricks;
    for (var i = 0; i < bricks.length; i += 1) {
      var brick = bricks[i];
      if (!brick.alive) continue;
      var color = ROW_COLORS[brick.row] || ROW_COLORS[0];
      var twoHp = brick.hp > 1;
      ctx.fillStyle = hexToRgba(color, twoHp ? 0.3 : 0.17);
      roundedRect(brick.x, brick.y, brick.w, brick.h, 5);
      ctx.fill();

      ctx.strokeStyle = hexToRgba(color, twoHp ? 0.85 : 0.55);
      ctx.lineWidth = twoHp ? 1.6 : 1.1;
      roundedRect(brick.x + 0.5, brick.y + 0.5, brick.w - 1, brick.h - 1, 5);
      ctx.stroke();

      /* 顶部一道高光，让砖块有厚度 */
      ctx.strokeStyle = hexToRgba(color, 0.22);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(brick.x + 5, brick.y + 2.5);
      ctx.lineTo(brick.x + brick.w - 5, brick.y + 2.5);
      ctx.stroke();

      if (twoHp) {
        ctx.strokeStyle = hexToRgba(color, 0.32);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(brick.x + 8, brick.y + brick.h / 2);
        ctx.lineTo(brick.x + brick.w - 8, brick.y + brick.h / 2);
        ctx.stroke();
      } else if (brick.maxHp > 1) {
        /* 打掉一格血后的裂纹 */
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(brick.x + brick.w * 0.3, brick.y + 3);
        ctx.lineTo(brick.x + brick.w * 0.42, brick.y + brick.h - 4);
        ctx.lineTo(brick.x + brick.w * 0.6, brick.y + 5);
        ctx.stroke();
      }
    }
  }

  function drawPaddle() {
    var game = state.game;
    var x = game.paddleX - Logic.PADDLE_W / 2;
    var y = Logic.PADDLE_TOP;
    var gradient = ctx.createLinearGradient(x, y, x, y + Logic.PADDLE_H);
    gradient.addColorStop(0, '#e8fff8');
    gradient.addColorStop(0.35, '#7cffb2');
    gradient.addColorStop(1, '#1fa66c');

    ctx.save();
    ctx.shadowColor = 'rgba(124, 255, 178, 0.6)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = gradient;
    roundedRect(x, y, Logic.PADDLE_W, Logic.PADDLE_H, 7);
    ctx.fill();
    ctx.restore();

    /* 挡板中心刻度 */
    ctx.fillStyle = 'rgba(6, 20, 14, 0.35)';
    ctx.fillRect(game.paddleX - 1, y + 3, 2, Logic.PADDLE_H - 6);
  }

  function drawBall(now) {
    var game = state.game;
    if (game.status === 'ready' && game.ball) {
      /* 待发球：画一条向上的虚线瞄准线 */
      var pulse = 0.45 + 0.3 * Shell.pulse(now, 1100);
      ctx.save();
      ctx.strokeStyle = 'rgba(92, 225, 230, ' + pulse + ')';
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(game.ball.x, game.ball.y - 12);
      ctx.lineTo(game.ball.x, game.ball.y - 88);
      ctx.stroke();
      ctx.restore();
    }

    if (!game.ball) return;
    var ball = game.ball;

    /* 拖尾 */
    for (var i = 0; i < state.ballTrail.length; i += 1) {
      var point = state.ballTrail[i];
      var alpha = (i / state.ballTrail.length) * 0.28;
      ctx.fillStyle = 'rgba(92, 225, 230, ' + alpha + ')';
      ctx.beginPath();
      ctx.arc(point.x, point.y, ball.r * (0.4 + (i / state.ballTrail.length) * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.shadowColor = 'rgba(92, 225, 230, 0.95)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#eaffff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(92, 225, 230, 0.9)';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEffects() {
    for (var i = 0; i < state.particles.length; i += 1) {
      var particle = state.particles[i];
      var progress = particle.life / particle.maxLife;
      ctx.fillStyle = hexToRgba(particle.color, 1 - progress);
      ctx.fillRect(
        particle.x - particle.size / 2,
        particle.y - particle.size / 2,
        particle.size,
        particle.size,
      );
    }

    ctx.textAlign = 'center';
    ctx.font = '700 12px ui-monospace, Consolas, monospace';
    for (var j = 0; j < state.popups.length; j += 1) {
      var popup = state.popups[j];
      var alpha = 1 - popup.life / popup.maxLife;
      ctx.fillStyle = 'rgba(255, 200, 87, ' + alpha + ')';
      ctx.fillText(popup.text, popup.x, popup.y);
    }
    ctx.textAlign = 'start';
  }

  function hexToRgba(hex, alpha) {
    var value = hex.replace('#', '');
    if (value.length === 3) {
      value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    }
    var r = parseInt(value.slice(0, 2), 16);
    var g = parseInt(value.slice(2, 4), 16);
    var b = parseInt(value.slice(4, 6), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  function draw(now) {
    var size = Shell.syncCanvas(canvas);
    var dpr = size.dpr;
    var scale = Math.min(size.width / W, size.height / H);
    var offsetX = (size.width - W * scale) / 2;
    var offsetY = (size.height - H * scale) / 2;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = '#070b10';
    ctx.fillRect(0, 0, size.width, size.height);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);

    var shake = state.shake * state.shake;
    if (shake > 0.001) {
      ctx.translate((Math.random() - 0.5) * shake * 7, (Math.random() - 0.5) * shake * 7);
    }

    drawBackground();
    drawBricks();
    drawPaddle();
    drawBall(now);
    drawEffects();

    if (state.flash > 0.001) {
      ctx.fillStyle = 'rgba(255, 110, 90, ' + state.flash * 0.16 + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------------- 主循环 ---------------- */

  function frame(now) {
    var dt = state.lastFrame ? Math.min(0.05, (now - state.lastFrame) / 1000) : 1 / 60;
    state.lastFrame = now;
    update(dt, now);
    draw(now);
    window.requestAnimationFrame(frame);
  }

  refreshHud();
  showOverlay('ready');
  window.requestAnimationFrame(frame);
})();
