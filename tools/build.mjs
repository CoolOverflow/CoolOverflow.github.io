#!/usr/bin/env node
/**
 * Static site generator for cooloverflow.github.io
 * Zero dependencies. Reads content/ + data/, writes the GitHub Pages site.
 *
 *   node tools/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mdToHtml, splitFrontMatter, readingTime } from './md.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = ROOT;

const log = (...a) => console.log(...a);
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function readJSON(rel, fallback) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}

function write(rel, html) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, html, 'utf8');
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return 0;
  let n = 0;
  const walk = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) walk(s, d);
      else {
        fs.copyFileSync(s, d);
        n++;
      }
    }
  };
  walk(from, to);
  return n;
}

const site = readJSON('data/site.json', {});
const repos = readJSON('data/repos.json', []);
const games = readJSON('data/games.json', []);

const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
function fmtDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y) return String(iso);
  return `${y} 年 ${MONTHS[m - 1] || m} 月 ${d || 1} 日`;
}
function shortDate(iso) {
  const [, m, d] = String(iso).split('-');
  return `${m}.${d}`;
}

/* --------------------------------------------------------------------------
   posts
   -------------------------------------------------------------------------- */
function loadPosts() {
  const dir = path.join(ROOT, 'content/posts');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const slug = file.replace(/\.md$/, '');
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const { data, body } = splitFrontMatter(raw);
      const rendered = mdToHtml(body, { toc: true });
      return {
        slug,
        title: data.title || slug,
        date: data.date || '2020-01-01',
        category: data.category || '随笔',
        tags: Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [],
        summary: data.summary || '',
        url: `/blog/${slug}/`,
        html: rendered.html,
        toc: rendered.toc,
        minutes: readingTime(body),
        words: (body.match(/[\u4e00-\u9fff]/g) || []).length,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
const posts = loadPosts();
const years = [...new Set(posts.map((p) => p.date.slice(0, 4)))].sort().reverse();
const categories = [...new Set(posts.map((p) => p.category))];
const playableGames = games.filter((g) => g.status !== 'soon');
const totalStars = repos.reduce((s, r) => s + (r.stars || 0), 0);

/* --------------------------------------------------------------------------
   icons
   -------------------------------------------------------------------------- */
const svg = (body, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICON = {
  arrow: svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
  arrowUpRight: svg('<path d="M7 17 17 7"/><path d="M8 7h9v9"/>'),
  play: svg('<path d="m8 5 11 7-11 7V5Z"/>'),
  github: svg(
    '<path d="M9 19c-4 1.5-4-2.5-6-3m12 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.8a5.4 5.4 0 0 0-1.5-3.7 5 5 0 0 0-.1-3.7s-1.2-.3-3.9 1.5a13 13 0 0 0-7 0C5.1.2 3.9.5 3.9.5a5 5 0 0 0-.1 3.7A5.4 5.4 0 0 0 2.3 8c0 5.3 3.2 6.5 6.2 6.8a3.4 3.4 0 0 0-.9 2.6V22"/>'
  ),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  star: svg('<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3Z"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  tag: svg('<path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z"/>'),
  code: svg('<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/>'),
  gamepad: svg('<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 11v4m-2-2h4m7 0h.01M18 13h.01"/>'),
  book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2V5Z"/><path d="M8 3v18"/>'),
  spark: svg('<path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8M8.4 15.6l-2.8 2.8"/>'),
  chevronRight: svg('<path d="m9 6 6 6-6 6"/>'),
  top: svg('<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>'),
};

/* --------------------------------------------------------------------------
   layout
   -------------------------------------------------------------------------- */
const NAV = [
  { href: '/', label: '首页', key: 'home' },
  { href: '/blog/', label: '文章', key: 'blog' },
  { href: '/projects/', label: '项目', key: 'projects' },
  { href: '/games/', label: '游戏厅', key: 'games' },
];

function header(active) {
  return `<header class="site-header" id="site-header">
  <div class="container header-inner">
    <a class="brand" href="/" aria-label="${esc(site.name)} · 首页">
      <span class="brand-mark" aria-hidden="true">A</span>
      <span class="brand-text">
        <span class="brand-name">${esc(site.name)}</span>
        <span class="brand-sub">游戏开发笔记</span>
      </span>
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="打开导航菜单" data-nav-toggle>
      <span class="nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>
    </button>
    <nav class="nav" id="site-nav" aria-label="主导航">
      <ul class="nav-list">
        ${NAV.map(
          (n) =>
            `<li><a class="nav-link${n.key === active ? ' is-active' : ''}" href="${n.href}"${
              n.key === active ? ' aria-current="page"' : ''
            }>${n.label}</a></li>`
        ).join('\n        ')}
      </ul>
      <div class="nav-actions">
        <a class="icon-btn" href="${site.github}" target="_blank" rel="noopener noreferrer" aria-label="GitHub 主页">${ICON.github}</a>
        <button class="theme-toggle" type="button" aria-label="切换深色 / 浅色主题" data-theme-toggle>
          <span class="theme-icon theme-icon-sun">${ICON.sun}</span>
          <span class="theme-icon theme-icon-moon">${ICON.moon}</span>
        </button>
      </div>
    </nav>
  </div>
</header>`;
}

function footer() {
  return `<footer class="site-footer">
  <div class="container footer-inner">
    <p class="footer-copy">© ${esc(site.name)} · 用 <span class="heart" aria-hidden="true">♥</span> 和原生 JS 手写 · 静态托管于 GitHub Pages</p>
    <nav class="footer-links" aria-label="页脚导航">
      <a href="/blog/">文章</a>
      <a href="/projects/">项目</a>
      <a href="/games/">游戏厅</a>
      <a href="mailto:${site.email}">Email</a>
      <a href="${site.github}" target="_blank" rel="noopener noreferrer">GitHub</a>
      <a href="/feed.xml">RSS</a>
    </nav>
  </div>
</footer>
<button class="back-to-top" type="button" aria-label="返回顶部" data-back-to-top>${ICON.top}</button>`;
}

function layout({ title, description, canonical, active = '', bodyClass = '', content, extraHead = '', extraScripts = '', ogType = 'website', jsonLd = null }) {
  const fullTitle = title ? `${title} · ${esc(site.name)}` : esc(site.title);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="author" content="${esc(site.name)}">
<meta name="theme-color" content="#070a0f">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title || site.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${site.siteUrl}/assets/img/avatar.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title || site.title)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)} 的文章" href="/feed.xml">
<link rel="stylesheet" href="/assets/css/base.css">
<link rel="stylesheet" href="/assets/css/theme.css">
<script>(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}else if(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.dataset.theme='light'}}catch(e){}})();</script>
${extraHead}
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">跳到主要内容</a>
${header(active)}
<main id="main">
${content}
</main>
${footer()}
<script src="/assets/js/site.js" defer></script>
${extraScripts}
</body>
</html>`;
}

/* --------------------------------------------------------------------------
   shared components
   -------------------------------------------------------------------------- */
function projectCard(r, { compact = false, headingLevel = 3 } = {}) {
  const tags = (r.tags || []).slice(0, 3);
  const haystack = [r.name, r.description, r.category, r.language, ...(r.tags || [])].join(' ');
  const H = `h${headingLevel}`;
  return `<article class="project-card" data-cat="${esc(r.category || '其它')}" data-lang="${esc(r.language || '')}" data-text="${esc(haystack)}">
  <div class="project-top">
    <span class="project-cat">${esc(r.category || '项目')}</span>
    ${r.language ? `<span class="project-lang"><i class="lang-dot" aria-hidden="true"></i>${esc(r.language)}</span>` : ''}
    ${r.fork ? '<span class="project-badge">fork</span>' : ''}
  </div>
  <${H} class="project-title"><a href="${r.url}" target="_blank" rel="noopener noreferrer">${esc(r.name)}</a></${H}>
  <p class="project-desc">${esc(r.description || '')}</p>
  ${
    compact
      ? ''
      : `<p class="project-story">${esc(r.story || '')}</p>`
  }
  ${tags.length ? `<ul class="tag-list project-tags">${tags.map((t) => `<li class="tag">${esc(t)}</li>`).join('')}</ul>` : ''}
  <div class="project-foot">
    <span class="project-meta">${r.stars ? `<span class="project-stars">${ICON.star}<span>${r.stars}</span></span>` : ''}</span>
    <span class="project-links">
      <a class="project-link" href="${r.url}" target="_blank" rel="noopener noreferrer">源码 ${ICON.arrowUpRight}</a>
      ${r.highlight ? `<a class="project-link" href="${r.highlight}" target="_blank" rel="noopener noreferrer">演示 ${ICON.arrowUpRight}</a>` : ''}
    </span>
  </div>
