/**
 * background.js —— MV3 service worker
 *
 * 两件事：
 *   1. 新建的标签页如果命中规则，就搬进 type:"popup" 独立窗口（无标签栏 / 书签栏 / 地址栏）
 *   2. 命中的网址如果配了图标，就替换页面 favicon（需要该站点的 host 权限）
 */

importScripts("common.js");

const CANDIDATE_TTL = 60 * 1000; // 新标签页创建后多久内仍算「新建」
const candidates = new Map(); // tabId -> 创建时间
const processing = new Set(); // 防重入
const iconDone = new Map(); // tabId -> 已注入图标的 url

// ---------------------------------------------------------------- 窗口搬运

async function focusPopupWithUrl(url) {
  const target = LAW.stripHash(url);
  let wins = [];
  try {
    wins = await chrome.windows.getAll({ populate: true });
  } catch {
    return false;
  }
  for (const w of wins) {
    if (w.type !== "popup") continue;
    for (const t of w.tabs || []) {
      if (t.url && LAW.stripHash(t.url) === target) {
        try {
          await chrome.windows.update(w.id, { focused: true, drawAttention: true });
        } catch {
          /* 忽略 */
        }
        return true;
      }
    }
  }
  return false;
}

async function detachTab(tabId, state) {
  if (processing.has(tabId)) return { ok: false, reason: "busy" };
  processing.add(tabId);
  try {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return { ok: false, reason: "no-tab" };
    }

    let win = null;
    try {
      win = await chrome.windows.get(tab.windowId);
    } catch {
      /* 窗口可能刚好关了 */
    }
    // 已经在独立窗口里 —— 保证弹窗内刷新 / 跳转不会被再搬一次
    if (win && win.type === "popup") return { ok: false, reason: "already-popup" };

    const url = tab.url || tab.pendingUrl || "";
    if (!LAW.firstMatch(state.rules, url)) return { ok: false, reason: "not-target" };

    if (state.focusExisting && (await focusPopupWithUrl(url))) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        /* 忽略 */
      }
      return { ok: true, reason: "focused-existing" };
    }

    const width = LAW.clamp(state.width, 320, 4000, 1280);
    const height = LAW.clamp(state.height, 240, 4000, 860);
    const focused = !!state.focusNewWindow;

    // 首选整体搬运：保留前进 / 后退历史，不重新请求
    let created = null;
    try {
      created = await chrome.windows.create({ tabId, type: "popup", width, height, focused });
    } catch {
      created = null;
    }
    if (created && created.type === "popup") {
      injectIcon(tabId, url);
      return { ok: true, reason: "moved" };
    }

    // 兜底：极少数 Chromium 分支会忽略 “tabId + type:popup” 里的 type
    try {
      await chrome.windows.create({ url, type: "popup", width, height, focused });
      if (created && created.id != null) {
        try {
          await chrome.windows.remove(created.id);
        } catch {
          /* 忽略 */
        }
      } else {
        try {
          await chrome.tabs.remove(tabId);
        } catch {
          /* 忽略 */
        }
      }
      return { ok: true, reason: "rebuilt" };
    } catch (err) {
      console.warn("[本地应用窗口] 创建独立窗口失败：", err);
      return { ok: false, reason: "create-failed" };
    }
  } finally {
    setTimeout(() => processing.delete(tabId), 3000);
  }
}

// ---------------------------------------------------------------- 图标替换

/**
 * 注入到页面里的函数：把 favicon 换成自定义图标，并在页面后续改动时保持。
 * 必须自包含，不能引用外部变量。
 */
