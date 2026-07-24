/* AG-ENT 단가 이력 — 화면 구성 */

var gRoot = document.getElementById("groot");
var gState = {
  mode: "each",        // each(개별) | multi(선택) | all(전체)
  unit: "day",         // day | week | month | year
  field: "숏폼 1채널",
  picked: [],          // multi 모드에서 선택한 크리에이터
  from: null, to: null,
  ready: false
};

function gInit() {
  gRender();
  Promise.all([
    fetchCSV(HIST_CSV_URL).then(parseHistory).catch(function (e) { loadErr = "이력 시트를 불러오지 못했습니다."; return []; }),
    fetchCSV(CUR_CSV_URL).then(parseCurrent).catch(function (e) { loadErr = "단가 시트를 불러오지 못했습니다."; return []; })
  ]).then(function (res) {
    histRows = res[0]; curData = res[1];
    // 기본 기간: 이력 전체 (없으면 최근 30일)
    var now = new Date();
    var todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    // 이력에 오늘 이후 기록이 있으면(시간대 차이) 그것까지 포함
    if (histRows.length) {
      var last = histRows[histRows.length - 1].t;
      gState.from = new Date(histRows[0].t.getTime());
      gState.from.setHours(0, 0, 0, 0);
      gState.to = last > todayEnd ? new Date(last.getTime() + 60000) : todayEnd;
    } else {
      gState.from = new Date(now.getTime() - 30 * 86400000);
      gState.from.setHours(0, 0, 0, 0);
      gState.to = todayEnd;
    }
    gState.ready = true;
    gRender();
  });
}

