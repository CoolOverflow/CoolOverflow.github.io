# 游戏厅 · Games

站点里可以直接玩的小游戏集合。纯前端、零依赖、零网络请求：没有 CDN、没有 `npm install`、
没有构建步骤，把目录丢到任何静态服务器（或直接双击 `index.html`）就能玩。

| 游戏 | 目录 | 技术 | 一句话 |
| --- | --- | --- | --- |
| 贪吃蛇 | `games/snake/` | Canvas | 撞墙即死，吃能量块变长，2 秒倒计时自动开始 |
| 2048 | `games/2048/` | DOM + CSS | 滑动合并数字，带合并动画、撤销一步 |
| 打砖块 | `games/breakout/` | Canvas | 6 关霓虹砖块，挡板反弹小球，粒子特效 |

所有游戏页共用深色外壳（`games/_shared/game-shell.css`）：深底 `#0B0F14`、绿 `#7CFFB2` /
青 `#5CE1E6` / 琥珀 `#FFC857` 三色 accent、等宽字体点缀、16:9 自适应舞台、键盘 + 触屏双输入。

---

## 目录约定

```
games/
├── _shared/
│   ├── game-shell.css      # 所有游戏页共用的外壳样式（顶栏 / 分数条 / 16:9 舞台 / 遮罩）
│   └── game-shell.js       # 共用小工具：canvas DPR 适配、最高分 localStorage、全屏按钮
├── _tools/
│   └── sync-logic.mjs      # 由 logic.mjs 生成 logic.classic.js（规则单一来源）
├── _tests/
│   ├── snake.test.mjs      # 纯规则单元测试
│   ├── 2048.test.mjs
│   ├── breakout.test.mjs
│   ├── sync.test.mjs       # 校验 logic.classic.js 与 logic.mjs 同步
│   ├── page-smoke.test.mjs # 用 DOM 桩把真实页面脚本跑一遍（防白屏 / 报错）
│   └── shots/              # 截图自测输出（不入库也可）
├── snake/
│   ├── index.html
│   ├── style.css           # 本游戏专属样式（主题变量 + 少量点缀）
│   ├── game.js             # 渲染 / 输入 / 主循环（经典 <script>）
│   ├── logic.mjs           # 纯规则（ES module，测试用，单一来源）
│   └── logic.classic.js    # 自动生成，页面用 window.GameLogic 访问
├── 2048/ ...
└── breakout/ ...
```

为什么每个游戏有两份逻辑文件？

- `logic.mjs` 用 `export`，`node --test` 可以直接 `import`；
- 页面**不能**用 `<script type="module">`（headless / `file://` 下模块加载受限），
  所以由 `games/_tools/sync-logic.mjs` 从 `logic.mjs` 生成经典脚本 `logic.classic.js`
  （去掉 `export` 并把导出挂到 `window.GameLogic`）。

**规则永远只改 `logic.mjs`**，然后运行：

```bash
node games/_tools/sync-logic.mjs          # 重新生成全部 logic.classic.js
node games/_tools/sync-logic.mjs --check  # 只校验（不同步则退出码 1）
```

`sync.test.mjs` 会比对两份文件内容，忘记同步会直接测试失败，所以页面和测试不会跑出两套规则。

---

## 运行测试

需要 Node.js ≥ 20（ES module + `node:test`）：

```bash
# 在仓库根目录执行；Node 24 / Windows 下传目录（games/_tests/）会报
# "Cannot find module ...games\_tests"，所以用 glob 或直接 `node --test`。
node --test "games/_tests/*.test.mjs"
# 等价写法（同样在仓库根）：node --test
```

当前覆盖：

- 蛇：吃食物增长 / 撞墙 / 撞自身 / 可进入尾巴腾出的格子 / 暂停 / 提速 / 通关；
- 2048：`slideLine` 合并规则（一块瓷砖每步最多合并一次）/ 四方向 / 不可移动判定 / 撤销 / 生成新砖 / 2048 判定；
- 打砖块：墙体与挡板反弹 / 砖块扣血与击碎 / 高速球不穿模 / 掉命 / 清关 / 最后一关通关；
- 页面冒烟：HTML 引用是否存在、是否离线、真实 `game.js` 在 DOM 桩里执行是否有异常、Canvas 是否真的在画。

> 若受限环境（例如 CI 沙箱）里 `node --test` 报 `spawn EPERM`，可加
> `--test-isolation=none` 让测试在当前进程执行：
> `node --test --test-isolation=none "games/_tests/*.test.mjs"`。

---

## 如何新增第 4 个游戏（以 `tetris` 为例）

### 1. 建目录

```bash
mkdir games/tetris
```

### 2. 写纯逻辑 `games/tetris/logic.mjs`

要求：

- 只做规则，不碰 DOM / `window` / `document` / `localStorage`；
- 随机数通过参数注入 `rng`（默认 `Math.random`），方便测试复现；
- 用 `export function` / `export const` 导出（不要 `export default`、不要 `import`，
  同步脚本只支持这种写法）；
- 状态尽量用不可变更新（返回新对象），页面才能安全地做动画 / 撤销。

示例：

