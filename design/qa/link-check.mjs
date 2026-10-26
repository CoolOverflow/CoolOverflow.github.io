#!/usr/bin/env node
/**
 * design/qa/link-check.mjs — internal link / asset integrity audit.
 *
 *   node design/qa/link-check.mjs
 *
 * Scans every generated HTML page (site pages + legacy redirect stubs), the CSS
 * files they load, sitemap.xml and feed.xml, then resolves every internal
 * href/src/srcset/url() against the file system.
 *
 * Fails on:
 *   - internal link/asset that has no backing file (404 risk)
 *   - same-page #anchor whose target id does not exist
 *   - http://localhost / 127.0.0.1 / file:// URLs leaking into generated output
 *   - redirect stub pointing at a missing page
 *   - og:image pointing at a missing file
 *
 * Exit code: 1 if any FAIL, else 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'design', 'qa', 'results');
const SITE_ORIGIN = 'https://cooloverflow.github.io';

const issues = [];
const fail = (page, code, message) => issues.push({ level: 'fail', page, code, message });
const warn = (page, code, message) => issues.push({ level: 'warn', page, code, message });

const rel = (p) => p.replace(ROOT + path.sep, '').replace(/\\/g, '/');
const abs = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(abs(p));

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.chrome-tmp') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(rel(full));
  }
  return acc;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/* ------------------------------------------------------- page inventory */
const allFiles = walk(ROOT);
const htmlFiles = allFiles
  .filter((f) => f.endsWith('.html'))
  .filter((f) => !f.startsWith('design/'))
  .filter((f) => f !== '_dom.html');
const legacyStubs = new Set(['blog/201911/AngularDisplacementInMath.html', 'blog/201911/LearnLuaBasic01.html', 'blog/201911/Turtle.html', 'blog/201911/index.html', 'blog/201912/index.html', 'blog/202004/index.html']);
const sitePages = htmlFiles.filter((f) => !legacyStubs.has(f));
const cssFiles = allFiles.filter((f) => f.endsWith('.css'));

/* --------------------------------------------------------- resolution */
const norm = (p) => p.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+/, '');

function decodeIfNeeded(p) {
  try {
    const d = decodeURIComponent(p);
    return d;
  } catch (e) {
    return p;
  }
}

/**
 * Resolve an internal URL into repo-relative file candidates.
 * Returns { internal, candidates, hashOnly }.
 */
function resolve(url, fromFile) {
  const raw = url.trim();
  if (!raw) return { internal: false };
  if (/^(mailto:|tel:|javascript:|data:|blob:)/i.test(raw)) return { internal: false, kind: raw.split(':')[0] };
  const hashOnly = raw.startsWith('#');
  let p = raw.split('#')[0].split('?')[0];
  if (hashOnly || p === '') return { internal: true, hashOnly: true, hash: raw.split('#')[1] || '' };

  let internal = false;
  if (p.startsWith(SITE_ORIGIN)) {
    p = p.slice(SITE_ORIGIN.length) || '/';
    internal = true;
  } else if (/^https?:\/\//i.test(p)) {
    return { internal: false };
  } else if (p.startsWith('//')) {
    return { internal: false };
  } else {
    internal = true;
  }

  const fromDir = path.posix.dirname(norm(fromFile));
  let target;
  if (internal && (p.startsWith('/') || raw.startsWith(SITE_ORIGIN))) {
    target = norm(p);
  } else if (internal) {
    // relative to the page that references it
    target = norm(path.posix.join(fromDir === '.' ? '' : fromDir, p));
  }

  // strip a possible leading "cooloverflow-site/" (repo root prefix)
  const dec = norm(decodeIfNeeded(target));
  const candidates = [];
  if (target === '' || target.endsWith('/')) {
    candidates.push(target + 'index.html');
  } else {
    candidates.push(target);
    candidates.push(target + '.html');
    candidates.push(target + '/index.html');
    if (dec !== target) {
      candidates.push(dec);
      candidates.push(dec + '.html');
      candidates.push(dec + '/index.html');
    }
  }
  return { internal: true, candidates: [...new Set(candidates)], target };
}

