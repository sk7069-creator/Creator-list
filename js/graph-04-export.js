/* AG-ENT 단가 이력 — 추출 (이미지 · CSV · 텍스트) */

function gToast(msg) {
  var el = document.getElementById("g-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "g-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = "show";
  clearTimeout(gToast._t);
  gToast._t = setTimeout(function () { el.className = ""; }, 3000);
}

function gDownload(blob, filename) {
  try {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 800);
    return true;
  } catch (e) {
    gToast("다운로드 실패: " + (e.message || e));
    return false;
  }
}

function gStamp() {
  var d = new Date();
  function z(n) { return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "_" + z(d.getHours()) + z(d.getMinutes());
}

// ── 1) 그래프 이미지 저장 (SVG → PNG) ──
function exportChartImage() {
  var wrap = document.getElementById("g-chart");
  var svg = wrap ? wrap.querySelector("svg") : null;
  if (!svg) { gToast("먼저 크리에이터를 선택해 주세요."); return; }

  var vb = (svg.getAttribute("viewBox") || "0 0 980 380").split(/\s+/);
  var W = parseFloat(vb[2]) || 980;
  var H = parseFloat(vb[3]) || 380;

  // 제목 · 범례를 포함한 캡션 구성
  var titleEl = wrap.querySelector(".g-charttitle");
  var title = titleEl ? titleEl.textContent : gState.field;
  var legendItems = [];
  wrap.querySelectorAll(".g-lg").forEach(function (el) {
    var i = el.querySelector("i");
    var color = i ? (i.style.background || "#2E5CB8") : "#2E5CB8";
    legendItems.push({ label: el.textContent.trim(), color: color });
  });

  var padTop = 54;
  var padBottom = legendItems.length ? 46 : 22;
  var outW = W, outH = H + padTop + padBottom;
  var scale = 2; // 선명하게

  // SVG를 문자열로 (CSS 변수 미사용, 인라인 속성만 쓰므로 그대로 직렬화 가능)
  var inner = svg.innerHTML;

  var parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + outW + '" height="' + outH + '" viewBox="0 0 ' + outW + ' ' + outH + '">');
  parts.push('<rect width="100%" height="100%" fill="#ffffff"/>');
  parts.push('<text x="24" y="30" font-family="Malgun Gothic, sans-serif" font-size="15" font-weight="700" fill="#111">AG-ENT 단가 변동 추이</text>');
  parts.push('<text x="24" y="47" font-family="Malgun Gothic, sans-serif" font-size="11.5" fill="#8a8375">' + gEsc(title) + '</text>');
  parts.push('<g transform="translate(0,' + padTop + ')">');
  parts.push('<style>.g-axis{font-size:10.5px;fill:#8a8375;font-family:Malgun Gothic,sans-serif}</style>');
  parts.push(inner);
  parts.push('</g>');

  if (legendItems.length) {
    var lx = 24, ly = padTop + H + 26;
    legendItems.forEach(function (it) {
      parts.push('<rect x="' + lx + '" y="' + (ly - 7) + '" width="12" height="3" rx="1.5" fill="' + it.color + '"/>');
      parts.push('<text x="' + (lx + 18) + '" y="' + ly + '" font-family="Malgun Gothic, sans-serif" font-size="11" fill="#555">' + gEsc(it.label) + '</text>');
      lx += 20 + it.label.length * 12 + 18;
    });
  }
  parts.push('</svg>');

  var svgStr = parts.join("");
  var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  var url = URL.createObjectURL(blob);

  var img = new Image();
  img.onload = function () {
    try {
      var canvas = document.createElement("canvas");
      canvas.width = outW * scale;
      canvas.height = outH * scale;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob(function (png) {
        if (!png) { gToast("이미지 변환에 실패했습니다."); return; }
        var who = gState.mode === "all" ? "전체평균"
          : (gState.picked.length === 1 ? gState.picked[0] : gState.picked.length + "명");
        gDownload(png, "단가추이_" + who + "_" + gStamp() + ".png");
        gToast("그래프 이미지를 저장했습니다.");
      }, "image/png");
    } catch (e) {
      URL.revokeObjectURL(url);
      gToast("이미지 저장 실패: " + (e.message || e));
    }
  };
  img.onerror = function () {
    URL.revokeObjectURL(url);
    gToast("이미지 변환에 실패했습니다.");
  };
  img.src = url;
}

// ── 2) 변동 내역 CSV 저장 ──
function exportLogsCSV() {
  var logs = filteredLogs();
  if (!logs.length) { gToast("추출할 기록이 없습니다."); return; }

  var rows = [["일시", "크리에이터", "항목", "이전값", "변경값", "변동", "수정자"]];
  logs.slice().reverse().forEach(function (r) {
    var diff = (r.before != null && r.after != null) ? (r.after - r.before) : "";
    rows.push([
      r.ts, r.name, r.field,
      r.before == null ? "" : r.before,
      r.after == null ? "" : r.after,
      diff === "" ? "" : (diff > 0 ? "+" + diff : String(diff)),
      r.who
    ]);
  });

  var csv = rows.map(function (r) {
    return r.map(function (c) {
      var s = String(c == null ? "" : c);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",");
  }).join("\r\n");

  gDownload(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), "단가변동내역_" + gStamp() + ".csv");
  gToast(logs.length + "건을 CSV로 저장했습니다.");
}

// ── 3) 변동 내역 텍스트 복사 ──
function exportLogsText() {
  var logs = filteredLogs();
  if (!logs.length) { gToast("추출할 기록이 없습니다."); return; }

  var head = "[AG-ENT 단가 변동 내역]\n"
    + "기간: " + fmtDate(gState.logFrom) + " ~ " + fmtDate(gState.logTo)
    + (gState.logDay ? " (" + gState.logDay + "만)" : "")
    + (gState.logNames.length ? "\n대상: " + gState.logNames.join(", ") : "")
    + (gState.logWho ? "\n수정자: " + gState.logWho : "")
    + "\n총 " + logs.length + "건\n\n";

  var body = logs.slice().reverse().map(function (r) {
    var diff = (r.before != null && r.after != null) ? r.after - r.before : null;
    var mark = diff == null ? "" : (diff > 0 ? " (▲" + fmtMoney(diff) + ")" : (diff < 0 ? " (▼" + fmtMoney(-diff) + ")" : ""));
    return r.ts + " · " + r.name + " · " + r.field + " : "
      + fmtMoney(r.before) + " → " + fmtMoney(r.after) + mark
      + (r.who ? " · " + r.who : "");
  }).join("\n");

  var text = head + body;

  function fallback() {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      gToast(ok ? (logs.length + "건을 복사했습니다.") : "복사에 실패했습니다.");
    } catch (e) {
      gToast("복사에 실패했습니다.");
    }
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      gToast(logs.length + "건을 클립보드에 복사했습니다.");
    }, fallback);
  } else {
    fallback();
  }
}
