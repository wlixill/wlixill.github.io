# wlixill · 个人博客 + 工具箱

> 一个纯静态的个人站点：写调试笔记，也放 13 件顺手的本地工具。
> 深/浅双主题，全屏动态背景（视频壁纸）+ 玻璃质感，可一键关闭。

- 线上原版（改版前）：<https://particle-desk-wlixill.stormy-scout-9613.chatgpt.site>
- 本地预览：`python3 -m http.server 4321` → <http://127.0.0.1:4321/>

## 站点结构

| 路由 | 内容 |
| --- | --- |
| `#/` | 博客首页：自我介绍 + 最新 4 篇文章 + 工具箱入口 |
| `#/posts` | 全部文章，按时间倒序，可按标签筛选（`#/posts/调试`） |
| `#/post/<slug>` | 文章详情，Markdown 渲染，上一篇 / 下一篇 |
| `#/tools` | 工具箱：13 件工具，按分类筛选 |
| `#/tools/<id>` | 单个工具（`json`、`video`、`timer` …） |
| `#/about` | 关于我 |

旧的 `#/json` 这类链接会自动跳到 `#/tools/json`。

## 写一篇新文章

1. 在 `content/posts/` 新建一个 `.md`，文件名就是 URL 里的 slug，例如 `my-debug-story.md`。
2. 顶部写 front matter：

```markdown
---
title: 一次 letterbox 逆变换的复盘
date: 2026-05-20
summary: 一句话摘要，会出现在列表和卡片里。
tags: [YOLO, 调试]
featured: false
---

正文用 Markdown 写……
```

3. 生成索引：

```bash
node dev/build-posts.mjs
```

4. 刷新页面即可。索引写到 `content/posts.json`，按日期倒序排列，阅读时间自动算。

**支持的 Markdown**：标题（`##` / `###`）、段落、列表、引用、表格、分割线、围栏代码块（带语言标签和复制按钮）、行内代码 / 粗体 / 斜体 / 链接 / 图片。不需要安装任何依赖。

## 目录结构

```
redesign/
├── index.html                 # 单页骨架
├── content/
│   ├── posts/*.md             # 文章源文件（Markdown + front matter）
│   ├── posts.json             # 由 dev/build-posts.mjs 生成的索引
│   ├── repos.json             # 关于页「开源」列表（可由 dev/fetch-github.mjs 更新）
│   └── profile.json           # 昵称 / 头像 / GitHub 链接（同步脚本生成）
├── assets/
│   ├── app.css                # 设计系统 + 博客 + 工具组件样式
│   ├── app.js                 # 路由、主题、背景、导航、命令面板、各页面
│   ├── markdown.js            # 极简 Markdown 渲染器 + 代码复制
│   ├── tools.js               # 13 个工具的元数据与 12 个轻量工具实现
│   ├── video.js               # 视频转码（ffmpeg.wasm 集成）
│   ├── ui.js                  # toast / 复制 / JSON 高亮 / 小工具函数
│   ├── icons.js               # 内联 SVG 图标集
│   ├── img/                   # 头像（avatar.jpg）、旧版头像、favicon
│   ├── bg/                    # 动态背景：stormlight-fields.mp4（440 KB）+ 海报
│   └── sample/demo.mp4        # 「试用示例」用的 5 秒样例
├── vendor/media-engine/       # ffmpeg.wasm 0.12（本地自托管，约 31 MB）
├── preview/                   # 截图
├── dev/                       # 文章索引脚本 + 回归脚本
├── DESIGN.md                  # 设计说明
└── PORTING.md                 # 想让 ChatGPT 把原站改成这一版时用的提示词
```

## 头像与昵称（和 GitHub 同步）

头像、昵称都来自 GitHub，由 `content/profile.json` 驱动，页面启动时读取：

```json
{ "login": "wlixill", "name": "wlixill", "avatar": "assets/img/avatar.jpg", "html_url": "https://github.com/wlixill", "bio": "" }
```

改了 GitHub 头像或昵称之后，跑一次：

```bash
node dev/fetch-github.mjs
```

它会同时更新 `content/profile.json`、下载头像到 `assets/img/avatar.jpg`、刷新 `content/repos.json`。
GitHub 上没填名字时会回退成登录名 `wlixill`。favicon 是头像缩出来的，想跟着换的话再执行一次：

```bash
ffmpeg -y -i assets/img/avatar.jpg -vf "scale=64:64:flags=lanczos" assets/img/favicon.png
```

## 关于页与 GitHub

关于页里的「开源」区块读取 `content/repos.json`，每条包含 `name / url / lang / desc / fork`。
首次或想刷新列表时：

```bash
node dev/fetch-github.mjs
```

它会抓取 `github.com/wlixill?tab=repositories` 的公开仓库，更新名称、语言和 fork 标记，
**保留你已写好的中文 `desc`**（按仓库名匹配）。没写过简介的仓库，会退回用 GitHub 上的英文描述。

首页和关于页的 GitHub 图标都指向 <https://github.com/wlixill>。

## 13 件工具

视频格式转换（19 种输出，本地 ffmpeg.wasm）、JSON 格式化、文本统计、时间戳转换、密码生成、Base64、URL 编解码、UUID、哈希、颜色转换、单位换算、计算器、专注计时。

全部在浏览器里运行，不上传任何内容。视频引擎资源已本地自托管，删掉 `vendor/media-engine/` 只影响视频工具。

## 背景

- 一段 3.9 秒循环的夜空视频（1920×1080，440 KB，`faststart`），1px 轻模糊 + 四层压暗，外壳是半透明玻璃。
- 侧栏「背景」按钮可关闭，选择写入 localStorage；关闭时视频不下载。
- 尊重 `prefers-reduced-motion`（只显示海报帧），省流模式默认关闭，切后台自动暂停。
- 换壁纸：替换 `assets/bg/` 下的 mp4 与 poster，改 `index.html` 里的 `data-src` / `poster`。

## 部署

任意静态托管（Vercel、Netlify、Cloudflare Pages、GitHub Pages、nginx…），发布 `redesign/` 目录即可。

- 必须通过 HTTP 访问：文章用 `fetch` 读取，`file://` 下会被浏览器拦截。
- `vendor/media-engine/` 约 31 MB，需随站点发布（或直接删掉，视频工具会提示引擎不可用）。
- 没有构建步骤、没有环境变量、没有服务端。

## 已验证

- 13 个工具的功能冒烟测试通过；视频转码端到端通过，输出经 `ffprobe` 校验。
- 博客首页 / 归档 / 文章渲染 / 旧链接重定向 / 命令面板搜索均有回归覆盖（`dev/test-tools.mjs`）。
- 1440 / 1100 / 820 / 390 四个宽度无横向溢出，明暗主题均检查。
