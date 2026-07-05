/* 幾何計算(純関数): スナップ・多角形・ポート座標・ケーブル経路 */
(function (LP) {
  "use strict";

  // グリッドスナップ
  LP.snap = function (v, grid) {
    return Math.round(v / grid) * grid;
  };

  LP.snapPoint = function (x, y, grid) {
    return [LP.snap(x, grid), LP.snap(y, grid)];
  };

  // 多角形の重心(ラベル配置用の簡易版: 頂点平均)
  LP.polygonCenter = function (points) {
    var sx = 0, sy = 0;
    points.forEach(function (p) { sx += p[0]; sy += p[1]; });
    return [sx / points.length, sy / points.length];
  };

  // 点の回転(cx,cy中心, deg度)
  LP.rotatePoint = function (x, y, cx, cy, deg) {
    var rad = deg * Math.PI / 180;
    var dx = x - cx, dy = y - cy;
    return [
      cx + dx * Math.cos(rad) - dy * Math.sin(rad),
      cy + dx * Math.sin(rad) + dy * Math.cos(rad)
    ];
  };

  // アイテムの実効サイズ(個別指定があればそれを、なければテンプレート値)
  LP.itemSize = function (item, template) {
    return {
      w: item.w || template.width,
      h: item.h || template.height
    };
  };

  // アイテムのポート座標を計算(回転適用後の絶対座標)
  // 機器矩形の上辺→右辺→下辺→左辺の順に等間隔で配置
  LP.portPositions = function (item, template) {
    var n = template.ports.length;
    if (n === 0) { return []; }
    var size = LP.itemSize(item, template);
    var w = size.w, h = size.h;
    var perimeter = 2 * (w + h);
    var positions = [];
    var cx = item.x + w / 2, cy = item.y + h / 2;
    for (var i = 0; i < n; i++) {
      // 周囲に等間隔配置(角を避けるため半ステップオフセット)
      var d = perimeter * (i + 0.5) / n;
      var px, py;
      if (d < w) { px = item.x + d; py = item.y; }
      else if (d < w + h) { px = item.x + w; py = item.y + (d - w); }
      else if (d < 2 * w + h) { px = item.x + w - (d - w - h); py = item.y + h; }
      else { px = item.x; py = item.y + h - (d - 2 * w - h); }
      var rotated = LP.rotatePoint(px, py, cx, cy, item.rotation || 0);
      positions.push({ port: template.ports[i], x: rotated[0], y: rotated[1] });
    }
    return positions;
  };

  // ケーブルのベジェパス(軽い垂み)
  LP.cablePath = function (x1, y1, x2, y2) {
    var mx = (x1 + x2) / 2;
    var my = (y1 + y2) / 2;
    var dist = Math.hypot(x2 - x1, y2 - y1);
    var sag = Math.min(30, dist * 0.15) + 8; // 距離に応じた垂み
    return "M " + x1 + " " + y1 +
      " Q " + mx + " " + (my + sag) + " " + x2 + " " + y2;
  };

  // ズームに応じた実効グリッド(ズームインで細かく、アウトで粗く)
  // 画面上の点間隔が約12〜24pxに収まるよう2倍/半分に切り替える
  LP.effectiveGrid = function (settings, zoom) {
    var px = settings.gridSize;          // 基準: 25px = 0.5m
    var m = settings.scaleMetersPerGrid;
    while (px * zoom > 24 && m > 0.126) { px /= 2; m /= 2; } // 最小 0.125m
    while (px * zoom < 12 && m < 1) { px *= 2; m *= 2; }     // 最大 1m
    return { px: px, m: m };
  };

  // px距離 → 実寸(m)。ケーブルの最小要求長さはポート間の直線距離とする
  LP.pxToMeters = function (px, settings) {
    var grid = (settings && settings.gridSize) || LP.GRID_SIZE;
    var scale = (settings && settings.scaleMetersPerGrid) || LP.SCALE_METERS_PER_GRID;
    return px / grid * scale;
  };

  LP.formatMeters = function (m) {
    return (Math.ceil(m * 10) / 10).toFixed(1) + "m"; // 0.1m単位で切り上げ
  };

  // ケーブルの最小要求長さ(m)
  LP.cableLengthMeters = function (x1, y1, x2, y2, settings) {
    return LP.pxToMeters(Math.hypot(x2 - x1, y2 - y1), settings);
  };

  // クライアント座標 → SVG座標
  LP.clientToSvg = function (svg, clientX, clientY) {
    var pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    var m = svg.getScreenCTM();
    if (!m) { return [0, 0]; }
    var p = pt.matrixTransform(m.inverse());
    return [p.x, p.y];
  };
})(window.LP = window.LP || {});
