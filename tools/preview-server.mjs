/**
 * 本地测试页：用来验证扩展是否正确接管。
 *
 * 用法：node tools/preview-server.mjs [端口]
 * 然后浏览器访问 http://127.0.0.1:5599
 *
 * 页面里有三种验证方式：
 *   1. 点击「新标签页打开」链接（target="_blank"）
 *   2. 点击「window.open 打开」按钮
 *   3. 直接在地址栏重新输入该地址（属于新建标签页场景）
 * 前两种都应该弹出一个无书签栏、无地址栏的独立窗口。
 */

import { createServer } from "node:http";

const PORT = Number(process.argv[2] || 5599);

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>本地应用窗口 · 测试页</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         font:15px/1.7 "Segoe UI","Microsoft YaHei",system-ui,sans-serif;
         background:#2563eb; color:#fff; }
  .card { width:min(560px,90vw); padding:28px 30px; border-radius:16px;
          background:rgba(255,255,255,.12); backdrop-filter:blur(6px);
          border:1px solid rgba(255,255,255,.25); }
  h1 { margin:0 0 6px; font-size:22px; }
  p { margin:6px 0; }
  .muted { opacity:.8; font-size:13px; }
  a, button { display:inline-block; margin:6px 8px 0 0; padding:9px 16px; border-radius:9px;
              font:inherit; text-decoration:none; cursor:pointer;
              background:#fff; color:#1d4ed8; border:1px solid transparent; }
  button.ghost { background:transparent; color:#fff; border-color:rgba(255,255,255,.6); }
  code { background:rgba(0,0,0,.22); padding:1px 6px; border-radius:5px; }
</style>
</head>
<body>
  <div class="card">
    <h1>本地应用窗口 · 测试页</h1>
    <p>本页运行在 <code>http://127.0.0.1:${PORT}</code>，应当被扩展接管。</p>
    <p class="muted">请用下面两种方式打开：期望结果是一个没有标签栏、没有书签栏、没有地址栏的独立窗口。</p>
    <a href="/?opened=blank" target="_blank">新标签页打开（target=_blank）</a>
    <button class="ghost" onclick="window.open('/?opened=window.open','_blank','width=1280,height=860')">window.open 打开</button>
    <p class="muted" style="margin-top:18px">
      若弹出的是普通带地址栏的标签页，说明扩展未加载，或当前地址不在匹配列表里。
    </p>
  </div>
</body>
</html>
`;

createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(html);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`测试页已启动：http://127.0.0.1:${PORT}`);
  console.log("按 Ctrl+C 停止。");
});
