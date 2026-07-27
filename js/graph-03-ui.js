/* AG-ENT 단가 이력 — 화면 구성 */

var gRoot = document.getElementById("groot");

var gState = {
  // 상단: 보기 방식
  mode: "each",          // each(개별) | multi(선택 비교) | all(전체 평균)
  unit: "day",           // day | week | month | year
  field: "숏폼 1채널",

  // 중단: 그래프 대상 + 그래프 기간
  picked: [],            // 선택한 크리에이터
  gFrom: null, gTo: null,

  // 하단: 변동 내역 전용 필터
  logFrom: null, logTo: null,
  logDay: null,          // 특정 날짜만 (null=전체)
  logNames: [],          // 크리에이터 필터 (비어있으면 전체)
  logWho: "",            // 수정자 필터 (빈 문자열=전체)

  ready: false
};

function gInit() {
  gRender();
  Promise.all([
    fetchCSV(HIST_CSV_URL).then(parseHistory).catch(function () { loadErr = "이력 시트를 불러오지 못했습니다."; return []; }),
    fetchCSV(CUR_CSV_URL).then(parseCurrent).catch(function () { loadErr = "단가 시트를 불러오지 못했습니다."; return []; })
  ]).then(function (res) {
    histRows = res[0];
    curData = res[1];

    var now = new Date();
    var todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    var start, end = todayEnd;

    if (histRows.length) {
      var last = histRows[histRows.length - 1].t;
      if (last > end) end = new Date(last.getTime() + 60000);
      start = new Date(histRows[0].t.getTime());
      start.setHours(0, 0, 0, 0);
    } else {
      start = new Date(now.getTime() - 30 * 86400000);
      start.setHours(0, 0, 0, 0);
    }

    gState.gFrom = start;   gState.gTo = end;
    gState.logFrom = start; gState.logTo = end;
    gState.ready = true;
    gRender();
  });
}

function fmtDate(d) {
  if (!d) return "";
  function z(n) { return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
}

function allNames() {
  var set = {}, out = [];
  curData.forEach(function (c) { if (!set[c.n]) { set[c.n] = 1; out.push(c.n); } });
  histRows.forEach(function (h) { if (!set[h.name]) { set[h.name] = 1; out.push(h.name); } });
  return out.sort(function (a, b) { return a.localeCompare(b, "ko"); });
}

// ── 그래프용 시계열 ──
function buildSeries() {
  var buckets = makeBuckets(gState.gFrom, gState.gTo, gState.unit);
  var series = [];

  if (gState.mode === "all") {
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
      var pts = buckets.map(function (b) { return { x: b.key, y: priceAt(nm, gState.field, b.end) }; });
      series.push({ label: nm, points: pts });
    });
  }
  return { series: series, buckets: buckets };
}

// ── 변동 내역 필터링 ──
function filteredLogs() {
  return histRows.filter(function (r) {
    if (r.t < gState.logFrom || r.t > gState.logTo) return false;
    if (gState.logDay && fmtDate(r.t) !== gState.logDay) return false;
    if (gState.logNames.length && gState.logNames.indexOf(r.name) < 0) return false;
    if (gState.logWho && r.who !== gState.logWho) return false;
    return true;
  });
}