function checkRef(pageFile, rawUrl, kind, line) {
  const r = resolve(rawUrl, pageFile);
  if (!r.internal) {
    if (/^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(rawUrl) || /^file:\/\//i.test(rawUrl)) {
      fail(pageFile, 'LOCAL_URL', `${kind} points at a local/development URL (will 404 in production): ${rawUrl} (line ${line})`);
    }
    return 'external';
  }
  if (r.hashOnly) return 'hash';
  const found = r.candidates.some((c) => exists(c));
  if (!found) {
    fail(pageFile, 'BROKEN_LINK', `${kind} -> ${rawUrl} has no backing file (tried ${r.candidates.join(', ')}) (line ${line})`);
  }
  return 'internal';
}

/* ------------------------------------------------------- scan HTML files */
const stats = { internal: 0, external: 0, hash: 0, files: 0 };
const externalHosts = new Map();

for (const file of htmlFiles) {
  const html = fs.readFileSync(abs(file), 'utf8');
  stats.files++;

  // collect ids on this page for #anchor checks
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

  const re = /<(a|link|script|img|iframe|source|video|audio|use|image)\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const line = lineOf(html, m.index);
    const grab = (name) => {
      const mm = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
      return mm ? (mm[2] !== undefined ? mm[2] : mm[3]) : null;
    };
    for (const attr of ['href', 'src', 'poster', 'xlink:href']) {
      const val = grab(attr);
      if (val === null) continue;
      const kind = `${tag}[${attr}]`;
      const result = checkRef(file, val, kind, line);
      if (result === 'external') {
        if (/^(https?:)?\/\//i.test(val)) {
          try {
            const u = new URL(val, SITE_ORIGIN);
            externalHosts.set(u.host, (externalHosts.get(u.host) || 0) + 1);
          } catch (e) {}
          stats.external++;
        }
      } else if (result === 'internal') stats.internal++;
      else if (result === 'hash') {
        stats.hash++;
        if (val !== '#' && !ids.has(val.slice(1))) {
          fail(file, 'BROKEN_ANCHOR', `${kind} -> ${val} target id is missing on this page (line ${line})`);
        }
      }
    }
    // srcset
    const srcset = grab('srcset');
    if (srcset) {
      for (const part of srcset.split(',')) {
        const u = part.trim().split(/\s+/)[0];
        if (!u) continue;
        const result = checkRef(file, u, tag + '[srcset]', line);
        if (result === 'external') stats.external++;
        else if (result === 'internal') stats.internal++;
      }
    }
  }

  // meta og:image / twitter:image
  for (const mm of html.matchAll(/<meta\b[^>]*(?:property|name)="(og:image|twitter:image)"[^>]*content="([^"]+)"/gi)) {
    const r = checkRef(file, mm[2], 'meta[' + mm[1] + ']', lineOf(html, mm.index));
    if (r === 'internal') stats.internal++;
  }

  // redirect stub targets (meta refresh + inline location.replace)
  if (legacyStubs.has(file)) {
    const refresh = html.match(/http-equiv="refresh" content="0;\s*url=([^">]+)/i);
    if (refresh) {
      const target = refresh[1].trim();
      const candidates = target.endsWith('/') ? [norm(target) + 'index.html'] : [norm(target) + '.html', norm(target) + '/index.html'];
      if (!candidates.some((c) => exists(c))) fail(file, 'STUB_TARGET_404', `redirect stub target has no page: ${target}`);
    } else {
      fail(file, 'STUB_NO_REFRESH', 'legacy stub without meta refresh target');
    }
  }

  // absolute internal text links from sitemap/feed are checked below
}

