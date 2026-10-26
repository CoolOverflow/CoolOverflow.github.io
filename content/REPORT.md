# 内容整理报告（blog/ → content/）

- 整理范围：`blog/` 下 5 篇技术文章 → `content/posts/`，图片 → `content/images/posts/<slug>/`
- 原 `blog/` 目录保持原样未动（未删除、未移动、未改名），删除/归档由 Lead 统一处理
- 本任务只写入 `content/`，未执行任何 git add/commit/push

## 一、交付清单

| slug | 标题 | date | category | tags | 源文件 | 图片 |
| --- | --- | --- | --- | --- | --- | --- |
| `angular-displacement-math` | 3D数学中角位移的表示：矩阵、欧拉角和四元数 | 2019-10-31 | 数学 | 3D数学, 四元数, 旋转矩阵, 欧拉角 | `blog/201911/AngularDisplacementInMath.md` | 无 |
| `bresenham-line` | 计算机图形学：Bresenham画线算法 | 2019-11-29 | 图形学 | Bresenham, 直线光栅化, 图形学, Python | `blog/201911/Bresenham画线算法.md` | `algo-explainer.png`、`line-cases.png` |
| `learn-lua-basic-01` | Lua语言学习1：基本语法和数据类型 | 2019-11-08 | 编程语言 | Lua, 语法基础, 数据类型 | `blog/201911/LearnLuaBasic01.md` | `lua-interface.png` |
| `python-turtle` | Python绘图工具turtle | 2019-11-28 | 编程语言 | Python, turtle, 绘图, L系统 | `blog/201911/Turtle.md` | 无 |
| `kalman-filter` | 线性动态系统-卡尔曼滤波 | 2019-12-29 | 机器学习 | 卡尔曼滤波, 概率图模型, 贝叶斯滤波 | `blog/201912/卡尔曼滤波.md` | 无 |

date 取值规则：`git log --follow --format=%ad --date=short -- <源文件>`，同一篇多次提交取**首次提交**的日期（与 Lead 口径一致）。各篇对应的提交：

- angular-displacement-math：`2019-10-31`（`add first blog`，之后两次同日修改）
- bresenham-line：`2019-11-29`（`Create Bresenham画线算法.md`）
- learn-lua-basic-01：`2019-11-08`（`LearnLua01`）
- python-turtle：`2019-11-28`（`Create Turtle.md`）
- kalman-filter：`2019-12-29`（`Create 卡尔曼滤波.md`）

## 二、front matter 与格式约定

每篇头部 YAML front matter 字段固定为 `title / date / category / tags / summary`：

- `title`：沿用原标题（去掉正文里重复的一级标题）
- `date`：`YYYY-MM-DD`（git 首次提交日期）
- `category`：只能是 `图形学 | 数学 | 游戏引擎 | 编程语言 | 算法 | 机器学习` 之一
- `tags`：`[a, b, c]` 行内数组
- `summary`：新写的中文摘要，50–80 字，说明「讲了什么 + 能学到什么」，不抄首段

正文约定：

- 图片统一引用 `/assets/img/posts/<slug>/<ascii>.png`（构建时由 `content/images` 复制到 `assets/img`）
- 数学公式保留原 `$...$` / `$$...$$`，由站点统一注入 KaTeX 渲染；原文 `<head>` 内的 MathJax 脚本块已删除
- 标题层级：原文章标题去掉（由 front matter `title` 渲染为 h1），正文小节统一提升为 h2、子节 h3
- 代码块语言标记统一为 ` ```python ` / ` ```lua ` / ` ```plaintext ` / ` ```text `

## 三、每篇改动摘要

### angular-displacement-math（2019-10-31，数学）

- 删除 `<head>` 内 MathJax 脚本块；删除正文重复标题与页尾「返回主页」链接
- 小节标题 `###` → `##`，`#### 特点` → `### 特点`（原 `####特点` 缺空格，Markdown 不识别）
- 原文 `$$即 R = ...$$` 的中文「即」移到公式外（KaTeX 公式内出现中文会报错），拆为「即：」+ 公式块
- 两处写在句子中间的 `$$p' = qpq^{-1}$$`、`$$ad = b$$` 拆成独立的展示公式块，避免行内解析错乱
- 修正四元数逆定义里多余的右括号（`[1 \quad \vec 0])` → `[1 \quad \vec 0]`）
- 数学公式、符号与作者口语（「嘿嘿~」「有空再讲」）原样保留

### bresenham-line（2019-11-29，图形学）