</article>`;
}

function postListItem(p, headingLevel = 3) {
  const haystack = [p.title, p.summary, p.category, ...p.tags].join(' ');
  const H = `h${headingLevel}`;
  return `<li class="post-item" data-cat="${esc(p.category)}" data-tags="${esc(p.tags.join(','))}" data-text="${esc(haystack)}">
  <a class="post-item-link" href="${p.url}">
    <div class="post-item-main">
      <${H} class="post-item-title">${esc(p.title)}</${H}>
      <span class="post-item-summary">${esc(p.summary)}</span>
      <span class="post-item-meta"><span class="post-item-cat">${esc(p.category)}</span><span class="post-item-time">${p.minutes} 分钟</span>${
        p.tags.slice(0, 2).map((t) => `<span class="post-item-tag">#${esc(t)}</span>`).join('')
      }</span>
    </div>
    <span class="post-item-arrow" aria-hidden="true">${ICON.chevronRight}</span>
  </a>
</li>`;
}

function gameCard(g, headingLevel = 3) {
  const soon = g.status === 'soon';
  const accent = g.accent || 'var(--accent)';
  const H = `h${headingLevel}`;
  const body = `<div class="game-thumb" aria-hidden="true">
      <span class="game-thumb-grid"></span>
      <span class="game-thumb-glyph">${soon ? ICON.spark : ICON.gamepad}</span>
      <span class="game-thumb-label">${soon ? 'COMING SOON' : 'PLAY NOW'}</span>
    </div>
    <div class="game-body">
      <div class="game-head">
        <${H} class="game-title">${esc(g.title)}</${H}>
        ${g.difficulty ? `<span class="game-diff">${esc(g.difficulty)}</span>` : ''}
      </div>
      ${g.subtitle ? `<p class="game-sub">${esc(g.subtitle)}</p>` : ''}
      <p class="game-desc">${esc(g.desc)}</p>
      ${(g.tags || []).length ? `<ul class="tag-list game-tags">${g.tags.map((t) => `<li class="tag">${esc(t)}</li>`).join('')}</ul>` : ''}
      <span class="game-play">${soon ? '敬请期待' : `打开就玩 ${ICON.play}`}</span>
    </div>`;
  return `<article class="game-card${soon ? ' is-soon' : ''}" style="--game-accent:${accent}">
  ${
    soon
      ? `<div class="game-card-link" aria-disabled="true">${body}</div>`
      : `<a class="game-card-link" href="${g.path}">${body}</a>`
  }
