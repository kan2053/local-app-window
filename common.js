/**
 * common.js —— 规则模型 + 匹配引擎 + 配置读写
 *
 * 同时被三个环境加载：
 *   - service worker：importScripts("common.js")
 *   - 设置页 / 工具栏弹窗：<script src="common.js"></script>
 * 统一挂在 globalThis.LAW 上。
 */
(function (root) {
  "use strict";

  /** 配置结构版本；升版本时 loadState() 会做一次迁移 */
  const SCHEMA_VERSION = 2;

  const DEFAULT_RULES = [
    { match: "host", pattern: "127.0.0.1", note: "本机服务" },
    { match: "host", pattern: "localhost", note: "" },
  ];

  const DEFAULTS = {
    schemaVersion: SCHEMA_VERSION,
    enabled: true,
    focusNewWindow: true,
    focusExisting: false,
    width: 1280,
    height: 860,
  };

  /** 匹配方式；顺序就是设置页下拉框的顺序 */
  const MATCH_TYPES = [
    {
      id: "host",
      label: "主机匹配",
      short: "主机",
      hint: "只比主机名和端口，路径随意。例：127.0.0.1:3000",
      placeholder: "127.0.0.1:3000",
    },
    {
      id: "prefix",
      label: "前缀匹配（部分）",
      short: "前缀",
      hint: "网址以该片段开头。例：http://localhost:8080/admin",
      placeholder: "http://localhost:8080/admin",
    },
    {
      id: "contains",
      label: "包含匹配（部分）",
      short: "包含",
      hint: "网址里出现该片段就算命中。例：/go/prod",
      placeholder: "192.168.1.10",
    },
    {
      id: "exact",
      label: "完全匹配",
      short: "完全",
      hint: "整个网址完全相同（忽略协议、#锚点、末尾斜杠、大小写；查询参数要一致）",
      placeholder: "http://localhost:3000/console",
    },
    {
      id: "regex",
      label: "正则匹配（高级）",
      short: "正则",
      hint: "用 JavaScript 正则匹配整个网址，不区分大小写",
      placeholder: "^https?://(\\d+\\.){3}\\d+:5173/",
    },
  ];

  const MATCH_IDS = MATCH_TYPES.map((m) => m.id);

  // -------------------------------------------------------------- 小工具

  const clamp = (n, lo, hi, fallback) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.min(hi, Math.max(lo, Math.round(v)));
  };

  function uid() {
    const buf = new Uint8Array(8);
    (root.crypto || {}).getRandomValues
      ? root.crypto.getRandomValues(buf)
      : buf.forEach((_, i) => (buf[i] = Math.floor(Math.random() * 256)));
    return "r_" + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  const stripHash = (s) => String(s == null ? "" : s).replace(/#.*$/, "");

  /** 用户可以直接写 127.0.0.1:3000，这里补上协议再交给 URL 解析 */
  function withScheme(s) {
    const t = String(s == null ? "" : s).trim();
    if (!t) return "";
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : "http://" + t;
  }

  function safeUrl(s) {
    try {
      const u = new URL(String(s));
      return u.protocol === "http:" || u.protocol === "https:" ? u : null;
    } catch {
      return null;
    }
  }

  /** 取主机名：去掉 IPv6 的方括号，转小写 */
  function normalizeHost(raw) {
    let s = String(raw == null ? "" : raw).trim().toLowerCase();
    if (!s) return "";
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    s = s.split(/[/?#]/)[0];
    s = s.replace(/:\d+$/, "");
    s = s.replace(/^\[/, "").replace(/\]$/, "");
    return s;
  }

  /** 解析 "主机[:端口]"，返回 { host, port }；port 为空表示"任意端口" */
  function parseHostPort(raw) {
    let t = String(raw == null ? "" : raw).trim().toLowerCase();
    if (!t) return null;
    t = t.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    t = t.split(/[/?#]/)[0];

    let host = t;
    let port = "";
    const v6 = t.match(/^\[(.+)\](?::(\d+))?$/);
    if (v6) {
      host = v6[1];
      port = v6[2] || "";
    } else {
      const i = t.lastIndexOf(":");
      if (i > -1) {
        const maybe = t.slice(i + 1);
        if (/^\d+$/.test(maybe)) {
          host = t.slice(0, i);
          port = maybe;
        }
      }
    }
    host = normalizeHost(host);
    return host ? { host, port } : null;
  }

  function effectivePort(u) {
    if (u.port) return u.port;
    return u.protocol === "https:" ? "443" : "80";
  }

  // -------------------------------------------------------------- 规则

  function normalizeRule(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const icon = typeof r.icon === "string" && /^data:image\//i.test(r.icon) ? r.icon : "";
    return {
      id: typeof r.id === "string" && r.id ? r.id : uid(),
      enabled: r.enabled !== false,
      match: MATCH_IDS.includes(r.match) ? r.match : "host",
      pattern: String(r.pattern == null ? "" : r.pattern).trim(),
      note: String(r.note == null ? "" : r.note).trim().slice(0, 60),
      icon,
      // 图标生效站点：包含/正则匹配无法从模式推导站点时由用户显式指定
      iconSite: String(r.iconSite == null ? "" : r.iconSite).trim(),
    };
  }

  function normalizeRules(list) {
    // 不是数组 → 交给调用方走「首次安装 / 迁移」分支；是空数组 → 尊重用户清空的选择
    if (!Array.isArray(list)) return null;
    return list.map(normalizeRule).filter((r) => r.pattern || r.icon);
  }

  /** 单条规则是否命中某网址 */
  function matchRule(rule, url) {
    if (!rule || rule.enabled === false) return false;
    const target = String(url || "");
    if (!/^https?:/i.test(target)) return false;

    const pattern = String(rule.pattern || "").trim();
    if (!pattern) return false;

    const lowerUrl = target.toLowerCase();
    const bare = lowerUrl.replace(/^https?:\/\//, "");

    switch (rule.match) {
      case "regex": {
        try {
          return new RegExp(pattern, "i").test(target);
        } catch {
          return false;
        }
      }

      case "exact": {
        const canon = (s) => stripHash(s).replace(/\/+$/, "").trim().toLowerCase();
        const a = canon(target);
        return a === canon(withScheme(pattern)) || a === canon(pattern);
      }

      case "prefix": {
        const needles = [stripHash(pattern), withScheme(stripHash(pattern))]
          .map((s) => s.toLowerCase().replace(/^https?:\/\//, ""))
          .filter(Boolean);
        return needles.some((n) => bare.startsWith(n) || lowerUrl.startsWith(n));
      }

      case "contains": {
        const needles = [pattern, withScheme(pattern)]
          .map((s) => s.toLowerCase())
          .filter(Boolean);
        return needles.some((n) => lowerUrl.includes(n) || bare.includes(n));
      }

      case "host":
      default: {
        const u = safeUrl(target);
        if (!u) return false;
        const p = parseHostPort(pattern);
        if (!p) return false;
        if (normalizeHost(u.hostname) !== p.host) return false;
        return p.port ? effectivePort(u) === p.port : true;
      }
    }
  }

  /** 返回第一条命中的规则（规则顺序即优先级） */
  function firstMatch(rules, url) {
    if (!Array.isArray(rules)) return null;
    for (const r of rules) {
      if (matchRule(r, url)) return r;
    }
    return null;
  }

  function matchTypeOf(id) {
    return MATCH_TYPES.find((m) => m.id === id) || MATCH_TYPES[0];
  }

  function describeRule(rule) {
    const d = matchTypeOf(rule.match).short;
    return `${d} · ${rule.pattern}`;
  }

  // -------------------------------------------------------------- 图标站点与权限

  /**
   * 图标只能通过替换页面 favicon 实现，因此需要该站点的 host 权限。
   * 这里推导出需要申请的 origin 匹配模式（形如 http://127.0.0.1/*）。
   * 注意：Chrome 的匹配模式不含端口，所以这里也刻意去掉端口。
   * 无法推导时返回 null（例如包含匹配只写了一个片段）。
   */
  function originPatternFor(rule) {
    if (!rule || rule.enabled === false || !rule.icon) return null;

    const explicit = String(rule.iconSite || "").trim();
    if (explicit) {
      const u = safeUrl(withScheme(explicit.replace(/\*+$/, "").replace(/\/+$/, "")));
      return u ? `${u.protocol}//${u.hostname}/*` : null;
    }

    const pattern = String(rule.pattern || "").trim();
    if (!pattern) return null;
    // 这两种匹配方式推导不出确定的站点，必须由用户填「图标生效站点」
    if (rule.match === "regex" || rule.match === "contains") return null;

    const u = safeUrl(withScheme(pattern));
    return u ? `${u.protocol}//${u.hostname}/*` : null;
  }

  function originsForRules(rules) {
    const set = new Set();
    for (const r of rules || []) {
      const o = originPatternFor(r);
      if (o) set.add(o);
    }
    return Array.from(set);
  }

  // -------------------------------------------------------------- 配置读写

  async function loadState() {
    const raw = (await chrome.storage.local.get(null)) || {};

    let rules = normalizeRules(raw.rules);
    if (rules === null) {
      // v1 的 hosts 数组迁移过来；全新安装则用默认规则
      const hosts = Array.isArray(raw.hosts) && raw.hosts.length ? raw.hosts : null;
      rules = hosts
        ? hosts.map((h) => normalizeRule({ match: "host", pattern: normalizeHost(h) }))
        : DEFAULT_RULES.map((r) => normalizeRule(r));
      await chrome.storage.local.set({ schemaVersion: SCHEMA_VERSION, rules });
    } else if (raw.schemaVersion !== SCHEMA_VERSION) {
      await chrome.storage.local.set({ schemaVersion: SCHEMA_VERSION, rules });
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      enabled: raw.enabled !== false,
      focusNewWindow: raw.focusNewWindow !== false,
      focusExisting: raw.focusExisting === true,
      width: clamp(raw.width, 320, 4000, DEFAULTS.width),
      height: clamp(raw.height, 240, 4000, DEFAULTS.height),
      rules,
    };
  }

  async function saveState(state) {
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      enabled: state.enabled !== false,
      focusNewWindow: state.focusNewWindow !== false,
      focusExisting: state.focusExisting === true,
      width: clamp(state.width, 320, 4000, DEFAULTS.width),
      height: clamp(state.height, 240, 4000, DEFAULTS.height),
      rules: (state.rules || []).map(normalizeRule),
    };
    await chrome.storage.local.set(payload);
    return payload;
  }

  root.LAW = {
    SCHEMA_VERSION,
    DEFAULTS,
    DEFAULT_RULES,
    MATCH_TYPES,
    clamp,
    uid,
    stripHash,
    withScheme,
    safeUrl,
    normalizeHost,
    parseHostPort,
    normalizeRule,
    normalizeRules,
    matchRule,
    firstMatch,
    matchTypeOf,
    describeRule,
    originPatternFor,
    originsForRules,
    loadState,
    saveState,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
