/**
 * Game Shell —— 游戏页共用的小工具（经典 <script>，零依赖）
 *
 * 提供：
 *   GameShell.syncCanvas(canvas)          每帧调用，按容器尺寸 + devicePixelRatio 适配
 *   GameShell.best(key) / saveBest(k,v)   最高分 localStorage 读写（隐私模式安全）
 *   GameShell.isCoarsePointer()           是否触屏主输入
 *   GameShell.bindFullscreen()            绑定 data-action="fullscreen" 按钮（自动执行）
 *
 * 不依赖父页面、不发网络请求；在 iframe 中直接可用。
 */
(function (global) {
  'use strict';

  var DPR_LIMIT = 2; // 高分屏最多 2x，兼顾清晰和性能

  /**
   * 同步 canvas 的像素尺寸到 CSS 像素尺寸 × devicePixelRatio。
   * 返回 { dpr, width, height }，width/height 是 CSS 像素（绘制时用）。
   * 尺寸没变时不会重置 canvas，因此不会清空画面。
   */
  function syncCanvas(canvas) {
    var dpr = Math.min(global.devicePixelRatio || 1, DPR_LIMIT);
    var cssWidth = Math.max(1, canvas.clientWidth || 1);
    var cssHeight = Math.max(1, canvas.clientHeight || 1);
    var pixelWidth = Math.round(cssWidth * dpr);
    var pixelHeight = Math.round(cssHeight * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    return { dpr: dpr, width: cssWidth, height: cssHeight };
  }

  function best(key) {
    try {
      var raw = global.localStorage.getItem(key);
      var value = Number(raw);
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch (error) {
      return 0;
    }
  }

  /** 分数更高才写入，返回（可能更新后的）最高分。 */
  function saveBest(key, score) {
    var current = best(key);
    if (score > current) {
      try {
        global.localStorage.setItem(key, String(Math.floor(score)));
      } catch (error) {
        /* 隐私模式 / 存储满了：静默失败，不影响游戏 */
      }
      return Math.floor(score);
    }
    return current;
  }

  function isCoarsePointer() {
    try {
      return global.matchMedia('(pointer: coarse)').matches;
    } catch (error) {
      return false;
    }
  }

  function bindFullscreen() {
    var buttons = document.querySelectorAll('[data-action="fullscreen"]');
    if (!buttons.length) return;

    function sync() {
      var active = Boolean(document.fullscreenElement);
      buttons.forEach(function (button) {
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
        button.title = active ? '退出全屏（Esc）' : '全屏';
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        try {
          if (!document.fullscreenElement) {
            var request = document.documentElement.requestFullscreen();
            if (request && typeof request.catch === 'function') request.catch(function () {});
          } else {
            var exit = document.exitFullscreen();
            if (exit && typeof exit.catch === 'function') exit.catch(function () {});
          }
        } catch (error) {
          /* iframe 未授权全屏时静默忽略 */
        }
      });
    });

    document.addEventListener('fullscreenchange', sync);
    sync();
  }

  /** 生成一个 0..1 的波形数值，用于呼吸光效（渲染层用）。 */
  function pulse(timeMs, periodMs) {
    return 0.5 + 0.5 * Math.sin((timeMs / periodMs) * Math.PI * 2);
  }

  global.GameShell = {
    syncCanvas: syncCanvas,
    best: best,
    saveBest: saveBest,
    isCoarsePointer: isCoarsePointer,
    bindFullscreen: bindFullscreen,
    pulse: pulse,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindFullscreen);
  } else {
    bindFullscreen();
  }
})(window);
