# QA 验收报告 — cooloverflow.github.io 改版

- **验收对象**：`C:\Dev\Agents\cooloverflow-site`（GitHub Pages 纯静态站，master 分支工作区，未提交）
- **验收时间**：2026-10-26 12:00–12:33（最终一轮构建 12:31，Chrome 实机审计 12:31–12:32）
- **验收方式**：独立、破坏性验收。除静态扫描外，用 headless Chrome + CDP（Node 24 全局 `WebSocket`）做真实 DOM 测量、真实按键/点击、console/网络监听；不只看代码。
- **结论**：**P0 = 0，P1 = 0（开放），P2 = 6（开放）。当前工作区可以发布。**
  早期快照里发现的 1 个 P1（博客“按标签…”死控件）与 5 个 P2 已在本轮验收期间由 Lead 的构建修复，复测通过（第 7 节）；另有 3 个 P2 由本次 QA 直接修复并复测（第 6 节）。
- **一条命令复跑**：`node design/qa/run-all.mjs`（启动服务 → 构建/静态 → 链接 → 游戏测试 → 真浏览器审计 → 汇总；本轮结果 `QA: ALL CHECKS PASSED`）

---

## 1. 验收范围与方法

| 维度 | 覆盖 |
| --- | --- |
| 页面 | 13 个真页面（`/`、`/blog/`、`/projects/`、`/games/`、5 篇文章、`/404.html`、3 个游戏页）+ 6 个旧 URL 跳转桩，共 19 个生成 HTML |
| 视口 | 每页 × 1440 / 768 / 390，共 **39 次真实浏览器访问**（另有动画未关闭状态 3 次、主题×2 的对比度采样） |
| 构建/静态 | `node tools/build.mjs`；`data/*.json` 结构；`sitemap.xml` / `feed.xml` XML 合法性；HTML 占位符/空 href/重复 id/alt/标题/meta/canonical/乱码；5 篇文章 front matter ↔ 渲染结果 |
| 链接 | 19 个 HTML 的 `href/src/srcset` + CSS `url()/@import` + sitemap/feed/robots URL，内链对照文件系统；33 个同页锚点；旧 URL 404 风险 |
| 交互 | 主题切换+刷新持久、移动端菜单开/合/Esc/链接、项目分类筛选+搜索+计数、博客标签跳转+分类筛选、TOC 点击+滚动高亮、代码复制、图片 lightbox、进场动画、skip-link 键盘可达 |
| 游戏 | 贪吃蛇 / 2048 / 打砖块：真实按键（`Input.dispatchKeyEvent`）驱动开始/暂停/继续/重开/得分/撤销；`node --test`；canvas 实际绘制；无外部请求 |
| 内容 | KaTeX 渲染、代码块语言标签+复制、图片 `naturalWidth>0`、文章标题/日期/分类/标签与 `content/posts` 一致、页脚/RSS/sitemap |
| 可访问性 | 每页唯一 h1、标题层级、img alt、按钮/链接可访问名、重复 id、输入框 label、skip-link、焦点可见性、明/暗双主题对比度采样 |
| 性能 | 请求数、传输字节、console error/warning、HTTP ≥400、外部资源请求 |

工具：`design/qa/build-check.mjs`、`link-check.mjs`、`cdp-audit.mjs`、`run-all.mjs`（说明见 `design/qa/README.md`），结果 JSON 在 `design/qa/results/`。

---

## 2. 结果总览

