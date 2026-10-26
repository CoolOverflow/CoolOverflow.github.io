# 视觉与交互设计简报 — cooloverflow.github.io

> 交给 site-designer。你负责 `assets/css/theme.css`（全部视觉）与 `assets/js/site.js`（全部交互）。
> 结构由 `tools/build.mjs` 生成，Lead 拥有 HTML；`base.css` 只提供 token/reset/版式骨架。不要改 HTML 与 base.css，需要改结构先告诉 Lead。

---

## 1. 这是谁的站

Amuda（GitHub: CoolOverflow），游戏开发工程师，方向：游戏引擎、图形学、3D 数学、Shader。
站点三件事：**放项目（15 个 GitHub 仓库）**、**放文章（5 篇技术长文，含大量 LaTeX 公式与代码）**、**放能直接玩的小游戏**。

读者画像：同行开发者、面试官/HR、以及被文章搜到的中文读者。他们要的是——**"这人技术是真的，而且品味不差"**，30 秒内看出来。

## 2. 视觉方向：Engine Room · 墨与网格

一句话：**把游戏引擎的调试视图做成一本印刷精致的工程笔记。**

- 底子是"深色引擎控制台"（近黑，不是纯黑），但不要赛博朋克霓虹堆砌：只用一个高饱和 mint 绿做信号色，青与琥珀做极少量点缀。
- 加一点东方质感呼应他的水墨 shader 项目：极细的网格线、纸面噪点、留白克制。**不要用毛笔字/山水画素材**，用几何手法暗示即可。
- 信息层级靠**排版与留白**，不靠颜色堆叠。卡片、分割线、标签都要"轻"，1px 线条 + 半透明表面，不要重投影。
- 技术感来自细节：等宽字体的编号与标签（`01 — PROJECTS`）、像素级对齐、像 terminal 的状态卡、代码块的语言标签。
- 动效要**短、稳、有目的**（150–400ms，ease-out），只在进入视口、hover、切主题时出现。禁止无限循环的骚动。

### 2.1 设计 token（可在 theme.css 覆盖）

base.css 已定义，直接复用或覆盖：

```
--bg #070a0f      页面底            --text #e9eff7     主文字
--bg-soft #0b1017 次级底            --text-dim #a8b6c7 次级文字
--surface #0f1620 卡片面            --text-mute #6d7d91 弱文字
--surface-2 #141d29 hover 面        --accent #7cffb2   mint 信号色
--surface-3 #1a2533 选中面          --accent-2 #5ce1e6 青
--line rgba(255,255,255,.08)        --accent-3 #ffc857 琥珀
--line-strong .16                   --danger #ff7a7a
--max 1180px  --narrow 760px  --header-h 68px  --radius 14px
--font-sans（系统中文字体栈）  --font-mono（等宽）
```

建议：正文中文 15–16px；标题字重 700、字距 -0.02em；`.section-kicker` 用 mono + 字距 0.18em + 全大写。
亮色主题（`[data-theme="light"]`）必须真的好看：不是简单反色，参考纸上印刷——暖白纸底 + 深墨字 + 同一个 mint 但要压暗成 `#0a8f5c`。

### 2.2 Hero 背景的三个元素（hero-bg 内已有 DOM）

```html
<div class="hero-bg"><canvas class="hero-canvas" id="hero-canvas"></canvas>
  <span class="hero-glow hero-glow-a"></span><span class="hero-glow hero-glow-b"></span>
  <span class="hero-grid"></span></div>
```
- `.hero-grid`：CSS 网格线（1px，透明度 3–6%），可用 mask 做中心淡出。
- `.hero-glow-a/b`：两个大范围径向渐变光斑（mint / cyan），极低不透明度，可轻微漂移（>=20s 循环，reduced-motion 下静止）。
- `.hero-canvas`：在 `site.js` 里画一个轻量"粒子/流场"效果：约 60–120 个点，速度场用 sin/cos 伪噪声，鼠标靠近时轻微排斥；DPR 适配；`prefers-reduced-motion` 或窄屏时只画静态一帧或直接隐藏。用 `requestAnimationFrame`，页面隐藏时暂停，CPU 占用要低。

## 3. 页面结构（已生成，按此写样式）

所有页面共用：`.site-header`（含 `.brand` `.nav-toggle` `.nav` `.nav-list` `.nav-link` `.nav-actions` `.icon-btn` `.theme-toggle`）、`.site-footer`、`.back-to-top`、`.skip-link`。