```js
export const COLS = 10;
export const ROWS = 20;

export function createGame(options = {}) {
  const rng = options.rng ?? Math.random;
  return { cols: COLS, rows: ROWS, /* ... */ };
}

export function step(state, rng = Math.random) {
  // 返回新 state
  return { ...state };
}
```

### 3. 生成经典版

```bash
node games/_tools/sync-logic.mjs
```

会生成 `games/tetris/logic.classic.js`，页面里可直接用 `window.GameLogic.createGame(...)`。
（改完逻辑别忘了再跑一次；`sync.test.mjs` 会检查。）

### 4. 加测试 `games/_tests/tetris.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from './_rng.mjs';
import { createGame, step } from '../tetris/logic.mjs';
```

至少覆盖核心规则的正反例。

### 5. 写页面 `games/tetris/index.html`

直接抄一个现有游戏（推荐 `snake`）再改，保持这些约定：

- 页面脚本顺序：`logic.classic.js`（同目录）→ `../_shared/game-shell.js` → `game.js`；
- **不要**用 `type="module"`、不要引用任何 CDN / 网络字体；
- 相对路径引用 `../_shared/game-shell.css` 和本目录 `style.css`；
- `<meta name="viewport">`、`<title>`、`<meta name="description">`、
  `<link rel="canonical" href="https://cooloverflow.github.io/games/tetris/">` 一个都不能少；
- 深色主题、中文 UI；键盘 + 触屏都要能用（触屏事件监听在 `.shell-stage` 上）。

外壳的固定结构（页面脚本靠 `data-*` 找元素）：

```html
<body class="game-shell" data-game="tetris">
  <header class="shell-topbar">
    <a class="shell-back" href="../../">← 返回博客</a>
    <div class="shell-title"><h1>俄罗斯方块</h1><p class="shell-sub">TETRIS · CANVAS</p></div>
    <div class="shell-actions">
      <button class="shell-btn" data-action="pause">暂停</button>
      <button class="shell-btn" data-action="restart">重开</button>
      <button class="shell-btn shell-btn--icon" data-action="fullscreen">⛶</button>
    </div>
  </header>
  <main class="shell-main">
    <div class="shell-hud"><!-- .shell-stat + .shell-stat-value --></div>
    <div class="shell-stage-area">
      <div class="shell-stage" data-stage>
        <canvas class="shell-canvas" data-canvas></canvas>
        <div class="shell-overlay" data-overlay><!-- .shell-card --></div>
      </div>
    </div>
    <p class="shell-hint">键盘 / 触屏操作提示</p>
  </main>
  <script src="logic.classic.js"></script>
  <script src="../_shared/game-shell.js"></script>
  <script src="game.js"></script>
</body>
```

在 `style.css` 里设置主题色即可（外壳会自动用 `--accent-rgb` 做光晕 / 描边）：

```css
.game-shell[data-game="tetris"] {
  --accent: #ffc857;
  --accent-rgb: 255, 200, 87;
  --on-accent: #1a1102;
}
```

### 6. 写渲染 `games/tetris/game.js`

- 用 `GameShell.syncCanvas(canvas)` 每帧同步 canvas 尺寸（已处理 `devicePixelRatio`，
  返回 CSS 像素宽高，绘制时 `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`）；
- 主循环用 `requestAnimationFrame` + `dt`（记得 `Math.min(dt, 0.05)` 防止切标签页后跳帧）；
- 最高分用 `GameShell.best('cooloverflow.tetris.best')` / `GameShell.saveBest(...)`；
- `visibilitychange` / `blur` 时自动暂停，避免切回来就死；
- 键盘事件里对方向键 / 空格调用 `event.preventDefault()`，防止页面滚动。

### 7. 注册到游戏厅 `data/games.json`

在数组里加一条（完整字段见下一节），把 `status` 设为 `"playable"`。
站点游戏厅读取这个文件自动渲染卡片；卡片点击后打开 `path`。

### 8. 自测

```bash
node --test "games/_tests/*.test.mjs"
```

再用浏览器打开 `games/tetris/index.html` 与 iframe 嵌入页，确认：

- 不是白屏、没有控制台报错、没有网络请求（DevTools → Network 应为空）；
- 窗口缩放（含 320px 宽手机、1280×800、全屏）不破版、无横向滚动；
- 键盘 / 触屏都能操作；暂停、重开、最高分正常。

截图自测命令（Chromium headless shell，路径按本机 Playwright 安装位置调整）：

```bash
chrome-headless-shell.exe --headless --disable-gpu --hide-scrollbars \
  --window-size=1280,800 --virtual-time-budget=3000 \
  --screenshot="games/_tests/shots/tetris.png" \
  "file:///C:/Dev/Agents/cooloverflow-site/games/tetris/index.html"
