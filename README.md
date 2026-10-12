# 本地应用窗口 · Local App Window

按自定义规则，把指定网址自动打开成**无标签栏 / 无书签栏 / 无地址栏**的独立窗口 —— 观感接近应用界面，但它仍然是普通浏览器窗口，不是 PWA、不是打包应用。

当前版本 **2.0.0** · Chrome / Edge · Manifest V3 · 无网络请求 · **免费分享 · 禁止转售** · [更新日志](CHANGELOG.md)

> **免责声明**：本扩展按「原样」提供。使用导致的任何后果（浏览器异常、设置被改、
> 数据丢失、系统故障等）**由使用者自行承担**，作者不承担任何责任。请自行备份浏览器配置。
> 完整条款见 [授权条款](LICENSE)。

---

## 目录

- [它做什么](#它做什么)
- [安装](#安装)
- [使用](#使用)
- [匹配方式](#匹配方式)
- [关于图标（重要，请先读）](#关于图标重要请先读)
- [如果想在任务栏显示自己的图标](#如果想在任务栏显示自己的图标)
- [已知限制](#已知限制)
- [开发](#开发)
- [English](#english)

---

## 它做什么

| 能力 | 说明 |
| --- | --- |
| **多条规则** | 从上到下依次匹配，第一条命中即生效 |
| **5 种匹配方式** | 主机 / 前缀（部分）/ 包含（部分）/ 完全 / 正则 |
| **自动转换** | 新建的标签页命中规则，自动搬进独立窗口，原位置不留残页 |
| **每条规则独立图标** | 上传一张图片，自动缩放成 64×64 的 PNG 并应用到该网址 |
| **手动转换** | 工具栏弹窗里一键把当前标签页变成独立窗口 |
| **状态可见** | 弹窗里直接显示当前页命中了哪条规则 |
| **隐私** | 没有网络请求、没有埋点、没有内容脚本常驻，配置只存在 `chrome.storage.local` |

窗口用的是 Chromium 的 `type: "popup"` 窗口类型 —— 这一类型本身就不渲染标签栏、书签栏和地址栏。
打开方式是**整体搬运已有标签页**（`chrome.windows.create({ tabId, type: "popup" })`），
保留前进 / 后退历史，不会重新发起请求。

---

## 安装

还没有上架商店，用「加载已解压的扩展程序」安装，30 秒搞定。

**方式一（推荐，只装插件）**：到 [Releases](https://github.com/kan2053/local-app-window/releases/latest) 下载 `local-app-window-v2.0.0.zip`，解压得到一个含 `manifest.json` 的文件夹。

**方式二（含开发工具）**：`Code` → `Download ZIP` 下载整个仓库，解压后进入 `local-app-window/` 子目录。

然后：

1. 打开扩展管理页：
   - Chrome：地址栏输入 `chrome://extensions`
   - Edge：地址栏输入 `edge://extensions`
2. 打开 **开发者模式**。
3. 点 **加载已解压的扩展程序**，选择含 `manifest.json` 的那一层目录。
4. 建议点 **固定**，把图标放到工具栏。

---

## 使用

点扩展图标 → **打开设置**，即可编辑规则。

### 规则表

| 列 | 说明 |
| --- | --- |
| 启用 | 单独关闭某条规则 |
| 匹配方式 | 见下一节 |
| 网址 / 片段 | 要匹配的内容，写法随匹配方式变化 |
| 备注 | 只是给你自己看的名字，弹窗里会显示 |
| 图标 | 上传一张图片；「清除」回到网站原本的图标 |

改完点 **保存**。默认自带两条规则：`127.0.0.1` 和 `localhost`（主机匹配）。

### 工具栏弹窗

- 开关「自动以独立窗口打开」
- 开关「同址窗口已存在时聚焦它」
- 显示当前页面的网址命中了哪条规则
- **把当前标签页变成独立窗口**：对已打开的老页面手动转一次

> 扩展只接管**新建**的标签页。安装扩展之前就已经开着的页面不会自动搬家，
> 用弹窗里那个按钮手动转一次即可。

---

## 匹配方式

| 方式 | 规则 | 例子 |
| --- | --- | --- |
| **主机匹配** | 只比主机名和端口，路径随意 | `127.0.0.1:3000` 命中 `http://127.0.0.1:3000/any/path`。不写端口就是该主机的所有端口 |
| **前缀匹配**（部分） | 网址以该片段开头 | `http://localhost:8080/admin` |
| **包含匹配**（部分） | 网址里出现该片段就算命中 | `192.168.1.10`、`/go/prod` |
| **完全匹配** | 整个网址完全相同 | `http://localhost:3000/console` |
| **正则匹配**（高级） | JavaScript 正则，不区分大小写 | `^https?://(\d+\.){3}\d+:5173/` |

几条约定：

- 不写协议时会自动按 `http://` 补全，所以 `127.0.0.1:3000` 和 `http://127.0.0.1:3000` 等价。
- **完全匹配**忽略协议、`#锚点`、末尾斜杠和大小写，但**查询参数要一致** ——
  `http://a/b` 不会命中 `http://a/b?x=1`，要宽松就用前缀匹配。
- **前缀匹配**同时对比「带协议」和「不带协议」两种写法，所以 `localhost/api` 也能匹配 `https://localhost/api/x`。
- 规则顺序就是优先级，第一条命中即生效。

---

## 关于图标（重要，请先读）

**扩展无法设置窗口的任务栏图标。这是 Chromium 平台限制，不是本扩展没做。**

Manifest V3 里**不存在**任何可以设置「窗口图标 / 任务栏图标」的 API：

- `chrome.windows.create()` 和 `chrome.windows.update()` 的参数里都没有 `icon` 字段；
- `chrome.action.setIcon()` 改的是**工具栏上那个扩展按钮**的图标，和窗口 / 任务栏无关；
- Windows 的任务栏按钮图标由窗口的 **AppUserModelID** 决定。`type: "popup"` 的窗口属于 Chrome 自己的
  AUMID 域，必然并入 Chrome 的任务栏分组、显示 Chrome 图标 —— 只有 `--app=` 启动的应用窗口
  才会拿到独立 AUMID 和独立图标。

所以本扩展做的图标功能是**替换页面 favicon**（`<link rel="icon">`）。它的实际效果：

| 位置 | 效果 |
| --- | --- |
| 普通标签页的标签图标 | ✅ 会变 |
| 独立窗口（popup）内的显示 | ⚠️ popup 没有标签栏；任务栏 / 标题栏是否跟着变，**取决于 Chromium 版本**，不同版本表现不一致 |
| 任务栏图标 | ❌ 不会变 |

**结论**：把图标当成「让这个网址在标签体系里更好认」的功能来用，别指望它改任务栏。
需要真正的任务栏自定义图标，走下一节。

申请图标权限时的说明：图标功能需要该站点的访问权限，保存时会自动弹窗申请。
**拒绝授权不影响其他功能** —— 规则照常生效，只是图标不应用。不配图标的规则永远不会申请任何站点权限。

---

## 如果想在任务栏显示自己的图标

只有一条路真的可行：**用 `chrome.exe --app=<网址>` 的快捷方式启动，并在快捷方式上指定 `.ico`**。
因为 Windows 的任务栏图标本来就取自快捷方式的图标资源。

仓库里带了一个生成脚本：

```powershell
powershell -ExecutionPolicy Bypass -File tools\make-app-shortcut.ps1 `
    -Url "http://127.0.0.1:5599" -Name "我的后台" -Icon "D:\icons\app.ico"
```

它会自动探测 Chrome / Edge，在桌面生成一个带 `--app=` 参数和自定义图标的快捷方式。
`-Icon` 必须是 `.ico` 格式（PNG 不认）。

这条路径和本扩展**可以并存**，按需要选用：

| | 本扩展的 popup 窗口 | `--app=` 快捷方式 |
| --- | --- | --- |
| 没有标签栏 / 书签栏 / 地址栏 | ✅ | ✅ |
| 自定义任务栏图标 | ❌ | ✅ |
| 按规则自动判断，多条规则 | ✅ | ❌（一个快捷方式一个网址） |
| 需要装扩展 | ✅ | ❌ |
| 保留前进 / 后退历史 | ✅ | ✅ |

---

## 已知限制

- **任务栏图标无法自定义** —— 见上一节，平台限制。
- **窗口标题栏去不掉** —— 由操作系统绘制，扩展无权干预。
- **不接管已存在的标签页** —— 只处理「新建」的；老页面用弹窗里的按钮手动转。
- **每个新标签页一个窗口** —— 没有做「同一站点合并到一个窗口」；需要的话打开
  「同址窗口已存在时聚焦它」。
- **`file://`、`chrome://`、其它扩展页面永远不会被接管** —— 只处理 `http` / `https`。
- **不支持无痕窗口** —— 需要在扩展详情页单独勾选「在无痕模式下启用」。
- **界面目前只有中文** —— 欢迎 PR 补英文文案。
- **依赖 `type: "popup"`** —— 极少数 Chromium 分支会忽略 `tabId + type:popup` 里的 `type`，
  此时扩展会退化成「按 URL 重建独立窗口」，副作用是该页面会加载两次。

---

## 开发

```
local-app-window/
├── manifest.json                MV3 清单
├── common.js                    规则模型 + 匹配引擎 + 配置读写（SW 与页面共用）
├── background.js                service worker：窗口搬运 + 图标注入
├── popup.html / popup.js        工具栏弹窗
├── options.html / options.js    设置页
├── icons/                       扩展图标
└── tools/
    ├── make-icons.mjs           重新生成扩展图标：node tools/make-icons.mjs
    ├── preview-server.mjs       本地测试页：node tools/preview-server.mjs [端口]
    └── make-app-shortcut.ps1    生成 --app= 快捷方式
```

改动后到扩展管理页点一下 **重新加载** 即可，没有构建步骤。

调试：

- service worker 的日志在 `chrome://extensions` → 本扩展 → **Service Worker** 链接里。
- 设置页 / 弹窗页直接右键 → 检查。
- 本地测试页：`node tools/preview-server.mjs 5599`，然后访问 `http://127.0.0.1:5599`。

权限说明：

| 权限 | 用途 |
| --- | --- |
| `tabs` | 读取标签页网址，判断是否命中规则 |
| `storage` | 保存规则和设置 |
| `scripting` | 命中且配了图标时，把 favicon 换成上传的图片 |
| `optional_host_permissions` | **可选**，只在保存带图标的规则时按站点申请，被拒绝也不影响主功能 |

---

## English

**Local App Window** is a Chrome / Edge (Manifest V3) extension that opens chosen URLs in clean,
app-like popup windows — no tab strip, no bookmarks bar, no address bar.

- **Multiple rules** with five match modes: host, prefix, contains, exact, regex.
- **Newly created tabs** that match a rule are moved into their own popup window
  (`chrome.windows.create({ tabId, type: "popup" })`), preserving back/forward history.
- **Per-rule icon**: upload an image and it is applied to that site's favicon.
- No network requests, no telemetry, no always-on content scripts.

**Install (unpacked):** download the repo → `chrome://extensions` (or `edge://extensions`) →
enable *Developer mode* → *Load unpacked* → select the folder containing `manifest.json`.

**Known platform limit — please read before filing an issue:**
an extension **cannot** set a window's taskbar icon. Manifest V3 exposes no such API
(`chrome.windows.create/update` have no `icon` field; `chrome.action.setIcon` only changes the
toolbar button). Taskbar identity on Windows comes from the AppUserModelID, and `type: "popup"`
windows share Chrome's AUMID, so they always group under the Chrome icon.
The per-rule icon in this extension replaces the page **favicon**, which is a different thing.
For a genuine custom taskbar icon you must launch `chrome.exe --app=<url>` from a shortcut and
set the `.ico` on that shortcut — `tools/make-app-shortcut.ps1` generates one for you.

The UI is currently Chinese-only. Pull requests translating the UI are very welcome.

---

## 授权与免责

**随便用、随便改、随便分享；但严禁拿去卖钱。用出问题自己担着。**

| | |
| --- | --- |
| ✅ 可以 | 使用（含商业环境）、修改、转发分享、收录进教程或工具集 |
| ❌ 不可以 | **二次销售**（售卖 / 出租 / 付费墙 / 捆绑付费产品）、移除署名、冒充作者 |
| ⚠️ 免责 | 使用导致的任何后果（浏览器异常、设置被改、数据丢失、系统故障）**由使用者自行承担** |

本扩展会创建浏览器窗口、读取标签页地址、并可能修改网页图标（favicon），
安装前请自行评估，并做好浏览器配置与数据的备份。

完整条款：[LICENSE](LICENSE) · 英文摘要见文件末尾
