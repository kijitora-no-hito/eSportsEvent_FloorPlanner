/* 状態管理: ドキュメント・commit・localStorage・import/export */
(function (LP) {
  "use strict";

  function emptyDoc() {
    return {
      schemaVersion: LP.SCHEMA_VERSION,
      meta: { title: "無題レイアウト", savedAt: null },
      settings: {
        gridSize: LP.GRID_SIZE,
        scaleMetersPerGrid: LP.SCALE_METERS_PER_GRID,
        hiddenGroups: [] // 半透過表示にする大分類: "furniture" | "device" | "cable"
      },
      rooms: [],
      templates: [],
      items: [],
      cables: [],
      checklist: { checked: [] }
    };
  }

  var idCounter = 0;

  var state = {
    doc: emptyDoc(),
    // ui は保存対象外
    ui: {
      mode: "place",            // "room" | "place" | "connect"
      selection: null,          // {type:"room"|"item"|"cable", id}
      placingTemplateId: null,  // 配置モード: 選択中テンプレート
      cableType: null,          // 接続モード: 選択中ケーブル種別
      pendingPort: null,        // 接続モード: 1点目 {itemId, portId, endIndex}
      drawingPoints: []         // 間取りモード: 作図中頂点
    }
  };

  LP.state = state;

  LP.newId = function (prefix) {
    idCounter += 1;
    return prefix + "-" + Date.now().toString(36) + "-" + idCounter;
  };

  // ---- commit: 変更 → 再描画 + 自動保存 ----
  var listeners = [];
  var saveTimer = null;

  LP.onCommit = function (fn) { listeners.push(fn); };

  LP.commit = function (mutator) {
    if (mutator) { mutator(state); }
    listeners.forEach(function (fn) { fn(state); });
    // 500ms デバウンスで自動保存
    if (saveTimer) { clearTimeout(saveTimer); }
    saveTimer = setTimeout(function () {
      try {
        state.doc.meta.savedAt = new Date().toISOString();
        localStorage.setItem(LP.STORAGE_KEY, JSON.stringify(state.doc));
      } catch (e) {
        /* localStorage 不可(プライベートモード等)は無視 */
      }
    }, 500);
  };

  // ---- バリデーション ----
  function isValidDoc(doc) {
    return doc && typeof doc === "object" &&
      doc.schemaVersion === LP.SCHEMA_VERSION &&
      Array.isArray(doc.rooms) && Array.isArray(doc.items) &&
      Array.isArray(doc.cables) && Array.isArray(doc.templates);
  }

  LP.loadDoc = function (doc) {
    if (!isValidDoc(doc)) { return false; }
    if (!doc.checklist || !Array.isArray(doc.checklist.checked)) {
      doc.checklist = { checked: [] };
    }
    if (!doc.settings) {
      doc.settings = { gridSize: LP.GRID_SIZE, scaleMetersPerGrid: LP.SCALE_METERS_PER_GRID };
    }
    if (!Array.isArray(doc.settings.hiddenGroups)) {
      doc.settings.hiddenGroups = []; // 旧形式データの後方互換
    }
    state.doc = doc;
    state.ui.selection = null;
    state.ui.pendingPort = null;
    state.ui.drawingPoints = [];
    return true;
  };

  // ---- localStorage 復元 ----
  LP.restoreFromStorage = function () {
    try {
      var raw = localStorage.getItem(LP.STORAGE_KEY);
      if (!raw) { return false; }
      return LP.loadDoc(JSON.parse(raw));
    } catch (e) {
      return false;
    }
  };

  LP.clearAll = function () {
    state.doc = emptyDoc();
    state.ui.selection = null;
    state.ui.pendingPort = null;
    state.ui.drawingPoints = [];
    try { localStorage.removeItem(LP.STORAGE_KEY); } catch (e) { /* 無視 */ }
  };

  // ---- エクスポート / インポート ----
  LP.exportJson = function () {
    state.doc.meta.savedAt = new Date().toISOString();
    var blob = new Blob([JSON.stringify(state.doc, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "layout-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  LP.importJsonText = function (text) {
    var doc;
    try {
      doc = JSON.parse(text);
    } catch (e) {
      return "JSONの解析に失敗しました";
    }
    if (!LP.loadDoc(doc)) {
      return "レイアウトファイルの形式が不正です";
    }
    return null; // 成功
  };

  // ---- 検索ヘルパ ----
  LP.findItem = function (itemId) {
    for (var i = 0; i < state.doc.items.length; i++) {
      if (state.doc.items[i].id === itemId) { return state.doc.items[i]; }
    }
    return null;
  };

  LP.findRoom = function (roomId) {
    for (var i = 0; i < state.doc.rooms.length; i++) {
      if (state.doc.rooms[i].id === roomId) { return state.doc.rooms[i]; }
    }
    return null;
  };

  // アイテムのポート定義を取得
  LP.findPort = function (itemId, portId) {
    var item = LP.findItem(itemId);
    if (!item) { return null; }
    var tpl = LP.findTemplate(state.doc, item.templateId);
    if (!tpl) { return null; }
    for (var i = 0; i < tpl.ports.length; i++) {
      if (tpl.ports[i].id === portId) { return tpl.ports[i]; }
    }
    return null;
  };

  // ポートが使用済みか(cables から導出)
  LP.isPortUsed = function (itemId, portId) {
    return state.doc.cables.some(function (c) {
      return (c.a.itemId === itemId && c.a.portId === portId) ||
             (c.b.itemId === itemId && c.b.portId === portId);
    });
  };

  // 大分類が半透過表示か
  LP.isGroupHidden = function (group) {
    return state.doc.settings.hiddenGroups.indexOf(group) >= 0;
  };

  // 機器が電源未接続か(電源入力系ポートを持つのに1本も電源が来ていない)
  // USB給電機器(usb-a/c-pwr-in)も対象
  LP.isUnpowered = function (item, template) {
    var powerIns = template.ports.filter(function (p) {
      return LP.POWER_IN_TYPES.indexOf(p.type) >= 0;
    });
    if (powerIns.length === 0) { return false; }
    return !powerIns.some(function (p) { return LP.isPortUsed(item.id, p.id); });
  };

  // アイテムに接続されている全ケーブル
  LP.cablesOfItem = function (itemId) {
    return state.doc.cables.filter(function (c) {
      return c.a.itemId === itemId || c.b.itemId === itemId;
    });
  };
})(window.LP = window.LP || {});
