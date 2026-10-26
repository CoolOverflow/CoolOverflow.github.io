# design/qa — 可复跑的验收脚本

零依赖（Node ≥ 22：用到了全局 `fetch` / `WebSocket` + 本机 Chrome）。全部脚本都在仓库根目录执行。

## 一条命令跑完全部

```bash
node design/qa/run-all.mjs
```

它会：没有本地服务时自己起 `python -m http.server 8081` → 跑构建/静态检查 → 链接完整性 → 游戏逻辑测试 → 真浏览器 CDP 审计 → 打印汇总，全部通过退出码 0，否则 1。机器可读结果写到 `design/qa/results/*.json`（已 gitignore）。

可选参数：

```bash
node design/qa/run-all.mjs --no-build   # 不重新构建，直接审计当前产物
node design/qa/run-all.mjs --shots      # 顺带刷新 design/shots/*.png
node design/qa/run-all.mjs --port 8083  # 换端口（8081 被别的目录占用时）
```

## 单项

| 脚本 | 作用 | 失败条件 |
| --- | --- | --- |
| `build-check.mjs` | 跑 `tools/build.mjs`；校验 19 个生成页、`data/*.json` 结构/计数、`sitemap.xml`/`feed.xml` 是否合法 XML、HTML 的 charset/lang/title/meta/canonical/h1/alt/重复 id/占位符/乱码、5 篇文章 front matter 与渲染结果是否一致 | 构建失败、页面缺失、JSON/XML 不合法、占位符/空 href/乱码、文章元数据不一致 |
| `link-check.mjs` | 扫描所有生成 HTML 的 `href/src/srcset`、CSS 的 `url()/@import`、sitemap/feed/robots 的 URL，区分内链/外链，内链逐一对照文件系统；同页 `#anchor` 校验目标 id；报告老 URL 404 风险 | 存在无对应文件的内链/锚点、`localhost`/`file://` 泄漏、跳转桩目标缺失 |
| `cdp-audit.mjs` | 真浏览器 CDP：13 个页面 × 1440/768/390 三档布局（`scrollWidth <= innerWidth+1`、溢出/裁切元素）、console error / 异常 / HTTP≥400、可访问性（h1/alt/按钮名/标题层级/对比度/重复 id/skip-link）、内容（KaTeX、TOC 目标、代码复制、图片加载）、交互（主题持久化、移动端菜单、项目/博客筛选搜索计数、TOC 滚动高亮、代码复制、lightbox、进场动画）、三个游戏真实按键流程、性能快照 | 横向滚动、console error、资源 404、图片不加载、可访问题、交互失效、游戏按键无效 |
| `run-all.mjs` | 依次跑上面三项 + `node --test "games/_tests/*.test.mjs"`，汇总 | 任一项失败 |

## 说明 / 已知噪声

- Chrome 路径按顺序找：`$CHROME_PATH` → Playwright `chrome-headless-shell` → 系统 Chrome/Edge，找不到会明确报错。
- 390/768/1440 下故意超出视口、但位于 `overflow:auto` 容器里的宽内容（代码块、宽 KaTeX 公式）记为 INFO 而不是失败；被「不可滚动容器」裁掉的文字才记为 WARN。
- 外链（GitHub/CSDN 等）只统计不联网校验；内链是全量文件系统校验。
- `design/shots/` 的截图由 `node tools/shots.mjs` 生成，`--shots` 会顺带刷新。