- 删除正文重复标题（文末原无「返回主页」，无需删）
- 补充两个小节标题：`## 算法推导`、`## Python 实现`
- 原来用 `-` 列表 + 顶格续行写的增量推导，改为「加粗条件 + 独立公式段」的段落结构（原列表续行未缩进，渲染会断行错位）
- 代码块语言标记 ` ```Python ` → ` ```python `
- 图片引用改为 ASCII 文件名：`算法解释.png` → `algo-explainer.png`、`多种情况下的直线.png` → `line-cases.png`
- 公式的 ASCII 写法（`bc_(i+1)` 等）按原样保留，未改写为 LaTeX

### learn-lua-basic-01（2019-11-08，编程语言）

- 删除正文重复标题与页尾「返回主页」链接
- 原用 `>-` 嵌套引用写的数据类型说明，改为标准无序列表（原有嵌套引用层级错乱，无法正常渲染）
- 小节标题统一为 `## 0. ...` ~ `## 5. ...` 格式
- 代码块 ` ```Lua ` → ` ```lua `；控制台会话与闭包输出改用 ` ```plaintext `
- 修正拼写：`tabel 赋值` → `table 赋值`
- 图片引用：`LuaTEInterface.PNG` → `/assets/img/posts/learn-lua-basic-01/lua-interface.png`
- 代码内容（含制表符与注释）原样保留

### python-turtle（2019-11-28，编程语言）

- 删除正文重复标题
- 小节标题统一为 `## 1. ...` ~ `## 4. ...`
- 四个代码块均已是 `python`，仅统一空格格式；代码内容原样保留

### kalman-filter（2019-12-29，机器学习）