| 检查 | 结果 |
| --- | --- |
| 构建 | ✅ `build ok`：posts 5 / repos 15（featured 6）/ games 3 playable + 1 soon / images 3 |
| 静态检查 | ✅ FAIL 0 / WARN 0（19 页、5 篇 front matter 全部一致） |
| 链接完整性 | ✅ FAIL 0；内链 331 条全部有落盘文件；同页锚点 33/33 有效；外链 76 条仅统计不联网 |
| 游戏逻辑测试 | ✅ 55/55 通过（`node --test "games/_tests/*.test.mjs"`） |
| 响应式 | ✅ 39/39 次访问 `document.documentElement.scrollWidth <= innerWidth + 1`；动画中/动画后同样无横向滚动 |
| Console / 网络 | ✅ 39 次访问 0 error / 0 warning / 0 个 HTTP≥400 / 0 个外部请求 |
| 交互 | ✅ 主题持久、菜单、筛选/搜索/计数、标签跳转、TOC、复制、lightbox、进场动画全部通过 |
| 三个游戏 | ✅ 按键可改变状态与分数（2048 实测 40 步 244 分、撤销 39 步 228 分、重开归零） |
| 内容 | ✅ KaTeX 36 个节点、10 个 display 公式、0 渲染错误；14 个代码块全部有语言标签+复制按钮；3 张正文图片全部加载；5 篇元数据一致 |
| 可访问性 | ✅ 每页 1 个 h1、0 个缺 alt、0 个无名按钮/链接、0 个重复 id、标题层级无跳级、skip-link 生效；对比度 108 个采样点全部 ≥ WCAG AA（亮色最低 4.6:1，暗色最低 5.33:1） |
| 性能 | ✅ 首页 3 请求 / ~101 KB / 文档 31 KB；文章页首次 10–12 请求（KaTeX ~344 KB），其余页面 4–5 请求；全部同源缓存 |

**P0 阻断：0 项。P1 明显：0 项开放。**

---

## 3. P0（阻断发布）

无。

---

## 4. P1（明显问题）

无开放项。

> 验收早期快照（12:06 构建）曾发现 1 个 P1：`/blog/` 的“按标签…”芯片点击后把分类设成伪值 `__tags:`，页面只剩“显示 0 / 5”。Lead 在 12:12 的构建中移除了该控件（当前 `blog/index.html` 已无 `data-filter-tags-toggle`），复测确认博客筛选/标签跳转/搜索全部正常。详见第 7 节。

---

## 5. P2（打磨项，未修，建议交 Lead / designer）

### P2-1 游戏页与站点外壳在主题、导航、品牌上不一致

- **页面**：`/games/snake/`、`/games/2048/`、`/games/breakout/`
- **现象**：① 游戏页恒为深色，站点切到浅色主题后从 `/games/` 进游戏会突然变深色；② 左上角文案是“返回博客”，实际 `href="../../"` 回到站点首页 `/`（`/games/snake/` → `../../` = `/`）；③ `<title>` 用 `贪吃蛇 · 游戏厅 | cooloverflow`，站点其它页统一 `… · Amuda`。
- **复现**：浅色主题下打开 `/games/` → 点“贪吃蛇”；或直接在游戏页点“返回博客”。
- **线索**：`games/*/index.html` L6–7、L15–19；`games/_shared/game-shell.css`（无 `data-theme` 分支）；`tools/build.mjs` 的站点布局不参与游戏页。
- **建议（视觉/文案取舍，交 Lead + designer）**：二选一——给 game-shell 加主题继承（读 `localStorage.theme` 或 `prefers-color-scheme`），或明确“游戏页永远深色”并在游戏厅页写一句说明；返回按钮建议改成“返回首页”或把目标改成 `/games/`；`<title>` 统一品牌后缀。

### P2-2 移动端宽公式可横向滑动但无提示

- **页面**：`/blog/angular-displacement-math/` @390
- **现象**：10 个 display 公式里最宽 424px > 容器 328px，`overflow-x:auto` 最多可滑 96px；截图/首屏看起来像被截断（如 `log q`、`squad(...)`）。
- **复现**：390 宽打开文章，滚到“四元数的对数/求幂/squad”公式处。
- **线索**：`assets/css/theme.css` 的 `.katex-display { overflow-x: auto; }`（可滚动，不是溢出 bug）。
- **建议**：右侧加渐隐遮罩或小号“可横向滑动”提示；或移动端把 display 公式 `font-size` 调小一档。属于视觉取舍，未改。

### P2-3 历史 `.md` 老 URL 仍会 404（跳转桩覆盖不全）

