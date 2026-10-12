/* popup.js —— 工具栏弹窗 */

const $ = (id) => document.getElementById(id);
let activeTabId = null;

const setStatus = (text) => {
  $("status").textContent = text;
};

async function refresh() {
  const stored = await chrome.storage.local.get({ enabled: true, focusExisting: false, rules: [] });
  $("enabled").checked = stored.enabled !== false;
  $("focusExisting").checked = stored.focusExisting === true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab ? tab.id : null;
  if (activeTabId == null) {
    setStatus("没有可用的标签页。");
    $("convert").disabled = true;
    return;
  }

  const probe = await chrome.runtime.sendMessage({ type: "probe-tab", tabId: activeTabId }).catch(() => null);
  if (!probe) {
    setStatus("后台脚本未响应，请到扩展页重新加载一次。");
    $("convert").disabled = true;
    return;
  }

  const lines = [probe.url || "(空)"];
  if (probe.rule) {
    const name = probe.rule.note ? `${probe.rule.note} ` : "";
    lines.push(`命中规则：${name}[${LAW.matchTypeOf(probe.rule.match).short}] ${probe.rule.pattern}`);
  } else {
    lines.push("未命中任何规则");
  }
  if (probe.inPopup) lines.push("当前已在独立窗口中");
  if (probe.enabled === false) lines.push("（自动转换已关闭）");

  setStatus(lines.join("\n"));
  $("convert").disabled = !probe.rule || probe.inPopup;
}

$("enabled").addEventListener("change", async () => {
  await chrome.storage.local.set({ enabled: $("enabled").checked });
  refresh();
});

$("focusExisting").addEventListener("change", async () => {
  await chrome.storage.local.set({ focusExisting: $("focusExisting").checked });
});

$("convert").addEventListener("click", async () => {
  if (activeTabId == null) return;
  $("convert").disabled = true;
  setStatus("正在转换…");
  const res = await chrome.runtime.sendMessage({ type: "detach-tab", tabId: activeTabId }).catch(() => null);
  const map = {
    moved: "已转换为独立窗口。",
    rebuilt: "已转换为独立窗口。",
    "focused-existing": "已聚焦到已有的同址独立窗口。",
    "already-popup": "当前已经是独立窗口。",
    "not-target": "当前页面未命中规则。",
    "no-tab": "标签页已关闭。",
    busy: "正在处理，请稍候。",
    "create-failed": "创建独立窗口失败，请查看扩展的错误页。",
  };
  setStatus(map[res && res.reason] || `结果：${(res && res.reason) || "未知"}`);
});

$("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

refresh();
