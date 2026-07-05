/* 定数定義: ポート種別・ケーブル種別・互換表・グリッド */
(function (LP) {
  "use strict";

  LP.GRID_SIZE = 25; // グリッド点の間隔(px)
  LP.SCALE_METERS_PER_GRID = 0.5; // グリッド1マスの実寸(m)

  // ポート種別 (dir: 信号・電力の方向。IN/OUT表示と接続方向チェックに使用)
  LP.PORT_TYPES = {
    "power-in":      { label: "電源(入力)",       color: "#222222", dir: "IN" },
    "power-out":     { label: "電源(供給)",       color: "#666666", dir: "OUT" },
    "hdmi-in":       { label: "HDMI入力",        color: "#c0392b", dir: "IN" },
    "hdmi-out":      { label: "HDMI出力",        color: "#e07b6a", dir: "OUT" },
    "usb-a":         { label: "USB Type-A",      color: "#27ae60", dir: null },
    "usb-c":         { label: "USB Type-C",      color: "#145a32", dir: null },
    "usb-a-pwr-in":  { label: "USB-A電源(入力)", color: "#e67e22", dir: "IN" },
    "usb-a-pwr-out": { label: "USB-A電源(供給)", color: "#f5b041", dir: "OUT" },
    "usb-c-pwr-in":  { label: "USB-C電源(入力)", color: "#8e44ad", dir: "IN" },
    "usb-c-pwr-out": { label: "USB-C電源(供給)", color: "#bb8fce", dir: "OUT" },
    "lan":           { label: "LAN",             color: "#2980b9", dir: null }
  };

  // 電源を受けるポート種別(⚡電源なし判定に使用)
  LP.POWER_IN_TYPES = ["power-in", "usb-a-pwr-in", "usb-c-pwr-in"];

  // USBコネクタ形状ごとのポート群(データ・電源とも物理的には同じ口)
  var USB_A_FAMILY = ["usb-a", "usb-a-pwr-in", "usb-a-pwr-out"];
  var USB_C_FAMILY = ["usb-c", "usb-c-pwr-in", "usb-c-pwr-out"];

  // ケーブル種別: ends = [端Aの許容ポート種別リスト, 端Bの許容ポート種別リスト]
  LP.CABLE_TYPES = {
    "power":  { label: "電源コード",      color: "#222222", ends: [["power-out"], ["power-in"]] },
    "lan":    { label: "LANケーブル",     color: "#2980b9", ends: [["lan"], ["lan"]] },
    "hdmi":   { label: "HDMIケーブル",    color: "#c0392b", ends: [["hdmi-out"], ["hdmi-in"]] },
    "usb-ac": { label: "USBケーブル A-C", color: "#27ae60", ends: [USB_A_FAMILY, USB_C_FAMILY] },
    "usb-aa": { label: "USBケーブル A-A", color: "#82c91e", ends: [USB_A_FAMILY, USB_A_FAMILY] },
    "usb-cc": { label: "USBケーブル C-C", color: "#145a32", ends: [USB_C_FAMILY, USB_C_FAMILY] }
  };

  // 指定ポート種別に接続し得るケーブル端があるか
  // 戻り値: cableType の端インデックス(0/1)の配列
  LP.compatibleEnds = function (cableType, portType) {
    var def = LP.CABLE_TYPES[cableType];
    if (!def) { return []; }
    var result = [];
    if (def.ends[0].indexOf(portType) >= 0) { result.push(0); }
    if (def.ends[1].indexOf(portType) >= 0) { result.push(1); }
    return result;
  };

  // 1点目(pendingPortType, 使用端 pendingEndIndex)から targetPortType へ接続できるか
  // 戻り値: null = 接続可 / 文字列 = 不可の理由
  LP.connectError = function (cableType, pendingEndIndex, pendingPortType, targetPortType) {
    var def = LP.CABLE_TYPES[cableType];
    var allowed = def.ends[1 - pendingEndIndex];
    if (allowed.indexOf(targetPortType) < 0) {
      return LP.PORT_TYPES[targetPortType].label + " には " + def.label +
        " のこの端子を接続できません";
    }
    var d1 = LP.PORT_TYPES[pendingPortType].dir;
    var d2 = LP.PORT_TYPES[targetPortType].dir;
    if (d1 && d2 && d1 === d2) {
      return "供給(OUT)と入力(IN)の組み合わせで接続してください(" + d1 + "同士は不可)";
    }
    return null;
  };

  LP.STORAGE_KEY = "venue-layout-planner:v1:autosave";
  LP.SCHEMA_VERSION = 1;
})(window.LP = window.LP || {});
