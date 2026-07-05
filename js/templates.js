/* デフォルト機器・什器テンプレート定義 */
(function (LP) {
  "use strict";

  function ports(spec) {
    // spec: [["power-in", 1], ["hdmi-in", 2], ...] → ポート配列に展開
    var list = [];
    var n = 1;
    spec.forEach(function (pair) {
      var type = pair[0];
      var count = pair[1];
      for (var i = 0; i < count; i++) {
        var label = LP.PORT_TYPES[type].label + (count > 1 ? String(i + 1) : "");
        list.push({ id: "p" + n, type: type, label: label });
        n += 1;
      }
    });
    return list;
  }

  LP.DEFAULT_TEMPLATES = [
    // 什器
    { id: "tpl-desk", name: "机", kind: "furniture", builtin: true,
      width: 100, height: 50, color: "#c8a165", ports: [] },
    { id: "tpl-chair", name: "椅子", kind: "furniture", builtin: true,
      width: 30, height: 30, color: "#8d6e4a", ports: [] },
    { id: "tpl-outlet", name: "電源(コンセント)", kind: "furniture", builtin: true,
      width: 30, height: 20, color: "#555555", ports: ports([["power-out", 2]]) },
    // 機器
    { id: "tpl-console", name: "ゲーム機", kind: "device", builtin: true,
      width: 50, height: 35, color: "#5d6dbe", ports: ports([["power-in", 1], ["hdmi-out", 1], ["lan", 1], ["usb-a", 2]]) },
    { id: "tpl-monitor", name: "モニタ", kind: "device", builtin: true,
      width: 70, height: 20, color: "#34495e", ports: ports([["power-in", 1], ["hdmi-in", 2]]) },
    { id: "tpl-tap", name: "電源タップ", kind: "device", builtin: true,
      width: 80, height: 20, color: "#7f8c8d", ports: ports([["power-in", 1], ["power-out", 6]]) },
    { id: "tpl-usb-outlet", name: "USBコンセント", kind: "device", builtin: true,
      width: 40, height: 25, color: "#e67e22",
      ports: ports([["power-in", 1], ["usb-a-pwr-out", 1], ["usb-c-pwr-out", 1]]) },
    { id: "tpl-wifi", name: "WiFiアクセスポイント", kind: "device", builtin: true,
      width: 40, height: 40, color: "#16a085", ports: ports([["power-in", 1], ["lan", 4]]) },
    { id: "tpl-pc", name: "PC", kind: "device", builtin: true,
      width: 45, height: 60, color: "#4a6fa5", ports: ports([["power-in", 1], ["hdmi-out", 1], ["usb-a", 4], ["usb-c", 1], ["lan", 1]]) },
    { id: "tpl-keyboard", name: "キーボード", kind: "device", builtin: true,
      width: 60, height: 20, color: "#95a5a6", ports: ports([["usb-a", 1]]) },
    { id: "tpl-mouse", name: "マウス", kind: "device", builtin: true,
      width: 20, height: 30, color: "#95a5a6", ports: ports([["usb-a", 1]]) },
    { id: "tpl-splitter", name: "HDMIスプリッタ", kind: "device", builtin: true,
      width: 50, height: 30, color: "#b03a5b", ports: ports([["power-in", 1], ["hdmi-in", 1], ["hdmi-out", 2]]) },
    { id: "tpl-projector", name: "プロジェクタ", kind: "device", builtin: true,
      width: 55, height: 40, color: "#d35400", ports: ports([["power-in", 1], ["hdmi-in", 2], ["usb-a", 1]]) }
  ];

  // テンプレート検索(デフォルト + カスタム)
  LP.findTemplate = function (doc, templateId) {
    var i;
    for (i = 0; i < LP.DEFAULT_TEMPLATES.length; i++) {
      if (LP.DEFAULT_TEMPLATES[i].id === templateId) { return LP.DEFAULT_TEMPLATES[i]; }
    }
    for (i = 0; i < doc.templates.length; i++) {
      if (doc.templates[i].id === templateId) { return doc.templates[i]; }
    }
    return null;
  };

  LP.allTemplates = function (doc) {
    return LP.DEFAULT_TEMPLATES.concat(doc.templates);
  };
})(window.LP = window.LP || {});
