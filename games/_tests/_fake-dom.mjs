/**
 * 极简 DOM / Canvas 桩，用来在 node 里跑真实页面脚本（game.js + game-shell.js），
 * 检查"打开页面不会抛异常、渲染循环真的在画"。
 *
 * 这不是完整浏览器，只覆盖三个游戏页用到的 API；
 * 视觉验证仍应使用真浏览器截图。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function makeClassList() {
  const set = new Set();
  return {
    add(...names) {
      names.forEach((name) => set.add(name));
    },
    remove(...names) {
      names.forEach((name) => set.delete(name));
    },
    toggle(name, force) {
      const next = force === undefined ? !set.has(name) : Boolean(force);
      if (next) set.add(name);
      else set.delete(name);
      return next;
    },
    contains(name) {
      return set.has(name);
    },
  };
}

function makeStyle() {
  const props = {};
  return {
    setProperty(name, value) {
      props[name] = String(value);
    },
    removeProperty(name) {
      delete props[name];
    },
    getPropertyValue(name) {
      return props[name] || '';
    },
    props,
  };
}

function makeElement(tagName, sizes = {}) {
  const listeners = new Map();
  const el = {
    tagName: String(tagName || 'div').toUpperCase(),
    children: [],
    parentNode: null,
    dataset: {},
    classList: makeClassList(),
    className: '',
    style: makeStyle(),
    textContent: '',
    hidden: false,
    disabled: false,
    title: '',
    width: 0,
    height: 0,
    clientWidth: sizes.width ?? 100,
    clientHeight: sizes.height ?? 20,
    listeners,
    appendChild(child) {
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    remove() {
      if (el.parentNode) {
        el.parentNode.children = el.parentNode.children.filter((node) => node !== el);
        el.parentNode = null;
      }
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type);
      if (!list) return;
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    setAttribute(name, value) {
      el[name] = value;
    },
    getAttribute(name) {
      return el[name];
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: el.clientWidth, height: el.clientHeight };
    },
    dispatch(type, event = {}) {
      const list = listeners.get(type) || [];
      const payload = {
        type,
        preventDefault() {},
        stopPropagation() {},
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        repeat: false,
        buttons: 1,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 0,
        clientY: 0,
        ...event,
      };
      list.slice().forEach((handler) => handler(payload));
    },
  };
  Object.defineProperty(el, 'offsetWidth', {
    get() {
      return el.clientWidth;
    },
  });
  Object.defineProperty(el, 'offsetHeight', {
    get() {
      return el.clientHeight;
    },
  });
  return el;
}

function makeCanvasContext(counter) {
  const store = {};
  const gradient = () => ({ addColorStop() {} });
  return new Proxy(store, {
    get(target, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
      if (prop === 'measureText') return () => ({ width: 12 });
      if (prop === 'getImageData') return () => ({ data: [] });
      if (prop in target) return target[prop];
      if (typeof prop !== 'string') return undefined;
      /* 未显式实现的 canvas 方法一律 no-op，并记录"画了一笔" */
      return function noop() {
        counter.count += 1;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

/**
 * @param {string} root 站点根目录
 * @param {'snake'|'2048'|'breakout'} game
 */
export function createGamePage(root, game) {
  const clock = { now: 5000 };
  const errors = [];
  const drawCalls = { count: 0 };
  const timers = [];
  const rafQueue = [];
  let timerId = 1;
  const docListeners = new Map();
  const winListeners = new Map();
  const registry = new Map();

  const sizesBySelector = {
    '[data-canvas]': { width: 1000, height: 562 },
    '[data-stage]': { width: 1000, height: 562 },
    '[data-board]': { width: 520, height: 520 },
    '[data-tiles]': { width: 520, height: 520 },
    '[data-grid]': { width: 520, height: 520 },
  };

  function createElementFor(selector) {
    const sizes = sizesBySelector[selector] || {};
    const el = makeElement(selector.includes('canvas') ? 'canvas' : 'div', sizes);
    if (selector === '[data-canvas]') {
      el.getContext = () => el.__ctx || (el.__ctx = makeCanvasContext(drawCalls));
    }
    return el;
  }

  function querySelector(selector) {
    if (!registry.has(selector)) registry.set(selector, createElementFor(selector));
    return registry.get(selector);
  }

  function addListener(map, type, handler) {
    if (!map.has(type)) map.set(type, []);
    map.get(type).push(handler);
  }

  const storage = new Map();

  const document = {
    readyState: 'complete',
    hidden: false,
    fullscreenElement: null,
    documentElement: makeElement('html', { width: 1280, height: 800 }),
    body: makeElement('body', { width: 1280, height: 800 }),
    querySelector,
    querySelectorAll(selector) {
      if (selector === '[data-action="fullscreen"]') return [];
      return [];
    },
    createElement(tagName) {
      return makeElement(tagName);
    },
    addEventListener(type, handler) {
      addListener(docListeners, type, handler);
    },
    removeEventListener() {},
    exitFullscreen() {
      return Promise.resolve();
    },
  };

  const window = {
    devicePixelRatio: 2,
    innerWidth: 1280,
    innerHeight: 800,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    performance: { now: () => clock.now },
    requestAnimationFrame(handler) {
      rafQueue.push(handler);
      return rafQueue.length;
    },
    cancelAnimationFrame() {},
    setTimeout(handler, delay) {
      timers.push({ id: timerId, at: clock.now + (Number(delay) || 0), handler });
      return timerId++;
    },
    clearTimeout(id) {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    addEventListener(type, handler) {
      addListener(winListeners, type, handler);
    },
    removeEventListener() {},
    console,
  };

  const sandbox = {
    window,
    document,
    performance: window.performance,
    localStorage: window.localStorage,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    console,
    Math,
    ResizeObserver: class ResizeObserver {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        this.callback([]);
      }
      disconnect() {}
    },
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);

  /* 按页面顺序执行：logic.classic.js → game-shell.js → game.js */
  function run() {
    const files = [
      path.join(root, 'games', game, 'logic.classic.js'),
      path.join(root, 'games', '_shared', 'game-shell.js'),
      path.join(root, 'games', game, 'game.js'),
    ];
    for (const file of files) {
      const code = readFileSync(file, 'utf8');
      vm.runInContext(code, context, { filename: file });
    }
  }

  function advance(milliseconds, stepMs = 16) {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += stepMs) {
      clock.now += stepMs;
      for (let i = timers.length - 1; i >= 0; i -= 1) {
        if (timers[i].at <= clock.now) {
          const timer = timers.splice(i, 1)[0];
          try {
            timer.handler();
          } catch (error) {
            errors.push(error);
          }
        }
      }
      const callbacks = rafQueue.splice(0);
      for (const callback of callbacks) {
        try {
          callback(clock.now);
        } catch (error) {
          errors.push(error);
        }
      }
    }
  }

  function dispatchKey(code, extra = {}) {
    const handlers = docListeners.get('keydown') || [];
    handlers.slice().forEach((handler) => {
      try {
        handler({
          code,
          type: 'keydown',
          preventDefault() {},
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          repeat: false,
          ...extra,
        });
      } catch (error) {
        errors.push(error);
      }
    });
  }

  function dispatchPointer(type, extra = {}) {
    const stage = querySelector('[data-stage]');
    stage.dispatch(type, {
      pointerId: 1,
      pointerType: 'touch',
      buttons: 1,
      ...extra,
    });
  }

  function click(selector) {
    querySelector(selector).dispatch('click');
  }

  return {
    game,
    window,
    document,
    sandbox,
    errors,
    drawCalls,
    run,
    advance,
    dispatchKey,
    dispatchPointer,
    click,
    querySelector,
  };
}
