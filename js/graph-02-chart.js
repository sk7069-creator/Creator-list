/* AG-ENT 단가 이력 — SVG 라인 차트 */

var CHART_COLORS = ["#2E5CB8", "#E8502E", "#1a7a3a", "#a15c00", "#7b2d8e", "#0e7c86", "#c0392b", "#5b6b7c"];

function gEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtMoney(v) {
  return v == null ? "-" : Number(v).toLocaleString();
}

// 눈금을 5·10·25·50·100 같은 깔끔한 단위로
function niceStep(rough) {
  var pow = Math.pow(10, Math.floor(Math.log(rough) / Math.LN10));
  var frac = rough / pow;
  var nice;
  if (frac <= 1) nice = 1;
  else if (frac <= 2) nice = 2;
  else if (frac <= 2.5) nice = 2.5;
  else if (frac <= 5) nice = 5;
  else nice = 10;
  return Math.max(5, nice * pow);
}

function bucketKey(d, unit) {
  function z(n) { return (n < 10 ? "0" : "") + n; }
  var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  if (unit === "year") return String(y);
  if (unit === "month") return y + "-" + z(m);
  if (unit === "week") {
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dayNum = (t.getDay() + 6) % 7;
    t.setDate(t.getDate() - dayNum);
    return t.getFullYear() + "-" + z(t.getMonth() + 1) + "-" + z(t.getDate());
  }
  return y + "-" + z(m) + "-" + z(day);
}

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

function renderChart(series, buckets, opts) {
  opts = opts || {};
  var W = opts.width || 980, H = opts.height || 380;
  var padL = 76, padR = 24, padT = 24, padB = 56;
  var iw = W - padL - padR, ih = H - padT - padB;
  var unitLabel = opts.unitLabel || "";

  var vals = [];
  series.forEach(function (s) { s.points.forEach(function (p) { if (p.y != null) vals.push(p.y); }); });
  if (!vals.length) {
    return '<div class="g-empty">표시할 데이터가 없습니다. 기간을 넓혀보세요.</div>';
  }
  var dataMin = Math.min.apply(null, vals), dataMax = Math.max.apply(null, vals);
  if (dataMin === dataMax) { dataMin = Math.max(0, dataMin - 50); dataMax = dataMax + 50; }

  var STEPS = 5;
  var step = niceStep((dataMax - dataMin) / STEPS || 1);
  var min = Math.max(0, Math.floor(dataMin / step) * step);
  var max = Math.ceil(dataMax / step) * step;
  if (max === min) max = min + step;
  var nSteps = Math.round((max - min) / step);

  var n = buckets.length;
  function px(i) { return padL + (n <= 1 ? iw / 2 : (iw * i) / (n - 1)); }
  function py(v) { return padT + ih - ((v - min) / (max - min)) * ih; }

  var h = [];
  h.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="g-svg" preserveAspectRatio="xMidYMid meet">');

  if (unitLabel) {
    h.push('<text x="' + (padL - 10) + '" y="' + (padT - 9) + '" text-anchor="end" class="g-axisunit">(' + gEsc(unitLabel) + ')</text>');
  }

  for (var g = 0; g <= nSteps; g++) {
    var v = min + step * g;
    var y = py(v);
    h.push('<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#e8e5df" stroke-width="1"/>');
    h.push('<text x="' + (padL - 10) + '" y="' + (y + 4) + '" text-anchor="end" class="g-axis">' + fmtMoney(v) + '</text>');
  }

  var xstep = Math.ceil(n / 12) || 1;
  for (var i = 0; i < n; i++) {
    if (i % xstep !== 0 && i !== n - 1) continue;
    h.push('<text x="' + px(i) + '" y="' + (H - padB + 20) + '" text-anchor="middle" class="g-axis">' + gEsc(buckets[i].key) + '</text>');
  }

  var dots = [];
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
      var x = px(i), y = py(p.y);
      h.push('<circle cx="' + x + '" cy="' + y + '" r="3.5" fill="#fff" stroke="' + color + '" stroke-width="2"/>');
      dots.push('<circle class="g-hit" cx="' + x + '" cy="' + y + '" r="13" fill="transparent" '
        + 'data-label="' + gEsc(s.label) + '" data-x="' + gEsc(buckets[i].key) + '" '
        + 'data-y="' + p.y + '" data-color="' + color + '"/>');
    });
  });
  h.push(dots.join(""));

  h.push('</svg>');

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