function gRender() {
  var h = [];
  h.push('<div class="g-wrap">');

  // 헤더
  h.push('<div class="g-head">');
  h.push('<div class="g-title">AG-ENT 단가 변동 추이</div>');
  h.push('<span class="g-headright"><a class="g-back" href="index.html">← 단가표로</a>');
  h.push('<a class="g-back" href="/api/auth/logout">로그아웃</a></span>');
  h.push('</div>');

  if (!gState.ready) {
    h.push('<div class="g-loading">이력을 불러오는 중…</div></div>');
    gRoot.innerHTML = h.join("");
    return;
  }
  if (loadErr) h.push('<div class="g-err">' + gEsc(loadErr) + '</div>');

  // ═══ 상단: 보기 · 기간 단위 · 항목 ═══
  h.push('<div class="g-panel">');
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

  h.push('<div class="g-ctl"><label>항목</label><select id="g-field" class="g-input">');
  FIELDS.forEach(function (f) {
    h.push('<option value="' + gEsc(f) + '"' + (gState.field === f ? " selected" : "") + '>' + gEsc(f) + '</option>');
  });
  h.push('</select></div>');
  h.push('</div>');

  // ═══ 중단: 크리에이터 선택 + 그래프 기간 ═══
  h.push('<div class="g-panel">');

  if (gState.mode !== "all") {
    var names = allNames();
    h.push('<div class="g-ctl"><label>크리에이터' + (gState.mode === "multi" ? " (최대 8명)" : "") + '</label>');
    h.push('<div class="g-row">');
    h.push('<select id="g-select" class="g-input" style="min-width:210px">');
    h.push('<option value="">선택하세요</option>');
    names.forEach(function (nm) {
      var on = gState.picked.indexOf(nm) >= 0;
      h.push('<option value="' + gEsc(nm) + '"' + (on ? " disabled" : "") + '>' + gEsc(nm) + (on ? " ✓" : "") + '</option>');
    });
    h.push('</select>');
    if (gState.picked.length) h.push('<button class="g-mini" id="g-clear">해제</button>');
    h.push('</div></div>');
  } else {
    h.push('<div class="g-ctl"><label>대상</label><div class="g-static">전체 크리에이터 ' + curData.length + '명 평균</div></div>');
  }

  h.push('<div class="g-ctl"><label>그래프 기간</label>');
  h.push('<div class="g-row">');
  h.push('<input type="date" id="g-gfrom" class="g-input" value="' + fmtDate(gState.gFrom) + '">');
  h.push('<span class="g-tilde">~</span>');
  h.push('<input type="date" id="g-gto" class="g-input" value="' + fmtDate(gState.gTo) + '">');
  h.push('</div>');
  h.push('<div class="g-quick">');
  [["7", "7일"], ["30", "30일"], ["90", "3개월"], ["all", "전체"]].forEach(function (q) {
    h.push('<button class="g-qb" data-gquick="' + q[0] + '">' + q[1] + '</button>');
  });
  h.push('</div></div>');

  h.push('<div class="g-ctl g-ctl-right"><label>&nbsp;</label>');
  h.push('<button class="g-action" id="g-export-img">그래프 이미지 저장</button>');
  h.push('</div>');

  h.push('</div>');

  // 선택된 크리에이터 칩
  if (gState.mode !== "all" && gState.picked.length) {
    h.push('<div class="g-chips">');
    gState.picked.forEach(function (nm) {
      h.push('<span class="g-chip">' + gEsc(nm) + '<button data-rm="' + gEsc(nm) + '">×</button></span>');
    });
    h.push('</div>');
  }

  // ═══ 차트 ═══
  var built = buildSeries();
  h.push('<div class="g-chart" id="g-chart">');
  if (!built.series.length) {
    h.push('<div class="g-empty">크리에이터를 선택하면 추이가 표시됩니다.</div>');
  } else {
    h.push('<div class="g-charttitle">' + gEsc(gState.field) + ' · ' + fmtDate(gState.gFrom) + ' ~ ' + fmtDate(gState.gTo) + '</div>');
    h.push(renderChart(built.series, built.buckets, { alwaysLegend: gState.mode !== "each" }));
  }
  h.push('</div>');

  // ═══ 하단: 변동 내역 ═══
  var logs = filteredLogs();

  var rangeRows = histRows.filter(function (r) { return r.t >= gState.logFrom && r.t <= gState.logTo; });

  h.push('<div class="g-section">변동 내역<span class="g-sub">' + logs.length + '건</span>');
  h.push('<span class="g-secright">');
  h.push('<button class="g-action" id="g-export-csv">엑셀(CSV) 저장</button>');
  h.push('<button class="g-action" id="g-export-txt">텍스트 복사</button>');
  h.push('</span></div>');

  h.push('<div class="g-panel g-panel-sm">');

  h.push('<div class="g-ctl"><label>조회 기간</label>');
  h.push('<div class="g-row">');
  h.push('<input type="date" id="g-lfrom" class="g-input" value="' + fmtDate(gState.logFrom) + '">');
  h.push('<span class="g-tilde">~</span>');
  h.push('<input type="date" id="g-lto" class="g-input" value="' + fmtDate(gState.logTo) + '">');
  h.push('</div>');
  h.push('<div class="g-quick">');
  [["7", "7일"], ["30", "30일"], ["90", "3개월"], ["all", "전체"]].forEach(function (q) {
    h.push('<button class="g-qb" data-lquick="' + q[0] + '">' + q[1] + '</button>');
  });
  h.push('</div></div>');

  // 특정 날짜 하나만 콕 집기
  h.push('<div class="g-ctl"><label>특정 일자</label>');
  h.push('<div class="g-row">');
  h.push('<input type="date" id="g-lday" class="g-input" value="' + (gState.logDay || "") + '"'
    + ' min="' + fmtDate(gState.logFrom) + '" max="' + fmtDate(gState.logTo) + '">');
  if (gState.logDay) h.push('<button class="g-mini" id="g-ldayclr">해제</button>');
  h.push('</div>');
  h.push('<div class="g-fieldhint">선택 시 그날 기록만 표시</div>');
  h.push('</div>');

  h.push('<div class="g-ctl"><label>크리에이터</label>');
  h.push('<div class="g-row">');
  h.push('<select id="g-lname" class="g-input" style="min-width:150px">');
  h.push('<option value="">전체</option>');
  var logNameSet = {}, logNameList = [];
  rangeRows.forEach(function (r) { if (!logNameSet[r.name]) { logNameSet[r.name] = 1; logNameList.push(r.name); } });
  logNameList.sort(function (a, b) { return a.localeCompare(b, "ko"); }).forEach(function (nm) {
    var on = gState.logNames.indexOf(nm) >= 0;
    h.push('<option value="' + gEsc(nm) + '"' + (on ? " disabled" : "") + '>' + gEsc(nm) + (on ? " ✓" : "") + '</option>');
  });
  h.push('</select>');
  if (gState.logNames.length) h.push('<button class="g-mini" id="g-lclear">해제</button>');
  h.push('</div>');
  if (gState.logNames.length) {
    h.push('<div class="g-chips g-chips-sm">');
    gState.logNames.forEach(function (nm) {
      h.push('<span class="g-chip">' + gEsc(nm) + '<button data-lrm="' + gEsc(nm) + '">×</button></span>');
    });
    h.push('</div>');
  }
  h.push('</div>');

  // 수정자 필터
  var whoSet = {}, whoList = [];
  rangeRows.forEach(function (r) { if (r.who && !whoSet[r.who]) { whoSet[r.who] = 1; whoList.push(r.who); } });
  whoList.sort();
  h.push('<div class="g-ctl"><label>수정자</label>');
  h.push('<div class="g-row">');
  h.push('<select id="g-lwho" class="g-input" style="min-width:180px">');
  h.push('<option value="">전체</option>');
  whoList.forEach(function (w) {
    h.push('<option value="' + gEsc(w) + '"' + (gState.logWho === w ? " selected" : "") + '>' + gEsc(w) + '</option>');
  });
  h.push('</select>');
  h.push('</div></div>');

  h.push('</div>');

  // 표
  h.push('<div class="g-tablewrap"><table class="g-table">');
  h.push('<thead><tr><th>일시</th><th>크리에이터</th><th>항목</th><th class="g-num">이전</th><th class="g-num">변경</th><th class="g-num">변동</th><th>수정자</th></tr></thead><tbody>');
  var shown = logs.slice().reverse().slice(0, 300);
  if (!shown.length) {
    h.push('<tr><td colspan="7" class="g-empty2">조건에 맞는 변동 기록이 없습니다.</td></tr>');
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
    if (logs.length > 300) h.push('<tr><td colspan="7" class="g-more">최근 300건만 표시됩니다 (전체 ' + logs.length + '건)</td></tr>');
  }
  h.push('</tbody></table></div>');

  h.push('</div>');
  gRoot.innerHTML = h.join("");
  gBind();
}

