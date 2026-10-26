#!/usr/bin/env node
/**
 * design/qa/build-check.mjs — build + static content audit for cooloverflow-site.
 *
 *   node design/qa/build-check.mjs            # rebuild, then check
 *   node design/qa/build-check.mjs --no-build # check current output only
 *
 * Checks (P0/P1/P2):
 *   - build.mjs exits 0 and reports the expected counts
 *   - every generated page exists (index/blog/projects/games/404/5 posts/3 games/legacy stubs)
 *   - data/*.json parses and has the expected shape/counts
 *   - sitemap.xml + feed.xml are well-formed XML with the right item counts
 *   - generated HTML: charset/lang/title/meta/canonical/h1/ids/alt/placeholders/encoding
 *   - content/posts front matter matches rendered title/date/category/tags
 *   - no unreplaced placeholders, empty href, `undefined`, NaN, U+FFFD
 *
 * Exit code: 0 when no FAIL issues, 1 otherwise.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'design', 'qa', 'results');
const args = process.argv.slice(2);
const NO_BUILD = args.includes('--no-build');

const issues = [];
const add = (level, page, code, message, detail) => issues.push({ level, page, code, message, detail });
const fail = (...a) => add('fail', ...a);
const warn = (...a) => add('warn', ...a);

const rel = (p) => p.replace(ROOT + path.sep, '').replace(/\\/g, '/');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* ------------------------------------------------------------------ build */
let buildOut = '';
if (!NO_BUILD) {
  const r = spawnSync(process.execPath, ['tools/build.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  buildOut = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) {
    fail('build', 'BUILD_EXIT', `node tools/build.mjs exited ${r.status}`, buildOut.slice(-2000));
  } else {
    for (const [needle, label] of [
      ['posts:    5', '5 posts'],
      ['repos:    15', '15 repos'],
      ['games:    3 playable', '3 playable games'],
    ]) {
      if (!buildOut.includes(needle)) warn('build', 'BUILD_COUNT', `build log missing "${label}"`, buildOut.slice(-800));
    }
    if (/\berror\b/i.test(buildOut.replace(/no error/gi, ''))) warn('build', 'BUILD_WARN', 'build output mentions "error"', buildOut.slice(-800));
  }
} else if (!exists('index.html')) {
  fail('build', 'NO_OUTPUT', 'index.html missing and --no-build was passed');
}

/* ------------------------------------------------------------ data assets */
function readJson(p) {
  try {
    return JSON.parse(read(p).replace(/^\uFEFF/, ''));
  } catch (e) {
    fail(p, 'JSON_PARSE', `invalid JSON: ${e.message}`);
    return null;
  }
}

const site = readJson('data/site.json');
if (site) {
  for (const k of ['name', 'siteUrl', 'title', 'description', 'email']) {
    if (!site[k]) fail('data/site.json', 'SITE_FIELD', `missing site.${k}`);
  }
  if (site.siteUrl && !/^https:\/\//.test(site.siteUrl)) fail('data/site.json', 'SITE_URL', 'siteUrl is not https');
}

const repos = readJson('data/repos.json');
if (repos) {
  if (!Array.isArray(repos)) fail('data/repos.json', 'REPOS_TYPE', 'not an array');
  else {
    if (repos.length !== 15) warn('data/repos.json', 'REPOS_COUNT', `expected 15 repos, got ${repos.length}`);
    const featured = repos.filter((r) => r.featured);
    if (featured.length > 6) fail('data/repos.json', 'REPOS_FEATURED', `${featured.length} featured repos (>6)`);
    if (featured.some((r) => r.fork)) fail('data/repos.json', 'REPOS_FEATURED_FORK', 'featured list contains fork repos');
    const ids = new Set();
    for (const r of repos) {
      for (const k of ['id', 'name', 'url', 'description', 'category', 'tags']) {
        if (r[k] === undefined || r[k] === null || r[k] === '') fail('data/repos.json', 'REPO_FIELD', `repo ${r.id || '?'} missing ${k}`);
      }
      if (ids.has(r.id)) fail('data/repos.json', 'REPO_DUP', 'duplicate repo id ' + r.id);
      ids.add(r.id);
      if (r.url && !/^https:\/\/github\.com\//.test(r.url)) fail('data/repos.json', 'REPO_URL', `${r.id}: url is not github.com`);
      if (!Array.isArray(r.tags)) fail('data/repos.json', 'REPO_TAGS', `${r.id}: tags is not an array`);
      if (typeof r.stars !== 'number' || Number.isNaN(r.stars)) fail('data/repos.json', 'REPO_STARS', `${r.id}: stars is not a number`);
    }
  }
}

const games = readJson('data/games.json');
if (games) {
  if (!Array.isArray(games)) fail('data/games.json', 'GAMES_TYPE', 'not an array');
  else {
    const playable = games.filter((g) => g.status === 'playable');
    const soon = games.filter((g) => g.status === 'soon');
    if (playable.length !== 3) warn('data/games.json', 'GAMES_PLAYABLE', `expected 3 playable, got ${playable.length}`);
    if (soon.length < 1) warn('data/games.json', 'GAMES_SOON', 'expected at least one soon slot');
    for (const g of games) {
      if (!g.id || !g.title || !g.status) fail('data/games.json', 'GAME_FIELD', `game ${g.id || '?'} missing id/title/status`);
      if (g.status === 'playable') {
        if (!g.path) fail('data/games.json', 'GAME_PATH', `${g.id}: missing path`);
        if (g.path && !exists(g.path.replace(/^\//, '') + 'index.html')) fail('data/games.json', 'GAME_PAGE', `${g.id}: ${g.path} has no index.html`);
        if (g.accent && !/^#[0-9a-fA-F]{3,8}$/.test(g.accent)) warn('data/games.json', 'GAME_ACCENT', `${g.id}: accent "${g.accent}" is not a hex color`);
      }
    }
  }
}

/* ---------------------------------------------------------- content/posts */
const POSTS = [];
const postsDir = path.join(ROOT, 'content', 'posts');
if (fs.existsSync(postsDir)) {
  for (const f of fs.readdirSync(postsDir).filter((f) => f.endsWith('.md'))) {
    const raw = fs.readFileSync(path.join(postsDir, f), 'utf8').replace(/^\uFEFF/, '');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const fm = {};
    if (!m) {
      fail('content/posts/' + f, 'FM_MISSING', 'no YAML front matter');
      continue;
    }
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (!kv) continue;
      let v = kv[2].trim();
      if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      else v = v.replace(/^["']|["']$/g, '');
      fm[kv[1]] = v;
    }
    POSTS.push({ file: f, slug: f.replace(/\.md$/, ''), fm, body: raw.slice(m[0].length) });
  }
}
if (POSTS.length !== 5) warn('content/posts', 'POSTS_COUNT', `expected 5 posts, got ${POSTS.length}`);
for (const p of POSTS) {
  const { fm } = p;
  for (const k of ['title', 'date', 'category', 'tags', 'summary']) {
    if (!fm[k] || (Array.isArray(fm[k]) && !fm[k].length)) fail('content/posts/' + p.file, 'FM_FIELD', `missing front matter "${k}"`);
  }
  if (fm.date && !/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) fail('content/posts/' + p.file, 'FM_DATE', `date "${fm.date}" is not YYYY-MM-DD`);
  if (Array.isArray(fm.tags) && fm.tags.length === 0) fail('content/posts/' + p.file, 'FM_TAGS', 'empty tags array');
  if (fm.summary && String(fm.summary).length < 30) warn('content/posts/' + p.file, 'FM_SUMMARY', `summary only ${String(fm.summary).length} chars`);
}

/* --------------------------------------------------------------- page set */
const expectedPages = ['index.html', 'blog/index.html', 'projects/index.html', 'games/index.html', '404.html'];
for (const p of POSTS) expectedPages.push(`blog/${p.slug}/index.html`);
if (games) for (const g of games.filter((x) => x.status === 'playable')) expectedPages.push(`games/${g.id}/index.html`);
const legacyStubs = [
  'blog/201911/AngularDisplacementInMath.html',
  'blog/201911/LearnLuaBasic01.html',
  'blog/201911/Turtle.html',
  'blog/201911/index.html',
  'blog/201912/index.html',
  'blog/202004/index.html',
];
for (const p of [...expectedPages, ...legacyStubs]) {
  if (!exists(p)) fail(p, 'PAGE_MISSING', `expected generated page missing: ${p}`);
}
for (const p of ['sitemap.xml', 'feed.xml', 'robots.txt', 'assets/js/site.js', 'assets/css/base.css', 'assets/css/theme.css', '.nojekyll']) {
  if (!exists(p)) fail(p, 'ASSET_MISSING', `required generated asset missing: ${p}`);
}

/* ------------------------------------------------------------ static HTML */
const htmlPages = [...new Set([...expectedPages, ...legacyStubs])].filter(exists);
const PLACEHOLDER_RE = /(\{\{|\$\{|%7B%7B|undefined<\/|>undefined<|>NaN<|\[object Object\]|TODO:|FIXME:)/;

for (const p of htmlPages) {
  const html = read(p);
  const isStub = legacyStubs.includes(p);
  const idsSeen = new Map();

  if (html.includes('\uFFFD')) fail(p, 'ENCODING', 'contains U+FFFD replacement character (mojibake)');
  const place = html.match(PLACEHOLDER_RE);
  if (place) fail(p, 'PLACEHOLDER', `unreplaced placeholder: ${place[0]}`, place.index);
  if (!/<meta charset="utf-8">/i.test(html)) fail(p, 'CHARSET', 'missing <meta charset="utf-8">');
  if (!/<html lang="zh-CN">/.test(html)) fail(p, 'LANG', 'missing html lang="zh-CN"');

  const titleM = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleM ? titleM[1].trim() : '';
  if (!title) fail(p, 'TITLE', 'empty or missing <title>');
  const brand = site && site.name;
  if (brand && title) {
    const n = (title.match(new RegExp(brand, 'g')) || []).length;
    if (n > 1) warn(p, 'TITLE_DUP', `brand "${brand}" appears ${n}× in title: "${title}"`);
  }
  if (!isStub && title.length > 70) warn(p, 'TITLE_LEN', `title is ${title.length} chars (>70)`);

  const descM = html.match(/<meta name="description" content="([^"]*)">/i);
  if (!isStub) {
    if (!descM) fail(p, 'META_DESC', 'missing meta description');
    else if (!descM[1].trim()) fail(p, 'META_DESC', 'empty meta description');
  }
  const canonM = html.match(/<link rel="canonical" href="([^"]+)">/i);
  if (!canonM) fail(p, 'CANONICAL', 'missing canonical link');
  else if (!/^https:\/\//.test(canonM[1])) {
    if (isStub) warn(p, 'CANONICAL', `redirect stub uses relative canonical: ${canonM[1]}`);
    else fail(p, 'CANONICAL', `canonical is not an absolute URL: ${canonM[1]}`);
  } else if (!/^https:\/\/cooloverflow\.github\.io\//.test(canonM[1])) {
    fail(p, 'CANONICAL', `canonical is not the production site URL: ${canonM[1]}`);
  }

  if (!isStub) {
    const h1s = (html.match(/<h1[\s>]/g) || []).length;
    if (h1s !== 1) fail(p, 'H1_COUNT', `expected exactly 1 <h1>, found ${h1s}`);
  }
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt=/.test(m[0])) fail(p, 'IMG_ALT', 'img without alt: ' + m[0].slice(0, 120));
  }
  for (const m of html.matchAll(/<a\b[^>]*href=""/g)) fail(p, 'EMPTY_HREF', 'anchor with empty href');
  for (const m of html.matchAll(/<a\b[^>]*href="#"[^>]*>/g)) {
    const tag = m[0];
    if (/aria-disabled="true"/.test(tag)) warn(p, 'PLACEHOLDER_HREF', 'disabled card still uses href="#" (not a real link)');
    else fail(p, 'EMPTY_HREF', 'anchor with placeholder href="#": ' + tag.slice(0, 140));
  }
  for (const m of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    if (!/rel="[^"]*noopener/.test(m[0])) warn(p, 'TARGET_BLANK', 'target=_blank without rel=noopener: ' + m[0].slice(0, 120));
  }
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) {
    const id = m[1];
    if (idsSeen.has(id)) warn(p, 'DUP_ID', `duplicate id "${id}" (also in ${idsSeen.get(id)})`);
    else idsSeen.set(id, p);
  }
  if (isStub) {
    if (!/http-equiv="refresh"/.test(html)) fail(p, 'STUB_REFRESH', 'legacy stub without meta refresh');
    if (!/name="robots" content="noindex"/.test(html)) fail(p, 'STUB_NOINDEX', 'legacy stub without noindex');
  }
}

/* -------------------------------------------------------------- XML files */
function checkXml(p) {
  const text = read(p);
  if (!text.startsWith('<?xml')) fail(p, 'XML_HEADER', 'missing XML declaration');
  // unescaped ampersands
  const amp = text.match(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/);
  if (amp) fail(p, 'XML_ENTITY', 'unescaped & in XML at ~' + amp.index);
  const stack = [];
  let rootTags = 0;
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(text))) {
    const [, close, name, attrs, selfClose] = m;
    if (close) {
      const top = stack.pop();
      if (top !== name) fail(p, 'XML_BALANCE', `closing </${name}> does not match <${top}>`);
    } else if (selfClose) {
      /* leaf */
    } else {
      stack.push(name);
      if (stack.length === 1) rootTags++;
    }
    if (!/^[\s\S]*$/.test(attrs)) {
      /* attrs sanity: every attribute needs = quoted value */
      const bad = attrs.match(/\s+[A-Za-z_:][\w:.-]*\s*=[^"'\s]/);
      if (bad) fail(p, 'XML_ATTR', 'unquoted attribute value: ' + bad[0]);
    }
  }
  if (stack.length) fail(p, 'XML_BALANCE', 'unclosed tags: ' + stack.join(','));
  if (rootTags !== 1) fail(p, 'XML_ROOT', `expected 1 root element, found ${rootTags}`);
  return text;
}

if (exists('sitemap.xml')) {
  const s = checkXml('sitemap.xml');
  const locs = [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const expected = 4 + POSTS.length + (games ? games.filter((g) => g.status === 'playable').length : 0);
  if (locs.length !== expected) warn('sitemap.xml', 'SITEMAP_COUNT', `expected ${expected} urls, got ${locs.length}`);
  for (const loc of locs) {
    const u = loc.replace(/^https:\/\/cooloverflow\.github\.io/, '');
    const file = u === '/' ? 'index.html' : u.endsWith('/') ? u.slice(1) + 'index.html' : u.slice(1);
    if (!exists(file)) fail('sitemap.xml', 'SITEMAP_404', `sitemap URL has no page: ${loc} (expected ${file})`);
  }
  const postsInSitemap = locs.filter((l) => l.includes('/blog/') && !l.endsWith('/blog/')).length;
  if (postsInSitemap !== POSTS.length) fail('sitemap.xml', 'SITEMAP_POSTS', `sitemap lists ${postsInSitemap} posts, expected ${POSTS.length}`);
}
if (exists('feed.xml')) {
  const f = checkXml('feed.xml');
  const items = (f.match(/<item>/g) || []).length;
  if (items !== POSTS.length) fail('feed.xml', 'FEED_COUNT', `feed has ${items} items, expected ${POSTS.length}`);
  if (!/<language>zh-CN<\/language>/.test(f)) fail('feed.xml', 'FEED_LANG', 'feed missing <language>zh-CN</language>');
}
if (exists('robots.txt')) {
  const r = read('robots.txt');
  if (!/Sitemap:\s*https:\/\/cooloverflow\.github\.io\/sitemap\.xml/.test(r)) fail('robots.txt', 'ROBOTS_SITEMAP', 'robots.txt missing absolute Sitemap line');
}

/* ------------------------------------------- rendered vs content/posts check */
for (const p of POSTS) {
  const pagePath = `blog/${p.slug}/index.html`;
  if (!exists(pagePath)) continue;
  const html = read(pagePath);
  const { fm } = p;
  if (fm.title && !html.includes(fm.title.replace(/&/g, '&amp;'))) fail(pagePath, 'POST_TITLE', `rendered page does not contain front matter title "${fm.title}"`);
  if (fm.date && !html.includes(`datetime="${fm.date}"`)) fail(pagePath, 'POST_DATE', `rendered page does not contain time datetime="${fm.date}"`);
  if (fm.category && !html.includes(fm.category)) fail(pagePath, 'POST_CAT', `rendered page does not contain category "${fm.category}"`);
  const missingTags = (Array.isArray(fm.tags) ? fm.tags : []).filter((t) => !html.includes(t));
  if (missingTags.length) warn(pagePath, 'POST_TAGS', `tags missing from page: ${missingTags.join(', ')}`);
  if (!/class="post-toc"/.test(html)) warn(pagePath, 'POST_TOC', 'no table of contents');
}

/* -------------------------------------- stray debug artifacts at repo root */
for (const stray of ['_dom.html', '_console.txt', 'debug.log']) {
  if (exists(stray)) warn(stray, 'STRAY_ARTIFACT', 'local debug artifact in the publish root; not committed but should be deleted before shipping');
}

/* ------------------------------------------------------------------- report */
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(
  path.join(OUT, 'build-check.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), pages: htmlPages.length, posts: POSTS.length, issues }, null, 2)
);

const fails = issues.filter((i) => i.level === 'fail');
const warns = issues.filter((i) => i.level === 'warn');
console.log(`\n== build-check ==  pages=${htmlPages.length} posts=${POSTS.length} repos=${repos ? repos.length : '?'} games=${games ? games.length : '?'}`);
console.log(`FAIL ${fails.length}   WARN ${warns.length}`);
for (const i of [...fails, ...warns]) {
  console.log(`  ${i.level === 'fail' ? 'FAIL' : 'warn'}  [${i.page}] ${i.code}: ${i.message}`);
}
console.log(fails.length ? '\nbuild-check: FAILED' : '\nbuild-check: OK');
process.exit(fails.length ? 1 : 0);