/* -------------------------------------------------------- scan CSS files */
for (const file of cssFiles) {
  const css = fs.readFileSync(abs(file), 'utf8');
  // quoted url() first so nested url(...) inside data: URIs is never scanned
  const urlRe = /url\(\s*"([^"]*)"\s*\)|url\(\s*'([^']*)'\s*\)|url\(\s*([^)'"]+?)\s*\)/gi;
  for (const m of css.matchAll(urlRe)) {
    const val = (m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3] || '').trim();
    if (!val || /^(data:|https?:|\/\/|#)/i.test(val)) continue;
    const r = checkRef(file, val, 'css url()', lineOf(css, m.index));
    if (r === 'internal') stats.internal++;
  }
  for (const m of css.matchAll(/@import\s+(?:url\()?\s*(['"])([^'"]+)\1/gi)) {
    const r = checkRef(file, m[2], 'css @import', lineOf(css, m.index));
    if (r === 'internal') stats.internal++;
  }
}

/* ------------------------------------------------- sitemap / feed / robots */
for (const file of ['sitemap.xml', 'feed.xml']) {
  if (!exists(file)) continue;
  const text = fs.readFileSync(abs(file), 'utf8');
  for (const m of text.matchAll(/<loc>([^<]+)<\/loc>|<link>([^<]+)<\/link>/g)) {
    const url = (m[1] || m[2] || '').trim();
    if (!url || !url.startsWith(SITE_ORIGIN)) {
      if (url) fail(file, 'FEED_URL', `URL is not on the production origin: ${url}`);
      continue;
    }
    const r = checkRef('index.html', url, file + ' url', lineOf(text, m.index));
    if (r === 'internal') stats.internal++;
  }
}
if (exists('robots.txt')) {
  const robots = fs.readFileSync(abs('robots.txt'), 'utf8');
  const sm = robots.match(/Sitemap:\s*(\S+)/i);
  if (sm) {
    if (!sm[1].startsWith(SITE_ORIGIN)) fail('robots.txt', 'ROBOTS_URL', 'sitemap URL not on production origin: ' + sm[1]);
    else if (!exists('sitemap.xml')) fail('robots.txt', 'ROBOTS_URL', 'sitemap.xml does not exist');
  }
}

/* ------------------------------------- known legacy URL debt (informational) */
const legacyRedirectMap = {
  'blog/201911/AngularDisplacementInMath.html': '/blog/angular-displacement-math/',
  'blog/201911/LearnLuaBasic01.html': '/blog/learn-lua-basic-01/',
  'blog/201911/Turtle.html': '/blog/python-turtle/',
  'blog/201912/index.html': '/blog/',
  'blog/201911/index.html': '/blog/',
  'blog/202004/index.html': '/blog/',
};
// Old GitHub Pages paths that existed in git history but have no redirect stub today.
const historicalUrls = [
  'blog/201911/Bresenham画线算法.md',
  'blog/201911/Bresenham画线算法.html',
  'blog/201912/卡尔曼滤波.md',
  'blog/201912/卡尔曼滤波.html',
  'blog/201911/201911.md',
  'blog/201912/201912.md',
  'blog/202004/202004.md',
  'blog/201911/LuaTEInterface.PNG',
  'blog/201911/AngularDisplacementInMath.md',
  'blog/201911/LearnLuaBasic01.md',
  'blog/201911/Turtle.md',
];
const missingLegacy = historicalUrls.filter((u) => {
  const candidates = [u, u.replace(/\.md$/, '.html')];
  return !candidates.some((c) => Object.keys(legacyRedirectMap).includes(c)) && !exists(u);
});
if (missingLegacy.length) {
  warn('(legacy URLs)', 'LEGACY_404', `${missingLegacy.length} historical URL(s) from git history have no page/redirect and will 404 (inbound-link risk): ${missingLegacy.join(', ')}`);
}

/* ------------------------------------------------------------- report */
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(
  path.join(OUT, 'link-check.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), ...stats, externalHosts: [...externalHosts.entries()].sort((a, b) => b[1] - a[1]), issues }, null, 2)
);

const fails = issues.filter((i) => i.level === 'fail');
const warns = issues.filter((i) => i.level === 'warn');
console.log(`\n== link-check ==  html=${stats.files} internal=${stats.internal} external=${stats.external} anchors=${stats.hash}`);
console.log(`external hosts: ${[...externalHosts.entries()].sort((a, b) => b[1] - a[1]).map(([h, n]) => h + '(' + n + ')').join(', ') || 'none'}`);
console.log(`FAIL ${fails.length}   WARN ${warns.length}`);
for (const i of [...fails, ...warns]) console.log(`  ${i.level === 'fail' ? 'FAIL' : 'warn'}  [${i.page}] ${i.code}: ${i.message}`);
console.log(fails.length ? '\nlink-check: FAILED' : '\nlink-check: OK');
process.exit(fails.length ? 1 : 0);
