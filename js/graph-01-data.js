/* AG-ENT 단가 이력 — 데이터 로드 및 파싱 */

// 이력 시트 CSV (자동 기록됨: 일시 | 크리에이터 | 항목 | 이전값 | 변경값 | 수정자)
var HIST_CSV_URL = "/api/sheet?which=history";

// 현재 단가 시트 CSV (기준 시점 계산용)
var CUR_CSV_URL = "/api/sheet?which=current";

var FIELDS = ["숏폼 1채널", "2채널", "3채널", "피드", "롱폼"];
var FIELD_KEY = { "숏폼 1채널": "s1", "2채널": "s2", "3채널": "s3", "피드": "fd", "롱폼": "lf" };

var histRows = [];   // [{t:Date, ts:'2026-07-24 15:10:41', name, field, before, after, who}]
var curData = [];    // 현재 단가 [{n, s1, s2, s3, fd, lf}]
var loadErr = "";

// ── CSV 파서 (따옴표·쉼표·줄바꿈 처리) ──
function gParseCSV(text) {
  text = text.replace(/^\ufeff/, "");
  var rows = [], row = [], cur = "", i = 0, inQ = false;
  while (i < text.length) {
    var ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i += 2; continue; } inQ = false; i++; continue; }
      cur += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === ",") { row.push(cur); cur = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; i++; continue; }
    cur += ch; i++;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function gNum(v) {
  var s = String(v == null ? "" : v).replace(/[^0-9]/g, "");
  return s ? parseInt(s, 10) : null;
}

// "2026-07-24 15:10:41" → Date
function parseTS(s) {
  s = String(s || "").trim();
  if (!s) return null;
  var m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  var t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
}

function fetchCSV(url) {
  var u = url + (url.indexOf("?") >= 0 ? "&" : "?") + "_t=" + Date.now();
  return fetch(u, { cache: "no-store" }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  });
}

// 이력 CSV 파싱
function parseHistory(text) {
  var rows = gParseCSV(text);
  if (!rows.length) return [];
  var out = [];
  // 헤더 행 찾기
  var hi = 0;
  for (var r = 0; r < Math.min(rows.length, 3); r++) {
    if (rows[r].some(function (c) { return String(c).indexOf("일시") >= 0 || String(c).indexOf("크리에이터") >= 0; })) { hi = r; break; }
  }
  for (var i = hi + 1; i < rows.length; i++) {
    var rr = rows[i];
    if (!rr || rr.length < 5) continue;
    var ts = String(rr[0] || "").trim();
    var name = String(rr[1] || "").trim();
    var field = String(rr[2] || "").trim();
    if (!ts || !name) continue;
    if (name === "e 없음" || ts === "진단") continue;   // 진단용 행 제외
    if (FIELDS.indexOf(field) < 0) continue;            // 단가 항목만
    var d = parseTS(ts);
    if (!d) continue;
    out.push({
      t: d, ts: ts, name: name, field: field,
      before: gNum(rr[3]), after: gNum(rr[4]),
      who: String(rr[5] || "").trim()
    });
  }
  out.sort(function (a, b) { return a.t - b.t; });
  return out;
}

// 현재 단가 CSV 파싱
function parseCurrent(text) {
  var rows = gParseCSV(text);
  if (!rows.length) return [];
  var hi = -1;
  for (var r = 0; r < Math.min(rows.length, 5); r++) {
    if (rows[r].some(function (c) { return String(c).replace(/\s/g, "").indexOf("크리에이터명") >= 0; })) { hi = r; break; }
  }
  if (hi === -1) hi = 0;
  var out = [];
  for (var i = hi + 1; i < rows.length; i++) {
    var rr = rows[i]; if (!rr) continue;
    var n = String(rr[0] || "").trim();
    if (!n || n.indexOf("*") === 0 || n.length > 25) continue;
    out.push({
      n: n, s1: gNum(rr[1]), s2: gNum(rr[2]), s3: gNum(rr[3]), fd: gNum(rr[4]), lf: gNum(rr[5]),
      ig: String(rr[6] || "").trim(), tt: String(rr[7] || "").trim(), yt: String(rr[8] || "").trim()
    });
  }
  return out;
}