- 删除正文重复标题
- 概率图模型示意与「预测—校正」递推列表原为顶格 ASCII 文本，改用 ` ```text ` 代码块保留对齐
- 修正递推积分式括号笔误：`∫_{z_{t-1}}{P(z_t|z_{t-1}·P(...))` → `∫_{z_{t-1}}{P(z_t|z_{t-1})·P(...)}dz_{t-1}`
- 公式仍以原文的纯文本记号（`P(z_t|x_1, ...)`）保留，未改写成 LaTeX（原文即如此，作者也吐槽过 GitHub 公式难写）
- 结尾作者语气「（github编写公式不能用LaTeX真麻烦）」保留

## 四、发现的问题

1. **`fourier.md` 原稿缺失（已多路确认）**：`blog/202004/202004.md` 里链接 `./fourier.md`，但该文件在
   - 本地 `blog/` 目录、
   - 本仓库全部 git 历史（`git log --all --name-only` 全量文件列表）、
   - 远端 `https://github.com/CoolOverflow/CoolOverflow.github.io` 的 `master` 文件树（GitHub API 查询）

   中**都不存在**。因此没有创建 `content/posts/fourier-transform.md`，也不会凭空补写内容；该文如需上线，必须由作者提供原稿。

2. **202004 月结不迁移**：`blog/202004/202004.md` 全文仅 3 句话（2020-04-04 创建，2025-11-24 改过链接），是旧站的月度索引页而非文章，且分类枚举中没有合适类目。按 Lead 口径不迁移为 post，交由 Lead 处理归档页。原文如下（原样摘录）：

   > 前几个月疫情比较严重，在家里学习了一些数据库、lua和untiy的内容
   >
   > 最近在公司需要处理和学习的事情比较多，争取之后随缘更新我的博客吧
   >
   > [傅里叶变换实现任意图形的绘制](./fourier.md)

   顺带记一个错别字：`untiy` 应为 `Unity`（仅记录，不影响本任务）。

3. **旧站「返回主页」链接全部失效**：`https://kimomi.github.io/` 实测返回 **HTTP 404**（GitHub Pages: Site not found）。三篇文章里的「返回主页」链接已全部删除，不建议在新站保留。

4. **旧月度索引与文章不一致**：
   - `blog/201911/201911.md` 的博文列表里链接的是 `AngularDisplacementInMath.html`（旧导出页，126 KB），而不是同名 `.md`；
   - 同一列表漏掉了 `Bresenham画线算法.md`（该文 2019-11-29 创建，晚于月结）；
   - `blog/201912/201912.md` 同样只是月结索引。
   以上月结索引均未迁移；`AngularDisplacementInMath.html` 按要求丢弃（以 `.md` 为准）。

5. **数学渲染兼容性**：原文 MathJax 配置删除后由 KaTeX 接管。KaTeX 对公式中的中文字符会报错，故把 `$$即 R=...$$` 的「即」移出公式；另外原文有两处 `$$...$$` 夹在句子中间，已整理为独立公式块。

6. **图片文件名中文化**：`算法解释.png`、`多种情况下的直线.png` 已改为 `algo-explainer.png`、`line-cases.png`，`LuaTEInterface.PNG` 改为 `lua-interface.png`（全部小写 ASCII）；源图片保留在 `blog/` 未动。

7. **日期与目录名不一致**：`angular-displacement-math` 真实首次提交日期是 2019-10-31，但源文件放在 `blog/201911/` 下、月结也归在 2019 年 11 月。按任务要求以 git 真实日期为准，未使用目录名。

## 五、自检

自检脚本检查项：每篇 front matter 可解析、必填字段齐全、date 合法、tags 为数组、summary 长度 50–80 字、所有图片引用在 `content/images/` 下存在、正文无 MathJax 残留/「返回主页」/重复标题、代码块语言标记合规。结果见下方输出：

```text
$ node C:\Dev\Agents\_check_content.mjs
== 文章自检 ==
slug | date | category | tags | summary(中文字) | imgs | math块
angular-displacement-math | 2019-10-31 | 数学 | 3D数学/四元数/旋转矩阵/欧拉角 | 58 | 0 | 10
bresenham-line | 2019-11-29 | 图形学 | Bresenham/直线光栅化/图形学/Python | 56 | 2 | 0
kalman-filter | 2019-12-29 | 机器学习 | 卡尔曼滤波/概率图模型/贝叶斯滤波 | 64 | 0 | 0
learn-lua-basic-01 | 2019-11-08 | 编程语言 | Lua/语法基础/数据类型 | 61 | 1 | 0
python-turtle | 2019-11-28 | 编程语言 | Python/turtle/绘图/L系统 | 59 | 0 | 0

文章数: 5；图片文件数: 3

errors: 0
（3 条 warning 均为「正文以小节标题开头、无引入段」，属原文结构，未改）
```

再用 `tools/md.mjs` 实际渲染一遍，确认构建器能正常解析每篇（front matter + 正文）：

```text
$ node C:\Dev\Agents\_render_check.mjs
angular-displacement-math.md | h2=4 h3=3 | mathBlock=10 code=0 img=0 toc=7 | 约4分钟
bresenham-line.md           | h2=2 h3=0 | mathBlock=0  code=1 img=2 toc=2 | 约3分钟
kalman-filter.md            | h2=2 h3=0 | mathBlock=0  code=2 img=0 toc=2 | 约1分钟
learn-lua-basic-01.md       | h2=6 h3=0 | mathBlock=0  code=7 img=1 toc=6 | 约3分钟
python-turtle.md            | h2=4 h3=0 | mathBlock=0  code=4 img=0 toc=4 | 约1分钟
render errors: 0
```

另做了源文 → 新文的逐字比对（CJK 字符集 + 代码块内容 + 公式块内容）：

- 代码块：仅 Lua 篇注释笔误 `-- tabel 赋值` 修正为 `-- table 赋值`；控制台示例末尾的空白行被去掉；其余代码块与源文逐字一致
- 公式块：angular 篇 10 个 `$$...$$` 全部保留（仅把 `$$即 R=...$$` 的中文「即」移到公式外、两处句中公式独立成块）；kalman 篇公式为原文纯文本记号，原样保留
- 删除的 CJK 仅来自：重复标题 / 「返回主页」链接 / 中文图片文件名（改为 ASCII 后 alt 仍保留）

三张图片用 SHA256 逐一比对，与 `blog/` 源图完全一致。

再用站点自带的 KaTeX（`assets/vendor/katex`）把每个 `$...$` / `$$...$$` 逐个解析一遍，确认浏览器端能渲染：

```text
$ node C:\Dev\Agents\_katex_check.mjs
OK   angular-displacement-math.md: 36 个公式全部可被 KaTeX 解析
OK   bresenham-line.md: 0 个公式全部可被 KaTeX 解析
OK   kalman-filter.md: 0 个公式全部可被 KaTeX 解析
OK   learn-lua-basic-01.md: 0 个公式全部可被 KaTeX 解析
OK   python-turtle.md: 0 个公式全部可被 KaTeX 解析

共 36 个公式，KaTeX 解析失败 0 个
```

> 说明：`build.mjs` 已于 10:44 成功读取本目录并生成 `blog/index.html` + 5 个 `blog/<slug>/index.html`（归档页 5 篇齐全、图片路径解析正确）。但那次构建早于本文件的最后两处文字修订（bresenham 补齐「当前一项的」、python-turtle 补回开头一句），**最终交付前请再跑一次 `node tools/build.mjs`**。

## 六、未做与交接

- `blog/` 原目录未改动，其删除、旧链接 301 跳转、月度归档页由 Lead 统一处理
- 未执行 git add/commit/push
- 图片目录结构：`content/images/posts/<slug>/`，构建脚本复制到 `assets/img/posts/<slug>/`
