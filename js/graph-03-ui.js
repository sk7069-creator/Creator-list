/* AG-ENT 단가 이력 — 화면 구성 */

var gRoot = document.getElementById("groot");
var UNIT_LABEL = "만원";   // 국내 단가 기준 (한화 만원)

var gState = {
  // 상단: 보기 방식
  mode: "each",          // each(개별) | multi(선택 비교) | all(전체 평균)
  unit: "day",           // day | week | month | year
  field: "숏폼 1채널",
  fields: ["숏폼 1채널"],   // 막대 비교용 다중 항목 (2개 이상이면 막대)

  // 중단: 그래프 대상 + 그래프 기간
  picked: [],            // 선택한 크리에이터
  gFrom: null, gTo: null,

  // 하단: 변동 내역 전용 필터
  logFrom: null, logTo: null,
  logDay: null,          // 특정 날짜만 (null=전체)
  logNames: [],          // 크리에이터 필터 (비어있으면 전체)
  logWho: "",            // 수정자 필터 (빈 문자열=전체)
  trendOpen: {},         // 펼친 방향 명단 {"high-up":true}

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
// 막대 모드 여부: 개별 보기 + 크리에이터 1명 + 항목 2개 이상
function isBarMode() {
  return gState.mode === "each" && gState.picked.length === 1 && gState.fields.length >= 2;
}

// 막대 데이터: 선택 크리에이터의 항목별 현재 단가
function buildBars() {
  var nm = gState.picked[0];
  var bars = [];
  gState.fields.forEach(function (f, i) {
    var v = priceAt(nm, f, gState.gTo);
    bars.push({ label: f, value: v, color: CHART_COLORS[i % CHART_COLORS.length] });
  });
  return { name: nm, bars: bars };
}

function buildSeries() {
  var buckets = makeBuckets(gState.gFrom, gState.gTo, gState.unit);
  var series = [];
  var field = gState.mode === "each" ? gState.fields[0] : gState.field;

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
      var pts = buckets.map(function (b) { return { x: b.key, y: priceAt(nm, field, b.end) }; });
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
  h.push('<span class="g-headright"><span class="g-sign">DEV by. JHDG</span>');
  h.push('<a class="g-back" href="index.html">← 단가표로</a>');
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

  // 항목 선택: 개별 모드에서는 여러 개(막대 비교), 그 외엔 하나
  if (gState.mode === "each") {
    h.push('<div class="g-ctl"><label>항목 <span class="g-lblhint">여러 개 선택 시 막대 비교</span></label>');
    h.push('<div class="g-fieldbtns">');
    FIELDS.forEach(function (f) {
      var on = gState.fields.indexOf(f) >= 0;
      h.push('<button class="g-fbtn' + (on ? " on" : "") + '" data-field="' + gEsc(f) + '">' + gEsc(f) + '</button>');
    });
    h.push('</div></div>');
  } else {
    h.push('<div class="g-ctl"><label>항목</label><select id="g-field" class="g-input">');
    FIELDS.forEach(function (f) {
      h.push('<option value="' + gEsc(f) + '"' + (gState.field === f ? " selected" : "") + '>' + gEsc(f) + '</option>');
    });
    h.push('</select></div>');
  }

  // 전체 평균 (현재 선택 항목)
  var avgField = gState.mode === "each" ? gState.fields[0] : gState.field;
  var avgV = avgOfField(FIELD_KEY[avgField]);
  h.push('<div class="g-ctl g-ctl-avg"><label>전체 평균 · ' + gEsc(avgField) + '</label>');
  h.push('<div class="g-avg">' + (avgV == null ? "-" : fmtMoney(avgV)) + ' <em>' + UNIT_LABEL + '</em> '
    + '<span class="g-avg-sub">' + curData.length + '명</span></div>');
  h.push('</div>');

  h.push('</div>');

  // ═══ 가격대별 단가 방향 (상승/하락/유지) ═══
  var trends = groupTrends();
  h.push('<div class="g-rates">');
  h.push('<div class="g-rates-title">가격대별 단가 방향 <span class="g-rates-note">숏폼 1채널 기준 · 최근 변경 방향 (60일 이상 변동 없으면 유지)</span></div>');
  h.push('<div class="g-rates-grid">');
  [["high", "500만원 이상", trends.high],
   ["mid", "200~500만원", trends.mid],
   ["low", "200만원 미만", trends.low]].forEach(function (grp) {
    var gkey = grp[0], label = grp[1], t = grp[2];
    h.push('<div class="g-rate-card">');
    h.push('<div class="g-rate-h">' + label + ' <span class="g-rate-cnt">' + t.total + '명</span></div>');

    [["up", "▲ 상승", "up"], ["down", "▼ 하락", "down"], ["hold", "― 유지", ""]].forEach(function (st) {
      var stKey = st[0], stLabel = st[1], cls = st[2];
      var cnt = t[stKey];
      var openKey = gkey + "-" + stKey;
      var isOpen = gState.trendOpen[openKey];
      var clickable = cnt > 0;
      h.push('<div class="g-rate-row' + (clickable ? " clickable" : "") + '"' + (clickable ? ' data-trend="' + openKey + '"' : '') + '>');
      h.push('<span class="g-rate-lbl ' + cls + '">' + stLabel + (clickable ? ' <span class="g-rate-caret">' + (isOpen ? "▾" : "▸") + '</span>' : '') + '</span>');
      h.push('<b class="' + cls + '">' + cnt + '<em>명</em></b>');
      h.push('</div>');
      // 펼친 명단
      if (isOpen && t.names[stKey].length) {
        h.push('<div class="g-rate-names">');
        t.names[stKey].forEach(function (item) {
          var extra = "";
          if (stKey === "up" && item.pct != null) extra = ' <span class="up">+' + item.pct + '%</span>';
          else if (stKey === "down" && item.pct != null) extra = ' <span class="down">' + item.pct + '%</span>';
          else if (stKey === "hold" && item.daysSince != null) extra = ' <span class="g-rate-days">' + item.daysSince + '일 전</span>';
          h.push('<span class="g-rate-name" data-pick="' + gEsc(item.name) + '">' + gEsc(item.name) + extra + '</span>');
        });
        h.push('</div>');
      }
    });

    if (t.none) h.push('<div class="g-rate-foot">이력 없음 ' + t.none + '명</div>');
    else h.push('<div class="g-rate-foot">전원 이력 있음</div>');
    h.push('</div>');
  });
  h.push('</div></div>');

  // ═══ 중단: 크리에이터 선택 + 그래프 기간 ═══
  h.push('<div class="g-panel">');

  if (gState.mode !== "all") {
    var names = allNames();
    var disMap = {};
    gState.picked.forEach(function (nm) { disMap[nm] = true; });
    h.push('<div class="g-ctl"><label>크리에이터' + (gState.mode === "multi" ? " (최대 8명)" : "") + '</label>');
    h.push('<div class="g-row">');
    h.push(comboHTML({ id: "g-select", placeholder: "이름 검색·선택", width: 210 }));
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

  // 선택 크리에이터 요약 (1명일 때) — 같은 줄에 나란히
  if (gState.mode !== "all" && gState.picked.length === 1) {
    var pk = gState.picked[0];
    var pkTrend = creatorTrend(pk);
    var badge = { up: ["상승세", "up"], down: ["하락세", "down"], hold: ["유지", "hold"], none: ["이력 없음", "none"] }[pkTrend.status];
    var lastTxt = pkTrend.last ? (fmtDate(pkTrend.last) + " 변경") : "변경 이력 없음";

    var pkData = null;
    for (var ci = 0; ci < curData.length; ci++) { if (curData[ci].n === pk) { pkData = curData[ci]; break; } }

    var built0 = buildSeries();
    var s0 = built0.series[0];
    var cur0 = null, diff0 = null, max0 = null, min0 = null;
    if (s0) {
      var pts0 = s0.points.filter(function (p) { return p.y != null; });
      if (pts0.length) {
        cur0 = pts0[pts0.length - 1].y;
        diff0 = cur0 - pts0[0].y;
        max0 = Math.max.apply(null, pts0.map(function (p) { return p.y; }));
        min0 = Math.min.apply(null, pts0.map(function (p) { return p.y; }));
      }
    }
    var dCls = diff0 == null ? "" : (diff0 > 0 ? "up" : (diff0 < 0 ? "down" : ""));
    var dTxt = diff0 == null ? "-" : (diff0 > 0 ? "▲ " + fmtMoney(diff0) : (diff0 < 0 ? "▼ " + fmtMoney(-diff0) : "변동 없음"));

    h.push('<div class="g-ctl"><label>선택 크리에이터</label>');
    h.push('<div class="g-picksum">');
    h.push('<div class="g-picksum-top">');
    h.push('<span class="g-picksum-name">' + gEsc(pk) + '</span>');
    h.push('<span class="g-card-badge ' + badge[1] + '">' + badge[0] + '</span>');
    if (pkData) {
      var links = [];
      if (pkData.ig && /^https?:/i.test(pkData.ig)) links.push('<a class="g-sns ig" href="' + gEsc(pkData.ig) + '" target="_blank" rel="noopener" title="인스타그램">IG</a>');
      if (pkData.tt && /^https?:/i.test(pkData.tt)) links.push('<a class="g-sns tt" href="' + gEsc(pkData.tt) + '" target="_blank" rel="noopener" title="틱톡">TT</a>');
      if (pkData.yt && /^https?:/i.test(pkData.yt)) links.push('<a class="g-sns yt" href="' + gEsc(pkData.yt) + '" target="_blank" rel="noopener" title="유튜브">YT</a>');
      if (links.length) h.push('<span class="g-snsrow">' + links.join("") + '</span>');
    }
    h.push('</div>');
    h.push('<div class="g-picksum-mid">' + (cur0 == null ? "-" : fmtMoney(cur0)) + ' <em>' + UNIT_LABEL + '</em>'
      + '<span class="g-picksum-diff ' + dCls + '">' + dTxt + '</span></div>');
    h.push('<div class="g-picksum-sub">'
      + (max0 != null ? "최고 " + fmtMoney(max0) + " · 최저 " + fmtMoney(min0) + " · " : "")
      + lastTxt + '</div>');
    h.push('</div></div>');
  }

  // 저장 버튼 (오른쪽 끝)
  h.push('<div class="g-ctl g-ctl-right"><label>&nbsp;</label>');
  h.push('<button class="g-action" id="g-export-img">그래프 이미지 저장</button>');
  h.push('</div>');

  h.push('</div>');

  // 선택된 크리에이터 칩 (2명 이상일 때만 — 1명은 위 요약으로 충분)
  if (gState.mode !== "all" && gState.picked.length >= 2) {
    h.push('<div class="g-chips">');
    gState.picked.forEach(function (nm) {
      h.push('<span class="g-chip">' + gEsc(nm) + '<button data-rm="' + gEsc(nm) + '">×</button></span>');
    });
    h.push('</div>');
  } else if (gState.mode !== "all" && gState.picked.length === 1) {
    // 1명일 때 해제용 칩만 작게
    h.push('<div class="g-chips">');
    h.push('<span class="g-chip">' + gEsc(gState.picked[0]) + '<button data-rm="' + gEsc(gState.picked[0]) + '">×</button></span>');
    h.push('</div>');
  }

  // ═══ 토탈 요약 카드 + 차트 ═══
  var barMode = isBarMode();

  if (barMode) {
    // 막대 모드: 한 크리에이터의 항목별 현재 단가 비교
    var bd = buildBars();
    var valid = bd.bars.filter(function (b) { return b.value != null; });
    if (valid.length) {
      h.push('<div class="g-cards">');
      valid.forEach(function (b) {
        h.push('<div class="g-card">');
        h.push('<div class="g-card-h"><i style="background:' + b.color + '"></i>' + gEsc(b.label) + '</div>');
        h.push('<div class="g-card-v">' + fmtMoney(b.value) + ' <em>' + UNIT_LABEL + '</em></div>');
        h.push('</div>');
      });
      h.push('</div>');
    }
    h.push('<div class="g-chart" id="g-chart">');
    h.push('<div class="g-charttitle">' + gEsc(bd.name) + ' · 항목별 단가 비교 <span class="g-unittag">단위: ' + UNIT_LABEL + '</span></div>');
    h.push(renderBarChart(bd.bars, { unitLabel: UNIT_LABEL }));
    h.push('</div>');
  } else {
    // 선 모드
    var built = buildSeries();
    // 개별 1명은 위 요약에 이미 다 있으므로 카드 생략. 전체평균/비교(2명+)만 카드 표시.
    var showCards = !(gState.mode === "each" && gState.picked.length === 1);
    if (built.series.length && showCards) {
      h.push('<div class="g-cards">');
      built.series.forEach(function (s, si) {
        var pts = s.points.filter(function (p) { return p.y != null; });
        if (!pts.length) return;
        var color = CHART_COLORS[si % CHART_COLORS.length];
        var latest = pts[pts.length - 1].y;
        var first = pts[0].y;
        var diff = latest - first;
        var maxv = Math.max.apply(null, pts.map(function (p) { return p.y; }));
        var minv = Math.min.apply(null, pts.map(function (p) { return p.y; }));
        var diffCls = diff > 0 ? "up" : (diff < 0 ? "down" : "");
        var diffTxt = diff > 0 ? "▲ " + fmtMoney(diff) : (diff < 0 ? "▼ " + fmtMoney(-diff) : "변동 없음");
        h.push('<div class="g-card">');
        h.push('<div class="g-card-h"><i style="background:' + color + '"></i>' + gEsc(s.label) + '</div>');
        h.push('<div class="g-card-v">' + fmtMoney(latest) + ' <em>' + UNIT_LABEL + '</em></div>');
        h.push('<div class="g-card-sub">기간 변동 <b class="' + diffCls + '">' + diffTxt + '</b></div>');
        h.push('<div class="g-card-mm">최고 ' + fmtMoney(maxv) + ' · 최저 ' + fmtMoney(minv) + '</div>');
        // 단가 방향 뱃지 (개별/비교 모드에서 크리에이터 이름일 때)
        if (gState.mode !== "all") {
          var tr = creatorTrend(s.label);
          var badge = { up: ["상승세", "up"], down: ["하락세", "down"], hold: ["유지", "hold"], none: ["이력 없음", "none"] }[tr.status];
          if (badge) h.push('<div class="g-card-badge ' + badge[1] + '">' + badge[0] + '</div>');
        }
        h.push('</div>');
      });
      h.push('</div>');
    }
    var titleField = gState.mode === "each" ? gState.fields[0] : gState.field;
    h.push('<div class="g-chart" id="g-chart">');
    if (!built.series.length) {
      h.push('<div class="g-empty">크리에이터를 선택하면 추이가 표시됩니다.</div>');
    } else {
      h.push('<div class="g-charttitle">' + gEsc(titleField) + ' · ' + fmtDate(gState.gFrom) + ' ~ ' + fmtDate(gState.gTo) + ' <span class="g-unittag">단위: ' + UNIT_LABEL + '</span></div>');
      h.push(renderChart(built.series, built.buckets, { alwaysLegend: gState.mode !== "each", unitLabel: UNIT_LABEL }));
    }
    h.push('</div>');
  }

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
  var logNameSet = {}, logNameList = [];
  rangeRows.forEach(function (r) { if (!logNameSet[r.name]) { logNameSet[r.name] = 1; logNameList.push(r.name); } });
  logNameList.sort(function (a, b) { return a.localeCompare(b, "ko"); });
  h.push(comboHTML({ id: "g-lname", placeholder: "이름 검색·선택", width: 160 }));
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
  var chartBox = document.getElementById("g-chart");
  if (chartBox) attachChartTooltip(chartBox, UNIT_LABEL);
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
  // 방향 카드: 상태 줄 클릭 → 명단 펼치기
  var trendRows = gRoot.querySelectorAll("[data-trend]");
  for (var tr = 0; tr < trendRows.length; tr++) {
    trendRows[tr].onclick = function () {
      var key = this.getAttribute("data-trend");
      gState.trendOpen[key] = !gState.trendOpen[key];
      gRender();
    };
  }
  var pickNames = gRoot.querySelectorAll("[data-pick]");
  for (var pn = 0; pn < pickNames.length; pn++) {
    pickNames[pn].onclick = function (e) {
      e.stopPropagation();
      var nm = this.getAttribute("data-pick");
      gState.mode = "each";
      gState.picked = [nm];
      gState.fields = [gState.fields[0] || "숏폼 1채널"];
      gRender();
      var chart = document.getElementById("g-chart");
      if (chart) chart.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  }

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

  // 항목 다중 선택 버튼 (개별 모드)
  var fbtns = gRoot.querySelectorAll(".g-fbtn");
  for (var fb = 0; fb < fbtns.length; fb++) {
    fbtns[fb].onclick = function () {
      var f = this.getAttribute("data-field");
      var idx = gState.fields.indexOf(f);
      if (idx >= 0) {
        if (gState.fields.length > 1) gState.fields.splice(idx, 1);  // 최소 1개 유지
      } else {
        gState.fields.push(f);
      }
      // 첫 항목을 대표 field로 동기화 (선 모드용)
      gState.field = gState.fields[0];
      gRender();
    };
  }

  // 중단 — 크리에이터 (검색 콤보박스)
  if (gState.mode !== "all") {
    var comboDis = {};
    gState.picked.forEach(function (nm) { comboDis[nm] = true; });
    comboBind({
      id: "g-select",
      options: allNames(),
      disabled: comboDis,
      onPick: function (nm) {
        if (!nm) return;
        if (gState.mode === "each") gState.picked = [nm];
        else if (gState.picked.indexOf(nm) < 0 && gState.picked.length < 8) gState.picked.push(nm);
        gRender();
      }
    });
  }
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
  // 하단 — 크리에이터 필터 (검색 콤보박스)
  var rangeRowsForCombo = histRows.filter(function (r) { return r.t >= gState.logFrom && r.t <= gState.logTo; });
  var lnSet = {}, lnOpts = [];
  rangeRowsForCombo.forEach(function (r) { if (!lnSet[r.name]) { lnSet[r.name] = 1; lnOpts.push(r.name); } });
  lnOpts.sort(function (a, b) { return a.localeCompare(b, "ko"); });
  var lnDis = {};
  gState.logNames.forEach(function (nm) { lnDis[nm] = true; });
  comboBind({
    id: "g-lname",
    options: lnOpts,
    disabled: lnDis,
    onPick: function (nm) {
      if (!nm) return;
      if (gState.logNames.indexOf(nm) < 0) gState.logNames.push(nm);
      gRender();
    }
  });
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
