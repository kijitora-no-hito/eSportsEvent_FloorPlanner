/* 初期化・モード切替・ツールバー */
(function (LP) {
  "use strict";

  LP.setMode = function (mode) {
    LP.commit(function (s) {
      s.ui.mode = mode;
      s.ui.selection = null;
      s.ui.pendingPort = null;
      s.ui.drawingPoints = [];
      if (mode !== "place") { s.ui.placingTemplateId = null; }
      if (mode !== "connect") { s.ui.cableType = null; }
    });
    var overlay = document.getElementById("layer-overlay");
    while (overlay.firstChild) { overlay.removeChild(overlay.firstChild); }
  };

  function updateModeButtons() {
    document.querySelectorAll(".mode-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.mode === LP.state.ui.mode);
    });
  }

  function initToolbar() {
    document.querySelectorAll(".mode-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { LP.setMode(btn.dataset.mode); });
    });

    document.getElementById("btn-export").addEventListener("click", function () {
      LP.exportJson();
    });

    var fileInput = document.getElementById("import-file");
    document.getElementById("btn-import").addEventListener("click", function () {
      fileInput.value = "";
      fileInput.click();
    });
    fileInput.addEventListener("change", function () {
      var file = fileInput.files[0];
      if (!file) { return; }
      if (LP.state.doc.items.length > 0 || LP.state.doc.rooms.length > 0) {
        if (!confirm("現在のレイアウトを破棄して読み込みますか？")) { return; }
      }
      var reader = new FileReader();
      reader.onload = function () {
        var err = LP.importJsonText(String(reader.result));
        if (err) {
          LP.toast(err);
        } else {
          LP.commit(null);
          LP.toast("レイアウトを読み込みました");
        }
      };
      reader.readAsText(file, "utf-8");
    });

    document.getElementById("btn-clear").addEventListener("click", function () {
      if (confirm("全て消去して新規作成しますか？(保存済みデータも消えます)")) {
        LP.clearAll();
        LP.commit(null);
        LP.toast("新規レイアウトを開始しました");
      }
    });
  }

  // ---- ズーム(viewBox管理) ----
  var ZOOM_MIN = 0.25, ZOOM_MAX = 4, ZOOM_STEP = 1.25;
  var view = null; // 現在の viewBox {x, y, w, h}
  var zoom = 1;

  LP.getZoom = function () { return zoom; };

  function applyView(svg) {
    svg.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h);
    document.getElementById("btn-zoom-reset").textContent = Math.round(zoom * 100) + "%";
  }

  // fx, fy: ズームの不動点(SVG座標)。省略時は表示中心
  function setZoom(svg, newZoom, fx, fy) {
    newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
    var rect = svg.getBoundingClientRect();
    if (fx === undefined) { fx = view.x + view.w / 2; }
    if (fy === undefined) { fy = view.y + view.h / 2; }
    var rx = (fx - view.x) / view.w;
    var ry = (fy - view.y) / view.h;
    view.w = rect.width / newZoom;
    view.h = rect.height / newZoom;
    view.x = fx - rx * view.w;
    view.y = fy - ry * view.h;
    zoom = newZoom;
    applyView(svg);
    // ポート・文字サイズの補正とグリッド切替のため再描画
    if (LP.render) { LP.render(); }
  }

  function initZoom() {
    var svg = document.getElementById("canvas");
    var rect = svg.getBoundingClientRect();
    view = { x: 0, y: 0, w: rect.width, h: rect.height };
    applyView(svg);

    document.getElementById("btn-zoom-in").addEventListener("click", function () {
      setZoom(svg, zoom * ZOOM_STEP);
    });
    document.getElementById("btn-zoom-out").addEventListener("click", function () {
      setZoom(svg, zoom / ZOOM_STEP);
    });
    document.getElementById("btn-zoom-reset").addEventListener("click", function () {
      setZoom(svg, 1);
    });

    // ホイールズーム(カーソル位置基準。Ctrl併用のピンチ操作にも対応)
    svg.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      var p = LP.clientToSvg(svg, ev.clientX, ev.clientY);
      var factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
      setZoom(svg, zoom * factor, p[0], p[1]);
    }, { passive: false });

    // ---- パン(中ボタンドラッグ / スペース+左ドラッグ) ----
    var pan = null;
    var spaceDown = false;

    svg.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 1 && !(ev.button === 0 && spaceDown)) { return; }
      pan = { sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y };
      svg.setPointerCapture(ev.pointerId);
      svg.classList.add("panning");
      ev.preventDefault();
      ev.stopImmediatePropagation(); // 各モードの操作に渡さない
    });
    svg.addEventListener("pointermove", function (ev) {
      if (!pan) { return; }
      view.x = pan.vx - (ev.clientX - pan.sx) / zoom;
      view.y = pan.vy - (ev.clientY - pan.sy) / zoom;
      applyView(svg);
      ev.stopImmediatePropagation();
    });
    svg.addEventListener("pointerup", function (ev) {
      if (!pan) { return; }
      pan = null;
      svg.classList.remove("panning");
      ev.stopImmediatePropagation();
    });

    // スペースキー押下中は左ドラッグでパン
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== " ") { return; }
      var tag = (ev.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") { return; }
      ev.preventDefault(); // ボタンの誤作動・スクロールを防ぐ
      spaceDown = true;
      svg.classList.add("pan-ready");
    });
    document.addEventListener("keyup", function (ev) {
      if (ev.key === " ") {
        spaceDown = false;
        svg.classList.remove("pan-ready");
      }
    });

    // ウィンドウリサイズ時は倍率を保ったまま表示範囲を追従
    window.addEventListener("resize", function () {
      var r = svg.getBoundingClientRect();
      var cx = view.x + view.w / 2;
      var cy = view.y + view.h / 2;
      view.w = r.width / zoom;
      view.h = r.height / zoom;
      view.x = cx - view.w / 2;
      view.y = cy - view.h / 2;
      applyView(svg);
    });
  }

  function init() {
    LP.initGrid();
    initZoom();
    LP.initGroupToggles();
    LP.initTemplateDialog();
    LP.initChecklist();
    LP.initInteractions();
    initToolbar();

    // commit のたびに全再描画
    LP.onCommit(function () {
      LP.render();
      LP.renderPalette();
      LP.renderChecklist();
      updateModeButtons();
    });

    // 前回の作業を復元
    if (LP.restoreFromStorage()) {
      LP.toast("前回の作業を復元しました");
    }
    LP.commit(null); // 初回描画
  }

  document.addEventListener("DOMContentLoaded", init);
})(window.LP = window.LP || {});
