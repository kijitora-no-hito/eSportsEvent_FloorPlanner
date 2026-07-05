/* インタラクション: 間取り/配置/接続 3モードのマウス・キーボード処理 */
(function (LP) {
  "use strict";

  var svg;
  var drag = null; // {itemId, offsetX, offsetY, moved}

  function svgPoint(ev) {
    return LP.clientToSvg(svg, ev.clientX, ev.clientY);
  }

  function overlay() { return document.getElementById("layer-overlay"); }

  // ズームに応じた実効グリッド間隔(px)
  function effGridPx() {
    return LP.effectiveGrid(LP.state.doc.settings, LP.getZoom ? LP.getZoom() : 1).px;
  }

  function clearOverlay() {
    var o = overlay();
    while (o.firstChild) { o.removeChild(o.firstChild); }
  }

  // ================= 間取りモード =================
  function roomClick(ev) {
    var p = svgPoint(ev);
    var snapped = LP.snapPoint(p[0], p[1], effGridPx());
    var pts = LP.state.ui.drawingPoints;

    // 既存部屋クリックで選択(作図中でないとき)
    if (pts.length === 0) {
      var roomEl = ev.target.closest(".room");
      if (roomEl) {
        LP.commit(function (s) {
          s.ui.selection = { type: "room", id: roomEl.dataset.roomId };
        });
        return;
      }
    }

    // 最初の頂点を再クリック → 閉じる
    if (pts.length >= 3 &&
        pts[0][0] === snapped[0] && pts[0][1] === snapped[1]) {
      finishRoom();
      return;
    }
    // 同一点の連続クリックは無視
    if (pts.length > 0 &&
        pts[pts.length - 1][0] === snapped[0] && pts[pts.length - 1][1] === snapped[1]) {
      return;
    }
    LP.commit(function (s) {
      s.ui.selection = null;
      s.ui.drawingPoints.push(snapped);
    });
    drawRoomPreview(snapped);
  }

  function finishRoom() {
    var pts = LP.state.ui.drawingPoints;
    if (pts.length < 3) {
      LP.toast("頂点が3つ以上必要です");
      return;
    }
    LP.commit(function (s) {
      var room = {
        id: LP.newId("room"),
        name: "部屋" + (s.doc.rooms.length + 1),
        points: pts.slice()
      };
      s.doc.rooms.push(room);
      s.ui.drawingPoints = [];
    });
    clearOverlay();
    LP.toast("間取りを作成しました");
  }

  function drawRoomPreview(cursor) {
    clearOverlay();
    var zc = LP.zoomComp();
    var pts = LP.state.ui.drawingPoints;
    if (pts.length === 0) {
      if (cursor) {
        LP.svgEl("circle", { "class": "snap-cursor", cx: cursor[0], cy: cursor[1], r: 6 / zc }, overlay());
      }
      return;
    }
    var all = cursor ? pts.concat([cursor]) : pts;
    LP.svgEl("polyline", {
      "class": "preview-line",
      points: all.map(function (p) { return p[0] + "," + p[1]; }).join(" ")
    }, overlay());
    pts.forEach(function (p, i) {
      LP.svgEl("circle", {
        "class": "vertex-dot", cx: p[0], cy: p[1], r: (i === 0 ? 6 : 4) / zc
      }, overlay());
    });
    if (cursor) {
      LP.svgEl("circle", { "class": "snap-cursor", cx: cursor[0], cy: cursor[1], r: 6 / zc }, overlay());
    }
  }

  function roomMove(ev) {
    var p = svgPoint(ev);
    drawRoomPreview(LP.snapPoint(p[0], p[1], effGridPx()));
  }

  // ================= 配置モード =================
  function placeClick(ev) {
    var ui = LP.state.ui;
    if (ui.placingTemplateId) {
      // 新規配置
      var tpl = LP.findTemplate(LP.state.doc, ui.placingTemplateId);
      if (!tpl) { return; }
      var p = svgPoint(ev);
      var grid = effGridPx() / 2; // 配置は半グリッド単位
      LP.commit(function (s) {
        var item = {
          id: LP.newId("item"),
          templateId: tpl.id,
          kind: tpl.kind,
          x: LP.snap(p[0] - tpl.width / 2, grid),
          y: LP.snap(p[1] - tpl.height / 2, grid),
          rotation: 0,
          label: ""
        };
        s.doc.items.push(item);
        s.ui.selection = { type: "item", id: item.id };
      });
      return;
    }
    // 選択
    var itemEl = ev.target.closest(".item");
    LP.commit(function (s) {
      s.ui.selection = itemEl ? { type: "item", id: itemEl.dataset.itemId } : null;
    });
  }

  function placeGhost(ev) {
    clearOverlay();
    var ui = LP.state.ui;
    if (!ui.placingTemplateId) { return; }
    var tpl = LP.findTemplate(LP.state.doc, ui.placingTemplateId);
    if (!tpl) { return; }
    var p = svgPoint(ev);
    var grid = effGridPx() / 2;
    var x = LP.snap(p[0] - tpl.width / 2, grid);
    var y = LP.snap(p[1] - tpl.height / 2, grid);
    var g = LP.svgEl("g", { "class": "ghost" }, overlay());
    LP.svgEl("rect", {
      x: x, y: y, width: tpl.width, height: tpl.height,
      fill: tpl.color, rx: 3
    }, g);
  }

  function placePointerDown(ev) {
    // 既存アイテム上での押下は「新規配置」より移動・編集を優先する
    var itemEl = ev.target.closest(".item");
    if (!itemEl) { return; }
    var item = LP.findItem(itemEl.dataset.itemId);
    if (!item) { return; }
    var p = svgPoint(ev);
    var cls = ev.target.classList;

    if (cls.contains("resize-handle")) {
      // リサイズ: 開始時点の回転・中心を固定して局所座標で計算する
      var tpl = LP.findTemplate(LP.state.doc, item.templateId);
      var size = LP.itemSize(item, tpl);
      drag = {
        kind: "resize", itemId: item.id,
        rot: item.rotation || 0,
        cx: item.x + size.w / 2, cy: item.y + size.h / 2
      };
    } else if (cls.contains("rotate-handle")) {
      LP.commit(function () {
        item.rotation = ((item.rotation || 0) + 90) % 360;
      });
      drag = { kind: "rotate", itemId: item.id };
    } else {
      drag = {
        kind: "move", itemId: item.id,
        offsetX: p[0] - item.x, offsetY: p[1] - item.y
      };
    }
    clearOverlay();
    svg.setPointerCapture(ev.pointerId);
  }

  function placePointerMove(ev) {
    if (!drag) {
      placeGhost(ev);
      return;
    }
    var item = LP.findItem(drag.itemId);
    if (!item) { drag = null; return; }
    var p = svgPoint(ev);
    var grid = effGridPx() / 2;

    if (drag.kind === "move") {
      var nx = p[0] - drag.offsetX;
      var ny = p[1] - drag.offsetY;
      if (!ev.shiftKey) { // Shift でスナップ解除
        nx = LP.snap(nx, grid);
        ny = LP.snap(ny, grid);
      }
      if (nx !== item.x || ny !== item.y) {
        LP.commit(function () {
          item.x = nx;
          item.y = ny;
        });
      }
    } else if (drag.kind === "resize") {
      // ポインタ位置を回転前の局所座標に戻して幅・高さを求める
      var local = LP.rotatePoint(p[0], p[1], drag.cx, drag.cy, -drag.rot);
      var nw = local[0] - item.x;
      var nh = local[1] - item.y;
      if (!ev.shiftKey) {
        nw = LP.snap(nw, grid);
        nh = LP.snap(nh, grid);
      }
      nw = Math.max(10, nw);
      nh = Math.max(10, nh);
      if (nw !== item.w || nh !== item.h) {
        LP.commit(function () {
          item.w = nw;
          item.h = nh;
        });
      }
    }
    // kind === "rotate" はドラッグ中の処理なし
  }

  function placePointerUp(ev) {
    if (drag) {
      // クリック・ドラッグいずれもそのアイテムを選択
      // (setPointerCapture 中は ev.target が svg になるため drag から特定)
      var id = drag.itemId;
      LP.commit(function (s) {
        s.ui.selection = { type: "item", id: id };
      });
      drag = null;
      return;
    }
    placeClick(ev);
  }

  function editLabel(ev) {
    var itemEl = ev.target.closest(".item");
    if (!itemEl) { return; }
    var item = LP.findItem(itemEl.dataset.itemId);
    if (!item) { return; }
    var tpl = LP.findTemplate(LP.state.doc, item.templateId);
    var current = item.label || (tpl ? tpl.name : "");
    var name = prompt("名前を入力してください", current);
    if (name === null) { return; }
    LP.commit(function () { item.label = name.trim(); });
  }

  // ================= 接続モード =================
  function connectClick(ev) {
    var ui = LP.state.ui;
    var portEl = ev.target.closest(".port");

    if (portEl) {
      handlePortClick(portEl);
      return;
    }
    // ケーブル選択
    var cableEl = ev.target.closest(".cable");
    LP.commit(function (s) {
      s.ui.selection = cableEl ? { type: "cable", id: cableEl.dataset.cableId } : null;
      if (!cableEl) { s.ui.pendingPort = null; }
    });
    clearOverlay();
  }

  function handlePortClick(portEl) {
    var ui = LP.state.ui;
    var itemId = portEl.dataset.itemId;
    var portId = portEl.dataset.portId;
    if (!ui.cableType) {
      LP.toast("先に左のパレットからケーブルを選択してください");
      return;
    }
    var item = LP.findItem(itemId);
    var tpl = LP.findTemplate(LP.state.doc, item.templateId);
    var port = null;
    tpl.ports.forEach(function (p) { if (p.id === portId) { port = p; } });
    if (!port) { return; }

    var cableDef = LP.CABLE_TYPES[ui.cableType];

    if (LP.isPortUsed(itemId, portId)) {
      LP.toast("このポートは使用中です");
      return;
    }

    if (!ui.pendingPort) {
      // 1点目
      var ends = LP.compatibleEnds(ui.cableType, port.type);
      if (ends.length === 0) {
        LP.toast(LP.PORT_TYPES[port.type].label + " には " + cableDef.label + " を接続できません");
        return;
      }
      LP.commit(function (s) {
        s.ui.pendingPort = { itemId: itemId, portId: portId, endIndex: ends[0] };
      });
      return;
    }

    // 2点目
    if (ui.pendingPort.itemId === itemId && ui.pendingPort.portId === portId) {
      // 同じポート再クリック → キャンセル
      LP.commit(function (s) { s.ui.pendingPort = null; });
      clearOverlay();
      return;
    }
    var pendingPortDef = LP.findPort(ui.pendingPort.itemId, ui.pendingPort.portId);
    var err = pendingPortDef
      ? LP.connectError(ui.cableType, ui.pendingPort.endIndex, pendingPortDef.type, port.type)
      : "接続元ポートが見つかりません";
    if (err) {
      LP.toast(err);
      return;
    }
    var pending = ui.pendingPort;
    LP.commit(function (s) {
      var endA, endB;
      if (pending.endIndex === 0) {
        endA = { itemId: pending.itemId, portId: pending.portId };
        endB = { itemId: itemId, portId: portId };
      } else {
        endA = { itemId: itemId, portId: portId };
        endB = { itemId: pending.itemId, portId: pending.portId };
      }
      s.doc.cables.push({ id: LP.newId("cable"), type: s.ui.cableType, a: endA, b: endB });
      s.ui.pendingPort = null;
    });
    clearOverlay();
  }

  function connectMove(ev) {
    var ui = LP.state.ui;
    clearOverlay();
    if (!ui.pendingPort) { return; }
    var from = LP.portXY({ itemId: ui.pendingPort.itemId, portId: ui.pendingPort.portId });
    if (!from) { return; }
    var p = svgPoint(ev);
    LP.svgEl("path", {
      "class": "preview-line",
      d: LP.cablePath(from[0], from[1], p[0], p[1])
    }, overlay());
    // 長さプレビュー
    var zc = LP.zoomComp();
    var meters = LP.cableLengthMeters(from[0], from[1], p[0], p[1], LP.state.doc.settings);
    var t = LP.svgEl("text", {
      "class": "cable-length", x: (from[0] + p[0]) / 2, y: (from[1] + p[1]) / 2 - 8 / zc,
      "text-anchor": "middle", "font-size": (11 / zc), fill: "#b06d0a"
    }, overlay());
    t.textContent = LP.formatMeters(meters);
  }

  // ================= 削除 =================
  function deleteSelection() {
    var sel = LP.state.ui.selection;
    if (!sel) { return; }
    if (sel.type === "room") {
      var room = LP.findRoom(sel.id);
      if (room && confirm("「" + room.name + "」を削除しますか？(配置済みの機器は残ります)")) {
        LP.commit(function (s) {
          s.doc.rooms = s.doc.rooms.filter(function (r) { return r.id !== sel.id; });
          s.ui.selection = null;
        });
      }
    } else if (sel.type === "item") {
      var item = LP.findItem(sel.id);
      if (!item) { return; }
      var cables = LP.cablesOfItem(sel.id);
      var tpl = LP.findTemplate(LP.state.doc, item.templateId);
      var name = item.label || (tpl ? tpl.name : "アイテム");
      var msg = "「" + name + "」を削除しますか？";
      if (cables.length > 0) {
        msg += "\n接続中のケーブル " + cables.length + " 本も削除されます。";
      }
      if (confirm(msg)) {
        LP.commit(function (s) {
          s.doc.items = s.doc.items.filter(function (it) { return it.id !== sel.id; });
          s.doc.cables = s.doc.cables.filter(function (c) {
            return c.a.itemId !== sel.id && c.b.itemId !== sel.id;
          });
          s.ui.selection = null;
        });
      }
    } else if (sel.type === "cable") {
      LP.commit(function (s) {
        s.doc.cables = s.doc.cables.filter(function (c) { return c.id !== sel.id; });
        s.ui.selection = null;
      });
    }
  }

  // ================= 回転 =================
  function rotateSelection() {
    var sel = LP.state.ui.selection;
    if (!sel || sel.type !== "item") { return; }
    var item = LP.findItem(sel.id);
    if (!item) { return; }
    LP.commit(function () {
      item.rotation = ((item.rotation || 0) + 90) % 360;
    });
  }

  // ================= イベント登録 =================
  LP.initInteractions = function () {
    svg = document.getElementById("canvas");

    svg.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 0) { return; }
      if (LP.state.ui.mode === "place") { placePointerDown(ev); }
    });

    svg.addEventListener("pointermove", function (ev) {
      var mode = LP.state.ui.mode;
      if (mode === "room") { roomMove(ev); }
      else if (mode === "place") { placePointerMove(ev); }
      else if (mode === "connect") { connectMove(ev); }
    });

    svg.addEventListener("pointerup", function (ev) {
      if (ev.button !== 0) { return; }
      var mode = LP.state.ui.mode;
      if (mode === "room") { roomClick(ev); }
      else if (mode === "place") { placePointerUp(ev); }
      else if (mode === "connect") { connectClick(ev); }
    });

    svg.addEventListener("dblclick", function (ev) {
      var mode = LP.state.ui.mode;
      if (mode === "room") { finishRoom(); }
      else if (mode === "place") { editLabel(ev); }
    });

    document.addEventListener("keydown", function (ev) {
      // 入力欄・ダイアログ内では無効
      var tag = (ev.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" ||
          document.getElementById("template-dialog").open) { return; }

      if (ev.key === "Escape") {
        LP.commit(function (s) {
          s.ui.drawingPoints = [];
          s.ui.pendingPort = null;
          s.ui.placingTemplateId = null;
          s.ui.selection = null;
        });
        clearOverlay();
      } else if (ev.key === "Enter" && LP.state.ui.mode === "room") {
        finishRoom();
      } else if (ev.key === "Delete" || ev.key === "Backspace") {
        deleteSelection();
      } else if (ev.key === "r" || ev.key === "R") {
        rotateSelection();
      } else if (ev.key === "1") { LP.setMode("room"); }
      else if (ev.key === "2") { LP.setMode("place"); }
      else if (ev.key === "3") { LP.setMode("connect"); }
    });
  };
})(window.LP = window.LP || {});