</article>`;
}

/* --------------------------------------------------------------------------
   pages
   -------------------------------------------------------------------------- */
const featured = (repos.filter((r) => r.featured).length ? repos.filter((r) => r.featured) : repos.filter((r) => !r.fork)).slice(0, 6);

function homePage() {
  const latest = posts.slice(0, 5);
  const heroGames = playableGames.slice(0, 3);
  const soonCard = games.find((g) => g.status === 'soon');

  const content = `
<section class="hero" aria-labelledby="hero-title">
  <div class="hero-bg" aria-hidden="true">
    <canvas class="hero-canvas" id="hero-canvas"></canvas>
    <span class="hero-glow hero-glow-a"></span>
    <span class="hero-glow hero-glow-b"></span>
    <span class="hero-grid"></span>
  </div>
  <div class="container hero-inner">
    <div class="hero-copy" data-reveal>
      <p class="eyebrow"><span class="eyebrow-dot" aria-hidden="true"></span>Game Dev · Graphics · Engine</p>
      <h1 class="hero-title" id="hero-title">${esc(site.heroTitleLine1)}<br><span class="hero-em">${esc(site.heroTitleLine2)}</span></h1>
      <p class="hero-lead">${esc(site.lead)}</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="/blog/">读文章 ${ICON.arrow}</a>
        <a class="btn btn-ghost" href="/games/">玩游戏 ${ICON.play}</a>
      </div>
      <ul class="hero-tags" aria-label="技术栈">
        ${['Unity', 'C#', 'C++', 'Shader', 'Lua', '图形学']
          .map((t) => `<li>${esc(t)}</li>`)
          .join('')}
      </ul>
    </div>
    <aside class="hero-panel" aria-label="开发者状态卡片" data-reveal>
      <div class="panel-bar">
        <span class="panel-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="panel-title">amuda@dev ~ ${esc(site.handle.toLowerCase())}</span>
      </div>
      <div class="panel-body">
        <p class="panel-line"><span class="panel-prompt" aria-hidden="true">$</span> whoami</p>
        <p class="panel-out">${esc(site.name)} · ${esc(site.role)}</p>
        <p class="panel-line"><span class="panel-prompt" aria-hidden="true">$</span> cat stack.txt</p>
        <p class="panel-out panel-out-dim">Unity / C# / C++ / HLSL / Lua</p>
        <p class="panel-line"><span class="panel-prompt" aria-hidden="true">$</span> ls ./now/</p>
        <p class="panel-out panel-out-dim">writing-notes/&nbsp;&nbsp;building-games/&nbsp;&nbsp;reading-papers/</p>
        <p class="panel-line"><span class="panel-prompt" aria-hidden="true">$</span> <span class="panel-cursor" aria-hidden="true"></span></p>
      </div>
      <div class="panel-foot"><span class="status-dot" aria-hidden="true"></span>状态 · 持续更新中</div>
    </aside>
  </div>
