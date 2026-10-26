#!/usr/bin/env node
/**
 * design/qa/cdp-audit.mjs — real-browser audit over the Chrome DevTools Protocol.
 *
 *   # with `python -m http.server 8081 --bind 127.0.0.1 --directory .` running
 *   node design/qa/cdp-audit.mjs
 *   node design/qa/cdp-audit.mjs --base http://127.0.0.1:8081 --only home,post
 *
 * Covers (no Playwright needed, Node's global WebSocket):
 *   1. layout at 1440 / 768 / 390: scrollWidth <= innerWidth+1, offending overflow elements
 *   2. console errors / uncaught exceptions / HTTP >=400 / failed requests per page
 *   3. accessibility: single h1, heading jumps, img alt + naturalWidth, button/link names,
 *      duplicate ids, lang, skip-link target, input labels, contrast spot-checks
 *   4. content: KaTeX render count, TOC anchor targets, code block language labels + copy
 *      buttons, post images loaded
 *   5. interactions: theme toggle + reload persistence, mobile nav open/close, project
 *      category filter + search + live count, blog tag jump + category chip, TOC click
 *      scroll, code copy click, image lightbox, reveal animation completes
 *   6. games: keyboard state changes (snake pause/restart, 2048 moves/undo/restart,
 *      breakout launch/pause), canvas actually paints, no external requests
 *   7. perf snapshot: request count + transferred bytes per page
 *
 * Exit code: 1 if any FAIL (P0/P1), else 0. Result JSON: design/qa/results/cdp-audit.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, waitForDevtools, newPage, closePage, sleep, summarizeRecords } from './lib/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'design', 'qa', 'results');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = arg('--base', 'http://127.0.0.1:8081').replace(/\/$/, '');
const PORT = Number(arg('--port', '9433'));
const ONLY = arg('--only', '').split(',').filter(Boolean);

const VIEWPORTS = [1440, 768, 390];
const issues = [];
const results = { generatedAt: new Date().toISOString(), base: BASE, pages: [], interactions: {}, games: {}, console: [], perf: [] };
const add = (level, page, code, message, detail) => {
  issues.push({ level, page, code, message, detail });
  return { level, page, code, message };
};
const FAIL = (...a) => add('fail', ...a);
const WARN = (...a) => add('warn', ...a);
const INFO = (...a) => add('info', ...a);

/* --------------------------------------------------------------- page set */
const postsDir = path.join(ROOT, 'content', 'posts');
const slugs = fs.existsSync(postsDir)
  ? fs.readdirSync(postsDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort()
  : [];
const games = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'games.json'), 'utf8'));
  } catch (e) {
    return [];
  }
})();
const PAGES = [
  { name: 'home', path: '/', kind: 'page' },
  { name: 'blog', path: '/blog/', kind: 'page' },
  { name: 'projects', path: '/projects/', kind: 'page' },
  { name: 'games', path: '/games/', kind: 'page' },
  ...slugs.map((s) => ({ name: 'post:' + s, path: `/blog/${s}/`, kind: 'post' })),
  { name: '404', path: '/404.html', kind: 'page' },
  ...games.filter((g) => g.status === 'playable').map((g) => ({ name: 'game:' + g.id, path: g.path, kind: 'game' })),
].filter((p) => !ONLY.length || ONLY.some((o) => p.name.includes(o)));

/* --------------------------------------------------------------- probes */
const LAYOUT_PROBE = `(() => {
  const iw = window.innerWidth;
  const de = document.documentElement;
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 3);
    if (cls.length) s += '.' + cls.join('.');
    return s;
  };
  const offenders = [];
  const isScrollable = (el) => {
    let node = el.parentElement;
    while (node && node.nodeType === 1) {
      const ox = getComputedStyle(node).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
      node = node.parentElement;
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    if (el.namespaceURI === 'http://www.w3.org/2000/svg' && el.tagName.toLowerCase() !== 'svg') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right <= iw + 1 && r.left >= -1) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    if (el.classList.contains('skip-link')) continue;
    // KaTeX's screen-reader-only MathML clone is a 1px overflow-hidden box: not visible content
    if (el.closest('.katex-mathml')) continue;
    offenders.push({ sel: sel(el), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), pos: cs.position, txt: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30), scrollable: isScrollable(el) });
    if (offenders.length >= 25) break;
  }
  const clipped = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.overflowX !== 'hidden' && cs.overflowX !== 'clip') continue;
    if (el.clientWidth < 4) continue;
    if (el.scrollWidth > el.clientWidth + 4) {
      clipped.push({ sel: sel(el), cw: el.clientWidth, sw: el.scrollWidth });
      if (clipped.length >= 15) break;
    }
  }
  return {
    iw,
    docScrollWidth: de.scrollWidth,
    bodyScrollWidth: document.body ? document.body.scrollWidth : null,
    scrollHeight: de.scrollHeight,
    offenders,
    clipped,
  };
})()`;

const A11Y_PROBE = `(() => {
  const nameOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim().replace(/\\s+/g, ' '));
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) => ({
    lvl: Number(el.tagName[1]),
    txt: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
  }));
  const jumps = [];
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].lvl > headings[i - 1].lvl + 1) jumps.push(headings[i - 1].txt + ' (h' + headings[i - 1].lvl + ') -> ' + headings[i].txt + ' (h' + headings[i].lvl + ')');
  }
  const imgs = [...document.images].map((i) => ({
    src: (i.getAttribute('src') || '').slice(-70),
    hasSrc: i.hasAttribute('src') && !!i.getAttribute('src'),
    alt: i.getAttribute('alt'),
    hasAlt: i.hasAttribute('alt'),
    nw: i.naturalWidth,
    complete: i.complete,
  }));
  const btnNoName = [...document.querySelectorAll('button')].filter((b) => visible(b) && !nameOf(b)).map((b) => b.outerHTML.slice(0, 90));
  const linkNoName = [...document.querySelectorAll('a')].filter((a) => visible(a) && !nameOf(a)).map((a) => a.outerHTML.slice(0, 90));
  const emptyLinks = [...document.querySelectorAll('a')].filter((a) => visible(a) && (!a.getAttribute('href') || a.getAttribute('href') === '#')).map((a) => ({ html: a.outerHTML.slice(0, 110), disabled: a.getAttribute('aria-disabled') }));
  const inputs = [...document.querySelectorAll('input,select,textarea')].filter((i) => visible(i)).map((i) => ({
    type: i.type,
    label: i.getAttribute('aria-label') || (i.labels && i.labels.length ? i.labels[0].textContent.trim() : ''),
  }));
  const seen = new Set();
  const dups = [];
  for (const el of document.querySelectorAll('[id]')) {
    if (seen.has(el.id)) dups.push(el.id);
    else seen.add(el.id);
  }
  const skip = document.querySelector('.skip-link');
  const skipHref = skip ? skip.getAttribute('href') : null;
  return {
    lang: document.documentElement.lang,
    title: document.title,
    desc: (document.querySelector('meta[name="description"]') || {}).content || '',
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
    h1Count: document.querySelectorAll('h1').length,
    headingJumps: jumps.slice(0, 10),
    headingCount: headings.length,
    badImgs: imgs.filter((i) => !i.hasAlt).map((i) => i.src),
    notLoadedImgs: imgs.filter((i) => i.hasSrc && i.complete && i.nw === 0).map((i) => i.src),
    imgCount: imgs.length,
    btnNoName,
    linkNoName,
    emptyLinks,
    inputs,
    dupIds: dups,
    skipLink: skipHref,
    skipTargetExists: skipHref && skipHref.startsWith('#') ? !!document.getElementById(skipHref.slice(1)) : null,
    mainCount: document.querySelectorAll('main').length,
    tabbables: document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])').length,
  };
})()`;