- **页面**：旧站地址（GitHub Pages）
- **现象**：当前 6 个跳转桩只覆盖确实存在过的 `.html` 导出（`AngularDisplacementInMath.html`、`LearnLuaBasic01.html`、`Turtle.html`）和 3 个目录索引；git 历史里另有 8 个旧地址无对应页面：`blog/201911/Bresenham画线算法.md`、`blog/201912/卡尔曼滤波.md`、`blog/201911/201911.md`、`blog/201912/201912.md`、`blog/202004/202004.md`、`LuaTEInterface.PNG` 等。
- **复现**：访问 `https://cooloverflow.github.io/blog/201911/Bresenham画线算法.md` → 404。
- **线索**：`tools/build.mjs` L831–838 `legacy` 映射表；`git ls-files blog/` 历史文件。
- **建议**：若确实有外链/搜索引擎收录，按真实旧 URL 补 `.html` 跳转桩；**不建议**给 `.md` 做桩（Pages 以 `text/markdown` 返回，meta refresh 不会执行）。纯静态站无法做 301，属可接受的残余风险。

### P2-4 `?theme=` 调试参数存在首帧闪烁

- **页面**：任意页（调试/截图路径）
- **现象**：首帧主题由 `<head>` 内联脚本（localStorage/系统）决定，URL 强制主题在 `site.js` 的 `DOMContentLoaded` 才应用，`?theme=light` 硬刷新时可能先看到深色一帧。
- **复现**：硬刷新 `http://127.0.0.1:8081/?theme=light`。
- **线索**：`tools/build.mjs` L222 内联主题脚本；`assets/js/site.js` L51–52 的 `forced` 分支。
- **建议**：只影响截图参数，用户不会带该参数访问；若要完美，把 `URLSearchParams` 判断并入 head 内联脚本。

### P2-5 贪吃蛇页无 JS 时 overlay 文案是数字“2”

- **页面**：`/games/snake/`（禁用 JS）
- **现象**：`<h2 data-overlay-title>2</h2>` 是倒计时数字的静态兜底，无 JS 时显示“2”而不是游戏名/准备提示。
- **复现**：DevTools 禁用 JavaScript 后打开游戏页。
- **线索**：`games/snake/index.html` L58。
- **建议**：静态兜底改成“准备”或“贪吃蛇”，JS 照常覆盖（一行改动，纯渐进增强，未动 game-dev 的页面）。

### P2-6 sitemap 缺 `lastmod`、feed `lastBuildDate` 每次构建都变

- **页面**：`/sitemap.xml`、`/feed.xml`
- **现象**：sitemap 只有 `loc/changefreq/priority` 没有 `lastmod`；`lastBuildDate` 每次 `build` 都刷新（即使内容没变），对抓取/订阅的去重判断略有噪声。
- **线索**：`tools/build.mjs` `sitemap()` L747+、`feed()` L767+。
- **建议**：sitemap 用文章 front matter 的 `date` 生成 `<lastmod>`（低成本 SEO 提升）；`lastBuildDate` 可保留。

---

## 6. 本轮 QA 直接修复并复测通过

| # | 文件:行 | 问题（现象） | 修法 | 复测证据 |
| --- | --- | --- | --- | --- |
| 1 | `assets/js/site.js:380` | 点击 TOC 后高亮错位一档：点 `#h-3` 却高亮 `#h-2`（锚点落点 = scroll-padding-top 80 + scroll-margin-top 90 = 170px，而滚动监听的阈值只算了 `--header-h + 80` = 144px） | scrollspy 阈值改为 `scroll-padding-top + heading.scroll-margin-top + 2`，与实际锚点落点一致 | 5 篇文章 TOC 点击后 `location.hash` 与 `.is-current` / `aria-current` 全部一致（`#h-3`→`#h-3` 等） |
| 2 | `assets/css/theme.css:727` | `/blog/` 热门标签计数与标签名粘连，渲染成 `#Python2`、`#卡尔曼滤波1`，像是另一个标签名 | 新增 `.tag-count { margin-left:4px; opacity:.55; font-variant-numeric:tabular-nums; }` | 截图确认变为 `#Python 2` / `#卡尔曼滤波 1`；不影响其它 `.tag` |
| 3 | `games/README.md:68,207` | 文档写的 `node --test games/_tests/` 在 Node 24 / Windows 上直接失败（`Cannot find module …games\_tests`），Lead 按文档复跑会误判 | 改为 `node --test "games/_tests/*.test.mjs"`（并注明 `node --test` 等价写法） | 55/55 通过，已并入 `run-all.mjs` |
| 4 | `README.md:48` | 根 README 没有 QA 入口 | 增加“验收 / QA”小节，指向 `node design/qa/run-all.mjs` 与报告/脚本说明 | — |
| 5 | `design/qa/*`（新增） | 验收不可复跑 | 新增 `build-check.mjs` / `link-check.mjs` / `cdp-audit.mjs` / `run-all.mjs` / `lib/cdp.mjs` / `README.md` | `node design/qa/run-all.mjs` → `QA: ALL CHECKS PASSED` |

