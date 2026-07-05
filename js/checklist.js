/* 必要機材チェックリスト: 構成から自動集計・チェック保存・テキストコピー */
(function (LP) {
  "use strict";

  // 機器・什器の集計: templateId → {name, count}
  function aggregateItems() {
    var map = {};
    LP.state.doc.items.forEach(function (item) {
      var tpl = LP.findTemplate(LP.state.doc, item.templateId);
      if (!tpl) { return; }
      if (!map[tpl.id]) { map[tpl.id] = { key: tpl.id, name: tpl.name, kind: tpl.kind, count: 0 }; }
      map[tpl.id].count += 1;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  // ケーブルの集計: type → {name, count, lengths[]}
  function aggregateCables() {
    var map = {};
    LP.state.doc.cables.forEach(function (cable) {
      var def = LP.CABLE_TYPES[cable.type];
      if (!def) { return; }
      var key = "cable:" + cable.type;
      if (!map[key]) { map[key] = { key: key, name: def.label, count: 0, lengths: [] }; }
      map[key].count += 1;
      var pa = LP.portXY(cable.a);
      var pb = LP.portXY(cable.b);
      if (pa && pb) {
        map[key].lengths.push(
          LP.cableLengthMeters(pa[0], pa[1], pb[0], pb[1], LP.state.doc.settings)
        );
      }
    });
    Object.keys(map).forEach(function (k) {
      map[k].lengths.sort(function (a, b) { return a - b; });
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function isChecked(key) {
    return LP.state.doc.checklist.checked.indexOf(key) >= 0;
  }

  function toggleChecked(key) {
    LP.commit(function (s) {
      var arr = s.doc.checklist.checked;
      var idx = arr.indexOf(key);
      if (idx >= 0) { arr.splice(idx, 1); } else { arr.push(key); }
    });
  }

  function makeRow(entry, detail) {
    var row = document.createElement("label");
    row.className = "checklist-row" + (isChecked(entry.key) ? " checked" : "");
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = isChecked(entry.key);
    cb.addEventListener("change", function () { toggleChecked(entry.key); });
    row.appendChild(cb);
    var name = document.createElement("span");
    name.className = "cname";
    name.textContent = entry.name + (detail ? " " + detail : "");
    row.appendChild(name);
    var count = document.createElement("span");
    count.className = "count";
    count.textContent = "×" + entry.count;
    row.appendChild(count);
    return row;
  }

  function cableDetail(entry) {
    if (entry.lengths.length === 0) { return ""; }
    return "(最小 " + entry.lengths.map(LP.formatMeters).join(" / ") + ")";
  }

  LP.renderChecklist = function () {
    var body = document.getElementById("checklist-body");
    body.textContent = "";
    var items = aggregateItems();
    var cables = aggregateCables();

    if (items.length === 0 && cables.length === 0) {
      var empty = document.createElement("div");
      empty.className = "checklist-empty";
      empty.textContent = "機器・什器を配置すると必要機材が集計されます。";
      body.appendChild(empty);
      return;
    }

    var groups = [
      { title: "什器", entries: items.filter(function (e) { return e.kind === "furniture"; }), detail: null },
      { title: "機器", entries: items.filter(function (e) { return e.kind === "device"; }), detail: null },
      { title: "ケーブル", entries: cables, detail: cableDetail }
    ];
    groups.forEach(function (grp) {
      if (grp.entries.length === 0) { return; }
      var div = document.createElement("div");
      div.className = "checklist-group";
      var h = document.createElement("h3");
      h.textContent = grp.title;
      div.appendChild(h);
      grp.entries.forEach(function (entry) {
        div.appendChild(makeRow(entry, grp.detail ? grp.detail(entry) : ""));
      });
      body.appendChild(div);
    });
  };

  // テキスト形式(共有・買い出し用)
  function checklistText() {
    var lines = [];
    aggregateItems().forEach(function (e) {
      lines.push((isChecked(e.key) ? "☑ " : "☐ ") + e.name + " ×" + e.count);
    });
    aggregateCables().forEach(function (e) {
      var detail = cableDetail(e);
      lines.push((isChecked(e.key) ? "☑ " : "☐ ") + e.name + " ×" + e.count +
        (detail ? " " + detail : ""));
    });
    return lines.join("\n");
  }

  LP.initChecklist = function () {
    document.getElementById("btn-copy-checklist").addEventListener("click", function () {
      var text = checklistText();
      if (!text) {
        LP.toast("コピーする機材がありません");
        return;
      }
      // file:// では navigator.clipboard が使えない場合があるためフォールバック付き
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e) { /* 無視 */ }
        document.body.removeChild(ta);
        LP.toast("チェックリストをコピーしました");
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          LP.toast("チェックリストをコピーしました");
        }, fallback);
      } else {
        fallback();
      }
    });
    document.getElementById("btn-toggle-checklist").addEventListener("click", function () {
      var panel = document.getElementById("checklist-panel");
      panel.classList.toggle("collapsed");
      this.textContent = panel.classList.contains("collapsed") ? "▲" : "▼";
    });
  };
})(window.LP = window.LP || {});