function injectFavicon(dataUrl) {
  const MARK = "data-law-icon";
  const apply = () => {
    const all = Array.from(
      document.querySelectorAll('link[rel~="icon" i], link[rel="shortcut icon" i], link[rel="apple-touch-icon" i]')
    );
    const ours = document.querySelector("link[data-law-icon]");
    const foreign = all.filter((l) => !l.hasAttribute(MARK));
    if (!foreign.length && ours && ours.getAttribute("href") === dataUrl) return;

    for (const l of foreign) l.remove();

    const el = ours || document.createElement("link");
    el.setAttribute(MARK, "1");
    el.setAttribute("rel", "icon");
    el.setAttribute("type", "image/png");
    el.setAttribute("href", dataUrl);
    if (!ours) (document.head || document.documentElement).appendChild(el);
  };

  apply();
  try {
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href", "rel"],
    });
    setTimeout(() => obs.disconnect(), 15000);
    document.addEventListener("DOMContentLoaded", apply, { once: true });
    window.addEventListener("load", apply, { once: true });
  } catch {
    /* 忽略 */
  }
}

/** 命中规则且有图标时替换页面 favicon；没有 host 权限就静默跳过 */
async function injectIcon(tabId, url) {
  if (!url || !/^https?:/i.test(url)) return;
  if (iconDone.get(tabId) === url) return;

  let state;
  try {
    state = await loadStateCached();
  } catch {
    return;
  }
  const rule = LAW.firstMatch(state.rules, url);
  if (!rule || !rule.icon) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectFavicon,
      args: [rule.icon],
      injectImmediately: true,
    });
    iconDone.set(tabId, url);
  } catch {
    /* 未授权该站点，忽略 */
  }
}

// ---------------------------------------------------------------- 状态

let stateCache = null;
async function loadStateCached() {
  if (!stateCache) stateCache = await LAW.loadState();
  return stateCache;
}
chrome.storage.onChanged.addListener(() => {
  stateCache = null;
});

async function handleCandidate(tabId) {
  const state = await loadStateCached();
  if (!state.enabled) return;
  await detachTab(tabId, state);
}

// ---------------------------------------------------------------- 事件

chrome.tabs.onCreated.addListener((tab) => {
  candidates.set(tab.id, Date.now());
  if (tab.pendingUrl || tab.url) {
    Promise.resolve().then(() => handleCandidate(tab.id));
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) iconDone.delete(tabId);

  if (candidates.has(tabId)) {
    if (Date.now() - candidates.get(tabId) > CANDIDATE_TTL) {
      candidates.delete(tabId);
    } else if (changeInfo.url) {
      handleCandidate(tabId);
    }
  }

  // 已经在独立窗口里的页面，导航 / 加载完成后补一次图标
  if ((changeInfo.url || changeInfo.status === "complete") && tab && tab.url) {
    loadStateCached()
      .then((state) => {
        if (state.enabled && LAW.firstMatch(state.rules, tab.url)) return injectIcon(tabId, tab.url);
        return undefined;
      })
      .catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  candidates.delete(tabId);
  processing.delete(tabId);
  iconDone.delete(tabId);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return undefined;

  if (msg.type === "detach-tab" && typeof msg.tabId === "number") {
    loadStateCached()
      .then((state) => detachTab(msg.tabId, state))
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, reason: String(err) }));
    return true;
  }

  if (msg.type === "probe-tab" && typeof msg.tabId === "number") {
    Promise.all([loadStateCached(), chrome.tabs.get(msg.tabId).catch(() => null)])
      .then(async ([state, tab]) => {
        const url = tab ? tab.url || tab.pendingUrl || "" : "";
        let win = null;
        try {
          win = tab ? await chrome.windows.get(tab.windowId) : null;
        } catch {
          /* 忽略 */
        }
        const rule = LAW.firstMatch(state.rules, url);
        sendResponse({
          enabled: state.enabled,
          url,
          inPopup: !!(win && win.type === "popup"),
          rule: rule ? { note: rule.note, match: rule.match, pattern: rule.pattern, hasIcon: !!rule.icon } : null,
        });
      })
      .catch((err) => sendResponse({ enabled: false, url: "", inPopup: false, rule: null, error: String(err) }));
    return true;
  }

  return undefined;
});
