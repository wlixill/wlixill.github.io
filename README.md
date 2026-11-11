# wlixill · 个人博客 + 工具箱

> 一个纯静态的个人站点：写调试笔记，也放 13 件顺手的本地工具。
> 深/浅双主题，全屏动态背景（视频壁纸）+ 玻璃质感，可一键关闭。

- **线上站点：<https://wlixill.github.io/>**（GitHub Pages，仓库 <https://github.com/wlixill/wlixill.github.io>）
- 本地预览：`python3 -m http.server 4321` → <http://127.0.0.1:4321/>
- 最早的原版（ChatGPT 生成）：<https://particle-desk-wlixill.stormy-scout-9613.chatgpt.site>

## 站点结构

| 路由 | 内容 |
| --- | --- |
| `/` 或 `/#/` | 博客首页：自我介绍、精选文章、最新 4 篇文章和工具箱入口 |
| `/posts/` 或 `/#/posts` | 全部文章；启用 JavaScript 后可按标签筛选（`/#/posts/调试`） |
| `/posts/<slug>/` | 独立文章页面，含正文、上一篇 / 下一篇和分享元信息 |
| `/#/tools` | 工具箱：13 件工具，按分类筛选 |
| `/#/tools/<id>` | 单个工具（`json`、`video`、`timer` …） |
| `/#/about` | 关于我 |

旧的 `/#/post/<slug>` 会在启用 JavaScript 时跳转到对应的 `/posts/<slug>/`；旧的 `/#/json` 会跳到 `/#/tools/json`。文章正文与 `/posts/` 归档无需 JavaScript，工具、搜索和标签筛选需要 JavaScript。

## 写一篇新文章

1. 在 `content/posts/` 新建一个 `.md`，文件名就是 URL 里的 slug，例如 `my-debug-story.md` → `/posts/my-debug-story/`。slug 使用小写英文字母、数字和单个连字符。
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

3. 每次新增或修改文章、修改 `index.html` 页面骨架或 Markdown 渲染器后，运行构建（Node.js 22+，无需 npm 安装）：

```bash
node dev/build-posts.mjs
```

4. 本地通过 HTTP 预览，检查生成结果，并将源文件及生成物一起纳入待发布改动：
   - `content/posts.json`：日期倒序索引、阅读时间和去掉 front matter 的正文搜索文本 `searchText`（包括代码）。
   - `posts/index.html` 和 `posts/<slug>/index.html`：静态归档和每篇文章的完整初始正文、独立标题、摘要、canonical、Open Graph/Twitter 信息。
   - `sitemap.xml` 和 `robots.txt`：供搜索引擎发现首页、归档和文章。

构建直接复用浏览器的 Markdown 渲染器，结果不依赖构建时间。部署使用现成生成物，GitHub Pages 不会自动执行这个脚本；只提交 Markdown 不会更新线上文章页。`index.html` 中的 `PAGE_META` 和 `STATIC_VIEW` 注释是模板标记，请保留。生成文件请勿手改；重命名或删除文章后，脚本不会自动删除旧 slug 目录，请先确认内容归属再手动移除过期生成页。

当前 canonical、分享图片和 sitemap 指向 `https://wlixill.github.io/`。如果域名或部署根路径改变，需同时更新 `dev/build-posts.mjs` 的 `siteUrl` 和首页 `index.html` 的元信息，再重新构建。

**支持的 Markdown**：标题（`##` / `###`）、段落、列表、引用、表格、分割线、围栏代码块（带语言标签和复制按钮）、行内代码 / 粗体 / 斜体 / 链接 / 图片。文章间可用 `/posts/<slug>/`；文章里的相对资源路径以站点根为基准。

## 目录结构

```
redesign/
├── index.html                 # 首页和静态页面骨架
├── posts/                     # 构建生成：静态归档和每篇文章 HTML
├── sitemap.xml, robots.txt    # 构建生成：搜索引擎发现入口
├── content/
│   ├── posts/*.md             # 文章源文件（Markdown + front matter）
│   ├── posts.json             # 由 dev/build-posts.mjs 生成的索引
│   ├── repos.json             # 关于页「开源」列表（可由 dev/fetch-github.mjs 更新）
│   └── profile.json           # 昵称 / 头像 / GitHub 链接（同步脚本生成）
├── assets/
│   ├── app.css                # 设计系统 + 博客 + 工具组件样式
│   ├── app.js                 # 路由、主题、背景、导航、命令面板、各页面
│   ├── liquid-glass.css/js    # 不拦截操作的液态玻璃鼠标跟随
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
├── dev/                       # 静态文章构建脚本 + 回归脚本
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

- 一段 3.9 秒循环的夜空视频（1920×1080，440 KB，`faststart`），轻模糊 + 压暗，外壳是半透明玻璃。
- 侧栏背景按钮可关闭，选择写入 localStorage；关闭时视频不下载。触屏设备首次访问默认显示静态海报；先关闭背景、再开启即可主动启用动态视频。
- 尊重 `prefers-reduced-motion`（只显示海报帧），省流模式默认关闭，切后台自动暂停。
- 换壁纸：替换 `assets/bg/` 下的 mp4 与 poster，改 `index.html` 里的 `data-src` / `poster`。

## 液态玻璃鼠标

桌面鼠标移动时出现一枚带微弱折射、惯性与点击形变的玻璃镜片；它不替换系统光标，也不会拦截点击。触屏或手写笔不启用；系统启用减少动态效果或强制颜色模式时自动关闭，输入文字时自动淡化。浏览器不支持 SVG 背景折射时使用轻模糊作为回退。

## 部署

当前部署在 **GitHub Pages**：仓库 `wlixill.github.io`，`main` 分支根目录。发布前先在本地执行 `node dev/build-posts.mjs`，检查并包含文章源文件及静态生成物；Pages 直接发布仓库文件，不负责运行构建。

也可以在其他静态托管（Vercel、Netlify、Cloudflare Pages、nginx…）发布这个目录；更换域名或根路径时先按上文更新 canonical 配置并重新构建。

- 请通过 HTTP 预览：JavaScript 模块和数据请求在 `file://` 下可能被浏览器拦截。静态文章正文不依赖 `fetch`。
- `vendor/media-engine/` 约 31 MB，需随站点发布（或直接删掉，视频工具会提示引擎不可用）。
- 部署后不需要 npm 依赖或服务端；文章发布前需要本地生成静态文件。

## 已验证

- 13 个工具的功能冒烟测试通过；视频转码端到端通过，输出经 `ffprobe` 校验。
- 博客静态文章、旧链接、全文搜索、手机导航和液态玻璃效果有浏览器回归覆盖（`dev/test-blog.mjs`）；工具箱使用 `dev/test-tools.mjs`。
- 1440 / 1100 / 820 / 390 四个宽度无横向溢出，明暗主题均检查。
