/* 左パレット: テンプレート一覧・ケーブル一覧・カスタム登録ダイアログ */
(function (LP) {
  "use strict";

  function portsSummary(tpl) {
    if (tpl.ports.length === 0) { return ""; }
    var counts = {};
    tpl.ports.forEach(function (p) {
      counts[p.type] = (counts[p.type] || 0) + 1;
    });
    return Object.keys(counts).map(function (t) {
      return LP.PORT_TYPES[t].label + "×" + counts[t];
    }).join(" ");
  }

  function makeItemButton(tpl) {
    // 複製ボタンを内包するため button の入れ子を避けて div にする
    var btn = document.createElement("div");
    btn.className = "palette-item";
    btn.dataset.templateId = tpl.id;
    if (LP.state.ui.mode === "place" && LP.state.ui.placingTemplateId === tpl.id) {
      btn.classList.add("selected");
    }

    var sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = tpl.color;
    btn.appendChild(sw);

    var name = document.createElement("span");
    name.textContent = tpl.name;
    btn.appendChild(name);

    var info = document.createElement("span");
    info.className = "ports-info";
    info.textContent = tpl.ports.length > 0 ? tpl.ports.length + "port" : "";
    info.title = portsSummary(tpl);
    btn.appendChild(info);

    // 複製して編集ボタン
    var dup = document.createElement("button");
    dup.type = "button";
    dup.className = "dup-btn";
    dup.textContent = "⧉";
    dup.title = "複製して編集";
    dup.addEventListener("click", function (ev) {
      ev.stopPropagation();
      LP.openTemplateDialog(tpl);
    });
    btn.appendChild(dup);

    btn.addEventListener("click", function () {
      LP.commit(function (s) {
        s.ui.mode = "place";
        s.ui.placingTemplateId =
          (s.ui.placingTemplateId === tpl.id) ? null : tpl.id;
        s.ui.cableType = null;
        s.ui.pendingPort = null;
      });
    });
    return btn;
  }

  function makeCableButton(type) {
    var def = LP.CABLE_TYPES[type];
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "palette-item";
    if (LP.state.ui.mode === "connect" && LP.state.ui.cableType === type) {
      btn.classList.add("selected");
    }
    var sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = def.color;
    btn.appendChild(sw);
    var name = document.createElement("span");
    name.textContent = def.label;
    btn.appendChild(name);

    btn.addEventListener("click", function () {
      LP.commit(function (s) {
        s.ui.mode = "connect";
        s.ui.cableType = (s.ui.cableType === type) ? null : type;
        s.ui.placingTemplateId = null;
        s.ui.pendingPort = null;
      });
    });
    return btn;
  }

  // 大分類の表示ON/OFFチェックボックスを見出しに追加(初期化時に1回だけ)
  var GROUP_SECTIONS = [
    ["palette-furniture", "furniture"],
    ["palette-devices", "device"],
    ["palette-cables", "cable"]
  ];

  LP.initGroupToggles = function () {
    GROUP_SECTIONS.forEach(function (pair) {
      var h2 = document.querySelector("#" + pair[0] + " h2");
      var label = document.createElement("label");
      label.className = "group-toggle";
      label.title = "チェックを外すとキャンバス上で半透過表示になります";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.dataset.group = pair[1];
      cb.addEventListener("change", function () {
        LP.commit(function (s) {
          var arr = s.doc.settings.hiddenGroups;
          var idx = arr.indexOf(pair[1]);
          if (cb.checked && idx >= 0) { arr.splice(idx, 1); }
          if (!cb.checked && idx < 0) { arr.push(pair[1]); }
        });
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode("表示"));
      h2.appendChild(label);
    });
  };

  function syncGroupToggles() {
    document.querySelectorAll(".group-toggle input").forEach(function (cb) {
      cb.checked = !LP.isGroupHidden(cb.dataset.group);
    });
  }

  LP.renderPalette = function () {
    syncGroupToggles();
    var furn = document.querySelector("#palette-furniture .palette-items");
    var dev = document.querySelector("#palette-devices .palette-items");
    var cab = document.querySelector("#palette-cables .palette-items");
    furn.textContent = "";
    dev.textContent = "";
    cab.textContent = "";
    LP.allTemplates(LP.state.doc).forEach(function (tpl) {
      (tpl.kind === "furniture" ? furn : dev).appendChild(makeItemButton(tpl));
    });
    Object.keys(LP.CABLE_TYPES).forEach(function (type) {
      cab.appendChild(makeCableButton(type));
    });

    // モード別ヒント
    var hint = document.getElementById("palette-hint");
    var mode = LP.state.ui.mode;
    if (mode === "room") {
      hint.textContent = "グリッド点をクリックして間取りを作図。最初の点をもう一度クリック / Enter で確定、Esc でキャンセル。";
    } else if (mode === "place") {
      hint.textContent = LP.state.ui.placingTemplateId
        ? "キャンバスの空き場所をクリックして配置。既存アイテムはそのままドラッグで移動可。Esc で解除。"
        : "アイテムをクリックで選択。ドラッグ移動、上の丸ハンドルか R で90°回転、右下ハンドルでサイズ変更、Delete で削除、ダブルクリックで名前変更。";
    } else if (mode === "connect") {
      hint.textContent = LP.state.ui.cableType
        ? "緑枠のポートを2つクリックして接続。Esc でキャンセル。"
        : "ケーブルを選択するとポートが表示されます。ケーブルをクリック → Delete で削除。";
    }
  };

  // ---- テンプレート登録ダイアログ ----
  var dialog, portsBox;

  function addPortRow(type, count) {
    var row = document.createElement("div");
    row.className = "tpl-port-row";
    var sel = document.createElement("select");
    Object.keys(LP.PORT_TYPES).forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t;
      opt.textContent = LP.PORT_TYPES[t].label;
      if (t === type) { opt.selected = true; }
      sel.appendChild(opt);
    });
    var num = document.createElement("input");
    num.type = "number";
    num.min = "1";
    num.max = "16";
    num.value = String(count || 1);
    var del = document.createElement("button");
    del.type = "button";
    del.textContent = "✕";
    del.addEventListener("click", function () { row.remove(); });
    row.appendChild(sel);
    row.appendChild(num);
    row.appendChild(del);
    portsBox.appendChild(row);
  }

  // base を渡すと「複製して編集」
  LP.openTemplateDialog = function (base) {
    dialog = document.getElementById("template-dialog");
    portsBox = document.getElementById("tpl-ports");
    portsBox.textContent = "";
    document.getElementById("template-dialog-title").textContent =
      base ? "「" + base.name + "」を複製して登録" : "機器を登録";
    document.getElementById("tpl-name").value = base ? base.name + " (カスタム)" : "";
    document.getElementById("tpl-kind").value = base ? base.kind : "device";
    document.getElementById("tpl-color").value = base ? base.color : "#4a6fa5";
    if (base) {
      // ポートを種別ごとに集計して行にする
      var counts = {};
      var order = [];
      base.ports.forEach(function (p) {
        if (!(p.type in counts)) { order.push(p.type); }
        counts[p.type] = (counts[p.type] || 0) + 1;
      });
      order.forEach(function (t) { addPortRow(t, counts[t]); });
    }
    dialog.showModal();
  };

  function collectPorts() {
    var ports = [];
    var n = 1;
    portsBox.querySelectorAll(".tpl-port-row").forEach(function (row) {
      var type = row.querySelector("select").value;
      var count = parseInt(row.querySelector("input").value, 10) || 0;
      for (var i = 0; i < count; i++) {
        var label = LP.PORT_TYPES[type].label + (count > 1 ? String(i + 1) : "");
        ports.push({ id: "p" + n, type: type, label: label });
        n += 1;
      }
    });
    return ports;
  }

  LP.initTemplateDialog = function () {
    dialog = document.getElementById("template-dialog");
    portsBox = document.getElementById("tpl-ports");

    document.getElementById("btn-add-template").addEventListener("click", function () {
      LP.openTemplateDialog(null);
    });
    document.getElementById("btn-add-port").addEventListener("click", function () {
      addPortRow("usb-a", 1);
    });
    document.getElementById("btn-tpl-cancel").addEventListener("click", function () {
      dialog.close();
    });
    document.getElementById("template-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var name = document.getElementById("tpl-name").value.trim();
      if (!name) { return; }
      var tpl = {
        id: LP.newId("tpl"),
        name: name,
        kind: document.getElementById("tpl-kind").value,
        builtin: false,
        color: document.getElementById("tpl-color").value,
        ports: collectPorts()
      };
      // サイズはポート数に応じて自動調整
      var n = tpl.ports.length;
      tpl.width = Math.max(40, 20 + n * 8);
      tpl.height = Math.max(30, 20 + Math.floor(n / 2) * 4);
      LP.commit(function (s) { s.doc.templates.push(tpl); });
      dialog.close();
      LP.toast("「" + name + "」を登録しました");
    });
  };
})(window.LP = window.LP || {});