### 3.1 首页 `index.html`（body.page-home）
1. `.hero` → `.hero-inner`：左 `.hero-copy`（`.eyebrow` 带 `.eyebrow-dot`、`.hero-title` 内含 `.hero-em` 高亮行、`.hero-lead`、`.hero-actions` 两个 `.btn`、`.hero-tags` 六个 li）；右 `.hero-panel`（terminal 卡：`.panel-bar` 三个 `.panel-dots` + `.panel-title`、`.panel-body` 里 `.panel-line`/`.panel-prompt`/`.panel-out`/`.panel-out-dim`/`.panel-cursor`、`.panel-foot` 带 `.status-dot`）。
2. `.stats-band` → `.stats-inner` 四组 `.stat`（`.stat-value` `.stat-label`）。数字要大、要像仪表读数；中间用竖线分隔（移动端 2×2）。
3. `.section-projects`：`.section-head`（`.section-kicker` 编号 + `.section-title` + `.section-desc` + 右侧 `.section-more` 带箭头图标），`.project-grid` 内 6 个 `.project-card`（结构：`.project-top` 里 `.project-cat` / `.project-lang`（含 `.lang-dot`）/`.project-badge`；`.project-title` 内链接；`.project-desc`；`.tag-list.project-tags`；`.project-foot` 里 `.project-meta`（含星标 svg）与 `.project-links` 的 `.project-link`）。
4. `.section-posts`：`.post-list` → 每个 `.post-item` → `.post-item-link` 内含 `.post-item-date`（`11.08`）、`.post-item-main`（`.post-item-title` `.post-item-summary` `.post-item-meta`：`.post-item-cat` `.post-item-time` `.post-item-tag`）、`.post-item-arrow`。**这是列表不是卡片**：日期用 mono 在左，hover 时整行提亮 + 箭头右移。
5. `.section-games`：`.game-grid` → `.game-card`（含 `--game-accent` 自定义属性）→ `.game-card-link` → `.game-thumb`（`.game-thumb-grid` `.game-thumb-glyph` `.game-thumb-label`）+ `.game-body`（`.game-head` `.game-title` `.game-diff`、`.game-sub`、`.game-desc`、`.tag-list.game-tags`、`.game-play`）。`.is-soon` 变体要明显不同（灰度、虚线、不可点）。
6. `.section-about`：`.about-grid` 两栏；左 `.about-text`（`.about-bio` + `.about-actions`），右 `.about-side`（`.about-facts` 里 `.about-fact-k`、`.skills` 里 `.skill-group` `.skill-title`）。

### 3.2 文章归档 `blog/index.html`（body.page-blog）
`.page-head`（`.page-title` `.page-desc` `.page-tags` 里 `.tag-btn` + `.tag-count`）→ `.filter-bar`（`.search-field` 包 `.search-input`；`.chip-row` 里 `.chip`；`.filter-count`）→ `#post-list` 内多个 `.archive-year`（`.year-title` 含 `.year-num` `.year-count`）+ `.post-list`。另有 `.filter-empty`（hidden 状态）。

### 3.3 项目 `projects/index.html`（body.page-projects）
同上 filter-bar，`.project-grid.project-grid-all` 内 15 张完整 `.project-card`（这里**有** `.project-story`，首页紧凑版没有）。

### 3.4 文章页 `blog/<slug>/index.html`（body.page-post）
`.post-header`（`.breadcrumb`、`.post-title`（大，可 40–52px）、`.post-summary`、`.post-meta` 含 time/`.meta-sep`/`.post-category`、`.tag-list.post-tags`）→ `.post-layout`（两栏：`.post-toc` sticky（`.toc-title` + `.toc-nav` 里 `.toc-item.toc-l2/.toc-l3`）+ `.post-body.prose`）→ `.post-footer`（`.post-end` 菱形、`.post-end-note`、`.post-nav` 两个 `.post-nav-item`、`.post-back`）。
**`.prose` 是重点，必须逐项写：** h2/h3（带 id，需 scroll-margin-top 避开 sticky header）、p、a、strong、em、del、ul/ol（中文序号/项目符号要小）、blockquote、hr、img（圆角 10px + 可选窄阴影）、`.table-wrap` 内 table（表头 sticky 不需要，窄屏横向滚动）、`.code-block`（内含 `.code-lang` 语言标签 + pre>code，深色高亮面，横向滚动；**语法高亮由你用少量正则实现基础 token 着色即可，不要引入 highlight.js**）、`.math.math-display`（居中 + 横向滚动，未渲染时也要可读；`span.katex-display` 要能溢出滚动）、`.math-inline`。
目录高亮：滚动时给当前 h2/h3 对应 `.toc-item` 加 `.is-current`。

