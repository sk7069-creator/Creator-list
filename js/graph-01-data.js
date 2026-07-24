/* AG-ENT 단가 이력 — 데이터 로드 및 파싱 */

// 이력 시트 CSV (자동 기록됨: 일시 | 크리에이터 | 항목 | 이전값 | 변경값 | 수정자)
var HIST_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT0DKy6jqqd7KD5MiKvc0xDdxNbsIsii4GkbN5ReRjGqSgn4sFm6bHBi4a3KJrrr1HbO8Qy8NMg9XCj/pub?gid=0&single=true&output=csv";

// 현재 단가 시트 CSV (기준 시점 계산용)
var CUR_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTzUU4epCiIOeNcIWiRKpS7YHau_e4Lxr7RQunedSF0aD0fNkBw2yEz9SindNPHQhfzNpJsphOgHdla/pub?gid=0&single=true&output=csv";

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
    out.push({ n: n, s1: gNum(rr[1]), s2: gNum(rr[2]), s3: gNum(rr[3]), fd: gNum(rr[4]), lf: gNum(rr[5]) });
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