</section>

<section class="stats-band" aria-label="站点统计">
  <div class="container stats-inner">
    <div class="stat"><span class="stat-value">${posts.length}</span><span class="stat-label">篇技术文章</span></div>
    <div class="stat"><span class="stat-value">${repos.length}</span><span class="stat-label">个公开仓库</span></div>
    <div class="stat"><span class="stat-value">${playableGames.length}</span><span class="stat-label">个可玩游戏</span></div>
    <div class="stat"><span class="stat-value">${totalStars}</span><span class="stat-label">GitHub 星标</span></div>
  </div>
</section>

<section class="section section-projects" id="projects">
  <div class="container">
    <header class="section-head" data-reveal>
      <div>
        <p class="section-kicker">01 — Projects</p>
        <h2 class="section-title">写过的项目</h2>
        <p class="section-desc">从软渲染器、FC 模拟器到用 Excel 跑像素着色器，都是一时兴起然后认真做完的东西。</p>
      </div>
      <a class="section-more" href="/projects/">全部 ${repos.length} 个仓库 ${ICON.arrow}</a>
    </header>
    <div class="project-grid">
      ${featured.map((r) => projectCard(r, { compact: true })).join('\n      ') || '<p class="empty-state">项目数据准备中…</p>'}
    </div>
  </div>
</section>

<section class="section section-posts" id="writing">
  <div class="container">
    <header class="section-head" data-reveal>
      <div>
        <p class="section-kicker">02 — Writing</p>
        <h2 class="section-title">最近在写</h2>
        <p class="section-desc">把学到的数学、图形学算法和引擎实现，写成能跑起来的代码与能看懂的文章。</p>
      </div>
      <a class="section-more" href="/blog/">全部文章 ${ICON.arrow}</a>
    </header>
    ${
      latest.length
        ? `<ol class="post-list">${latest.map((p) => postListItem(p)).join('\n      ')}</ol>`
        : '<p class="empty-state">文章正在整理中…</p>'
    }
  </div>
</section>

