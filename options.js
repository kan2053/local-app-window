/* options.js —— 规则编辑：读表 → 申请权限 → 保存 */

const $ = (id) => document.getElementById(id);
const tbody = $("rules");
const msg = $("msg");

let rules = [];

// ---------------------------------------------------------------- 图标

/** 把选的图片等比缩放成 64×64 PNG data URL */
function fileToIcon(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const S = 64;
        const canvas = document.createElement("canvas");
        canvas.width = S;
        canvas.height = S;
        const ctx = canvas.getContext("2d");
        const scale = Math.min(S / img.width, S / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------- 渲染

function render() {
  tbody.textContent = "";

  rules.forEach((rule, i) => {
    const tr = document.createElement("tr");

    const tdEnabled = document.createElement("td");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = rule.enabled !== false;
    cb.addEventListener("change", () => {
      rule.enabled = cb.checked;
    });
    tdEnabled.appendChild(cb);

    const tdMatch = document.createElement("td");
    const sel = document.createElement("select");
    sel.innerHTML = LAW.MATCH_TYPES.map(
      (m) => `<option value="${m.id}"${m.id === rule.match ? " selected" : ""}>${m.label}</option>`
    ).join("");
    sel.addEventListener("change", () => {
      rule.match = sel.value;
      pat.placeholder = LAW.matchTypeOf(rule.match).placeholder;
    });
    tdMatch.appendChild(sel);

    const tdPat = document.createElement("td");
    tdPat.className = "pat";
    const pat = document.createElement("input");
    pat.type = "text";
    pat.value = rule.pattern;
    pat.placeholder = LAW.matchTypeOf(rule.match).placeholder;
    pat.spellcheck = false;
    pat.addEventListener("input", () => {
      rule.pattern = pat.value;
    });
    tdPat.appendChild(pat);

    const tdNote = document.createElement("td");
    tdNote.className = "note";
    const note = document.createElement("input");
    note.type = "text";
    note.value = rule.note || "";
    note.placeholder = "可选";
    note.addEventListener("input", () => {
      rule.note = note.value;
    });
    tdNote.appendChild(note);

    const tdIcon = document.createElement("td");
    const cell = document.createElement("div");
    cell.className = "icon-cell";

    const preview = document.createElement("img");
    preview.alt = "";
    if (rule.icon) preview.src = rule.icon;
    else preview.style.visibility = "hidden";

    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      try {
        rule.icon = await fileToIcon(f);
        preview.src = rule.icon;
        preview.style.visibility = "visible";
        pick.textContent = "换图";
      } catch {
        msg.textContent = "图片处理失败，换一张试试。";
      }
    });

    const pick = document.createElement("button");
    pick.type = "button";
    pick.textContent = rule.icon ? "换图" : "选图";
    pick.addEventListener("click", () => file.click());

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "link";
    clear.textContent = "清除";
    clear.addEventListener("click", () => {
      rule.icon = "";
      preview.removeAttribute("src");
      preview.style.visibility = "hidden";
      pick.textContent = "选图";
    });

    cell.append(preview, pick, clear, file);
    tdIcon.appendChild(cell);

    const tdDel = document.createElement("td");
    tdDel.className = "row-actions";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "link";
    del.textContent = "删除";
    del.addEventListener("click", () => {
      rules.splice(i, 1);
      render();
    });
    tdDel.appendChild(del);

    tr.append(tdEnabled, tdMatch, tdPat, tdNote, tdIcon, tdDel);
    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------------------- 存取

function fill(state) {
  $("enabled").checked = state.enabled !== false;
  $("focusNewWindow").checked = state.focusNewWindow !== false;
  $("focusExisting").checked = state.focusExisting === true;
  $("width").value = state.width;
  $("height").value = state.height;
  rules = state.rules.map(LAW.normalizeRule);
  render();
}

$("add").addEventListener("click", () => {
  rules.push(LAW.normalizeRule({ match: "host", pattern: "", note: "" }));
  render();
  const inputs = tbody.querySelectorAll("td.pat input");
  if (inputs.length) inputs[inputs.length - 1].focus();
});

$("save").addEventListener("click", () => {
  const state = {
    enabled: $("enabled").checked,
    focusNewWindow: $("focusNewWindow").checked,
    focusExisting: $("focusExisting").checked,
    width: Number($("width").value),
    height: Number($("height").value),
    rules: rules.filter((r) => r.pattern),
  };

  // 只有配了图标的站点才需要 host 权限（Chrome 的匹配模式不含端口）。
  // permissions.request 必须在用户手势里同步调用，所以这里不再先 contains。
  const origins = LAW.originsForRules(state.rules);
  let permNote = "";

  const finish = () =>
    LAW.saveState(state).then(() => {
      msg.textContent = "已保存 ✓" + permNote;
      setTimeout(() => {
        msg.textContent = "";
      }, 4000);
    });

  if (!origins.length) {
    finish().catch((err) => (msg.textContent = "保存失败：" + err));
    return;
  }

  chrome.permissions
    .request({ origins })
    .then((granted) => {
      if (!granted) permNote = "（图标未授权，规则本身已生效）";
      return finish();
    })
    .catch((err) => {
      msg.textContent = "保存失败：" + err;
    });
});

$("reset").addEventListener("click", async () => {
  await chrome.storage.local.clear();
  fill(await LAW.loadState());
  msg.textContent = "已恢复默认 ✓";
});

LAW.loadState().then(fill);