// 렌더 후 툴팁 이벤트 연결
function attachChartTooltip(container, unitLabel) {
  var svg = container.querySelector("svg.g-svg");
  if (!svg) return;

  var tip = container.querySelector(".g-tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "g-tip";
    container.appendChild(tip);
  }
  tip.style.display = "none";

  var hits = svg.querySelectorAll(".g-hit");
  for (var i = 0; i < hits.length; i++) {
    hits[i].addEventListener("mouseenter", function (e) {
      var el = e.target;
      var color = el.getAttribute("data-color");
      var label = el.getAttribute("data-label");
      var xk = el.getAttribute("data-x");
      var yv = Number(el.getAttribute("data-y"));
      tip.innerHTML = '<span class="g-tip-h"><i style="background:' + color + '"></i>' + gEsc(label) + '</span>'
        + '<span class="g-tip-x">' + gEsc(xk) + '</span>'
        + '<span class="g-tip-v">' + fmtMoney(yv) + (unitLabel ? ' <em>' + gEsc(unitLabel) + '</em>' : '') + '</span>';
      tip.style.display = "block";
      var crect = container.getBoundingClientRect();
      var drect = el.getBoundingClientRect();
      var cx = drect.left + drect.width / 2 - crect.left;
      var cy = drect.top - crect.top;
      tip.style.left = cx + "px";
      tip.style.top = (cy - 10) + "px";
    });
    hits[i].addEventListener("mouseleave", function () {
      tip.style.display = "none";
    });
  }
}

/**
 * 막대 차트 — 항목별 비교 (한 크리에이터의 여러 항목)
 * bars: [{label, value, color}]
 */
function renderBarChart(bars, opts) {
  opts = opts || {};
  var W = opts.width || 980, H = opts.height || 380;
  var padL = 76, padR = 24, padT = 24, padB = 56;
  var iw = W - padL - padR, ih = H - padT - padB;
  var unitLabel = opts.unitLabel || "";

  var vals = bars.map(function (b) { return b.value; }).filter(function (v) { return v != null; });
  if (!vals.length) return '<div class="g-empty">표시할 데이터가 없습니다.</div>';

  var dataMax = Math.max.apply(null, vals);
  var step = niceStep(dataMax / 5 || 1);
  var max = Math.ceil(dataMax / step) * step;
  if (max === 0) max = step;
  var nSteps = Math.round(max / step);

  function py(v) { return padT + ih - (v / max) * ih; }

  var h = [];
  h.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="g-svg" preserveAspectRatio="xMidYMid meet">');

  if (unitLabel) {
    h.push('<text x="' + (padL - 10) + '" y="' + (padT - 9) + '" text-anchor="end" class="g-axisunit">(' + gEsc(unitLabel) + ')</text>');
  }

  for (var g = 0; g <= nSteps; g++) {
    var v = step * g;
    var y = py(v);
    h.push('<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#e8e5df" stroke-width="1"/>');
    h.push('<text x="' + (padL - 10) + '" y="' + (y + 4) + '" text-anchor="end" class="g-axis">' + fmtMoney(v) + '</text>');
  }

  var n = bars.length;
  var slot = iw / n;
  var bw = Math.min(80, slot * 0.5);

  bars.forEach(function (b, i) {
    if (b.value == null) return;
    var cx = padL + slot * i + slot / 2;
    var x = cx - bw / 2;
    var y = py(b.value);
    var barH = padT + ih - y;
    var color = b.color || CHART_COLORS[i % CHART_COLORS.length];
    h.push('<rect class="g-bar" x="' + x + '" y="' + y + '" width="' + bw + '" height="' + barH + '" rx="3" fill="' + color + '" '
      + 'data-label="' + gEsc(b.label) + '" data-y="' + b.value + '"/>');
    // 값 라벨
    h.push('<text x="' + cx + '" y="' + (y - 7) + '" text-anchor="middle" class="g-barval">' + fmtMoney(b.value) + '</text>');
    // 항목 라벨
    h.push('<text x="' + cx + '" y="' + (H - padB + 20) + '" text-anchor="middle" class="g-axis">' + gEsc(b.label) + '</text>');
  });

  h.push('</svg>');
  return h.join("");
}