<section class="section section-games" id="games">
  <div class="container">
    <header class="section-head" data-reveal>
      <div>
        <p class="section-kicker">03 — Playground</p>
        <h2 class="section-title">游戏厅</h2>
        <p class="section-desc">这里放下我自己写的小游戏。不用下载、不用注册，点开就能玩。</p>
      </div>
      <a class="section-more" href="/games/">进入游戏厅 ${ICON.arrow}</a>
    </header>
    <div class="game-grid">
      ${heroGames.map((g) => gameCard(g)).join('\n      ')}
      ${soonCard ? gameCard(soonCard) : ''}
    </div>
  </div>
</section>

<section class="section section-about" id="about">
  <div class="container about-grid">
    <div class="about-text" data-reveal>
      <p class="section-kicker">04 — About</p>
      <h2 class="section-title">关于我</h2>
      <p class="about-bio">${esc(site.bio)}</p>
      <div class="about-actions">
        <a class="btn btn-ghost" href="mailto:${site.email}">${ICON.mail} 写信给我</a>
        <a class="btn btn-ghost" href="${site.github}" target="_blank" rel="noopener noreferrer">${ICON.github} GitHub</a>
      </div>
    </div>
    <div class="about-side" data-reveal>
      <ul class="about-facts">
        <li><span class="about-fact-k">邮箱</span><a href="mailto:${site.email}">${esc(site.email)}</a></li>
        <li><span class="about-fact-k">GitHub</span><a href="${site.github}" target="_blank" rel="noopener noreferrer">@${esc(site.handle)}</a></li>
        <li><span class="about-fact-k">方向</span><span>游戏引擎 · 图形学 · 玩法原型</span></li>
      </ul>
      <div class="skills">
        ${(site.skills || [])
          .map(
            (g) => `<div class="skill-group">
          <h3 class="skill-title">${esc(g.group)}</h3>
          <ul class="tag-list">${g.items.map((i) => `<li class="tag">${esc(i)}</li>`).join('')}</ul>
        </div>`
          )
          .join('\n        ')}
      </div>
    </div>
  </div>
</section>`;

  return layout({
    title: '',
    description: site.description,
    canonical: `${site.siteUrl}/`,
    active: 'home',
    bodyClass: 'page-home',
    content,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: site.name,
      alternateName: site.handle,
      url: site.siteUrl,
      email: site.email,
      sameAs: [site.github],
      description: site.description,
    },
  });
}

function projectsPage() {
  const cats = ['全部', ...new Set(repos.map((r) => r.category || '其它'))];
  const content = `
<section class="page-head">
  <div class="container">
    <p class="section-kicker">Projects</p>
    <h1 class="page-title">项目与仓库</h1>
    <p class="page-desc">GitHub 上的 ${repos.length} 个公开仓库，按方向分类。点开任意一个能看到源码；有在线 Demo 的会单独标出来。</p>
  </div>
</section>
<section class="section section-list">
  <div class="container">
    <div class="filter-bar" role="search">
      <label class="search-field">
        ${ICON.code}
        <input class="search-input" type="search" placeholder="搜索名称、语言或标签…" aria-label="搜索项目" data-filter-search data-target="#project-list">
      </label>
      <div class="chip-row" data-filter-chips data-target="#project-list">
        ${cats.map((c, i) => `<button class="chip${i === 0 ? ' is-active' : ''}" type="button" data-filter="${esc(c)}">${esc(c)}</button>`).join('\n        ')}
      </div>
      <p class="filter-count" data-filter-count data-target="#project-list" aria-live="polite"></p>
    </div>
    <div class="project-grid project-grid-all" id="project-list">
      ${repos.map((r) => projectCard(r, { headingLevel: 2 })).join('\n      ') || '<p class="empty-state">项目数据准备中…</p>'}
    </div>
    <p class="empty-state filter-empty" data-filter-empty hidden>没有匹配的项目，换个关键词试试。</p>
  </div>