> 说明：这些文件在 `git status` 里是 **已暂存 + 有新修改（MM）** 状态，提交前需要重新 `git add`（见第 9 节）。

---

## 7. 验收期间由 Lead 构建修复、QA 复测通过的项

12:12 的构建相对 12:06 快照发生变化，以下问题在最终构建中已不存在，逐项复测通过：

| 问题（早期快照） | 复测结果 |
| --- | --- |
| 首页 `<title>` 重复品牌：`Amuda · Amuda · 游戏开发笔记`（`layout()` 拼了两次 `site.name`/`site.title`） | ✅ 现为 `Amuda · 游戏开发笔记`（`tools/build.mjs:198`） |
| `/blog/` “按标签…”芯片（P1）：点击把分类设为 `__tags:`，5 篇全部隐藏、计数 0，属于死控件 | ✅ 控件已移除；博客页分类/标签跳转/搜索复测正常 |
| Coming-soon 游戏卡 `href="#"`，点击会跳回页首 | ✅ 改为非链接 `<div class="game-card-link" aria-disabled="true">`（`tools/build.mjs:309`）；点击不跳转、不在 Tab 序列 |
| `/projects/`、`/games/` 标题层级 h1 → h3 跳级（卡片标题是 h3） | ✅ 卡片标题改为 h2（`build.mjs:501/689`），本页现在的层级为 h1→h2 |
| 旧 URL 跳转桩 `canonical` 是相对路径 | ✅ 改为绝对 URL（`build.mjs:798`） |
| 根目录遗留调试产物 `debug.log`、`_dom.html`、`_console.txt`、`_inspect.mjs` 等 | ✅ 已清理；`.gitignore` 增加了 `design/qa/results/` 等 |

---

## 8. 逐项验收证据（摘要）

**5 篇文章内容**（front matter ↔ 页面一致）：

| slug | 标题 | 日期 | 分类 | 标签 | TOC | KaTeX | 代码块/复制 | 图片 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| angular-displacement-math | 3D数学中角位移的表示：矩阵、欧拉角和四元数 | 2019-10-31 | 数学 | 3D数学/四元数/旋转矩阵/欧拉角 | 7 | 36 节点 / 10 display / 0 error | 0/0 | 0 |
| bresenham-line | 计算机图形学：Bresenham画线算法 | 2019-11-29 | 图形学 | Bresenham/直线光栅化 | 2 | — | 1/1（python） | 2（536/700px，均加载） |
| kalman-filter | 线性动态系统-卡尔曼滤波 | 2019-12-29 | 机器学习 | 卡尔曼滤波/概率图模型/贝叶斯滤波 | 2 | — | 2/2 | 0 |
| learn-lua-basic-01 | Lua语言学习1：基本语法和数据类型 | 2019-11-08 | 编程语言 | Lua/语法基础 | 6 | — | 7/7 | 1（加载） |
| python-turtle | Python绘图工具turtle | 2019-11-28 | 编程语言 | Python/turtle/绘图/L系统 | 4 | — | 4/4 | 0 |

**交互实测数值**：

- 主题：light → dark，`localStorage.theme=dark`，刷新后仍 dark，body 背景 `rgb(7,10,15)`，`aria-pressed`/`title` 同步，可键盘聚焦。
- 移动端菜单（390）：点击后 `aria-expanded=true`、5 个链接可见、`body.nav-open`；`Escape` 关闭并把焦点还给按钮；点“文章”跳 `/blog/` 且菜单自动收起。
- 项目页：15 张卡；分类“引擎学习” → 3 张，计数“显示 3 / 15”；搜索 `Shader` → 3 张；乱词 → 0 张 + 空状态提示；清空 → 15 张；`aria-pressed` 与计数同步。
- 博客页：5 篇；热门标签 `Python` → 输入框自动填 `Python`、2 篇、计数“显示 2 / 5”；分类“机器学习” → 1 篇。
- 文章页：TOC 目标 id 全部存在（7/2/2/6/4），点击后 hash/滚动/高亮一致；复制按钮点击后变“已复制”且 0 console 错误；点击图片打开 lightbox（`body.no-scroll`），Esc 关闭。
- 进场动画：首页 7 个 `[data-reveal]` 全部 `is-revealed`；动画进行中与结束后三档视口均无横向滚动。
- 键盘：首页第一次 Tab 聚焦 `.skip-link`（`href="#main"`，目标存在）。