// 특정 시점의 단가 복원 (현재값에서 이후 변경을 역으로 되돌림)
function priceAt(name, field, when) {
  var key = FIELD_KEY[field];
  var cur = null;
  for (var i = 0; i < curData.length; i++) {
    if (curData[i].n === name) { cur = curData[i][key]; break; }
  }
  if (cur == null) return null;
  // when 이후에 일어난 변경들을 역순으로 되돌리기
  for (var j = histRows.length - 1; j >= 0; j--) {
    var h = histRows[j];
    if (h.name !== name || h.field !== field) continue;
    if (h.t <= when) break;
    if (h.before != null) cur = h.before;
  }
  return cur;
}

// 전체 크리에이터의 특정 시점 스냅샷
function snapshotAt(when) {
  return curData.map(function (c) {
    var o = { n: c.n };
    FIELDS.forEach(function (f) { o[FIELD_KEY[f]] = priceAt(c.n, f, when); });
    return o;
  });
}

// ── 전체 평균 (현재 단가 기준, 특정 항목) ──
function avgOfField(fieldKey) {
  var sum = 0, cnt = 0;
  curData.forEach(function (c) {
    var v = c[fieldKey];
    if (v != null && v !== "") { sum += Number(v); cnt++; }
  });
  return cnt ? Math.round(sum / cnt) : null;
}

// ── 가격대별 그룹 분류 (현재 숏폼 1채널 기준) ──
// 500만원↑ / 200~500 / 200↓  (단위: 만원이므로 500 / 200)
function priceGroup(v) {
  if (v == null) return null;
  if (v >= 500) return "high";   // 500만원 이상
  if (v >= 200) return "mid";    // 200~500만원
  return "low";                  // 200만원 미만
}

/**
 * 그룹별 월 변동률 계산
 * 각 크리에이터의 이력에서 "변경 건"마다 (변경폭/이전값)을 월 단위로 환산해 평균.
 * 반환: { high:{all,up,down,n}, mid:{...}, low:{...} }
 *   all: 방향 무관 평균 변동률(%), up: 상향만, down: 하향만, n: 표본 수
 */
function trendStatus(name) {
  // 최근 단가 방향 판단: 크리에이터의 숏폼1 이력을 보고 상승/하락/유지
  var STALE_DAYS = 60;   // 이 기간 넘게 변경 없으면 '유지(정체)'
  var changes = [];
  histRows.forEach(function (h) {
    if (h.name !== name) return;
    if (h.field !== "숏폼 1채널") return;   // 대표 항목 기준
    if (h.before == null || h.after == null) return;
    changes.push(h);
  });
  if (!changes.length) return { status: "none", last: null };

  var last = changes[changes.length - 1];
  var now = new Date();
  var daysSince = (now - last.t) / 86400000;

  if (daysSince > STALE_DAYS) return { status: "hold", last: last.t, daysSince: Math.round(daysSince) };

  // 최근 변경의 방향
  var diff = last.after - last.before;
  if (diff > 0) return { status: "up", last: last.t, pct: +(((diff) / last.before) * 100).toFixed(1) };
  if (diff < 0) return { status: "down", last: last.t, pct: +(((diff) / last.before) * 100).toFixed(1) };
  return { status: "hold", last: last.t };
}

// 가격대별 상승/하락/유지 인원 집계
function groupTrends() {
  var nameGroup = {};
  curData.forEach(function (c) {
    var g = priceGroup(c.s1);
    if (g) nameGroup[c.n] = g;
  });

  function blank() {
    return { up: 0, down: 0, hold: 0, none: 0, total: 0,
             names: { up: [], down: [], hold: [], none: [] } };
  }
  var result = { high: blank(), mid: blank(), low: blank() };

  Object.keys(nameGroup).forEach(function (name) {
    var g = nameGroup[name];
    var t = trendStatus(name);
    result[g].total++;
    result[g][t.status]++;
    result[g].names[t.status].push({ name: name, pct: t.pct, daysSince: t.daysSince });
  });

  // 이름 가나다 정렬
  ["high", "mid", "low"].forEach(function (g) {
    ["up", "down", "hold", "none"].forEach(function (st) {
      result[g].names[st].sort(function (a, b) { return a.name.localeCompare(b.name, "ko"); });
    });
  });

  return result;
}

// 개별 크리에이터의 상태 (칩/뱃지용)
function creatorTrend(name) {
  return trendStatus(name);
}
