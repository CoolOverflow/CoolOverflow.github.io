# CoolOverflow 仓库清单（审阅用）

共 15 个公开仓库（GitHub API `public_repos` = 15，单页抓取无分页）：自研 11 个，fork 4 个；精选 featured 6 个（均为非 fork 自研）。

分类分布：游戏引擎 2 / 图形学 4 / 工具 4 / 引擎学习 3 / AI与算法 1 / 其它 1。

## 精选（featured，非 fork）

| 仓库 | 分类 | 一句话 | 星标 |
| --- | --- | --- | --- |
| [FamicomSimulator](https://github.com/CoolOverflow/FamicomSimulator) | 引擎学习 | C# 手写 6502 CPU 与 PPU，从零实现可跑测试 ROM 的 FC 模拟器 | 0 |
| [TinyRendererLearn](https://github.com/CoolOverflow/TinyRendererLearn) | 引擎学习 | 手写软件光栅化渲染器，实现 Gouraud、法线贴图与阴影贴图 | 0 |
| [ExcelAsPixelShader](https://github.com/CoolOverflow/ExcelAsPixelShader) | 图形学 | 把 Excel 单元格当像素，用 VBA 宏跑光线步进，慢到离谱 | 2 |
| [UnityParticleSystemMemoryOptimization](https://github.com/CoolOverflow/UnityParticleSystemMemoryOptimization) | 游戏引擎 | 用粒子系统池加配置类复用，压掉 Unity 粒子反复实例化的内存开销 | 12 |
| [SimpleFluidSimulation](https://github.com/CoolOverflow/SimpleFluidSimulation) | 图形学 | 用元胞自动机、SPH 与 SDF 渲染三种思路实现流体模拟 | 0 |
| [ShadertoyNNImage](https://github.com/CoolOverflow/ShadertoyNNImage) | 图形学 | 把神经网络权重翻译成 GLSL 常量，用着色器实时还原参考图 | 3 |

## 全部仓库（featured 优先，其余按推送时间倒序）

| 仓库 | 分类 | 一句话 | 星标 | 类型 | 备注 |
| --- | --- | --- | --- | --- | --- |
| [FamicomSimulator](https://github.com/CoolOverflow/FamicomSimulator) | 引擎学习 | C# 手写 6502 CPU 与 PPU，从零实现可跑测试 ROM 的 FC 模拟器 | 0 | 自研 | — |
| [TinyRendererLearn](https://github.com/CoolOverflow/TinyRendererLearn) | 引擎学习 | 手写软件光栅化渲染器，实现 Gouraud、法线贴图与阴影贴图 | 0 | 自研 | — |
| [ExcelAsPixelShader](https://github.com/CoolOverflow/ExcelAsPixelShader) | 图形学 | 把 Excel 单元格当像素，用 VBA 宏跑光线步进，慢到离谱 | 2 | 自研 | — |
| [UnityParticleSystemMemoryOptimization](https://github.com/CoolOverflow/UnityParticleSystemMemoryOptimization) | 游戏引擎 | 用粒子系统池加配置类复用，压掉 Unity 粒子反复实例化的内存开销 | 12 | 自研 | — |
| [SimpleFluidSimulation](https://github.com/CoolOverflow/SimpleFluidSimulation) | 图形学 | 用元胞自动机、SPH 与 SDF 渲染三种思路实现流体模拟 | 0 | 自研 | — |
| [ShadertoyNNImage](https://github.com/CoolOverflow/ShadertoyNNImage) | 图形学 | 把神经网络权重翻译成 GLSL 常量，用着色器实时还原参考图 | 3 | 自研 | — |
| [claude-code](https://github.com/CoolOverflow/claude-code) | 工具 | Claude Code 公开源码快照的镜像，供供应链与安全研究 | 0 | fork | fork 自 ultraworkers/claw-code |
| [CoolOverflow.github.io](https://github.com/CoolOverflow/CoolOverflow.github.io) | 其它 | 个人技术博客，记录游戏开发与图形学的学习笔记与踩坑 | 0 | 自研 | — |
| [3D_ChineseInkPaintingStyleShader_URP](https://github.com/CoolOverflow/3D_ChineseInkPaintingStyleShader_URP) | 图形学 | URP 下的 3D 中国水墨风渲染，描边与分层墨色做出宣纸质感 | 0 | fork | fork 自 sacshadow/3D_ChineseInkPaintingStyleShader |
| [FromPaper](https://github.com/CoolOverflow/FromPaper) | AI与算法 | 读论文就动手复现：Marching Cubes 等值面与 Perlin 噪声 | 0 | 自研 | — |
| [ChatGPTBotInFlutter](https://github.com/CoolOverflow/ChatGPTBotInFlutter) | 工具 | Flutter 写的 ChatGPT 聊天客户端，填入 API Key 即可对话 | 0 | 自研 | ⚠ 介绍为推断 |
| [CSharpPersudoRandom](https://github.com/CoolOverflow/CSharpPersudoRandom) | 工具 | 可按索引取值的伪随机数，任意下标都能复现同一随机序列 | 0 | 自研 | — |
| [cpp-game-engine-book](https://github.com/CoolOverflow/cpp-game-engine-book) | 引擎学习 | 《游戏引擎浅入浅出》配套代码，从 OpenGL 搭到骨骼动画 | 0 | fork | fork 自 ThisisGame/cpp-game-engine-book |
| [LitJsonPolymorphism](https://github.com/CoolOverflow/LitJsonPolymorphism) | 工具 | 给 LitJson 补上多态支持，反序列化时自动还原具体子类 | 3 | 自研 | — |
| [xLua](https://github.com/CoolOverflow/xLua) | 游戏引擎 | 腾讯开源的 Unity/C# Lua 热更新方案，支持多平台与热补丁 | 0 | fork | fork 自 Tencent/xLua |

## 说明与待确认

- 分类字符串按任务发起人最新要求使用「AI与算法」；task-2 描述里写的是「AI/算法」，若站点代码按后者过滤需统一。
- fork 仓库（claude-code、3D_ChineseInkPaintingStyleShader_URP、cpp-game-engine-book、xLua）全部保留并标 `fork: true`，按规则不进入 featured。
- `3D_ChineseInkPaintingStyleShader_URP` 的 fork 源为 `sacshadow/3D_ChineseInkPaintingStyleShader`，仓库内有作者自己的效果截图与后续改动；个人画像里把“Unity URP 中国水墨风 shader”列为代表作，若确认主体是本人改写可改判自研并考虑精选，需人工确认。
- `claude-code` 是 `ultraworkers/claw-code` 的镜像 fork（Claude Code 源码快照，用于安全研究），按 fork 处理，不展示为精选。
- `FromPaper/RRDCT` 只提交了空类骨架，该仓库实质内容是 MarchingCubes 与 PerlinNoise 两个复现，介绍按实际内容写。
- `PowerShell curl.exe` 在本机 schannel TLS 失败（SEC_E_NO_CREDENTIALS），改用 node 原生 fetch 抓取成功；无 token，故私有仓库不可见（public_repos 已为 15，应无遗漏）。
- 介绍为推断（原仓库 description 为空，按仓库名 + 语言 + README 推断）：`ChatGPTBotInFlutter`。
