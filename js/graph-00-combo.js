/* AG-ENT — 검색 가능한 드롭다운 (콤보박스)
   기본 select로는 검색이 안 되므로 입력창+목록을 직접 구성.
   한 페이지에 여러 개 쓸 수 있도록 인스턴스별로 상태 관리. */

var gComboSeq = 0;

/**
 * 검색 드롭다운 HTML 생성
 * opts: { id, placeholder, options:[문자열], disabledSet:{이름:true}, width }
 */
function comboHTML(opts) {
  var id = opts.id;
  var ph = opts.placeholder || "선택하세요";
  var width = opts.width || 200;
  var h = [];
  h.push('<div class="g-combo" id="' + id + '" style="width:' + width + 'px" data-open="0">');
  h.push('<input type="text" class="g-combo-input" id="' + id + '-inp" placeholder="' + gEsc(ph) + '" autocomplete="off" readonly>');
  h.push('<span class="g-combo-arrow">▾</span>');
  h.push('<div class="g-combo-list" id="' + id + '-list"></div>');
  h.push('</div>');
  return h.join("");
}

/**
 * 드롭다운 동작 연결
 * cfg: {
 *   id, options:[문자열], disabled:{이름:true},
 *   onPick: function(value){}
 * }
 */
function comboBind(cfg) {
  var root = document.getElementById(cfg.id);
  if (!root) return;
  var inp = document.getElementById(cfg.id + "-inp");
  var list = document.getElementById(cfg.id + "-list");
  var options = cfg.options || [];
  var disabled = cfg.disabled || {};

  function renderList(filter) {
    var q = (filter || "").toLowerCase().replace(/\s/g, "");
    var html = [];
    var visible = [];   // 화면에 보이는 항목의 원본 이름
    options.forEach(function (nm) {
      var norm = String(nm).toLowerCase().replace(/\s/g, "");
      if (q && norm.indexOf(q) < 0) return;
      var dis = !!disabled[nm];
      var vi = visible.length;
      visible.push(nm);
      html.push('<div class="g-combo-item' + (dis ? " dis" : "") + '" data-vi="' + vi + '">'
        + gEsc(nm) + (dis ? ' <span class="g-combo-chk">선택됨</span>' : '') + '</div>');
    });
    if (!visible.length) html.push('<div class="g-combo-empty">검색 결과 없음</div>');
    list.innerHTML = html.join("");

    var items = list.querySelectorAll(".g-combo-item");
    for (var i = 0; i < items.length; i++) {
      var vi = parseInt(items[i].getAttribute("data-vi"), 10);
      var name = visible[vi];              // 이 항목의 실제 이름 (검색 결과 기준)
      if (disabled[name]) continue;
      (function (picked) {
        items[i].onmousedown = function (e) {
          e.preventDefault();
          close();
          if (cfg.onPick) cfg.onPick(picked);
        };
      })(name);
    }
  }

  function open() {
    root.setAttribute("data-open", "1");
    inp.removeAttribute("readonly");
    inp.value = "";
    renderList("");
    setTimeout(function () { inp.focus(); }, 0);
  }
  function close() {
    root.setAttribute("data-open", "0");
    inp.setAttribute("readonly", "readonly");
    inp.value = "";
  }

  root.__close = close;

  inp.onclick = function () {
    if (root.getAttribute("data-open") === "1") close(); else open();
  };
  // 한글 조합 중에는 필터 미루기
  var composing = false;
  inp.addEventListener("compositionstart", function () { composing = true; });
  inp.addEventListener("compositionend", function () { composing = false; renderList(inp.value); });
  inp.oninput = function () { if (!composing) renderList(inp.value); };
  inp.onkeydown = function (e) { if (e.key === "Escape") close(); };
}

// 열려 있는 콤보 전부 닫기 (바깥 클릭 시)
document.addEventListener("mousedown", function (e) {
  var combos = document.querySelectorAll(".g-combo[data-open='1']");
  for (var i = 0; i < combos.length; i++) {
    if (!combos[i].contains(e.target) && combos[i].__close) combos[i].__close();
  }
});