const CONTENT_PROBE = `(() => {
  const tocLinks = [...document.querySelectorAll('.toc-nav a')].map((a) => {
    const href = a.getAttribute('href') || '';
    return { href, targetExists: href.startsWith('#') ? !!document.getElementById(href.slice(1)) : false };
  });
  const postImgs = [...document.querySelectorAll('.post-body img')].map((i) => ({
    alt: i.getAttribute('alt'),
    nw: i.naturalWidth,
    nw2: i.naturalWidth,
  }));
  return {
    katex: document.querySelectorAll('.katex').length,
    katexDisplay: document.querySelectorAll('.katex-display').length,
    katexErrors: document.querySelectorAll('.katex-error').length,
    tocLinks,
    tocMissing: tocLinks.filter((t) => !t.targetExists).length,
    codeBlocks: document.querySelectorAll('.code-block').length,
    codeCopy: document.querySelectorAll('.code-copy').length,
    codeLang: document.querySelectorAll('.code-lang').length,
    preCount: document.querySelectorAll('pre').length,
    postImgs,
    tables: document.querySelectorAll('.post-body table').length,
    revealPending: document.querySelectorAll('[data-reveal]').length ? document.querySelectorAll('[data-reveal]:not(.is-revealed)').length : 0,
    stats: [...document.querySelectorAll('.stat')].map((s) => (s.textContent || '').trim().replace(/\\s+/g, ' ')),
    cards: {
      projects: document.querySelectorAll('.project-card').length,
      posts: document.querySelectorAll('.post-item').length,
      games: document.querySelectorAll('.game-card').length,
      soon: document.querySelectorAll('.game-card.is-soon').length,
    },
  };
})()`;

const CONTRAST_PROBE = `(() => {
  const parse = (str) => {
    const m = String(str).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const bgOf = (el) => {
    const layers = [];
    let node = el;
    let opaque = false;
    let approx = false;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      // subtle gradients are fine as a base colour; flag them so the report is honest
      if (cs.backgroundImage && cs.backgroundImage !== 'none') approx = true;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) { opaque = true; break; }
      }
      node = node.parentElement;
    }
    if (!opaque) return null; // no solid backdrop (e.g. canvas-only game shell)
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base);
    base.approx = approx;
    return base;
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  const sels = ['body', '.section-desc', '.hero-lead', '.post-body p', '.post-body li', '.project-desc', '.post-item-summary', '.filter-count', 'footer', '.site-footer', '.page-desc', '.game-desc', '.shell-hint', '.shell-stat-label', '.eyebrow', '.stat-label'];
  const out = [];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (!el) continue;
    const t = (el.textContent || '').trim();
    if (!t) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const fgRaw = parse(cs.color);
    if (!fgRaw) continue;
    const bg = bgOf(el);
    if (!bg) continue; // background is an image/gradient — colour ratio not computable reliably
    const fg = fgRaw.a < 1 ? blend(fgRaw, bg) : fgRaw;
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    out.push({ sel: s, text: t.slice(0, 24), ratio: Math.round(ratio(fg, bg) * 100) / 100, size, large, required: large ? 3 : 4.5, approx: !!bg.approx });
  }
  return out;
})()`;

/* ---------------------------------------------------------------- helpers */
function externalResourceUrls(page) {
  return page.evaluate(`(() => {
    const resources = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /^https?:/.test(n));
    return resources.filter((u) => !u.startsWith(${JSON.stringify(BASE)}));
  })()`);
}

async function visit(page, pageInfo, vw, basePath) {
  await page.setViewport(vw, 900);
  page.resetRecords();
  const url = basePath + pageInfo.path + (pageInfo.path.includes('?') ? '&' : '?') + 'noanim=1';
  await page.goto(url, { settle: 420 });
  const layout = await page.evaluate(LAYOUT_PROBE);
  const a11y = await page.evaluate(A11Y_PROBE);
  const content = await page.evaluate(CONTENT_PROBE);
  const { errors, warnings } = summarizeRecords(page.records);
  const external = await externalResourceUrls(page);
  const perf = await page.evaluate(`(() => {
    const res = performance.getEntriesByType('resource');
    return { requests: res.length, transferKB: Math.round(res.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024), docKB: Math.round((document.documentElement.outerHTML.length) / 1024) };
  })()`);
  // contrast: measure both themes (default/site pages follow prefers-color-scheme)
  let contrast = null;
  if (vw === 1440) {
    const light = await page.evaluate(CONTRAST_PROBE);
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await page.reload({ settle: 420 });
    const dark = await page.evaluate(CONTRAST_PROBE);
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    contrast = { light, dark };
  }
  return { url, vw, layout, a11y, content, errors, warnings, external, contrast, perf };
}

function record(result) {
  results.pages.push(result);
  const { url, vw, layout, a11y, content, errors, warnings, external } = result;
  const tag = `${url.replace(BASE, '')} @${vw}`;

  if (layout.docScrollWidth > layout.iw + 1 || (layout.bodyScrollWidth || 0) > layout.iw + 1) {
    add('fail', tag, 'H_SCROLL', `horizontal scroll: documentElement.scrollWidth=${layout.docScrollWidth} > innerWidth=${layout.iw}`, layout.offenders);
  } else {
    // Elements that stick out of the viewport but sit inside an overflow:auto/scroll
    // ancestor are intentionally scrollable (code blocks, wide KaTeX) — informational.
    // Text that is clipped (no scroll affordance) is a real readability issue.
    const scrollable = layout.offenders.filter((o) => o.scrollable);
    const clippedText = layout.offenders.filter((o) => !o.scrollable && (o.txt || '').trim().length > 0);
    const decor = layout.offenders.filter((o) => !o.scrollable && !(o.txt || '').trim().length);
    if (clippedText.length) {
      add('warn', tag, 'ELEMENT_OVERFLOW', `${clippedText.length} text element(s) extend past the viewport and are clipped (not scrollable)`, clippedText.slice(0, 8));
    }
    if (scrollable.length) {
      add('info', tag, 'SCROLLABLE_OVERFLOW', `${scrollable.length} wide element(s) inside a horizontal scroll container (code/KaTeX)`, scrollable.slice(0, 5));
    }
    if (decor.length) add('info', tag, 'DECORATIVE_OVERFLOW', `${decor.length} decorative element(s) intentionally bleed past the viewport`, decor.slice(0, 5));
  }
  if (layout.clipped.length) {
    add('info', tag, 'CLIPPED_CONTENT', `${layout.clipped.length} overflow-hidden element(s) have content wider than the box`, layout.clipped.slice(0, 6));
  }

  for (const e of errors) add(vw === 390 ? 'fail' : 'fail', tag, 'CONSOLE', e);
  if (warnings.length) add('warn', tag, 'CONSOLE_WARN', warnings.join(' | ').slice(0, 300));
  if (external.length) add(result.kind === 'game' ? 'fail' : 'warn', tag, 'EXTERNAL_REQUEST', `page made external request(s): ${external.slice(0, 5).join(', ')}`);

  if (a11y.h1Count !== 1) add('fail', tag, 'H1_COUNT', `expected 1 h1, found ${a11y.h1Count}`);
  if (a11y.headingJumps.length) add('warn', tag, 'HEADING_JUMP', `heading level jumps: ${a11y.headingJumps.slice(0, 3).join(' ; ')}`);
  if (a11y.badImgs.length) add('fail', tag, 'IMG_ALT', `${a11y.badImgs.length} <img> without alt`, a11y.badImgs);
  if (a11y.notLoadedImgs.length) add('fail', tag, 'IMG_BROKEN', `image(s) did not load (naturalWidth=0): ${a11y.notLoadedImgs.slice(0, 4).join(', ')}`);
  if (a11y.btnNoName.length) add('fail', tag, 'BTN_NAME', `${a11y.btnNoName.length} button(s) without accessible name`, a11y.btnNoName);
  if (a11y.linkNoName.length) add('fail', tag, 'LINK_NAME', `${a11y.linkNoName.length} visible link(s) without accessible name`, a11y.linkNoName);
  const realEmptyLinks = a11y.emptyLinks.filter((l) => !l.disabled);
  if (realEmptyLinks.length) add('fail', tag, 'EMPTY_HREF', `${realEmptyLinks.length} visible link(s) with empty/# href`, realEmptyLinks);
  else if (a11y.emptyLinks.length) add('warn', tag, 'EMPTY_HREF_DISABLED', `${a11y.emptyLinks.length} aria-disabled card uses href="#"`, a11y.emptyLinks);
  if (a11y.inputs.some((i) => !i.label)) add('fail', tag, 'INPUT_LABEL', 'input without accessible label');
  if (a11y.dupIds.length) add('fail', tag, 'DUP_ID', `duplicate id(s): ${a11y.dupIds.join(', ')}`);
  if (!a11y.lang) add('fail', tag, 'LANG', 'html[lang] missing');
  if (a11y.skipLink && a11y.skipTargetExists === false) add('fail', tag, 'SKIP_LINK', `skip-link target ${a11y.skipLink} does not exist`);
  if (a11y.mainCount !== 1) add('warn', tag, 'MAIN_COUNT', `expected 1 <main>, found ${a11y.mainCount}`);
  if (!a11y.title) add('fail', tag, 'TITLE', 'empty document.title');
  if (!a11y.desc) add('warn', tag, 'META_DESC', 'missing meta description');

  if (content.katexErrors) add('fail', tag, 'KATEX_ERROR', `${content.katexErrors} KaTeX render error(s)`);
  if (content.tocLinks.length && content.tocMissing) add('fail', tag, 'TOC_TARGET', `${content.tocMissing} TOC link target id(s) missing`);
  if (content.preCount && content.codeCopy < content.codeBlocks) add('warn', tag, 'CODE_COPY', `only ${content.codeCopy}/${content.codeBlocks} code blocks have a copy button`);
  if (content.postImgs.some((i) => i.nw === 0)) add('fail', tag, 'POST_IMG', `post image(s) not loaded`);
  if (result.kind === 'post' && content.tocLinks.length === 0) WARN(tag, 'POST_TOC', 'article page without a table of contents');
  if (result.contrast) {
    for (const themeName of ['light', 'dark']) {
      const samples = result.contrast[themeName] || [];
      const low = samples.filter((c) => c.ratio < c.required);
      if (low.length) {
        add(
          'warn',
          tag + ' [' + themeName + ']',
          'CONTRAST',
          `${low.length}/${samples.length} text sample(s) below WCAG AA (${themeName}): ${low.map((c) => `${c.sel}=${c.ratio}:1 (need ${c.required})`).join('; ')}`,
          low
        );
      } else if (samples.length) {
        add('info', tag + ' [' + themeName + ']', 'CONTRAST_OK', `${samples.length} text sample(s) ≥ AA, min ${Math.min(...samples.map((c) => c.ratio))}:1`);
      }
    }
  }
}

