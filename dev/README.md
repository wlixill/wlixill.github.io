# 本地验证脚本（可选）

这些脚本用 Chrome DevTools Protocol 驱动 headless Chrome，用来给改版做回归和截图。
日常使用不需要它们。

## 准备

```bash
# 终端 1：起本地站点
cd .. && python3 -m http.server 4321

# 终端 2：起无头 Chrome（开放 9333 调试端口）
google-chrome --headless=new --remote-debugging-port=9333 \
  --disable-gpu --no-first-run --hide-scrollbars \
  --user-data-dir=/tmp/cdp-profile about:blank

# 终端 3：跑测试
node dev/test-tools.mjs          # 12 个轻量工具 + 命令面板 + 主题 + 乱码扫描
node dev/test-blog.mjs           # 静态文章、旧链接、手机导航、全文搜索、液态玻璃
node dev/test-video.mjs          # 视频：载入示例 → 转码 → 产出文件
node dev/screenshot.mjs http://127.0.0.1:4321/ out.png 1440 full    # 整页截图
FOLD=1 THEME=light node dev/screenshot.mjs http://127.0.0.1:4321/ out.png 1440 900
```

依赖：Node 22+（内置 WebSocket）、Chrome 112+。无需 npm install。
