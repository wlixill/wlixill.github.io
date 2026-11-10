# 想保留原网址？把这一版搬回去

有两种做法，按方便程度排序。

---

## 方案 A：直接用这套静态站点（推荐）

`redesign/` 是一个完整的静态站点，不需要 React、不需要构建。把它发布到任意静态托管，
再用自己的域名指过去即可。原来 chatgpt.site 的链接可以继续留着，也可以弃用。

```bash
cd redesign
python3 -m http.server 4321     # 本地预览
# 上线：npx vercel deploy --prod  或  netlify deploy --prod  或 推到 GitHub Pages
```

注意 `vendor/media-engine/`（约 31 MB）要一起上传，视频转码才可用。

---

## 方案 B：让 ChatGPT 在原项目里照着改

原站是 ChatGPT Sites 生成的 Next.js 项目。把下面这段提示词整段发给它，
再逐个文件对照 `redesign/` 里的实现补细节即可。

```
请在不改变任何工具功能的前提下，把「wlixill 个人站」的界面重做成下面这套设计。
要求：所有既有功能（13 个工具、/media-engine 的 ffmpeg 加载逻辑、本地处理、路由）全部保留，
只重做布局、组件结构与视觉；不要引入新的 UI 框架或网络字体。

一、信息架构
1. 桌面端：左侧固定侧栏 268px，右侧内容区（最大 1120px，居中）。
   侧栏自上而下：品牌（wlixill / NOTES & TOOLS）、用户卡（GitHub 头像 40px + 昵称 wlixill + "调试笔记 · 顺手的工具"）、
   搜索入口（⌘K）、按分类分组的工具导航（媒体处理 / 文本与开发 / 日常工具）、底部安全说明 + 主题切换。
2. 首页：问候（按时间：早上好/下午好…）+ 副标题 + 大搜索框 + 三个统计（13 件 / 0 次上传 / 100% 本地）
   + 最近使用 chips + 分类筛选胶囊 + 13 个工具网格。
   视频格式转换是唯一的重型工具，做成跨 2 列 × 2 行的主卡（≥1200px 时），其余工具等大。
3. 工具页：返回链接 + 图标 + 标题 + 一句说明 + 分类/本地处理徽章 + 工具面板 + 底部「换个工具」。
   每个工具独立路由（如 #/json）。
4. 移动端（<1024px）：侧栏改为抽屉（带关闭按钮），工具卡变为"图标 + 标题 + 一行描述 + 箭头"的紧凑列表行。
5. 去掉原来的 banner 大图、封面图、翻页器和卡片右侧的箭头轨道；头像保留。

二、设计 tokens
深色：背景 #08090c，面板 #101318 / #151922 / #1c212a，描边 rgba(255,255,255,.072)，
正文 #e9edf3，次级 #9aa5b3，弱化 #6a7686，主色 #5ce1c6（配文字色 #04231f），辅助 #8b9dff。
浅色：背景 #f5f5f2，面板 #ffffff / #f7f7f4，正文 #14171b，次级 #55606f，主色 #0f9d8a。
分类强调色：媒体 #7c9cff，文本与开发 #5ce1c6，日常 #eeb567。
圆角 7/9/12/16/20，间距按 8px 栅格，卡片只用 1px 描边 + 2~3% 顶光，不用重阴影。
字体：系统中文栈（PingFang SC / HarmonyOS Sans SC / Microsoft YaHei），
等宽只用于 JSON、哈希、时间戳、密码等数据。不要用渐变霓虹和发光按钮；
玻璃质感只用于背景视频之上的外壳层（见第四部分），内容卡片保持干净。

三、组件
- 工具卡：34px 图标片（分类色 13% 底 + 22% 描边）+ 标题 14px 600 + 描述 12px 两行截断 + 底部分类/本地处理小字；hover 上浮 2px 并显示箭头。
- 面板：1px 描边 16px 圆角；头部 46px（标题 + 操作），底部一条 note；
  文本类工具用左右两栏（原始 / 结果），移动端堆叠。
- 按钮：主按钮主色实底，次按钮面板色 + 描边，幽灵按钮无描边；高度 34px，圆角 9px。
- 输入：高 38px，聚焦时主色描边 + 3px 主色 13% 光晕。
- toast：底部居中的胶囊提示，2 秒消失。
- 命令面板：⌘K 打开，宽 560px，输入框 + 结果列表 + 键盘提示，↑↓/回车/Esc 可用。

四、背景（视频壁纸 + 玻璃）
1. 全屏背景层固定在 body 最前面，z-index 0：
   <video muted loop playsinline autoplay preload="none"
          poster="assets/bg/stormlight-fields-poster.jpg"
          data-src="assets/bg/stormlight-fields.mp4">，
   object-fit: cover，transform: scale(1.06)，filter: blur(5px) saturate(118%) brightness(.94)。
2. 上面盖一层压暗层（只读，不拦截事件）：
   纵向 linear-gradient(rgba(5,8,13,.56), rgba(5,8,13,.68) 46%, rgba(3,5,9,.9))，
   横向 linear-gradient(90deg, rgba(4,6,10,.5), rgba(4,6,10,.12) 42%, rgba(4,6,10,.22))，
   右上角径向暗角。
3. 外壳玻璃：侧栏 background 为面板色 68% + backdrop-filter: blur(18px) saturate(130%)；
   工具卡用面板色 71%（不要每张卡都加 backdrop-filter，性能会掉）；
   工具面板用面板色 85% + blur(14px)。
4. 浅色主题：视频 opacity .44、saturate(58%) brightness(1.32)，压暗层换成暖白
   rgba(246,246,243,.70/.82/.94)。
5. 侧栏底部加「背景」开关：aria-pressed 控制 html[data-bg=on|off]，关掉时背景层 opacity 0
   且不加载视频，选择存 localStorage。
6. prefers-reduced-motion 时不要 autoplay（只留海报帧、不下载视频）；
   切到后台标签页暂停；navigator.connection.saveData 为 true 时默认关闭。

五、交互
- ⌘K / Ctrl+K 命令面板；Esc 关闭弹层或回首页。
- 分类筛选、最近使用（localStorage）、明暗主题记忆（localStorage）、复制 toast。
- 所有动画在 prefers-reduced-motion 下关闭。
- 焦点可见、aria-current/aria-pressed 齐全，卡片用可点击的链接而不是 div。

六、必须保留
- /media-engine/ 的加载逻辑与路径（ffmpeg.wasm 0.12 的 manifest + parts 方案）。
- 19 种输出格式与质量/分辨率/保留音轨选项、示例视频。
- 所有工具的实际行为与文案含义，不要删功能。
- 背景视频文件在 assets/bg/（stormlight-fields.mp4 440 KB、poster 76 KB），随站点一起发布。
```