function gBind() {
  var byId = function (id) { return document.getElementById(id); };

  function dayStart(v) { var p = v.split("-"); return new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0, 0); }
  function dayEnd(v) { var p = v.split("-"); return new Date(+p[0], +p[1] - 1, +p[2], 23, 59, 59, 999); }

  function rangeFor(v) {
    var now = new Date();
    var end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    if (histRows.length) {
      var last = histRows[histRows.length - 1].t;
      if (last > end) end = new Date(last.getTime() + 60000);
    }
    var from;
    if (v === "all") {
      from = histRows.length ? new Date(histRows[0].t.getTime()) : new Date(now.getTime() - 30 * 86400000);
    } else {
      from = new Date(now.getTime() - parseInt(v, 10) * 86400000);
    }
    from.setHours(0, 0, 0, 0);
    return { from: from, to: end };
  }

  // 상단
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

  // 중단 — 크리에이터
  var sel = byId("g-select");
  if (sel) sel.onchange = function () {
    var nm = this.value; if (!nm) return;
    if (gState.mode === "each") gState.picked = [nm];
    else if (gState.picked.indexOf(nm) < 0 && gState.picked.length < 8) gState.picked.push(nm);
    gRender();
  };
  var clr = byId("g-clear");
  if (clr) clr.onclick = function () { gState.picked = []; gRender(); };
  var rms = gRoot.querySelectorAll("[data-rm]");
  for (var k = 0; k < rms.length; k++) {
    rms[k].onclick = function () {
      var idx = gState.picked.indexOf(this.getAttribute("data-rm"));
      if (idx >= 0) { gState.picked.splice(idx, 1); gRender(); }
    };
  }

  // 중단 — 그래프 기간
  var gf = byId("g-gfrom"), gt = byId("g-gto");
  if (gf) gf.onchange = function () { if (this.value) { gState.gFrom = dayStart(this.value); gRender(); } };
  if (gt) gt.onchange = function () { if (this.value) { gState.gTo = dayEnd(this.value); gRender(); } };
  var gqs = gRoot.querySelectorAll("[data-gquick]");
  for (var q = 0; q < gqs.length; q++) {
    gqs[q].onclick = function () {
      var r = rangeFor(this.getAttribute("data-gquick"));
      gState.gFrom = r.from; gState.gTo = r.to; gRender();
    };
  }

  // 하단 — 조회 기간
  var lf = byId("g-lfrom"), lt = byId("g-lto");
  if (lf) lf.onchange = function () { if (this.value) { gState.logFrom = dayStart(this.value); gState.logDay = null; gState.logWho = ""; gRender(); } };
  if (lt) lt.onchange = function () { if (this.value) { gState.logTo = dayEnd(this.value); gState.logDay = null; gState.logWho = ""; gRender(); } };
  var lqs = gRoot.querySelectorAll("[data-lquick]");
  for (var q2 = 0; q2 < lqs.length; q2++) {
    lqs[q2].onclick = function () {
      var r = rangeFor(this.getAttribute("data-lquick"));
      gState.logFrom = r.from; gState.logTo = r.to; gState.logDay = null; gRender();
    };
  }

  // 하단 — 크리에이터 필터
  var ln = byId("g-lname");
  if (ln) ln.onchange = function () {
    var nm = this.value; if (!nm) return;
    if (gState.logNames.indexOf(nm) < 0) gState.logNames.push(nm);
    gRender();
  };
  var lclr = byId("g-lclear");
  if (lclr) lclr.onclick = function () { gState.logNames = []; gRender(); };
  var lrms = gRoot.querySelectorAll("[data-lrm]");
  for (var m2 = 0; m2 < lrms.length; m2++) {
    lrms[m2].onclick = function () {
      var idx = gState.logNames.indexOf(this.getAttribute("data-lrm"));
      if (idx >= 0) { gState.logNames.splice(idx, 1); gRender(); }
    };
  }

  // 하단 — 날짜 칩
  var lday = byId("g-lday");
  if (lday) lday.onchange = function () { gState.logDay = this.value || null; gRender(); };
  var ldayclr = byId("g-ldayclr");
  if (ldayclr) ldayclr.onclick = function () { gState.logDay = null; gRender(); };

  var lwho = byId("g-lwho");
  if (lwho) lwho.onchange = function () { gState.logWho = this.value || ""; gRender(); };

  // 추출
  var exImg = byId("g-export-img");
  if (exImg) exImg.onclick = exportChartImage;
  var exCsv = byId("g-export-csv");
  if (exCsv) exCsv.onclick = exportLogsCSV;
  var exTxt = byId("g-export-txt");
  if (exTxt) exTxt.onclick = exportLogsText;
}

gInit();