function fmtDate(d) {
  if (!d) return "";
  function z(n) { return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
}

// 크리에이터 목록 (이력에 등장한 사람 + 현재 명단)
function allNames() {
  var set = {}, out = [];
  curData.forEach(function (c) { if (!set[c.n]) { set[c.n] = 1; out.push(c.n); } });
  histRows.forEach(function (h) { if (!set[h.name]) { set[h.name] = 1; out.push(h.name); } });
  return out;
}

// 시계열 생성
function buildSeries() {
  var buckets = makeBuckets(gState.from, gState.to, gState.unit);
  var series = [];

  if (gState.mode === "all") {
    // 전체 평균
    var pts = buckets.map(function (b) {
      var sum = 0, cnt = 0;
      curData.forEach(function (c) {
        var v = priceAt(c.n, gState.field, b.end);
        if (v != null) { sum += v; cnt++; }
      });
      return { x: b.key, y: cnt ? Math.round(sum / cnt) : null };
    });
    series.push({ label: "전체 평균 · " + gState.field, points: pts });
  } else {
    var names = gState.mode === "each"
      ? (gState.picked.length ? [gState.picked[0]] : [])
      : gState.picked;
    names.slice(0, 8).forEach(function (nm) {
      var pts = buckets.map(function (b) {
        return { x: b.key, y: priceAt(nm, gState.field, b.end) };
      });
      series.push({ label: nm, points: pts });
    });
  }
  return { series: series, buckets: buckets };
}

function gRender() {
  var h = [];

  h.push('<div class="g-wrap">');

  // 헤더
  h.push('<div class="g-head">');
  h.push('<div class="g-title">AG-ENT 단가 변동 추이</div>');
  h.push('<a class="g-back" href="index.html">← 단가표로</a>');
  h.push('</div>');

  if (!gState.ready) {
    h.push('<div class="g-loading">이력을 불러오는 중…</div>');
    h.push('</div>');
    gRoot.innerHTML = h.join("");
    return;
  }

  if (loadErr) h.push('<div class="g-err">' + gEsc(loadErr) + '</div>');

  // 컨트롤
  h.push('<div class="g-controls">');

  h.push('<div class="g-ctl"><label>보기</label><div class="g-seg">');
  [["each", "개별"], ["multi", "선택 비교"], ["all", "전체 평균"]].forEach(function (m) {
    h.push('<button class="g-sg' + (gState.mode === m[0] ? " on" : "") + '" data-mode="' + m[0] + '">' + m[1] + '</button>');
  });
  h.push('</div></div>');

  h.push('<div class="g-ctl"><label>기간 단위</label><div class="g-seg">');
  [["day", "일별"], ["week", "주차별"], ["month", "월별"], ["year", "연도별"]].forEach(function (u) {
    h.push('<button class="g-sg' + (gState.unit === u[0] ? " on" : "") + '" data-unit="' + u[0] + '">' + u[1] + '</button>');
  });
  h.push('</div></div>');

  h.push('<div class="g-ctl"><label>항목</label><select id="g-field">');
  FIELDS.forEach(function (f) {
    h.push('<option value="' + gEsc(f) + '"' + (gState.field === f ? " selected" : "") + '>' + gEsc(f) + '</option>');
  });
  h.push('</select></div>');

  h.push('<div class="g-ctl"><label>기간</label>');
  h.push('<input type="date" id="g-from" value="' + fmtDate(gState.from) + '"> ~ ');
  h.push('<input type="date" id="g-to" value="' + fmtDate(gState.to) + '">');
  h.push('</div>');

  h.push('</div>');

  // 크리에이터 선택 (개별/비교 모드)
  if (gState.mode !== "all") {
    var names = allNames();
    h.push('<div class="g-picker">');
    h.push('<input type="text" id="g-search" class="g-search" placeholder="크리에이터 검색">');
    h.push('<div class="g-chips">');
    gState.picked.forEach(function (nm) {
      h.push('<span class="g-chip">' + gEsc(nm) + '<button data-rm="' + gEsc(nm) + '">×</button></span>');
    });
    if (!gState.picked.length) h.push('<span class="g-hint">아래에서 크리에이터를 선택하세요' + (gState.mode === "multi" ? " (최대 8명)" : "") + '</span>');
    h.push('</div>');
    h.push('<div class="g-list" id="g-list">');
    names.slice(0, 60).forEach(function (nm) {
      h.push('<button class="g-name' + (gState.picked.indexOf(nm) >= 0 ? " on" : "") + '" data-name="' + gEsc(nm) + '">' + gEsc(nm) + '</button>');
    });
    h.push('</div></div>');
  }

  // 차트
  var built = buildSeries();
  h.push('<div class="g-chart">');
  if (!built.series.length) {
    h.push('<div class="g-empty">크리에이터를 선택하면 추이가 표시됩니다.</div>');
  } else {
    h.push(renderChart(built.series, built.buckets, { alwaysLegend: gState.mode !== "each" }));
  }
  h.push('</div>');

  // 변동 내역 표
  h.push('<div class="g-section">변동 내역');
  h.push('<span class="g-sub">' + histRows.length + '건 기록됨</span></div>');
  h.push('<div class="g-tablewrap"><table class="g-table">');
  h.push('<thead><tr><th>일시</th><th>크리에이터</th><th>항목</th><th>이전</th><th>변경</th><th>변동</th><th>수정자</th></tr></thead><tbody>');
  var shown = histRows.filter(function (r) {
    if (r.t < gState.from || r.t > gState.to) return false;
    if (gState.mode !== "all" && gState.picked.length && gState.picked.indexOf(r.name) < 0) return false;
    return true;
  }).slice().reverse().slice(0, 200);
  if (!shown.length) {
    h.push('<tr><td colspan="7" class="g-empty2">해당 기간에 변동 기록이 없습니다.</td></tr>');
  } else {
    shown.forEach(function (r) {
      var diff = (r.before != null && r.after != null) ? r.after - r.before : null;
      var cls = diff == null ? "" : (diff > 0 ? "up" : (diff < 0 ? "down" : ""));
      var arrow = diff == null ? "-" : (diff > 0 ? "▲ " + fmtMoney(diff) : (diff < 0 ? "▼ " + fmtMoney(-diff) : "-"));
      h.push('<tr>'
        + '<td class="g-ts">' + gEsc(r.ts) + '</td>'
        + '<td class="g-nm">' + gEsc(r.name) + '</td>'
        + '<td>' + gEsc(r.field) + '</td>'
        + '<td class="g-num">' + fmtMoney(r.before) + '</td>'
        + '<td class="g-num">' + fmtMoney(r.after) + '</td>'
        + '<td class="g-num ' + cls + '">' + arrow + '</td>'
        + '<td class="g-who">' + gEsc(r.who) + '</td></tr>');
    });
  }
  h.push('</tbody></table></div>');

  h.push('</div>');
  gRoot.innerHTML = h.join("");
  gBind();
}

function gBind() {
  var byId = function (id) { return document.getElementById(id); };

  var segs = gRoot.querySelectorAll(".g-sg");
  for (var i = 0; i < segs.length; i++) {
    segs[i].onclick = function () {
      var m = this.getAttribute("data-mode"), u = this.getAttribute("data-unit");
      if (m) { gState.mode = m; if (m === "each" && gState.picked.length > 1) gState.picked = [gState.picked[0]]; }
      if (u) gState.unit = u;
      gRender();
    };
  }

  var fs = byId("g-field");
  if (fs) fs.onchange = function () { gState.field = this.value; gRender(); };

  var ff = byId("g-from"), ft = byId("g-to");
  if (ff) ff.onchange = function () { var d = new Date(this.value); if (!isNaN(d)) { gState.from = d; gRender(); } };
  if (ft) ft.onchange = function () { var d = new Date(this.value); if (!isNaN(d)) { d.setHours(23, 59, 59); gState.to = d; gRender(); } };

  var names = gRoot.querySelectorAll(".g-name");
  for (var j = 0; j < names.length; j++) {
    names[j].onclick = function () {
      var nm = this.getAttribute("data-name");
      var idx = gState.picked.indexOf(nm);
      if (gState.mode === "each") {
        gState.picked = idx >= 0 ? [] : [nm];
      } else {
        if (idx >= 0) gState.picked.splice(idx, 1);
        else if (gState.picked.length < 8) gState.picked.push(nm);
      }
      gRender();
    };
  }

  var rms = gRoot.querySelectorAll("[data-rm]");
  for (var k = 0; k < rms.length; k++) {
    rms[k].onclick = function () {
      var nm = this.getAttribute("data-rm");
      var idx = gState.picked.indexOf(nm);
      if (idx >= 0) { gState.picked.splice(idx, 1); gRender(); }
    };
  }

  var sc = byId("g-search");
  if (sc) {
    sc.oninput = function () {
      var q = this.value.toLowerCase();
      var list = gRoot.querySelectorAll(".g-name");
      for (var i = 0; i < list.length; i++) {
        var nm = list[i].getAttribute("data-name").toLowerCase();
        list[i].style.display = (!q || nm.indexOf(q) >= 0) ? "" : "none";
      }
    };
  }
}

gInit();
