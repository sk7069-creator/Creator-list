/* AG-ENT 단가 이력 — SVG 라인 차트 */

var CHART_COLORS = ["#2E5CB8", "#E8502E", "#1a7a3a", "#a15c00", "#7b2d8e", "#0e7c86", "#c0392b", "#5b6b7c"];

function gEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtMoney(v) {
  return v == null ? "-" : Number(v).toLocaleString();
}

// 기간 단위로 날짜 라벨 만들기
function bucketKey(d, unit) {
  function z(n) { return (n < 10 ? "0" : "") + n; }
  var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  if (unit === "year") return String(y);
  if (unit === "month") return y + "-" + z(m);
  if (unit === "week") {
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dayNum = (t.getDay() + 6) % 7;          // 월요일 시작
    t.setDate(t.getDate() - dayNum);
    return t.getFullYear() + "-" + z(t.getMonth() + 1) + "-" + z(t.getDate());
  }
  return y + "-" + z(m) + "-" + z(day);         // day
}

// 버킷 목록 생성 (시작~끝 사이를 unit 간격으로)
function makeBuckets(from, to, unit) {
  var out = [], cur = new Date(from.getTime());
  cur.setHours(0, 0, 0, 0);
  if (unit === "week") { var dn = (cur.getDay() + 6) % 7; cur.setDate(cur.getDate() - dn); }
  if (unit === "month") cur.setDate(1);
  if (unit === "year") { cur.setMonth(0); cur.setDate(1); }
  var guard = 0;
  while (cur <= to && guard++ < 400) {
    out.push({ key: bucketKey(cur, unit), end: endOfBucket(cur, unit) });
    if (unit === "day") cur.setDate(cur.getDate() + 1);
    else if (unit === "week") cur.setDate(cur.getDate() + 7);
    else if (unit === "month") cur.setMonth(cur.getMonth() + 1);
    else cur.setFullYear(cur.getFullYear() + 1);
  }
  return out;
}

function endOfBucket(d, unit) {
  var e = new Date(d.getTime());
  if (unit === "day") e.setHours(23, 59, 59, 999);
  else if (unit === "week") { e.setDate(e.getDate() + 6); e.setHours(23, 59, 59, 999); }
  else if (unit === "month") { e.setMonth(e.getMonth() + 1); e.setDate(0); e.setHours(23, 59, 59, 999); }
  else { e.setFullYear(e.getFullYear() + 1); e.setMonth(0); e.setDate(0); e.setHours(23, 59, 59, 999); }
  return e;
}

/**
 * series: [{label, color, points:[{x:'2026-07', y:1400}]}]
 * 반환: SVG 문자열
 */
function renderChart(series, buckets, opts) {
  opts = opts || {};
  var W = opts.width || 980, H = opts.height || 380;
  var padL = 70, padR = 24, padT = 20, padB = 56;
  var iw = W - padL - padR, ih = H - padT - padB;

  // Y 범위
  var vals = [];
  series.forEach(function (s) { s.points.forEach(function (p) { if (p.y != null) vals.push(p.y); }); });
  if (!vals.length) {
    return '<div class="g-empty">표시할 데이터가 없습니다. 기간을 넓혀보세요.</div>';
  }
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if (min === max) { min = Math.max(0, min - 100); max = max + 100; }
  var span = max - min;
  min = Math.max(0, min - span * 0.1);
  max = max + span * 0.1;

  var n = buckets.length;
  function px(i) { return padL + (n <= 1 ? iw / 2 : (iw * i) / (n - 1)); }
  function py(v) { return padT + ih - ((v - min) / (max - min)) * ih; }

  var h = [];
  h.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="g-svg" preserveAspectRatio="xMidYMid meet">');

  // 가로 눈금선 + Y 라벨
  var STEPS = 5;
  for (var g = 0; g <= STEPS; g++) {
    var v = min + ((max - min) * g) / STEPS;
    var y = py(v);
    h.push('<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#e8e5df" stroke-width="1"/>');
    h.push('<text x="' + (padL - 10) + '" y="' + (y + 4) + '" text-anchor="end" class="g-axis">' + fmtMoney(Math.round(v)) + '</text>');
  }

  // X 라벨 (너무 많으면 건너뛰기)
  var step = Math.ceil(n / 12) || 1;
  for (var i = 0; i < n; i++) {
    if (i % step !== 0 && i !== n - 1) continue;
    h.push('<text x="' + px(i) + '" y="' + (H - padB + 20) + '" text-anchor="middle" class="g-axis">' + gEsc(buckets[i].key) + '</text>');
  }

  // 선 + 점
  series.forEach(function (s, si) {
    var color = s.color || CHART_COLORS[si % CHART_COLORS.length];
    var d = "", started = false;
    s.points.forEach(function (p, i) {
      if (p.y == null) return;
      var x = px(i), y = py(p.y);
      d += (started ? " L" : "M") + x + "," + y;
      started = true;
    });
    if (d) h.push('<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round"/>');
    s.points.forEach(function (p, i) {
      if (p.y == null) return;
      h.push('<circle cx="' + px(i) + '" cy="' + py(p.y) + '" r="3.5" fill="#fff" stroke="' + color + '" stroke-width="2">'
        + '<title>' + gEsc(s.label) + ' · ' + gEsc(buckets[i].key) + ' · ' + fmtMoney(p.y) + '</title></circle>');
    });
  });

  h.push('</svg>');

  // 범례
  if (series.length > 1 || opts.alwaysLegend) {
    h.push('<div class="g-legend">');
    series.forEach(function (s, si) {
      var color = s.color || CHART_COLORS[si % CHART_COLORS.length];
      h.push('<span class="g-lg"><i style="background:' + color + '"></i>' + gEsc(s.label) + '</span>');
    });
    h.push('</div>');
  }
  return h.join("");
}