**游戏实测**：

| 游戏 | 结果 |
| --- | --- |
| 贪吃蛇 | canvas 1122×630 实际绘制；2s 倒计时后自动开始；`Space` 暂停（overlay“已暂停”）/继续；`R` 重开（倒计时+Ready）；overlay 按钮可立即开始；`ArrowDown/Right` 真实按键被接受 |
| 2048 | 开局 2 块；方向键 40 步：分数 244、最大块 32、撤销可用；撤销后 39 步/228 分；`R` 重开归零；合并动画/最高分写入 localStorage |
| 打砖块 | 5 次按键内进入 running；暂停按钮 → overlay“已暂停”/“继续”；继续后得分 15；`R` 回到 ready；`Space` 发球正常；canvas 1024×…、粒子正常 |

**性能快照**（本机 localhost，已含缓存影响）：首页 3 请求/101 KB、文档 31 KB；`/blog/`、`/projects/`、`/games/`、`/404.html` 4 请求；文章页首次 10–12 请求（KaTeX CSS+JS+字体约 344 KB，之后走缓存）；游戏页 5 请求（24–40 KB）。全部页面 0 个外部请求、0 个 4xx/5xx。

**截图**：`design/shots/` 下 38 张（19 个页面/视口组合 × dark/light）。全页长截图中个别标题有 CDP `captureBeyondViewport` 的合成伪影（视口级截图与 DOM 测量均正常），不是页面 bug。

---

## 9. 复跑方式与产物

```bash
# 在 C:\Dev\Agents\cooloverflow-site 下
node design/qa/run-all.mjs            # 全量：构建 + 静态 + 链接 + 游戏测试 + 真浏览器审计
node design/qa/run-all.mjs --shots    # 额外刷新 design/shots/*.png
node design/qa/run-all.mjs --no-build # 不重新构建，只审计当前产物
```

- 若 8081 无服务，脚本会自己起 `python -m http.server 8081 --bind 127.0.0.1 --directory .`（换端口用 `--port`）。
- 结果：`design/qa/results/build-check.json`、`link-check.json`、`cdp-audit.json`（含每个页面×视口的原始测量、交互返回值）、`run-all.log`；该目录已 gitignore。
- 单项脚本与失败条件见 `design/qa/README.md`。

**提交注意**：`assets/js/site.js`、`assets/css/theme.css`、`README.md`、`games/README.md`、`design/qa/*` 在 `git status` 里是“已暂存 + 后续又有修改”（`MM`）或未跟踪（`?? design/qa/README.md`），提交前请重新 `git add` 这些文件；`design/QA-REPORT.md` 本身也需 `git add`。本轮未执行 `git commit/push`。

---

## 10. 未覆盖 / 残余风险

1. **外链可达性未联网校验**：76 条外链（GitHub 71、CSDN 3、x.com 1、thisisgame 1）只统计不请求；老 CSDN 文章链接存在失效可能。
2. **真机未测**：iOS Safari / Android Chrome 未实机跑，仅 Chrome headless + 移动视口模拟（含 `mobile:true`/触屏 pointer 事件路径）。
3. **`prefers-reduced-motion`**：审计固定 `no-preference` 以测动效；reduce 分支代码存在（hero canvas/reveal 关闭）但未做视觉回归。
4. **高 DPI 画布清晰度**：DPR 上限 2，≥3x 屏幕上 canvas 可能略软（设计取舍）。
5. **全页截图伪影**：超长页面的 `captureBeyondViewport` 会让个别标题看起来被截断；以视口截图与 DOM 测量为准。