</section>`;

  return layout({
    title: '项目与仓库',
    description: `CoolOverflow 的 ${repos.length} 个公开 GitHub 仓库：图形学、游戏引擎、工具与实验。`,
    canonical: `${site.siteUrl}/projects/`,
    active: 'projects',
    bodyClass: 'page-projects',
    content,
  });
}

function blogPage() {
  const tagCounts = new Map();
  for (const p of posts) for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const allPosts = `<ol class="post-list">${posts.map((p) => postListItem(p, 2)).join('\n      ')}</ol>`;

  const content = `
<section class="page-head">
  <div class="container">
    <p class="section-kicker">Writing</p>
    <h1 class="page-title">文章归档</h1>
    <p class="page-desc">${posts.length} 篇文章，按分类或关键词筛一筛，也可以直接从头读下去。</p>
    <ul class="page-tags" aria-label="热门标签">
      ${topTags.map(([t, n]) => `<li><button class="tag tag-btn" type="button" data-filter-jump="${esc(t)}" data-target="#post-list">#${esc(t)} <span class="tag-count">${n}</span></button></li>`).join('')}
    </ul>
  </div>
</section>
<section class="section section-list">
  <div class="container">
    <div class="filter-bar" role="search">
      <label class="search-field">
        ${ICON.code}
        <input class="search-input" type="search" placeholder="搜索标题、摘要或标签…" aria-label="搜索文章" data-filter-search data-target="#post-list">
      </label>
      <div class="chip-row" data-filter-chips data-target="#post-list">
        <button class="chip is-active" type="button" data-filter="全部">全部</button>
        ${categories.map((c) => `<button class="chip" type="button" data-filter="${esc(c)}">${esc(c)}</button>`).join('\n        ')}
      </div>
      <p class="filter-count" data-filter-count data-target="#post-list" aria-live="polite"></p>
    </div>
    <div id="post-list">
      ${posts.length ? allPosts : '<p class="empty-state">文章正在整理中…</p>'}
    </div>
    <p class="empty-state filter-empty" data-filter-empty hidden>没有匹配的文章，换个关键词试试。</p>
  </div>
</section>`;

  return layout({
    title: '文章归档',
    description: `Amuda 的技术博客文章归档，共 ${posts.length} 篇：3D 数学、计算机图形学、Lua、算法与游戏引擎实现。`,
    canonical: `${site.siteUrl}/blog/`,
    active: 'blog',
    bodyClass: 'page-blog',
    content,
  });
}

function postPage(p, idx) {
  const newer = posts[idx - 1];
  const older = posts[idx + 1];
  const tocHtml = p.toc.length
    ? `<aside class="post-toc" aria-label="本文目录">
      <p class="toc-title">本文目录</p>
      <nav class="toc-nav"><ol>${p.toc
        .map((t) => `<li class="toc-item toc-l${t.level}"><a href="#${t.id}">${esc(t.text)}</a></li>`)
        .join('')}</ol></nav>
    </aside>`
    : '';

  const content = `
