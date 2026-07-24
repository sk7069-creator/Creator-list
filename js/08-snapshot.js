/* AG-ENT 크리에이터 단가표 — 기준일 스냅샷 (특정 날짜 23:59 기준 단가) */

var snapHist = null;      // 이력 캐시
var snapLoading = false;

var SNAP_FIELDS = { "숏폼 1채널": "s1", "2채널": "s2", "3채널": "s3", "피드": "fd", "롱폼": "lf" };

function snapParseTS(s) {
  s = String(s || "").trim();
  if (!s) return null;
  var m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  var t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
}

// 이력 CSV 로드 (한 번만)
function loadHistory() {
  if (snapHist) return Promise.resolve(snapHist);
  if (snapLoading) return Promise.resolve(null);
  snapLoading = true;
  return fetch("/api/sheet?which=history&_t=" + Date.now(), { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
    .then(function (text) {
      var rows = parseCSV(text);
      var out = [];
      var hi = 0;
      for (var r = 0; r < Math.min(rows.length, 3); r++) {
        if (rows[r].some(function (c) { return String(c).indexOf("일시") >= 0; })) { hi = r; break; }
      }
      for (var i = hi + 1; i < rows.length; i++) {
        var rr = rows[i];
        if (!rr || rr.length < 5) continue;
        var ts = String(rr[0] || "").trim();
        var nm = String(rr[1] || "").trim();
        var fld = String(rr[2] || "").trim();
        if (!ts || !nm || ts === "진단") continue;
        if (!SNAP_FIELDS[fld]) continue;
        var d = snapParseTS(ts);
        if (!d) continue;
        out.push({ t: d, name: nm, key: SNAP_FIELDS[fld], before: num(rr[3]), after: num(rr[4]) });
      }
      out.sort(function (a, b) { return a.t - b.t; });
      snapHist = out;
      snapLoading = false;
      return out;
    })
    .catch(function (e) {
      snapLoading = false;
      return null;
    });
}

// 기준 시점의 데이터 복원 (현재값에서 이후 변경을 역으로 되돌림)
function dataAsOf(when) {
  if (!snapHist) return null;
  var out = data.map(function (r) {
    var o = {};
    for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = r[k];
    if (r._m) o._m = JSON.parse(JSON.stringify(r._m));
    return o;
  });

  var byName = {};
  out.forEach(function (r) { byName[r.n] = r; });

  // when 이후의 변경을 최신 → 과거 순으로 되돌리기
  for (var i = snapHist.length - 1; i >= 0; i--) {
    var h = snapHist[i];
    if (h.t <= when) break;
    var row = byName[h.name];
    if (!row) continue;
    row[h.key] = (h.before == null ? "" : String(h.before));
  }

  // 병합 정보 재계산 (값이 바뀌었으므로)
  out.forEach(function (r) { autoMerge(r); });
  return out;
}

// 날짜 선택 모달
function showSnapshotModal() {
  closeOverlay();
  var ov = document.createElement("div");
  ov.id = "xl-overlay"; ov.className = "xl-overlay";
  var box = document.createElement("div");
  box.className = "xl-modal";
  box.style.maxWidth = "420px";

  var today = new Date();
  function z(n) { return (n < 10 ? "0" : "") + n; }
  var todayStr = today.getFullYear() + "-" + z(today.getMonth() + 1) + "-" + z(today.getDate());

  box.innerHTML =
    '<div class="xl-modal-head"><b>엑셀 다운로드</b><button class="xl-modal-x" id="xl-snap-x">✕</button></div>' +
    '<div style="padding:20px">' +
      '<div style="font-size:12.5px;color:#555;line-height:1.7;margin-bottom:16px">' +
        '기준 일자를 선택하면 해당 날짜 <b>23:59 시점</b>의 단가로 받습니다.<br>' +
        '<span style="color:#999">현재 탭: ' + (activeTab === "us" ? "해외 (USD)" : "국내 (만원)") + '</span>' +
      '</div>' +
      '<label style="display:block;font-size:11px;color:#8a8375;font-weight:700;letter-spacing:.05em;margin-bottom:6px">기준 일자</label>' +
      '<input type="date" id="xl-snap-date" value="' + todayStr + '" max="' + todayStr + '" ' +
        'style="font-family:inherit;font-size:13px;padding:8px 10px;border:1px solid #ccc7bf;border-radius:5px;width:100%;outline:none">' +
      '<div id="xl-snap-msg" style="font-size:11.5px;color:#999;margin-top:10px;line-height:1.6"></div>' +
      '<div style="display:flex;gap:8px;margin-top:18px">' +
        '<button class="xl-btn" id="xl-snap-today" style="flex:1">오늘(현재) 기준</button>' +
        '<button class="xl-btn xl-btn-p" id="xl-snap-go" style="flex:1">선택일 기준 받기</button>' +
      '</div>' +
    '</div>';

  ov.appendChild(box);
  document.body.appendChild(ov);
  ov.onclick = function (e) { if (e.target === ov) closeOverlay(); };
  box.querySelector("#xl-snap-x").onclick = closeOverlay;

  var msg = box.querySelector("#xl-snap-msg");
  msg.textContent = "이력을 불러오는 중…";
  loadHistory().then(function (h) {
    if (!h) { msg.textContent = "이력을 불러오지 못했습니다. 현재 기준으로만 받을 수 있습니다."; return; }
    if (!h.length) { msg.textContent = "기록된 변경 이력이 없습니다. 현재 값으로 받습니다."; return; }
    var first = h[0].t;
    msg.textContent = "이력 " + h.length + "건 · " +
      (first.getFullYear() + "-" + z(first.getMonth() + 1) + "-" + z(first.getDate())) + " 이후 시점만 정확합니다.";
  });

  box.querySelector("#xl-snap-today").onclick = function () {
    closeOverlay();
    downloadXLSX();
  };

  box.querySelector("#xl-snap-go").onclick = function () {
    var v = box.querySelector("#xl-snap-date").value;
    if (!v) { notify("날짜를 선택하세요"); return; }
    var parts = v.split("-");
    var when = new Date(+parts[0], +parts[1] - 1, +parts[2], 23, 59, 59, 999);
    closeOverlay();

    loadHistory().then(function (h) {
      if (!h) { notify("이력을 불러오지 못해 현재 기준으로 받습니다."); downloadXLSX(); return; }
      var snap = dataAsOf(when);
      if (!snap) { downloadXLSX(); return; }
      downloadXLSX(snap, v);
    });
  };
}