```

---

## `data/games.json` 字段说明

顶层是一个数组，每张卡片一项，顺序即展示顺序：

```json
{
  "id": "snake",
  "title": "贪吃蛇",
  "subtitle": "经典复刻 · Canvas",
  "desc": "方向键或滑动转向，吃能量块变长，撞墙即结束。支持加速档位与最高分。",
  "path": "/games/snake/",
  "tags": ["街机", "Canvas"],
  "accent": "#7CFFB2",
  "status": "playable",
  "difficulty": "入门"
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 唯一标识，建议与目录名一致（`snake` / `2048` / `breakout`） |
| `title` | string | 是 | 卡片标题（中文） |
| `subtitle` | string | 否 | 副标题，一行小字（`经典复刻 · Canvas`） |
| `desc` | string | 是 | 约 30–45 字描述，卡片正文 |
| `path` | string | playable 必填 | 游戏页地址，站点根相对路径，**以 `/` 开头、以 `/` 结尾**（`/games/snake/`） |
| `tags` | string[] | 否 | 2–3 个标签，渲染成小 chip |
| `accent` | string | 否 | 卡片主色，与游戏页 `--accent` 保持一致：`#7CFFB2` / `#5CE1E6` / `#FFC857` |
| `status` | string | 是 | `playable`（可玩）或 `soon`（即将上线占位） |
| `difficulty` | string | 否 | 难度文案：`入门` / `轻松` / `进阶` / `硬核` |

注意：

- `path` 是**站点绝对路径**（不是相对路径），因为游戏厅首页可能在任意层级；
  本地用 `file://` 直接打开游戏页时，`path` 不参与跳转。
- 字段只增不改语义；渲染端遇到未知字段应忽略，遇到缺失的可选字段要有兜底。

---

## iframe 嵌入要求

游戏厅首页可以用 iframe 内嵌游戏，游戏页本身不依赖父页面：

```html
<div class="game-frame" style="aspect-ratio: 16 / 9; height: min(78vh, 720px);">
  <iframe
    src="/games/snake/"
    title="贪吃蛇"
    loading="lazy"
    allow="fullscreen"
    style="width: 100%; height: 100%; border: 0; display: block;"
  ></iframe>
</div>
```

硬性要求（新增游戏也必须满足）：

1. **100% 高**：`html, body { height: 100% }`，外壳 `.game-shell { height: 100dvh }`，
   所有关键容器 `min-height: 0`，这样 iframe 给多高就用多高，不会出现滚动条。
2. **无横向滚动**：不要给页面设固定最小宽度；画布用 `width: 100%` + 等比缩放；
   小屏（320px）也要能放下顶栏按钮（现有外壳在 720px / 460px 有断点）。
3. **不依赖父页面**：不读 `window.parent`、不需要 `postMessage` 握手，
   直接用相对路径加载自己的 CSS / JS / 图片；父页面只负责给 iframe 一个 16:9 容器。
4. **键盘**：iframe 需要先获得焦点（用户点一下游戏区）键盘事件才生效；
   游戏页内的按钮（暂停 / 重开 / 全屏）在 iframe 内可直接点击。
5. **全屏**：父页面 iframe 加 `allow="fullscreen"`，游戏页顶栏的 ⛶ 按钮才能进入全屏；
   被浏览器拒绝时游戏页会静默忽略，不会报错。
6. **尺寸变化**：游戏页内部监听 canvas / 容器尺寸（`GameShell.syncCanvas` 每帧读取
   `clientWidth/clientHeight`），父页面改变 iframe 尺寸时游戏会自动适配，不需要重新加载。
7. **音效**：目前三个游戏都没有音频，避免 iframe 自动播放策略问题；如将来添加音频，
   需要用户手势后才能播放。

---

## "即将上线"空位的用法

`data/games.json` 里的 `coming-soon` 是一条**占位卡片**，`status` 为 `"soon"`、没有 `path`：

```json
{
  "id": "coming-soon",
  "title": "下一个游戏?",
  "desc": "这里留给你的下一个作品。按 games/README.md 的约定添加即可自动出现在游戏厅。",
  "status": "soon"
}
```

规则：

- 渲染端看到 `status: "soon"` 时渲染成不可点击的占位卡（虚线边框 / 降低透明度 / 显示
  "即将上线"），不要生成链接，也不要尝试加载不存在的 `path`；
- 占位卡建议**始终保留一条在列表末尾**，让游戏厅保持"未完待续"的感觉；
- 如果同时想放多个空位，复制一条并把 `id` 改成 `coming-soon-2`、`coming-soon-3`（`id` 必须唯一）；
- 新游戏上线时，把对应占位项替换成真实条目（补上 `path`，`status` 改成 `playable`），
  或者保留占位、把真实条目插入到它前面。

---

## 已知限制

- 页面用经典 `<script>`（非 module），逻辑文件因此有两份（见上文），靠 `sync-logic.mjs` 保证一致。
- `file://` 直接打开时 `localStorage` 在部分浏览器里按文件隔离，最高分可能不跨游戏共享；
  部署到 GitHub Pages 后正常。
- 触屏滑动依赖 `pointer` 事件；非常老的浏览器（iOS 12 及更早）建议降级为方向键 / 按钮操作。
- 三个游戏均无音效，避免 iframe 自动播放限制；需要音效时请加用户手势解锁。
- 最高分 localStorage key：`cooloverflow.snake.best`、`cooloverflow.2048.best`、
  `cooloverflow.breakout.best`，清理站点数据会一并清除。