<article class="post">
  <header class="post-header">
    <div class="container container-narrow">
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="/blog/">文章</a><span aria-hidden="true">/</span><span class="breadcrumb-cat">${esc(p.category)}</span>
      </nav>
      <h1 class="post-title">${esc(p.title)}</h1>
      ${p.summary ? `<p class="post-summary">${esc(p.summary)}</p>` : ''}
      <div class="post-meta">
        <span>${ICON.clock}${p.minutes} 分钟读完</span>
        <span class="meta-sep" aria-hidden="true">·</span>
        <span class="post-category">${esc(p.category)}</span>
      </div>
      ${p.tags.length ? `<ul class="tag-list post-tags">${p.tags.map((t) => `<li class="tag">#${esc(t)}</li>`).join('')}</ul>` : ''}
    </div>
  </header>
  <div class="container post-layout">
    ${tocHtml}
    <div class="post-body prose">
      ${p.html}
    </div>
  </div>
  <footer class="post-footer">
    <div class="container container-narrow">
      <div class="post-end" aria-hidden="true"><span>◆</span></div>
      <nav class="post-nav" aria-label="上下篇">
        ${
          newer
            ? `<a class="post-nav-item post-nav-prev" href="${newer.url}"><span class="post-nav-label">← 较新一篇</span><span class="post-nav-title">${esc(newer.title)}</span></a>`
            : '<span class="post-nav-item is-empty"></span>'
        }
        ${
          older
            ? `<a class="post-nav-item post-nav-next" href="${older.url}"><span class="post-nav-label">较早一篇 →</span><span class="post-nav-title">${esc(older.title)}</span></a>`
            : '<span class="post-nav-item is-empty"></span>'
        }
      </nav>
      <a class="post-back" href="/blog/">${ICON.arrow} 返回文章归档</a>
    </div>
  </footer>
</article>`;

  const extraHead = `<link rel="stylesheet" href="/assets/vendor/katex/katex.min.css">
<script defer src="/assets/vendor/katex/katex.min.js"></script>
<script defer src="/assets/vendor/katex/auto-render.min.js"></script>`;
  const extraScripts = `<script>
document.addEventListener('DOMContentLoaded', function () {
  if (window.renderMathInElement) {
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false }
      ],
      throwOnError: false,
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
    });
  }
});
</script>`;

  return layout({
    title: p.title,
    description: p.summary || site.description,
    canonical: `${site.siteUrl}${p.url}`,
    active: 'blog',
    bodyClass: 'page-post',
    content,
    extraHead,
    extraScripts,
    ogType: 'article',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: p.title,
      description: p.summary,
      author: { '@type': 'Person', name: site.name, url: site.siteUrl },
      mainEntityOfPage: `${site.siteUrl}${p.url}`,
      keywords: p.tags.join(', '),
      articleSection: p.category,
    },
  });
}

function gamesPage() {
  const content = `
<section class="page-head page-head-games">
  <div class="container">
    <p class="section-kicker">Playground</p>
    <h1 class="page-title">游戏厅</h1>
    <p class="page-desc">都是我自己写的，纯前端、零依赖，打开就能玩。键盘和触屏都支持，手机上也能玩。</p>
    <div class="games-hint">
      <span class="hint-key">${ICON.gamepad}</span>
      <span>小提示：横屏体验更好；游戏页支持全屏。</span>
    </div>
  </div>
</section>
<section class="section section-games-list">
  <div class="container">
    <div class="game-grid game-grid-all">
      ${games.map((g) => gameCard(g, 2)).join('\n      ') || '<p class="empty-state">游戏正在准备中…</p>'}
    </div>
  </div>
</section>
<section class="section section-extension">
  <div class="container">
    <div class="extend-card">
      <div class="extend-copy">
        <p class="section-kicker">04 — Reserved</p>
        <h2 class="section-title">这里永远留一个位置</h2>
        <p class="section-desc">游戏厅是预留的可扩展模块：新游戏只要放进 <code>games/&lt;id&gt;/</code>，再往 <code>data/games.json</code> 里加一条记录，首页和这里就会自动多一张卡片。也可以直接把 Unity WebGL 导出放进 iframe。</p>
        <div class="extend-actions">
          <a class="btn btn-ghost" href="${site.github}/CoolOverflow.github.io/tree/master/games" target="_blank" rel="noopener noreferrer">${ICON.code} 查看添加文档</a>
          <a class="btn btn-ghost" href="mailto:${site.email}">推荐一个玩法</a>
        </div>
      </div>
      <pre class="extend-code"><code>// data/games.json
{
  "id": "your-game",
  "title": "你的游戏",
  "path": "/games/your-game/",
  "status": "playable",
  "accent": "#7CFFB2"
}</code></pre>
    </div>
  </div>
</section>`;

  return layout({
    title: '游戏厅',
    description: '直接在浏览器里玩的小游戏合集：贪吃蛇、2048、打砖块。纯前端实现，键盘与触屏都能操作。',
    canonical: `${site.siteUrl}/games/`,
    active: 'games',
    bodyClass: 'page-games',
    content,
  });
}

function notFoundPage() {
  const content = `