/** math expectation: posts whose markdown body contains math should render .katex */
function expectMathForPosts() {
  const out = [];
  for (const slug of slugs) {
    const file = path.join(postsDir, slug + '.md');
    try {
      const body = fs.readFileSync(file, 'utf8').split(/^---$/m).slice(2).join('---');
      if (/\$\$|\\\(|\\\[/.test(body)) out.push(slug);
    } catch (e) {}
  }
  return out;
}

/* ------------------------------------------------------------- interactions */
async function testTheme(page) {
  const out = {};
  await page.setViewport(1440, 900);
  page.resetRecords();
  await page.goto(BASE + '/?noanim=1', { settle: 450 });
  out.initial = await page.evaluate(`(() => ({
    theme: document.documentElement.dataset.theme || null,
    stored: (() => { try { return localStorage.getItem('theme'); } catch (e) { return 'ERR'; } })(),
    bg: getComputedStyle(document.body).backgroundColor,
    toggle: !!document.querySelector('[data-theme-toggle]'),
    pressed: (document.querySelector('[data-theme-toggle]') || {}).getAttribute ? document.querySelector('[data-theme-toggle]').getAttribute('aria-pressed') : null,
  }))()`);
  if (!out.initial.toggle) {
    FAIL('theme', 'THEME_TOGGLE', 'no [data-theme-toggle] found on home page');
    return out;
  }
  await page.click('[data-theme-toggle]');
  await sleep(250);
  out.afterClick = await page.evaluate(`(() => ({
    theme: document.documentElement.dataset.theme,
    stored: (() => { try { return localStorage.getItem('theme'); } catch (e) { return 'ERR'; } })(),
    bg: getComputedStyle(document.body).backgroundColor,
    pressed: document.querySelector('[data-theme-toggle]').getAttribute('aria-pressed'),
    title: document.querySelector('[data-theme-toggle]').getAttribute('title'),
  }))()`);
  await page.reload({ settle: 500 });
  out.afterReload = await page.evaluate(`(() => ({
    theme: document.documentElement.dataset.theme,
    stored: (() => { try { return localStorage.getItem('theme'); } catch (e) { return 'ERR'; } })(),
    bg: getComputedStyle(document.body).backgroundColor,
  }))()`);
  if (out.afterClick.theme === out.initial.theme) FAIL('theme', 'THEME_NOOP', `theme did not change on click (still ${out.afterClick.theme})`);
  if (out.afterClick.stored !== out.afterClick.theme) FAIL('theme', 'THEME_STORE', `localStorage theme=${out.afterClick.stored} but dataset.theme=${out.afterClick.theme}`);
  if (out.afterReload.theme !== out.afterClick.theme) FAIL('theme', 'THEME_PERSIST', `after reload theme=${out.afterReload.theme}, expected ${out.afterClick.theme}`);
  if (out.afterClick.bg === out.initial.bg) FAIL('theme', 'THEME_CSS', 'body background color did not change with theme (CSS var not applied?)');
  if (out.afterClick.pressed !== String(out.afterClick.theme === 'light')) WARN('theme', 'THEME_ARIA', `aria-pressed=${out.afterClick.pressed} inconsistent with theme=${out.afterClick.theme}`);
  // switch back so later passes use the default theme
  await page.click('[data-theme-toggle]');
  await sleep(120);
  await page.evaluate(`(() => { try { localStorage.removeItem('theme'); } catch (e) {} })()`);
  // keyboard reachability of the toggle
  out.toggleKeyboard = await page.evaluate(`(() => { const t = document.querySelector('[data-theme-toggle]'); t.focus(); return document.activeElement === t; })()`);
  if (!out.toggleKeyboard) WARN('theme', 'THEME_FOCUS', 'theme toggle cannot receive keyboard focus');
  return out;
}

async function testMobileNav(page) {
  const out = {};
  await page.setViewport(390, 844);
  await page.goto(BASE + '/?noanim=1', { settle: 450 });
  out.before = await page.evaluate(`(() => {
    const t = document.querySelector('[data-nav-toggle]');
    const nav = document.getElementById('site-nav');
    const cs = t ? getComputedStyle(t) : null;
    return {
      toggleExists: !!t,
      toggleVisible: !!t && t.offsetParent !== null && cs.display !== 'none' && getComputedStyle(t).visibility !== 'hidden',
      navExists: !!nav,
      navOpen: nav ? nav.classList.contains('is-open') : null,
      expanded: t ? t.getAttribute('aria-expanded') : null,
      navRect: nav ? { h: Math.round(nav.getBoundingClientRect().height), top: Math.round(nav.getBoundingClientRect().top) } : null,
    };
  })()`);
  if (!out.before.toggleExists || !out.before.toggleVisible) FAIL('nav', 'NAV_TOGGLE', 'mobile nav toggle is missing or not visible at 390px');
  if (!out.before.navExists) FAIL('nav', 'NAV_MISSING', '#site-nav not found');
  if (out.before.toggleExists && out.before.navExists) {
    await page.click('[data-nav-toggle]');
    await sleep(260);
    out.opened = await page.evaluate(`(() => {
      const t = document.querySelector('[data-nav-toggle]');
      const nav = document.getElementById('site-nav');
      const links = [...nav.querySelectorAll('a')].filter((a) => a.getBoundingClientRect().height > 0);
      return {
        navOpen: nav.classList.contains('is-open'),
        expanded: t.getAttribute('aria-expanded'),
        label: t.getAttribute('aria-label'),
        bodyClass: document.body.classList.contains('nav-open'),
        visibleLinks: links.length,
        navH: Math.round(nav.getBoundingClientRect().height),
      };
    })()`);
    if (!out.opened.navOpen) FAIL('nav', 'NAV_OPEN', 'clicking [data-nav-toggle] did not open #site-nav');
    if (out.opened.expanded !== 'true') WARN('nav', 'NAV_ARIA', `aria-expanded=${out.opened.expanded} after open`);
    if (out.opened.visibleLinks < 4) FAIL('nav', 'NAV_LINKS', `only ${out.opened.visibleLinks} nav links visible after opening`);
    // close with Escape
    await page.key('Escape', 'Escape', 27);
    await sleep(200);
    out.afterEscape = await page.evaluate(`(() => ({ navOpen: document.getElementById('site-nav').classList.contains('is-open'), expanded: document.querySelector('[data-nav-toggle]').getAttribute('aria-expanded'), focusOnToggle: document.activeElement === document.querySelector('[data-nav-toggle]') }))()`);
    if (out.afterEscape.navOpen) FAIL('nav', 'NAV_ESCAPE', 'Escape did not close the mobile nav');
    // open again, close by clicking a nav link (navigation happens -> same page anchor? use 文章 link)
    await page.click('[data-nav-toggle]');
    await sleep(200);
    const beforeUrl = page && (await page.evaluate('location.pathname'));
    await page.click('#site-nav a[href="/blog/"]');
    await sleep(700);
    out.afterLink = await page.evaluate(`(() => ({ path: location.pathname, navOpen: (document.getElementById('site-nav') || {}).classList ? document.getElementById('site-nav').classList.contains('is-open') : null }))()`.replace("location.pathname", "location.pathname"));
    if (out.afterLink.path !== '/blog/') FAIL('nav', 'NAV_LINK', `nav link did not navigate (still ${out.afterLink.path}, was ${beforeUrl})`);
    if (out.afterLink.navOpen) WARN('nav', 'NAV_CLOSE_LINK', 'nav stayed open after clicking a nav link');
  }
  return out;
}

async function testProjects(page) {
  const out = {};
  await page.setViewport(1440, 900);
  page.resetRecords();
  await page.goto(BASE + '/projects/?noanim=1', { settle: 450 });
  const snap = () => page.evaluate(`(() => {
    const list = document.getElementById('project-list');
    const cards = [...list.querySelectorAll('.project-card')];
    const visible = cards.filter((c) => !c.hidden && c.getBoundingClientRect().height > 0 && c.offsetParent !== null);
    const counter = document.querySelector('[data-filter-count]');
    const empty = document.querySelector('[data-filter-empty]');
    const chips = [...document.querySelectorAll('[data-filter]')];
    return {
      total: cards.length,
      visible: visible.length,
      visibleCats: visible.map((c) => c.getAttribute('data-cat')),
      counter: counter ? counter.textContent.trim() : null,
      emptyShown: empty ? !empty.hidden : null,
      activeChips: chips.filter((c) => c.classList.contains('is-active')).map((c) => c.getAttribute('data-filter')),
      pressed: chips.filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.getAttribute('data-filter')),
      search: (document.querySelector('[data-filter-search]') || {}).value,
    };
  })()`);
  out.initial = await snap();
  if (out.initial.total !== 15) WARN('projects', 'CARD_COUNT', `expected 15 project cards, found ${out.initial.total}`);
  if (!out.initial.counter || !/显示\s*15\s*\/\s*15/.test(out.initial.counter)) WARN('projects', 'COUNTER', `initial count text is "${out.initial.counter}"`);

  // category filter
  const cat = await page.evaluate(`(() => { const c = document.querySelector('[data-filter]:not([data-filter="全部"])'); return c ? c.getAttribute('data-filter') : null; })()`);
  if (!cat) FAIL('projects', 'CHIPS', 'no category chips found');
  else {
    await page.evaluate(`document.querySelector('[data-filter="${cat}"]').click()`);
    await sleep(220);
    out.category = await snap();
    const expected = out.initial.visibleCats.filter((c) => c === cat).length;
    out.category.expectedForCat = expected;
    if (!(out.category.visible > 0 && out.category.visible < out.initial.total)) FAIL('projects', 'FILTER_CAT', `category "${cat}" filter shows ${out.category.visible}/${out.initial.total} cards (expected between 1 and 14)`);
    if (out.category.visible !== expected) FAIL('projects', 'FILTER_CAT_COUNT', `category "${cat}" shows ${out.category.visible} cards but data-cat count is ${expected}`);
    if (!new RegExp('显示\\s*' + out.category.visible + '\\s*/\\s*15').test(out.category.counter || '')) FAIL('projects', 'COUNTER_SYNC', `counter "${out.category.counter}" does not match visible=${out.category.visible}`);
    if (!(out.category.pressed.includes(cat))) WARN('projects', 'CHIP_ARIA', `chip "${cat}" not marked aria-pressed after click`);
  }
  // back to all
  await page.evaluate(`document.querySelector('[data-filter="全部"]').click()`);
  await sleep(200);
  out.backToAll = await snap();
  if (out.backToAll.visible !== out.initial.total) FAIL('projects', 'FILTER_RESET', `"全部" chip shows ${out.backToAll.visible}/${out.initial.total}`);

  // search
  await page.typeInto('[data-filter-search]', 'Shader');
  await sleep(300);
  out.search = await snap();
  if (!(out.search.visible > 0 && out.search.visible < out.initial.total)) FAIL('projects', 'SEARCH', `search "Shader" shows ${out.search.visible}/${out.initial.total} cards`);
  if (!new RegExp('显示\\s*' + out.search.visible + '\\s*/\\s*15').test(out.search.counter || '')) FAIL('projects', 'COUNTER_SEARCH', `counter "${out.search.counter}" does not match visible=${out.search.visible}`);
  const searchMatches = await page.evaluate(`(() => {
    const q = 'shader';
    return [...document.querySelectorAll('#project-list .project-card')].filter((c) => !c.hidden && (c.getAttribute('data-text') || '').toLowerCase().includes(q)).length;
  })()`);
  if (out.search.visible !== searchMatches) WARN('projects', 'SEARCH_PURITY', `search shows ${out.search.visible} cards, ${searchMatches} actually match data-text`);

  // empty state
  await page.typeInto('[data-filter-search]', 'zzz-no-such-project');
  await sleep(300);
  out.empty = await snap();
  if (out.empty.visible !== 0) FAIL('projects', 'EMPTY_STATE', `nonsense query still shows ${out.empty.visible} cards`);
  if (!out.empty.emptyShown) FAIL('projects', 'EMPTY_STATE', 'empty-state hint did not appear for no results');
  // clear
  await page.typeInto('[data-filter-search]', '');
  await sleep(300);
  out.cleared = await snap();
  if (out.cleared.visible !== out.initial.total) WARN('projects', 'CLEAR_SEARCH', `clearing search shows ${out.cleared.visible}/${out.initial.total}`);
  const { errors } = summarizeRecords(page.records);
  if (errors.length) FAIL('projects', 'CONSOLE', errors.join(' | '));
  return out;
}

async function testBlog(page) {
  const out = {};
  await page.setViewport(1440, 900);
  page.resetRecords();
  await page.goto(BASE + '/blog/?noanim=1', { settle: 450 });
  const snap = () => page.evaluate(`(() => {
    const items = [...document.querySelectorAll('#post-list .post-item')];
    const visible = items.filter((i) => !i.hidden && i.offsetParent !== null);
    const years = [...document.querySelectorAll('.archive-year')];
    return {
      total: items.length,
      visible: visible.length,
      visibleCats: visible.map((i) => i.getAttribute('data-cat')),
      visibleTags: visible.map((i) => i.getAttribute('data-tags')),
      counter: (document.querySelector('[data-filter-count]') || {}).textContent || null,
      search: (document.querySelector('[data-filter-search]') || {}).value,
      emptyShown: (() => { const e = document.querySelector('[data-filter-empty]'); return e ? !e.hidden : null; })(),
      yearsShown: years.filter((y) => !y.hidden).length,
      yearsTotal: years.length,
      activeChip: (() => { const c = document.querySelector('.chip.is-active'); return c ? c.getAttribute('data-filter') : null; })(),
    };
  })()`);
  out.initial = await snap();
  if (out.initial.total !== 5) WARN('blog', 'POST_COUNT', `expected 5 post items, found ${out.initial.total}`);

  // hot tag jump
  const tag = await page.evaluate(`(() => { const b = document.querySelector('[data-filter-jump]'); return b ? b.getAttribute('data-filter-jump') : null; })()`);
  if (!tag) FAIL('blog', 'TAG_BUTTONS', 'no hot-tag buttons found');
  else {
    await page.evaluate(`document.querySelector('[data-filter-jump]').click()`);
    await sleep(260);
    out.tagJump = await snap();
    if (out.tagJump.search !== tag) FAIL('blog', 'TAG_JUMP_INPUT', `tag jump "${tag}" did not fill search box (value="${out.tagJump.search}")`);
    const expected = out.initial.visibleTags.filter((t) => (t || '').toLowerCase().split(',').map((s) => s.trim()).includes(tag.toLowerCase())).length;
    out.tagJump.expectedForTag = expected;
    if (out.tagJump.visible !== expected) FAIL('blog', 'TAG_JUMP_COUNT', `tag "${tag}" shows ${out.tagJump.visible} posts, data-tags says ${expected}`);
    if (out.tagJump.visible >= out.initial.total && expected < out.initial.total) FAIL('blog', 'TAG_JUMP_FILTER', `tag "${tag}" did not reduce the list`);
  }

  // category chip
  await page.evaluate(`document.querySelector('[data-filter-search]').value = ''; document.querySelector('[data-filter-search]').dispatchEvent(new Event('input', { bubbles: true }));`);
  await sleep(200);
  const cat = await page.evaluate(`(() => { const c = [...document.querySelectorAll('.chip[data-filter]')].find((c) => !['全部','__tags:'].includes(c.getAttribute('data-filter'))); return c ? c.getAttribute('data-filter') : null; })()`);
  if (!cat) FAIL('blog', 'CAT_CHIPS', 'no category chips found');
  else {
    await page.evaluate(`[...document.querySelectorAll('.chip[data-filter]')].find((c) => c.getAttribute('data-filter') === ${JSON.stringify(cat)}).click()`);
    await sleep(240);
    out.category = await snap();
    const expected = out.initial.visibleCats.filter((c) => c === cat).length;
    if (out.category.visible !== expected) FAIL('blog', 'CAT_COUNT', `category "${cat}" shows ${out.category.visible} posts, expected ${expected}`);
    if (!new RegExp('显示\\s*' + out.category.visible + '\\s*/\\s*5').test(out.category.counter || '')) FAIL('blog', 'COUNTER_SYNC', `counter "${out.category.counter}" does not match visible=${out.category.visible}`);
    if (out.category.yearsShown > out.category.visible) WARN('blog', 'YEAR_COLLAPSE', `year blocks not collapsed: ${out.category.yearsShown} shown for ${out.category.visible} posts`);
  }

  // "按标签…" toggle chip — documented hook [data-filter-tags-toggle]
  const tagsToggle = await page.evaluate(`(() => { const b = document.querySelector('[data-filter-tags-toggle]'); if (!b) return null; b.click(); return { filter: b.getAttribute('data-filter'), active: b.classList.contains('is-active') }; })()`);
  if (tagsToggle) {
    await sleep(240);
    out.tagsToggle = { ...tagsToggle, state: await snap() };
    if (out.tagsToggle.state.visible === 0) {
      FAIL('blog', 'TAGS_TOGGLE', `clicking the "按标签…" category chip (data-filter="${tagsToggle.filter}") filters out all posts (0 visible) — it should open a tag list, not apply a fake category`);
    }
  }
  // reset + text search
  await page.evaluate(`document.querySelector('[data-filter="全部"]').click()`);
  await page.typeInto('[data-filter-search]', 'Lua');
  await sleep(320);
  out.search = await snap();
  if (!(out.search.visible > 0 && out.search.visible <= out.initial.total)) WARN('blog', 'SEARCH', `search "Lua" shows ${out.search.visible}/${out.initial.total}`);
  const { errors } = summarizeRecords(page.records);
  if (errors.length) FAIL('blog', 'CONSOLE', errors.join(' | '));
  return out;
}

async function testPostInteractions(page, slug) {
  const out = {};
  await page.setViewport(1440, 900);
  page.resetRecords();
  await page.goto(BASE + `/blog/${slug}/?noanim=1`, { settle: 700 });
  out.initial = await page.evaluate(`(() => {
    const toc = [...document.querySelectorAll('.toc-nav a')];
    return {
      tocCount: toc.length,
      tocHrefs: toc.map((a) => a.getAttribute('href')),
      tocMissing: toc.filter((a) => { const h = a.getAttribute('href') || ''; return !h.startsWith('#') || !document.getElementById(h.slice(1)); }).length,
      codeBlocks: document.querySelectorAll('.code-block').length,
      copyButtons: document.querySelectorAll('.code-copy').length,
      langLabels: document.querySelectorAll('.code-lang').length,
      katex: document.querySelectorAll('.katex').length,
      imgCount: document.querySelectorAll('.post-body img').length,
    };
  })()`);
  if (out.initial.tocCount && out.initial.tocMissing) FAIL('post-toc', 'TOC_MISSING', `${slug}: ${out.initial.tocMissing}/${out.initial.tocCount} TOC targets missing`);
  if (out.initial.codeBlocks && out.initial.copyButtons < out.initial.codeBlocks) FAIL('post-code', 'COPY_BUTTON', `${slug}: ${out.initial.copyButtons} copy buttons for ${out.initial.codeBlocks} code blocks`);

  // TOC click -> hash + scroll
  if (out.initial.tocCount > 1) {
    const pick = await page.evaluate(`(() => {
      const links = [...document.querySelectorAll('.toc-nav a')];
      const a = links[Math.min(2, links.length - 1)];
      return { href: a.getAttribute('href'), text: (a.textContent || '').trim(), before: document.getElementById(a.getAttribute('href').slice(1)).getBoundingClientRect().top };
    })()`);
    await page.evaluate(`[...document.querySelectorAll('.toc-nav a')].find((a) => a.getAttribute('href') === ${JSON.stringify(pick.href)}).click()`);
    await sleep(1100);
    out.tocClick = await page.evaluate(`(() => ({
      hash: location.hash,
      scrollY: Math.round(window.scrollY),
      targetTop: Math.round(document.getElementById(location.hash.slice(1)).getBoundingClientRect().top),
      current: (document.querySelector('.toc-nav a.is-current') || {}).getAttribute ? document.querySelector('.toc-nav a.is-current').getAttribute('href') : null,
      ariaCurrent: (document.querySelector('.toc-nav a[aria-current]') || {}).getAttribute ? document.querySelector('.toc-nav a[aria-current]').getAttribute('href') : null,
    }))()`);
    out.tocClick.expected = pick.href;
    if (out.tocClick.hash !== pick.href) FAIL('post-toc', 'TOC_CLICK_HASH', `${slug}: clicking ${pick.href} left location.hash=${out.tocClick.hash || '(empty)'}`);
    if (out.tocClick.scrollY < 40) WARN('post-toc', 'TOC_SCROLL', `${slug}: page did not scroll after TOC click (scrollY=${out.tocClick.scrollY})`);
    if (out.tocClick.targetTop < -10 || out.tocClick.targetTop > 220) WARN('post-toc', 'TOC_OFFSET', `${slug}: clicked heading sits ${out.tocClick.targetTop}px from viewport top (header overlap or wrong offset)`);
    if (!out.tocClick.current && !out.tocClick.ariaCurrent) WARN('post-toc', 'TOC_SPY', `${slug}: no is-current/aria-current TOC highlight after click`);
    else if (out.tocClick.current !== pick.href && out.tocClick.ariaCurrent !== pick.href) {
      WARN('post-toc', 'TOC_SPY_LAG', `${slug}: clicked ${pick.href} but the scrollspy highlights ${out.tocClick.current || out.tocClick.ariaCurrent} (threshold mismatch)`);
    }
  }

  // code copy button click
  if (out.initial.copyButtons) {
    await page.evaluate(`window.scrollTo(0, 0)`);
    await sleep(100);
    await page.evaluate(`document.querySelector('.code-copy').click()`);
    await sleep(350);
    out.copy = await page.evaluate(`(() => {
      const b = document.querySelector('.code-copy');
      return { text: b.textContent.trim(), hasDone: b.classList.contains('is-done') };
    })()`);
    if (!/已复制|复制/.test(out.copy.text)) WARN('post-code', 'COPY_FEEDBACK', `${slug}: copy button text after click = "${out.copy.text}"`);
    const { errors } = summarizeRecords(page.records);
    out.copyErrors = errors;
    if (errors.length) FAIL('post-code', 'COPY_ERROR', `${slug}: clicking copy raised: ${errors.join(' | ')}`);
  }

  // lightbox
  if (out.initial.imgCount) {
    await page.evaluate(`(() => { const img = document.querySelector('.post-body img'); img.scrollIntoView({ block: 'center' }); img.click(); })()`);
    await sleep(300);
    out.lightbox = await page.evaluate(`(() => { const o = document.querySelector('.lightbox'); return o ? { open: o.classList.contains('is-open'), imgSrc: (o.querySelector('img') || {}).getAttribute ? (o.querySelector('img').getAttribute('src') || '').slice(-50) : null, bodyNoScroll: document.body.classList.contains('no-scroll') } : null; })()`);
    if (!out.lightbox || !out.lightbox.open) WARN('post-img', 'LIGHTBOX', `${slug}: clicking a post image did not open the lightbox`);
    await page.key('Escape', 'Escape', 27);
    await sleep(200);
    out.lightboxClosed = await page.evaluate(`(() => { const o = document.querySelector('.lightbox'); return o ? !o.classList.contains('is-open') : true; })()`);
    if (out.lightbox && out.lightbox.open && !out.lightboxClosed) WARN('post-img', 'LIGHTBOX_ESC', `${slug}: Escape did not close the lightbox`);
  }
  const { errors } = summarizeRecords(page.records);
  if (errors.length) FAIL('post', 'CONSOLE', `${slug}: ${errors.join(' | ')}`);
  return out;
}

async function testGamesIndex(page) {
  const out = {};
  await page.setViewport(1440, 900);
  await page.goto(BASE + '/games/?noanim=1', { settle: 450 });
  out.initial = await page.evaluate(`(() => {
    const soon = document.querySelector('.game-card.is-soon');
    const soonLink = soon ? soon.querySelector('.game-card-link') : null;
    return {
      cards: document.querySelectorAll('.game-card').length,
      playable: document.querySelectorAll('.game-card:not(.is-soon)').length,
      playableLinks: document.querySelectorAll('a.game-card-link[href^="/games/"]').length,
      soon: document.querySelectorAll('.game-card.is-soon').length,
      soonTag: soonLink ? soonLink.tagName : null,
      soonHref: soonLink ? soonLink.getAttribute('href') : null,
      soonFocusable: soonLink ? soonLink.getAttribute('tabindex') : null,
      soonLinks: soon ? soon.querySelectorAll('a').length : null,
    };
  })()`);
  if (out.initial.playable !== 3) FAIL('games', 'PLAYABLE_COUNT', `expected 3 playable game cards, found ${out.initial.playable}`);
  if (out.initial.playableLinks !== 3) WARN('games', 'PLAYABLE_LINKS', `expected 3 playable cards to link to a game page, found ${out.initial.playableLinks} anchors`);
  if (out.initial.soon && out.initial.soonHref !== null) {
    WARN('games', 'SOON_LINK', `"coming soon" card is still a link (href="${out.initial.soonHref}")`);
  }
  // clicking the "coming soon" card must not jump the page / navigate
  if (out.initial.soon && out.initial.soonLinks === 0) {
    const jump = await page.evaluate(`(() => {
      const pageH = document.documentElement.scrollHeight;
      window.scrollTo(0, Math.max(0, pageH - window.innerHeight - 40));
      const before = window.scrollY;
      const el = document.querySelector('.game-card.is-soon .game-card-link');
      el.click();
      return { pageH, viewport: window.innerHeight, before, after: window.scrollY, url: location.href };
    })()`);
    out.soonClick = jump;
    if (jump.before > 0 && jump.after === 0 && jump.before !== 0) {
      WARN('games', 'SOON_CARD_JUMP', `clicking the "coming soon" card jumps the page to the top (scroll ${jump.before} -> 0)`);
    }
  }
  return out;
}

const KEYMAP = {
  ArrowLeft: [37, 'ArrowLeft'],
  ArrowUp: [38, 'ArrowUp'],
  ArrowRight: [39, 'ArrowRight'],
  ArrowDown: [40, 'ArrowDown'],
  Space: [32, 'Space'],
  KeyR: [82, 'r'],
  KeyP: [80, 'p'],
  KeyU: [85, 'u'],
};

async function testSnake(page) {
  const out = {};
  await page.setViewport(1280, 800);
  page.resetRecords();
  await page.goto(BASE + '/games/snake/', { settle: 300 });
  out.boot = await page.evaluate(`(() => ({
    score: (document.querySelector('[data-score]') || {}).textContent,
    overlayOpen: document.querySelector('[data-overlay]').classList.contains('is-open'),
    overlayTitle: (document.querySelector('[data-overlay-title]') || {}).textContent,
    canvas: (() => { const c = document.querySelector('[data-canvas]'); return c ? { w: c.width, h: c.height, data: c.toDataURL().length } : null; })(),
    buttons: [...document.querySelectorAll('[data-action]')].map((b) => b.getAttribute('data-action')),
  }))()`);
  if (!out.boot.canvas || out.boot.canvas.w === 0) FAIL('game-snake', 'CANVAS', 'snake canvas has zero size');
  // wait past the ready countdown (3s)
  await sleep(3600);
  out.afterCountdown = await page.evaluate(`(() => ({
    score: document.querySelector('[data-score]').textContent,
    overlayOpen: document.querySelector('[data-overlay]').classList.contains('is-open'),
    pauseLabel: document.querySelector('[data-action="pause"]').textContent.trim(),
    pausedDisabled: document.querySelector('[data-action="pause"]').disabled,
  }))()`);
  if (out.afterCountdown.overlayOpen) WARN('game-snake', 'AUTOSTART', 'snake overlay still open after countdown (game not auto-started)');
  // keyboard: pause via Space
  await page.key(' ', 'Space', 32, { text: ' ' });
  await sleep(300);
  out.afterSpace = await page.evaluate(`(() => ({
    overlayOpen: document.querySelector('[data-overlay]').classList.contains('is-open'),
    overlayTitle: document.querySelector('[data-overlay-title]').textContent.trim(),
    pauseLabel: document.querySelector('[data-action="pause"]').textContent.trim(),
  }))()`);
  if (!out.afterSpace.overlayOpen) FAIL('game-snake', 'PAUSE_KEY', 'Space did not pause the snake game');
  // resume
  await page.key(' ', 'Space', 32, { text: ' ' });
  await sleep(250);
  out.afterResume = await page.evaluate(`(() => ({
    overlayOpen: document.querySelector('[data-overlay]').classList.contains('is-open'),
    pauseLabel: document.querySelector('[data-action="pause"]').textContent.trim(),
  }))()`);
  if (out.afterResume.overlayOpen) FAIL('game-snake', 'RESUME_KEY', 'Space did not resume the snake game');
  // turn with arrow keys (trusted input)
  await page.key('ArrowDown', 'ArrowDown', 40);
  await page.key('ArrowRight', 'ArrowRight', 39);
  await sleep(900);
  out.afterArrows = await page.evaluate(`(() => ({ score: document.querySelector('[data-score]').textContent, length: document.querySelector('[data-length]').textContent, canvas: document.querySelector('[data-canvas]').toDataURL().length }))()`);
  // R restarts -> overlay with countdown
  await page.key('r', 'KeyR', 82);
  await sleep(300);
  out.afterRestart = await page.evaluate(`(() => ({ overlayOpen: document.querySelector('[data-overlay]').classList.contains('is-open'), overlayTitle: document.querySelector('[data-overlay-title]').textContent.trim(), kicker: document.querySelector('[data-overlay-kicker]').textContent.trim() }))()`);
  if (!out.afterRestart.overlayOpen) FAIL('game-snake', 'RESTART_KEY', 'R did not restart the snake game (no overlay)');
  // start via overlay button
  await page.evaluate(`document.querySelector('[data-overlay-primary]').click()`);
  await sleep(500);
  out.afterStartButton = await page.evaluate(`document.querySelector('[data-overlay]').classList.contains('is-open')`);
  if (out.afterStartButton) FAIL('game-snake', 'START_BUTTON', 'overlay primary button did not start the game');
  const { errors } = summarizeRecords(page.records);
  if (errors.length) FAIL('game-snake', 'CONSOLE', errors.join(' | '));
  return out;
}

async function test2048(page) {
  const out = {};
  await page.setViewport(1280, 800);
  page.resetRecords();
  await page.goto(BASE + '/games/2048/?noanim=1', { settle: 400 });
  out.boot = await page.evaluate(`(() => ({
    score: document.querySelector('[data-score]').textContent,
    moves: document.querySelector('[data-moves]').textContent,
    tiles: document.querySelectorAll('.tile').length,
    undoDisabled: document.querySelector('[data-action="undo"]').disabled,
    size: (() => { const b = document.querySelector('[data-board]'); const r = b ? b.getBoundingClientRect() : null; return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null; })(),
  }))()`);
  if (out.boot.tiles < 2) FAIL('game-2048', 'TILES', `only ${out.boot.tiles} tiles rendered at boot`);
  // play a bunch of moves
  const seq = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowUp'];
  for (let i = 0; i < 4; i++) for (const k of seq) await page.key(k, k, KEYMAP[k][0]);
  await sleep(400);
  out.afterMoves = await page.evaluate(`(() => ({
    score: document.querySelector('[data-score]').textContent,
    moves: document.querySelector('[data-moves]').textContent,
    max: document.querySelector('[data-max]').textContent,
    best: document.querySelector('[data-best]').textContent,
    undoDisabled: document.querySelector('[data-action="undo"]').disabled,
    tiles: document.querySelectorAll('.tile').length,
    overlayOpen: document.querySelector('[data-overlay]').classList.contains('is-open'),
  }))()`);
  if (Number(out.afterMoves.moves) < 5) FAIL('game-2048', 'MOVE_KEY', `arrow keys did not register moves (moves=${out.afterMoves.moves})`);
  if (out.afterMoves.undoDisabled) FAIL('game-2048', 'UNDO_STATE', 'undo button still disabled after moves');
  // undo
  if (!out.afterMoves.undoDisabled) {
    const before = Number(out.afterMoves.moves);
    await page.evaluate(`document.querySelector('[data-action="undo"]').click()`);
    await sleep(250);
    out.afterUndo = await page.evaluate(`(() => ({ moves: document.querySelector('[data-moves]').textContent, score: document.querySelector('[data-score]').textContent }))()`);
    if (Number(out.afterUndo.moves) !== before - 1) WARN('game-2048', 'UNDO', `undo did not decrement moves (${before} -> ${out.afterUndo.moves})`);
  }
  // restart via R
  await page.key('r', 'KeyR', 82);
  await sleep(300);
  out.afterRestart = await page.evaluate(`(() => ({ moves: document.querySelector('[data-moves]').textContent, score: document.querySelector('[data-score]').textContent, overlayOpen: document.querySelector('[data-overlay]').classList.contains('is-open') }))()`);
  if (out.afterRestart.moves !== '0') FAIL('game-2048', 'RESTART', `R did not reset moves (moves=${out.afterRestart.moves})`);
  const { errors } = summarizeRecords(page.records);
  if (errors.length) FAIL('game-2048', 'CONSOLE', errors.join(' | '));
  return out;
}

async function testBreakout(page) {
  const out = {};
  await page.setViewport(1280, 800);
  page.resetRecords();
  await page.goto(BASE + '/games/breakout/?noanim=1', { settle: 400 });
  out.boot = await page.evaluate(`(() => ({
    score: document.querySelector('[data-score]').textContent,
    lives: document.querySelector('[data-lives]').textContent,
    level: document.querySelector('[data-level]').textContent,
    overlayOpen: document.querySelector('[data-overlay]').classList.contains('is-open'),
    canvas: (() => { const c = document.querySelector('[data-canvas]'); return c ? { w: c.width, h: c.height, data: c.toDataURL().length } : null; })(),
  }))()`);
  if (!out.boot.canvas || out.boot.canvas.w === 0) FAIL('game-breakout', 'CANVAS', 'breakout canvas has zero size');
  if (!out.boot.overlayOpen) WARN('game-breakout', 'READY', 'breakout did not show the ready overlay');
  /** read game status through the pause button label + overlay */
  const state = () =>
    page.evaluate(`(() => ({
      overlayOpen: document.querySelector('[data-overlay]').classList.contains('is-open'),
      overlayTitle: (document.querySelector('[data-overlay-title]') || {}).textContent,
      pauseLabel: document.querySelector('[data-action="pause"]').textContent.trim(),
      pauseDisabled: document.querySelector('[data-action="pause"]').disabled,
      score: document.querySelector('[data-score]').textContent,
      lives: document.querySelector('[data-lives]').textContent,
      level: document.querySelector('[data-level]').textContent,
    }))()`);

  await page.evaluate(`document.querySelector('[data-overlay-primary]').click()`);
  await sleep(300);
  // Space is "launch when ready / pause when running": press it until the game runs.
  let running = false;
  for (let i = 0; i < 4 && !running; i++) {
    const s = await state();
    if (s.pauseLabel === '暂停' && !s.overlayOpen) running = true;
    else {
      await page.key(' ', 'Space', 32, { text: ' ' });
      await sleep(250);
    }
  }
  out.running = await state();
  if (!running) FAIL('game-breakout', 'START', `could not get breakout into the running state (state=${JSON.stringify(out.running)})`);

  // pause via the pause button (deterministic), not via Space's launch/pause overload
  await page.evaluate(`document.querySelector('[data-action="pause"]').click()`);
  await sleep(300);
  out.afterPauseButton = await state();
  if (!/暂停|已暂停/.test(out.afterPauseButton.overlayTitle + out.afterPauseButton.pauseLabel) || !out.afterPauseButton.overlayOpen) {
    FAIL('game-breakout', 'PAUSE_BUTTON', `pause button did not pause (${JSON.stringify(out.afterPauseButton)})`);
  }
  await page.evaluate(`document.querySelector('[data-action="pause"]').click()`);
  await sleep(250);
  out.afterResumeButton = await state();
  if (out.afterResumeButton.overlayOpen) WARN('game-breakout', 'RESUME_BUTTON', 'pause button did not resume the game');

  // keyboard: R restarts back to the ready overlay
  await page.key('r', 'KeyR', 82);
  await sleep(350);
  out.afterRestart = await state();
  if (!out.afterRestart.overlayOpen) WARN('game-breakout', 'RESTART', 'R did not return breakout to the ready overlay');

  // paddle keys + Space launch from ready state (must not throw)
  await page.key('ArrowLeft', 'ArrowLeft', 37);
  await page.key('ArrowRight', 'ArrowRight', 39);
  await page.key(' ', 'Space', 32, { text: ' ' });
  await sleep(400);
  out.afterLaunchKey = await state();

  const { errors } = summarizeRecords(page.records);
  if (errors.length) FAIL('game-breakout', 'CONSOLE', errors.join(' | '));
  return out;
}

/* ------------------------------------------------------------------- run */
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { child, port } = launchChrome({ port: PORT });
  let page = null;
  let targetId = null;
  try {
    await waitForDevtools(port);
    ({ page, targetId } = await newPage(port));
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

    // 1) layout + console + a11y + content for every page at every viewport
    for (const vw of VIEWPORTS) {
      for (const p of PAGES) {
        try {
          const r = await visit(page, p, vw, BASE);
          r.kind = p.kind;
          r.name = p.name;
          record(r);
          results.console.push({ page: p.name, vw, errors: r.errors, warnings: r.warnings });
          results.perf.push({ page: p.name, vw, ...r.perf });
        } catch (e) {
          FAIL(p.name + ' @' + vw, 'VISIT_ERROR', 'page visit failed: ' + e.message);
        }
      }
    }

    // 2) interactions (desktop unless noted)
    results.interactions.theme = await testTheme(page);
    results.interactions.mobileNav = await testMobileNav(page);
    results.interactions.projects = await testProjects(page);
    results.interactions.blog = await testBlog(page);
    results.interactions.gamesIndex = await testGamesIndex(page);
    results.interactions.posts = {};
    for (const slug of slugs) {
      try {
        results.interactions.posts[slug] = await testPostInteractions(page, slug);
      } catch (e) {
        FAIL('post:' + slug, 'INTERACTION_ERROR', e.message);
      }
    }

    // 3) games
    for (const [name, fn] of [
      ['snake', testSnake],
      ['2048', test2048],
      ['breakout', testBreakout],
    ]) {
      try {
        results.games[name] = await fn(page);
      } catch (e) {
        FAIL('game-' + name, 'INTERACTION_ERROR', e.message);
      }
    }

    // 4) math expectation: posts with $...$ must render KaTeX
    const mathPosts = expectMathForPosts();
    for (const slug of mathPosts) {
      const r = results.pages.find((p) => p.name === 'post:' + slug && p.vw === 1440);
      if (r && r.content.katex === 0) FAIL('post:' + slug, 'KATEX_NOT_RENDERED', 'markdown contains math delimiters but 0 .katex nodes rendered');
    }

    // 5) reveal animation completes (safety net / IntersectionObserver)
    await page.setViewport(1440, 900);
    await page.goto(BASE + '/', { settle: 3200 });
    const reveal = await page.evaluate(`(() => ({ total: document.querySelectorAll('[data-reveal]').length, pending: document.querySelectorAll('[data-reveal]:not(.is-revealed)').length }))()`);
    results.interactions.reveal = reveal;
    if (reveal.pending > 0) WARN('home', 'REVEAL_STUCK', `${reveal.pending}/${reveal.total} [data-reveal] blocks never revealed after 3.2s`);

    // 6) keyboard: first Tab should reach the skip link, Enter should move to #main
    await page.setViewport(1440, 900);
    await page.goto(BASE + '/?noanim=1', { settle: 400 });
    await page.evaluate('document.body.focus()');
    await page.key('Tab', 'Tab', 9);
    const kb = await page.evaluate(`(() => {
      const el = document.activeElement;
      return { tag: el ? el.tagName.toLowerCase() : null, cls: el ? el.className : null, text: el ? (el.textContent || '').trim().slice(0, 20) : null, href: el && el.getAttribute ? el.getAttribute('href') : null };
    })()`);
    results.interactions.skipLink = kb;
    if (!kb.href || kb.href !== '#main') WARN('home', 'SKIP_LINK_TAB', `first Tab focused <${kb.tag} class="${kb.cls}">, expected the skip link (#main)`);

    // 7) transient layout while reveal/entry animations run (no noanim=1)
    for (const vw of [390, 768, 1440]) {
      await page.setViewport(vw, 900);
      await page.goto(BASE + '/', { settle: 120 });
      const early = await page.evaluate(`({ w: document.documentElement.scrollWidth, iw: window.innerWidth })`);
      await sleep(2900);
      const late = await page.evaluate(`({ w: document.documentElement.scrollWidth, iw: window.innerWidth })`);
      results.interactions.animatedLayout = results.interactions.animatedLayout || {};
      results.interactions.animatedLayout[vw] = { early, late };
      if (early.w > vw + 1) FAIL(`home(animated) @${vw}`, 'H_SCROLL_ANIM', `horizontal scroll during entry animation: ${early.w} > ${vw}`);
      if (late.w > vw + 1) FAIL(`home(animated) @${vw}`, 'H_SCROLL_ANIM', `horizontal scroll after animation: ${late.w} > ${vw}`);
    }
  } catch (e) {
    FAIL('harness', 'FATAL', e.stack || e.message);
  } finally {
    try {
      if (page) page.close();
      if (targetId) await closePage(port, targetId);
    } catch (e) {}
    try {
      child.kill();
    } catch (e) {}
  }

  fs.writeFileSync(path.join(OUT, 'cdp-audit.json'), JSON.stringify({ ...results, issues }, null, 2));
  const fails = issues.filter((i) => i.level === 'fail');
  const warns = issues.filter((i) => i.level === 'warn');
  const infos = issues.filter((i) => i.level === 'info');
  console.log('\n== cdp-audit ==');
  console.log(`pages scanned: ${results.pages.length} (${PAGES.length} pages x ${VIEWPORTS.length} viewports)`);
  console.log(`FAIL ${fails.length}  WARN ${warns.length}  INFO ${infos.length}`);
  const uniq = (arr) => {
    const seen = new Set();
    return arr.filter((i) => {
      const k = i.page + '|' + i.code + '|' + i.message.slice(0, 80);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  for (const i of [...uniq(fails), ...uniq(warns)].slice(0, 120)) {
    console.log(`  ${i.level === 'fail' ? 'FAIL' : 'warn'}  [${i.page}] ${i.code}: ${i.message}`);
  }
  console.log(fails.length ? '\ncdp-audit: FAILED' : '\ncdp-audit: OK');
  process.exit(fails.length ? 1 : 0);
})();
