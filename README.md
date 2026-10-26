# cooloverflow.github.io

Amuda 的个人主页与技术博客 — **https://cooloverflow.github.io/**

> 游戏开发 / 图形学 / 引擎。写文章、放项目，还有几个打开就能玩的小游戏。

站点是一个**零依赖的静态站**：没有 Jekyll、没有前端框架、没有 CDN 字体，一个零依赖的 Node 脚本把 `content/` 与 `data/` 编译成纯 HTML/CSS/JS，直接由 GitHub Pages 托管。

---

## 站点结构

```
.
├── content/                  # 内容源（唯一需要手写的部分）
│   ├── posts/*.md            # 文章：Markdown + YAML front matter
│   └── images/posts/<slug>/  # 文章配图（构建时复制到 assets/img）
├── data/
│   ├── site.json             # 站点身份：名称、简介、技能栈、社交链接
│   ├── repos.json            # 项目清单（GitHub 仓库的中文策展）
│   └── games.json            # 游戏厅清单
├── games/                    # 每个游戏一个独立目录，可单独访问 / 可 iframe 嵌入
│   ├── snake/  2048/  breakout/
│   └── README.md             # 如何新增一个游戏
├── tools/
│   ├── build.mjs             # 静态站生成器（零依赖）
│   ├── md.mjs                # Markdown → HTML（含数学保护）
│   └── shots.mjs             # 批量截图自检
├── assets/
│   ├── css/base.css          # 设计 token / reset / 版式骨架
│   ├── css/theme.css         # 视觉与组件
│   ├── js/site.js            # 交互：主题、筛选、TOC、代码复制…
│   └── vendor/katex/         # 本地 KaTeX（公式渲染，无外链）
├── design/                   # 设计简报、截图、QA 报告
└── index.html …              # 构建产物，请勿手改
```

## 本地开发

```bash
node tools/build.mjs                                  # 生成整站
python -m http.server 8081 --bind 127.0.0.1           # 本地预览 http://127.0.0.1:8081/
node tools/shots.mjs                                  # 批量截图到 design/shots/（需要本机 Chrome）
```

构建产物（`index.html`、`blog/`、`projects/`、`games/index.html`、`sitemap.xml`、`feed.xml`）直接写在仓库根目录，`git push` 即发布。

## 验收 / QA

```bash
node design/qa/run-all.mjs        # 构建 + 链接 + 真浏览器交互 + 游戏逻辑测试（一条命令）
node design/qa/run-all.mjs --shots  # 顺便刷新 design/shots/ 截图
```

脚本与失败条件见 `design/qa/README.md`，本次改版的验收结论见 `design/QA-REPORT.md`。

## 写一篇新文章

在 `content/posts/` 下新建 `我的文章.md`：

```markdown
---
title: "文章标题"
date: 2026-04-01
category: 图形学        # 图形学 | 数学 | 游戏引擎 | 编程语言 | 算法 | 机器学习
tags: [光栅化, 阴影]
summary: "50-80 字摘要，会出现在列表页、RSS 和 SEO description 里。"
---

正文用 Markdown 写。公式用 `$...$` / `$$...$$`（KaTeX），代码块记得标语言。
图片放到 content/images/posts/<slug>/ 下，正文引用 /assets/img/posts/<slug>/xxx.png。
```

再跑一次 `node tools/build.mjs`，新文章会自动出现在首页最新、归档、RSS 和 sitemap 里。

## 游戏厅

`games/README.md` 里有完整说明：把游戏放进 `games/<id>/index.html`（纯前端、零依赖、可 iframe），
然后在 `data/games.json` 加一条记录，首页和 `/games/` 会自动多一张卡。
游戏页支持键盘 + 触屏，也可以用 `window.GameShell` 的统一样式。

## 部署

GitHub Pages → 分支 `master` → 根目录。仓库根的 `.nojekyll` 关闭了 Jekyll 构建，
所以推上去的文件就是最终文件，没有隐式构建步骤。

## 许可

文章内容 © Amuda，转载请注明出处。代码部分（`tools/`、`assets/js/`、`games/`）可随意参考。