<section class="section notfound">
  <div class="container notfound-inner">
    <p class="notfound-code" aria-hidden="true">404</p>
    <h1 class="page-title">这一页好像被引擎丢掉了</h1>
    <p class="page-desc">链接可能改了名字，或者这篇文章还没写完。回到首页，或者去游戏厅玩一局？</p>
    <div class="hero-actions">
      <a class="btn btn-primary" href="/">${ICON.arrow} 回首页</a>
      <a class="btn btn-ghost" href="/games/">去游戏厅 ${ICON.play}</a>
    </div>
  </div>
</section>`;
  return layout({
    title: '页面不存在',
    description: '页面不存在或已迁移。',
    canonical: `${site.siteUrl}/404.html`,
    content,
  });
}

/* --------------------------------------------------------------------------
   feeds / meta files
   -------------------------------------------------------------------------- */
function sitemap() {
  const urls = [
    ['/', '1.0'],
    ['/blog/', '0.9'],
    ['/projects/', '0.8'],
    ['/games/', '0.8'],
    ...posts.map((p) => [p.url, '0.7']),
    ...playableGames.map((g) => [g.path, '0.6']),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    ([u, pri]) =>
      `  <url><loc>${site.siteUrl}${u}</loc><changefreq>weekly</changefreq><priority>${pri}</priority></url>`
  )
  .join('\n')}
</urlset>`;
}

function feed() {
  const items = posts
    .slice(0, 20)
    .map(
      (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${site.siteUrl}${p.url}</link>
      <guid>${site.siteUrl}${p.url}</guid>
      <category>${esc(p.category)}</category>
      <description>${esc(p.summary)}</description>
    </item>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(site.title)}</title>
    <link>${site.siteUrl}/</link>
    <description>${esc(site.description)}</description>
    <language>zh-CN</language>
${items}
  </channel>
</rss>`;
}

function redirectStub(target) {
  const abs = `${site.siteUrl}${target}`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>页面已迁移</title>
<link rel="canonical" href="${abs}">
<meta http-equiv="refresh" content="0; url=${target}">
<meta name="robots" content="noindex">
<script>location.replace(${JSON.stringify(target)})</script>
</head><body style="font-family:system-ui;background:#070a0f;color:#e9eff7;padding:48px">
<p>这个地址已经迁移到 <a style="color:#7cffb2" href="${target}">${abs}</a></p>
</body></html>`;
}

/* --------------------------------------------------------------------------
   build
   -------------------------------------------------------------------------- */
function build() {
  // pages
  write('index.html', homePage());
  write('projects/index.html', projectsPage());
  write('blog/index.html', blogPage());
  posts.forEach((p, i) => write(`blog/${p.slug}/index.html`, postPage(p, i)));
  write('games/index.html', gamesPage());
  write('404.html', notFoundPage());

  // assets copied from content
  const imgCount = copyDir(path.join(ROOT, 'content/images'), path.join(ROOT, 'assets/img'));

  // meta
  write('sitemap.xml', sitemap());
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /content/\nDisallow: /design/\nDisallow: /data/\nDisallow: /tools/\nDisallow: /games/_tests/\nDisallow: /games/_tools/\nSitemap: ${site.siteUrl}/sitemap.xml\n`);
  write('feed.xml', feed());

  // legacy URL redirects (old GitHub Pages paths)
  const legacy = {
    'blog/201911/AngularDisplacementInMath.html': '/blog/angular-displacement-math/',
    'blog/201911/LearnLuaBasic01.html': '/blog/learn-lua-basic-01/',
    'blog/201911/Turtle.html': '/blog/python-turtle/',
    'blog/201912/index.html': '/blog/',
    'blog/201911/index.html': '/blog/',
    'blog/202004/index.html': '/blog/',
  };
  for (const [from, to] of Object.entries(legacy)) write(from, redirectStub(to));

  log(`\n✅ build ok`);
  log(`   posts:    ${posts.length}  (${years.join(', ')})`);
  log(`   repos:    ${repos.length}  (featured ${featured.length})`);
  log(`   games:    ${playableGames.length} playable / ${games.length} total`);
  log(`   images:   ${imgCount} copied`);
  log(`   pages:    index, projects, blog, ${posts.length} posts, games, 404, sitemap, feed`);
}

build();
