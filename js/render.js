/* SVG描画: state → 全レイヤー再描画 */
(function (LP) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  function el(name, attrs, parent) {
    var e = document.createElementNS(SVG_NS, name);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    if (parent) { parent.appendChild(e); }
    return e;
  }
  LP.svgEl = el;

  function clear(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }

  function layer(id) { return document.getElementById(id); }

  // 拡大時のサイズ補正係数。ポート・文字を画面上で一定サイズに保つ
  // (ズームアウト時は補正しない = 俯瞰時は自然に縮小)
  var zc = 1;
  LP.zoomComp = function () { return zc; };

  function isSelected(type, id) {
    var sel = LP.state.ui.selection;
    return sel && sel.type === type && sel.id === id;
  }

  // ---- 部屋 ----
  function renderRooms() {
    var g = layer("layer-rooms");
    clear(g);
    LP.state.doc.rooms.forEach(function (room) {
      var grp = el("g", { "class": "room" + (isSelected("room", room.id) ? " selected" : "") }, g);
      grp.dataset.roomId = room.id;
      el("polygon", {
        points: room.points.map(function (p) { return p[0] + "," + p[1]; }).join(" ")
      }, grp);
      var c = LP.polygonCenter(room.points);
      var t = el("text", { x: c[0], y: c[1], "text-anchor": "middle" }, grp);
      t.textContent = room.name;
      t.style.fontSize = (13 / zc) + "px";
    });
  }

  // ---- アイテム(什器・機器) ----
  function renderItems() {
    var gFurn = layer("layer-furniture");
    var gDev = layer("layer-devices");
    clear(gFurn);
    clear(gDev);
    LP.state.doc.items.forEach(function (item) {
      var tpl = LP.findTemplate(LP.state.doc, item.templateId);
      if (!tpl) { return; }
      var parent = tpl.kind === "furniture" ? gFurn : gDev;
      var size = LP.itemSize(item, tpl);
      var cx = item.x + size.w / 2;
      var cy = item.y + size.h / 2;
      var selected = isSelected("item", item.id);
      var cls = "item" + (selected ? " selected" : "");
      if (LP.isGroupHidden(tpl.kind)) { cls += " dimmed"; }
      var unpowered = LP.isUnpowered(item, tpl);
      if (unpowered) { cls += " unpowered"; }
      var grp = el("g", {
        "class": cls,
        transform: "rotate(" + (item.rotation || 0) + " " + cx + " " + cy + ")"
      }, parent);
      grp.dataset.itemId = item.id;
      el("rect", {
        "class": "body", x: item.x, y: item.y,
        width: size.w, height: size.h, fill: tpl.color, rx: 3
      }, grp);
      var t = el("text", { "class": "label", x: cx, y: cy }, grp);
      t.textContent = item.label || tpl.name;
      t.style.fontSize = (10 / zc) + "px";
      // ラベルが暗色背景で見えるよう白抜き
      t.setAttribute("fill", "#fff");
      t.setAttribute("stroke", "rgba(0,0,0,.35)");
      t.setAttribute("stroke-width", "0.4");
      // 電源未接続バッジ
      if (unpowered) {
        var warn = el("text", {
          "class": "warn-badge", x: item.x, y: item.y - 4 / zc
        }, grp);
        warn.textContent = "⚡電源なし";
        warn.style.fontSize = (10 / zc) + "px";
      }
      // 選択中(配置モード)は回転・リサイズハンドルを表示
      if (selected && LP.state.ui.mode === "place") {
        var rh = el("circle", {
          "class": "rotate-handle", cx: cx, cy: item.y - 12 / zc, r: 6 / zc
        }, grp);
        el("title", null, rh).textContent = "クリックで90°回転";
        var hs = 10 / zc; // リサイズハンドルの辺長
        var sh = el("rect", {
          "class": "resize-handle",
          x: item.x + size.w - hs / 2, y: item.y + size.h - hs / 2,
          width: hs, height: hs
        }, grp);
        el("title", null, sh).textContent = "ドラッグでサイズ変更";
      }
    });
  }

  // ---- ポート ----
  function portStateClass(itemId, port) {
    var ui = LP.state.ui;
    var cls = "port";
    var used = LP.isPortUsed(itemId, port.id);
    var pending = ui.pendingPort &&
      ui.pendingPort.itemId === itemId && ui.pendingPort.portId === port.id;
    if (pending) { return cls + " pending"; }
    if (used) { return cls + " used"; }
    if (ui.mode === "connect" && ui.cableType) {
      var ends = LP.compatibleEnds(ui.cableType, port.type);
      if (ui.pendingPort) {
        // 2点目: 1点目のポートと接続可能か(形状+IN/OUT方向)
        var pendingDef = LP.findPort(ui.pendingPort.itemId, ui.pendingPort.portId);
        var err = pendingDef
          ? LP.connectError(ui.cableType, ui.pendingPort.endIndex, pendingDef.type, port.type)
          : "err";
        cls += err ? " incompatible" : " compatible";
      } else {
        cls += ends.length > 0 ? " compatible" : " incompatible";
      }
    }
    return cls;
  }

  function renderPorts() {
    var g = layer("layer-ports");
    clear(g);
    if (LP.state.ui.mode !== "connect") { return; } // 接続モードのみ表示
    LP.state.doc.items.forEach(function (item) {
      var tpl = LP.findTemplate(LP.state.doc, item.templateId);
      if (!tpl || tpl.ports.length === 0) { return; }
      if (LP.isGroupHidden(tpl.kind)) { return; } // 半透過中はポートも操作不可
      LP.portPositions(item, tpl).forEach(function (pp) {
        var def = LP.PORT_TYPES[pp.port.type];
        var c = el("circle", {
          "class": portStateClass(item.id, pp.port),
          cx: pp.x, cy: pp.y, r: 6 / zc,
          fill: def.color
        }, g);
        c.dataset.itemId = item.id;
        c.dataset.portId = pp.port.id;
        var title = el("title", null, c);
        var used = LP.isPortUsed(item.id, pp.port.id);
        title.textContent = (item.label || tpl.name) + " / " + pp.port.label +
          " [" + def.label + "] " + (used ? "使用中" : "空き");
        // IN/OUT方向のあるポートは文字で明示
        if (def.dir) {
          var dirText = el("text", {
            "class": "port-dir", x: pp.x, y: pp.y - 8 / zc
          }, g);
          dirText.textContent = def.dir;
          dirText.style.fontSize = (7 / zc) + "px";
        }
      });
    });
  }

  // ---- ケーブル ----
  function portXY(cableEnd) {
    var item = LP.findItem(cableEnd.itemId);
    if (!item) { return null; }
    var tpl = LP.findTemplate(LP.state.doc, item.templateId);
    if (!tpl) { return null; }
    var positions = LP.portPositions(item, tpl);
    for (var i = 0; i < positions.length; i++) {
      if (positions[i].port.id === cableEnd.portId) {
        return [positions[i].x, positions[i].y];
      }
    }
    return null;
  }
  LP.portXY = portXY;

  function renderCables() {
    var g = layer("layer-cables");
    clear(g);
    LP.state.doc.cables.forEach(function (cable) {
      var pa = portXY(cable.a);
      var pb = portXY(cable.b);
      if (!pa || !pb) { return; }
      var d = LP.cablePath(pa[0], pa[1], pb[0], pb[1]);
      var meters = LP.cableLengthMeters(pa[0], pa[1], pb[0], pb[1], LP.state.doc.settings);
      var lenText = LP.formatMeters(meters);
      var grp = el("g", {
        "class": "cable" + (isSelected("cable", cable.id) ? " selected" : "") +
          (LP.isGroupHidden("cable") ? " dimmed" : "")
      }, g);
      grp.dataset.cableId = cable.id;
      el("path", { "class": "visible", d: d, stroke: LP.CABLE_TYPES[cable.type].color }, grp);
      var hit = el("path", { "class": "hit", d: d }, grp);
      var title = el("title", null, hit);
      title.textContent = LP.CABLE_TYPES[cable.type].label + " 最小" + lenText;
      // 中点付近に長さラベル(垂み分だけ下げる)
      var label = el("text", {
        "class": "cable-length",
        x: (pa[0] + pb[0]) / 2,
        y: (pa[1] + pb[1]) / 2 + Math.min(30, Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) * 0.15) / 2 + 4
      }, grp);
      label.textContent = lenText;
      label.style.fontSize = (10 / zc) + "px";
    });
  }

  // ---- グリッド点とスケール表示の更新(ズーム連動) ----
  function updateGrid() {
    var eff = LP.effectiveGrid(LP.state.doc.settings, LP.getZoom ? LP.getZoom() : 1);
    var pattern = document.getElementById("grid-dots");
    pattern.setAttribute("width", eff.px);
    pattern.setAttribute("height", eff.px);
    var pos = [[0, 0], [eff.px, 0], [0, eff.px], [eff.px, eff.px]];
    pattern.querySelectorAll(".grid-dot").forEach(function (d, i) {
      d.setAttribute("cx", pos[i][0]);
      d.setAttribute("cy", pos[i][1]);
      d.setAttribute("r", 1.5 / zc);
    });
    var scaleEl = document.getElementById("grid-scale");
    if (scaleEl) { scaleEl.textContent = "1グリッド = " + eff.m + "m"; }
  }

  // ---- 全体 ----
  LP.render = function () {
    zc = Math.max(1, LP.getZoom ? LP.getZoom() : 1);
    updateGrid();
    renderRooms();
    renderItems();
    renderCables();
    renderPorts();
    // モードに応じた canvas クラス(パン用クラスを消さないよう classList で操作)
    var canvas = document.getElementById("canvas");
    ["mode-room", "mode-place", "mode-connect"].forEach(function (c) {
      canvas.classList.remove(c);
    });
    canvas.classList.add("mode-" + LP.state.ui.mode);
  };

  // ---- グリッドパターン初期化 ----
  LP.initGrid = function () {
    var pattern = document.getElementById("grid-dots");
    pattern.setAttribute("width", LP.GRID_SIZE);
    pattern.setAttribute("height", LP.GRID_SIZE);
    var dot = pattern.querySelector(".grid-dot");
    dot.setAttribute("cx", 0);
    dot.setAttribute("cy", 0);
    dot.setAttribute("r", 1.5);
    // パターン原点に置くと切れるため4隅に点を複製
    [[0, 0], [LP.GRID_SIZE, 0], [0, LP.GRID_SIZE], [LP.GRID_SIZE, LP.GRID_SIZE]].forEach(function (p, i) {
      if (i === 0) { return; }
      var d = dot.cloneNode();
      d.setAttribute("cx", p[0]);
      d.setAttribute("cy", p[1]);
      pattern.appendChild(d);
    });
  };

  // ---- トースト ----
  var toastTimer = null;
  LP.toast = function (message) {
    var t = document.getElementById("toast");
    t.textContent = message;
    t.classList.add("show");
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  };
})(window.LP = window.LP || {});