### 3.5 游戏厅 `games/index.html`（body.page-games）
`.page-head-games` 里 `.games-hint`（`.hint-key` + 文案）→ `.game-grid.game-grid-all`（所有 `.game-card`）→ `.section-extension` 里 `.extend-card`（左 `.extend-copy` 含 `.extend-actions`，右 `.extend-code` pre）——这是"预留模块"的说明卡，做成一张有边界感的虚线/网格容器。

### 3.6 404
`.notfound` → `.notfound-inner`（`.notfound-code` 巨大 404 做装饰，`.page-title`，按钮组）。

## 4. 交互清单（site.js）

DOM 钩子（HTML 里已存在，直接用）：
- `[data-theme-toggle]` 主题切换：写 `document.documentElement.dataset.theme` + `localStorage.theme`；`.theme-icon-sun/.theme-icon-moon` 按主题显示其一；切换时加个 150ms 过渡。
- `[data-nav-toggle]` + `#site-nav`：开合 `.is-open`，同步 `aria-expanded`；点击链接/按 Esc/点外部关闭；打开时锁 body 滚动。
- `#site-header`：滚动 >8px 加 `.is-scrolled`。
- `[data-back-to-top]`：滚动 >600px 显示（`.is-visible`），点击平滑回顶。
- 过滤：`[data-filter-search]`（输入）+ `[data-filter-chips]` 内 `[data-filter]`（分类 chip，值为分类名或"全部"）+ `[data-filter-count]`（显示 `N / M`）+ `[data-filter-empty]`（无结果时显示）。目标容器由 `data-target` 指定（`#project-list` / `#post-list`）。条目带 `data-cat` `data-lang`(项目) `data-tags` `data-text`（小写 haystack）。搜索与 chip 是**与**关系；`[data-filter-jump]` 热门标签点击后把搜索框填成该标签并过滤。博客页需隐藏空的 `.archive-year`。
- `[data-reveal]`：IntersectionObserver 进场（先加 `.is-revealed`，CSS 里控制），`once`，reduced-motion 直接显示。
- `.code-block`：注入"复制"按钮（`navigator.clipboard` + 成功 1.5s 文案），并把 `code` 内容做轻量语法高亮（关键字/字符串/注释/数字四类即可，注意别破坏中文与 Lua/Python/C#/VB 混排）。
- 文章页：TOC scrollspy（IntersectionObserver 或 scroll 节流）、图片点击放大（可选，简单 lightbox 即可）。
- 启动时把 `document.documentElement.dataset.js = 'on'`（CSS 里做渐进增强）。
- **所有代码 vanilla，单文件 site.js，IIFE，无依赖，无 console 报错。**

## 5. 验收（必须自己截图看）

1. 起服务：`python -m http.server 8080 --bind 127.0.0.1 --directory C:\Dev\Agents\cooloverflow-site`（若 8080 已占用就用 8081）。
2. 用 headless shell 截图（Windows PowerShell）：
```powershell
$chrome = "C:\Users\YH-01783\AppData\Local\ms-playwright\chromium_headless_shell-1208\chrome-headless-shell-win64\chrome-headless-shell.exe"
& $chrome --headless --disable-gpu --hide-scrollbars --window-size=1440,2600 --screenshot="C:\Dev\Agents\cooloverflow-site\design\shots\home-1440.png" "http://127.0.0.1:8080/"
```
   截 `home-1440.png`、`home-390.png`（window-size=390,2400）、`blog-1440.png`、`post-1440.png`、`projects-1440.png`、`games-1440.png`，全都放到 `design/shots/`，用 read_image 亲眼检查破版/溢出/对比度，至少迭代 2 轮。
3. 自检：三段断点（1440 / 768 / 390）无横向滚动条；标题不压字；卡片等高；亮色主题也截一张；深色下正文对比度 ≥ 4.5:1。
4. 不引入外部字体/CDN；不新增框架；不改 HTML/base.css；只在 `assets/css/theme.css`、`assets/js/site.js`、`design/shots/` 内写文件。

## 6. 品味要求（最重要）

- 宁可少一个装饰，不要多一个噪音。每加一个效果问：它帮读者理解了什么？
- 卡片、徽章、标签的圆角/字号/内边距全部统一成 3–4 个档位，不要每个组件一套。
- 中文排版别出错：中英混排留空格由 CSS 不用管，但不要用 `text-transform: uppercase` 处理中文，行高别小于 1.6，段间距 1em 左右。
- 首页第一屏要把"我是谁 + 我做过什么 + 现在能玩什么"说清楚，不要被背景动效抢戏。
