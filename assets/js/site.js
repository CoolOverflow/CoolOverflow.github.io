/* =============================================================================
   site.js — interaction layer for cooloverflow.github.io
   Vanilla, no dependencies, progressive enhancement.
   Owned by Lead. Hooks used by generated HTML (see design/BRIEF.md):
     [data-theme-toggle] [data-nav-toggle] #site-nav #site-header [data-back-to-top]
     [data-filter-search] [data-filter-chips] [data-filter-count] [data-filter-empty]
     [data-filter-jump] [data-reveal] .code-block .toc-nav .post-body img #hero-canvas
   ============================================================================= */
(function () {
  'use strict';

  var root = document.documentElement;
  var store = {
    get: function (k) {
      try { return localStorage.getItem(k); } catch (e) { return null; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, v); } catch (e) {}
    },
  };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function onReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function throttle(fn, wait) {
    var last = 0, timer = null;
    return function () {
      var now = Date.now(), args = arguments, self = this;
      var remaining = wait - (now - last);
      if (remaining <= 0) {
        if (timer) { clearTimeout(timer); timer = null; }
        last = now;
        fn.apply(self, args);
      } else if (!timer) {
        timer = setTimeout(function () {
          last = Date.now();
          timer = null;
          fn.apply(self, args);
        }, remaining);
      }
    };
  }

  /* -------------------------------------------------------------------------
     theme
     ------------------------------------------------------------------------- */
  function initTheme() {
    var forced = new URLSearchParams(location.search).get('theme');
    if (forced === 'light' || forced === 'dark') root.dataset.theme = forced;

    var toggle = document.querySelector('[data-theme-toggle]');
    if (!toggle) return;
    var sync = function () {
      var light = root.dataset.theme === 'light';
      toggle.setAttribute('aria-pressed', String(light));
      toggle.setAttribute('title', light ? '切换到深色主题' : '切换到浅色主题');
    };
    sync();
    toggle.addEventListener('click', function () {
      var next = root.dataset.theme === 'light' ? 'dark' : 'light';
      root.dataset.theme = next;
      store.set('theme', next);
      sync();
    });
    // react to system change only when the user has never chosen explicitly
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: light)');
      var onChange = function (e) {
        if (store.get('theme')) return;
        root.dataset.theme = e.matches ? 'light' : 'dark';
        sync();
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
    return sync;
  }

  /* -------------------------------------------------------------------------
     mobile nav
     ------------------------------------------------------------------------- */
  function initNav() {
    var toggle = document.querySelector('[data-nav-toggle]');
    var nav = document.getElementById('site-nav');
    if (!toggle || !nav) return;

    var setOpen = function (open) {
      nav.classList.toggle('is-open', open);
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    };
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!nav.classList.contains('is-open'));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('click', function (e) {
      if (!nav.classList.contains('is-open')) return;
      if (e.target.closest('#site-nav') || e.target.closest('[data-nav-toggle]')) return;
      setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    window.addEventListener('resize', throttle(function () {
      if (window.innerWidth > 820) setOpen(false);
    }, 150));
  }

  /* -------------------------------------------------------------------------
     sticky header + back to top
     ------------------------------------------------------------------------- */
  function initScrollChrome() {
    var header = document.getElementById('site-header');
    var top = document.querySelector('[data-back-to-top]');
    var onScroll = function () {
      if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
      if (top) {
        var show = window.scrollY > 640;
        top.classList.toggle('is-visible', show);
        top.setAttribute('aria-hidden', String(!show));
        top.tabIndex = show ? 0 : -1;
      }
    };
    onScroll();
    window.addEventListener('scroll', throttle(onScroll, 120), { passive: true });
    if (top) {
      top.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
        var brand = document.querySelector('.brand');
        if (brand) brand.focus({ preventScroll: true });
      });
    }
    return onScroll;
  }

  /* -------------------------------------------------------------------------
     filters + search (projects / blog)
     ------------------------------------------------------------------------- */
  function initFilters() {
    var inputs = document.querySelectorAll('[data-filter-search]');
    Array.prototype.forEach.call(inputs, function (input) {
      var bar = input.closest('.filter-bar') || document;
      var targetSel = input.getAttribute('data-target');
      var list = document.querySelector(targetSel);
      if (!list) return;
      var chips = bar.querySelectorAll('[data-filter]');
      var counter = bar.querySelector('[data-filter-count]');
      var empty = document.querySelector('[data-filter-empty]');
      var state = { cat: '全部', q: '' };
      var itemSel = list.classList.contains('project-grid') ? '.project-card' : '.post-item';

      function apply() {
        var items = list.querySelectorAll(itemSel);
        var visible = 0;
        Array.prototype.forEach.call(items, function (item) {
          var okCat = state.cat === '全部' || item.getAttribute('data-cat') === state.cat;
          var okText = !state.q || (item.getAttribute('data-text') || '').toLowerCase().indexOf(state.q) !== -1;
          var show = okCat && okText;
          item.hidden = !show;
          item.classList.toggle('is-hidden', !show);
          if (show) visible++;
        });
        // blog: collapse empty year blocks
        var years = list.querySelectorAll('.archive-year');
        Array.prototype.forEach.call(years, function (year) {
          var any = year.querySelectorAll(itemSel + ':not([hidden])').length > 0;
          year.hidden = !any;
        });
        if (counter) counter.textContent = '显示 ' + visible + ' / ' + items.length;
        if (empty) empty.hidden = visible !== 0 || items.length === 0;
      }

      input.addEventListener('input', throttle(function () {
        state.q = input.value.trim().toLowerCase().replace(/^#/, '');
        apply();
      }, 80));

      Array.prototype.forEach.call(chips, function (chip) {
        chip.addEventListener('click', function () {
          Array.prototype.forEach.call(chips, function (c) {
            c.classList.toggle('is-active', c === chip);
            c.setAttribute('aria-pressed', String(c === chip));
          });
          state.cat = chip.getAttribute('data-filter');
          if (input.value) { input.value = ''; state.q = ''; }
          apply();
        });
      });

      // hot-tag buttons jump into search
      var jumps = document.querySelectorAll('[data-filter-jump]');
      Array.prototype.forEach.call(jumps, function (btn) {
        btn.addEventListener('click', function () {
          var tag = btn.getAttribute('data-filter-jump');
          input.value = tag;
          state.q = tag.toLowerCase();
          state.cat = '全部';
          Array.prototype.forEach.call(chips, function (c) {
            c.classList.toggle('is-active', c.getAttribute('data-filter') === '全部');
          });
          apply();
          input.focus();
          var y = input.getBoundingClientRect().top + window.scrollY - 140;
          window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
        });
      });

      apply();
    });
  }

  /* -------------------------------------------------------------------------
     reveal on scroll
     ------------------------------------------------------------------------- */
  var NO_ANIM = false;

  function revealAll() {
    var nodes = document.querySelectorAll('[data-reveal]');
    Array.prototype.forEach.call(nodes, function (n) { n.classList.add('is-revealed'); });
  }

  function initReveal() {
    var nodes = document.querySelectorAll('[data-reveal]');
    if (!nodes.length) return;
    if (NO_ANIM || reduceMotion || !('IntersectionObserver' in window)) {
      revealAll();
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
    Array.prototype.forEach.call(nodes, function (n, i) {
      n.style.setProperty('--reveal-delay', (i % 6) * 60 + 'ms');
      io.observe(n);
    });
    // safety net: never leave content invisible if something goes wrong
    setTimeout(function () {
      Array.prototype.forEach.call(nodes, function (n) {
        if (!n.classList.contains('is-revealed')) n.classList.add('is-revealed');
      });
    }, 2600);
  }

  /* -------------------------------------------------------------------------
     code blocks: language label, copy button, lightweight highlighting
     ------------------------------------------------------------------------- */
  var KEYWORDS = new Set(
    ('let const var function return if else for while do switch case break continue class new this import export ' +
      'from async await def elif in not and or None True False nil local then end elseif repeat until self print ' +
      'public private static void int float double bool string true false null using namespace struct foreach get set ' +
      'yield override virtual abstract interface enum try catch finally throw typeof sizeof ref out params internal ' +
      'protected readonly base is as operator implicit explicit delegate event lock default extern unsafe volatile ' +
      'goto sub dim as long short byte char object').split(' ')
  );

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function highlight(code, lang) {
    if (!lang || lang === 'text' || lang === 'plaintext' || lang === 'plain') {
      return escapeHtml(code);
    }
    // tokenize on the RAW text, escape each chunk, wrap tokens
    var re = /(\/\/[^\n]*|#[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;
    var out = '';
    var last = 0;
    var m;
    while ((m = re.exec(code))) {
      out += escapeHtml(code.slice(last, m.index));
      if (m[1]) out += '<span class="tok-com">' + escapeHtml(m[1]) + '</span>';
      else if (m[2]) out += '<span class="tok-str">' + escapeHtml(m[2]) + '</span>';
      else if (m[3]) out += '<span class="tok-num">' + escapeHtml(m[3]) + '</span>';
      else if (m[4] && KEYWORDS.has(m[4])) out += '<span class="tok-kw">' + escapeHtml(m[4]) + '</span>';
      else out += escapeHtml(m[4]);
      last = re.lastIndex;
    }
    out += escapeHtml(code.slice(last));
    return out;
  }

  function initCodeBlocks() {
    var blocks = document.querySelectorAll('.code-block');
    Array.prototype.forEach.call(blocks, function (block) {
      var codeEl = block.querySelector('code');
      if (!codeEl) return;
      var lang = '';
      var m = (codeEl.className || '').match(/language-([\w-]+)/);
      if (m) lang = m[1].toLowerCase();
      if (!block.querySelector('.code-lang') && lang) {
        var label = document.createElement('span');
        label.className = 'code-lang';
        label.textContent = lang;
        block.appendChild(label);
      }
      if (!reduceMotion || true) {
        var raw = codeEl.textContent;
        codeEl.innerHTML = highlight(raw, lang);
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy';
      btn.textContent = '复制';
      btn.setAttribute('aria-label', '复制这段代码');
      btn.addEventListener('click', function () {
        var text = codeEl.textContent;
        var done = function () {
          btn.textContent = '已复制';
          btn.classList.add('is-done');
          setTimeout(function () {
            btn.textContent = '复制';
            btn.classList.remove('is-done');
          }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
        } else {
          fallbackCopy(text, done);
        }
      });
      block.appendChild(btn);
    });
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* -------------------------------------------------------------------------
     table of contents scrollspy
     ------------------------------------------------------------------------- */
  function initToc() {
    var nav = document.querySelector('.toc-nav');
    if (!nav) return;
    var links = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
    if (!links.length) return;
    var targets = links
      .map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); })
      .filter(Boolean);
    if (!targets.length) return;
    var current = null;

    var setCurrent = function (id) {
      if (current === id) return;
      current = id;
      links.forEach(function (a) {
        var on = a.getAttribute('href') === '#' + id;
        a.classList.toggle('is-current', on);
        if (on) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    };

    var onScroll = throttle(function () {
      // Anchor targets land at scroll-padding-top + scroll-margin-top; the spy
      // threshold must match that or the just-clicked heading highlights its
      // predecessor. Fall back to the old header-based heuristic if unsupported.
      var pad = parseInt(getComputedStyle(root).scrollPaddingTop, 10);
      var margin = parseInt(getComputedStyle(targets[0]).scrollMarginTop, 10);
      var headerH = parseInt(getComputedStyle(root).getPropertyValue('--header-h'), 10) || 68;
      var offset = (isNaN(pad) ? headerH + 16 : pad) + (isNaN(margin) ? 0 : margin) + 2;
      var active = targets[0];
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].getBoundingClientRect().top <= offset) active = targets[i];
        else break;
      }
      if (active) setCurrent(active.id);
    }, 100);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    links.forEach(function (a) {
      a.addEventListener('click', function () {
        setCurrent(a.getAttribute('href').slice(1));
      });
    });
  }

  /* -------------------------------------------------------------------------
     article image lightbox
     ------------------------------------------------------------------------- */
  function initLightbox() {
    var body = document.querySelector('.post-body');
    if (!body) return;
    var imgs = body.querySelectorAll('img');
    if (!imgs.length) return;
    var overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '图片预览');
    overlay.innerHTML = '<button type="button" class="lightbox-close" aria-label="关闭预览">×</button><img alt="">';
    document.body.appendChild(overlay);
    var big = overlay.querySelector('img');

    var close = function () {
      overlay.classList.remove('is-open');
      document.body.classList.remove('no-scroll');
    };
    Array.prototype.forEach.call(imgs, function (img) {
      img.classList.add('is-zoomable');
      img.addEventListener('click', function () {
        big.src = img.currentSrc || img.src;
        big.alt = img.alt || '';
        overlay.classList.add('is-open');
        document.body.classList.add('no-scroll');
      });
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.classList.contains('lightbox-close')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
    });
  }

  /* -------------------------------------------------------------------------
     hero canvas — sparse flow field, cheap and calm
     ------------------------------------------------------------------------- */
  function initHeroCanvas() {
    var canvas = document.getElementById('hero-canvas');
    if (!canvas || !canvas.getContext) return;
    if (reduceMotion) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, raf = null, t = 0, running = false;
    var pointer = { x: -9999, y: -9999 };
    var dots = [];

    function resize() {
      var rect = canvas.parentElement.getBoundingClientRect();
      w = Math.max(rect.width, 1);
      h = Math.max(rect.height, 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      var count = Math.max(28, Math.min(90, Math.round((w * h) / 22000)));
      dots = [];
      for (var i = 0; i < count; i++) {
        dots.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: 0,
          vy: 0,
          r: 0.7 + Math.random() * 1.5,
          a: 0.15 + Math.random() * 0.5,
        });
      }
    }

    function frame() {
      t += 0.0022;
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < dots.length; i++) {
        var p = dots[i];
        var ang = Math.sin(p.x * 0.0026 + t) * 2 + Math.cos(p.y * 0.0021 - t * 1.3) * 2;
        p.vx += Math.cos(ang) * 0.012;
        p.vy += Math.sin(ang) * 0.012;
        var dx = p.x - pointer.x;
        var dy = p.y - pointer.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < 16000) {
          var f = 0.5 / Math.max(d2, 40);
          p.vx += dx * f;
          p.vy += dy * f;
        }
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(124,255,178,' + p.a + ')';
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }

    var start = function () {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    var stop = function () {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    };

    resize();
    start();
    window.addEventListener('resize', throttle(resize, 200));
    canvas.parentElement.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    });
    canvas.parentElement.addEventListener('pointerleave', function () {
      pointer.x = -9999;
      pointer.y = -9999;
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });
  }

  /* -------------------------------------------------------------------------
     boot
     ------------------------------------------------------------------------- */
  onReady(function () {
    var params = new URLSearchParams(location.search);
    NO_ANIM = params.get('noanim') === '1';
    if (NO_ANIM) root.dataset.noanim = 'on';
    root.dataset.js = 'on';

    // one failing module must never take the whole page down
    var guard = function (fn) {
      try { return fn(); } catch (e) { if (window.console) console.warn('[site]', e); }
    };
    guard(initTheme);
    guard(initNav);
    var onScroll = guard(initScrollChrome);
    guard(initFilters);
    guard(initReveal);
    guard(initCodeBlocks);
    guard(initToc);
    guard(initLightbox);
    guard(initHeroCanvas);
    if (typeof onScroll === 'function') guard(onScroll);
    // anchor deep links after fonts settle
    if (location.hash) {
      var el = document.getElementById(location.hash.slice(1));
      if (el) setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 60);
    }
  });
})();