---

## 小提示

- ChatGPT 一次改不完全站，建议按「设计 tokens → 侧栏与首页 → 工具页模板 → 逐个工具」四步让它做，
  每步都先看截图再继续。
- 如果它改坏了 `/media-engine` 的加载，视频工具会报「引擎加载失败」；把 `redesign/assets/video.js`
  里的 `ensureEngine()` 整段给它对照即可。


---

## 七、最终形态：博客优先（覆盖前面的首页布局）

站点最终定位是**个人博客**，工具箱作为子页。如果照前面的提示词改，请把「一、信息架构」的第 2、3 条替换成：

```
2. 首页 = 博客首页：头像 + 一句自我介绍 + 三个入口按钮（读文章 / 逛工具箱 / 关于我）；
   下面是最新 4 篇文章的双列卡片（日期、标题、摘要、标签），再下面是工具箱子页的入口 chips。
3. 文章归档 #/posts：按时间倒序的列表行（日期 | 标题 + 摘要 | 箭头），顶部是标签筛选；
   文章详情 #/post/<slug>：标题 + 日期/阅读时长/标签 + 正文（820px 居中玻璃纸面板）+ 上一篇/下一篇。
4. 工具箱 #/tools：原来的 13 个工具网格，保留分类筛选；单个工具走 #/tools/<id>，旧的 #/json 自动跳转。
5. 关于 #/about：自我介绍 + 站点说明 + 写作原则。
```

内容用 Markdown 维护：`content/posts/*.md`（front matter：title / date / summary / tags），
`node dev/build-posts.mjs` 生成 `content/posts.json` 索引；前端用 `fetch` 读取并用一个极简
Markdown 渲染器（支持标题、列表、引用、表格、代码块、行内格式）显示。不引入任何第三方库。

没有文章时首页会空空如也，务必保留至少 3–4 篇真实文章再上线。
