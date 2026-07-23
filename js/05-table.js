/* AG-ENT 크리에이터 단가표 — 표 렌더링 · 선택 · 편집 · 병합 */
function render(){
  var vr=viewRows();
  var totalW=COLS.reduce(function(a,c){return a+c.w;},0)+40;
  var h=[];
  h.push('<div class="xl-wrap">');
  // 툴바
  h.push('<div class="xl-toolbar"><div class="xl-tleft">');
  h.push('<span class="xl-title">AG-ENT 크리에이터 단가표</span>');
  h.push('<span class="xl-tabs">');
  h.push('<button class="xl-tab'+(activeTab==="kr"?" on":"")+'" data-tab="kr">국내 (만원)</button>');
  h.push('<button class="xl-tab'+(activeTab==="us"?" on":"")+'" data-tab="us">해외 (USD)</button>');
  h.push('</span>');
  h.push('<span class="xl-count">'+data.length+'명'+(searchQ?(' · 검색 '+vr.length):'')+(activeTab==="us"?' · 환율 '+USD_RATE.toLocaleString():'')+'</span>');
  h.push('</div><div class="xl-tright">');
  h.push('<input id="xl-search" class="xl-search" placeholder="크리에이터명 검색" value="'+esc(searchQ)+'">');
  h.push('<button class="xl-btn xl-btn-p" id="xl-copy">복사</button>');
  h.push('<button class="xl-btn" id="xl-copyall">전체 복사</button>');
  h.push('<button class="xl-btn" id="xl-xlsx">엑셀 다운로드</button>');
  h.push('<button class="xl-btn" id="xl-log">수정 기록'+(editLog.length?' '+editLog.length:'')+'</button>');
  h.push('<button class="xl-btn" id="xl-alert-demo" title="마스터 시트 변경 알림 예시">🔔 알림 예시</button>');
  h.push('<button class="xl-btn" id="xl-refresh" title="마스터 시트에서 최신 내용 다시 확인">↻ 시트 확인</button>');
  h.push('<button class="xl-btn" id="xl-reset" title="도구에서 수정한 내용을 버리고 마스터 시트 상태로 되돌립니다">초기화</button>');
  h.push('<button class="xl-btn" id="xl-undo" title="Ctrl+Z">↶</button>');
  h.push('<button class="xl-btn" id="xl-redo" title="Ctrl+Y">↷</button>');
  h.push('</div></div>');
  // 표
  h.push('<div class="xl-scroll"><table class="xl-table" style="width:'+totalW+'px"><colgroup><col style="width:40px">');
  COLS.forEach(function(c){ h.push('<col style="width:'+c.w+'px">'); });
  h.push('</colgroup>');
  // ── 1행: 엑셀 열 라벨 A B C ... (클릭=열 선택, 우클릭=열 메뉴, 경계=리사이즈) ──
  h.push('<thead>');
  h.push('<tr class="xl-alpha-row">');
  h.push('<th class="xl-corner" id="xl-selall" title="전체 선택"></th>');
  COLS.forEach(function(c,ci){
    var on=colSelected(ci);
    h.push('<th class="xl-alpha'+(on?' xl-colsel':'')+'" data-col="'+ci+'">'+ALPHA[ci]
      +'<span class="xl-resize" data-col="'+ci+'"></span></th>');
  });
  h.push('</tr>');
  // ── 2행: 실제 헤더 (셀처럼 선택 가능, r=-1) ──
  h.push('<tr>');
  h.push('<th class="xl-corner2"></th>');
  COLS.forEach(function(c,ci){
    var inSel=selContains(-1,ci);
    var arrow=(sortState.key===c.key)?(sortState.dir>0?'▲':(sortState.dir<0?'▼':'⇅')):'⇅';
    h.push('<th class="xl-th'+(inSel?' xl-sel':'')+'" data-r="-1" data-c="'+ci+'">'
      +'<span class="xl-thlabel">'+esc(colLabel(c))+'</span>'
      +'<span class="xl-sort" data-sort="'+c.key+'" title="정렬">'+arrow+'</span></th>');
  });
  h.push('</tr></thead>');
  // ── 데이터 ──
  h.push('<tbody>');
  vr.forEach(function(o,ri){
    h.push('<tr data-di="'+o.di+'">');
    h.push('<td class="xl-rownum'+(rowSelected(ri)?' xl-rowsel':'')+'" data-row="'+ri+'">'+(ri+1)+'</td>');
    var merges=o.row._m||[];
    var rowName=o.row.n||"";
    var rowChanged=highlightCells[rowName+"|__row"];
    var ci=0;
    while(ci<COLS.length){
      var c=COLS[ci];
      // 이 칸이 병합 구간의 시작인지
      var mg=null; for(var mi=0;mi<merges.length;mi++){ if(merges[mi].c1===ci){ mg=merges[mi]; break; } }
      var inSel=selContains(ri,ci);
      var chg=rowChanged||highlightCells[rowName+"|"+c.key];
      var cls="xl-td"+(c.center?" xl-center":"")+(c.bold?" xl-bold":"")+(c.link?" xl-link":"")+(inSel?" xl-sel":"")+(chg?" xl-changed":"");
      if(mg){
        var span=mg.c2-mg.c1+1;
        // 병합 구간 안의 어느 칸이든 변경됐으면 강조
        var mchg=rowChanged; for(var mc=mg.c1;mc<=mg.c2;mc++){ if(highlightCells[rowName+"|"+COLS[mc].key]) mchg=true; }
        cls="xl-td xl-center xl-merged"+(inSel?" xl-sel":"")+(mchg?" xl-changed":"");
        if(editingCell&&editingCell.r===ri&&editingCell.c===ci){
          h.push('<td class="'+cls+' xl-editing" colspan="'+span+'" data-r="'+ri+'" data-c="'+ci+'"><input class="xl-input" value="'+esc(cellRaw(o.row,c))+'"></td>');
        }else{
          h.push('<td class="'+cls+'" colspan="'+span+'" data-r="'+ri+'" data-c="'+ci+'">'+esc(cellText(o.row,c))+'</td>');
        }
        ci=mg.c2+1;
      }else{
        if(editingCell&&editingCell.r===ri&&editingCell.c===ci){
          h.push('<td class="'+cls+' xl-editing" data-r="'+ri+'" data-c="'+ci+'"><input class="xl-input" value="'+esc(cellRaw(o.row,c))+'"></td>');
        }else{
          h.push('<td class="'+cls+'" data-r="'+ri+'" data-c="'+ci+'">'+esc(cellText(o.row,c))+'</td>');
        }
        ci++;
      }
    }
    h.push('</tr>');
  });
  if(vr.length===0) h.push('<tr><td class="xl-empty" colspan="'+(COLS.length+1)+'">표시할 데이터가 없습니다.</td></tr>');
  h.push('</tbody></table></div>');
  // 상태바
  h.push('<div class="xl-note">'+esc(currentNote())+'</div>');
  h.push('<div class="xl-status"><span>'+(sel?selDesc():'셀·행·열을 선택하세요 (우클릭 = 메뉴)')+'</span>');
  h.push('<span class="xl-hint">드래그 선택 → 우클릭/Ctrl+C 복사 → 메일·엑셀 붙여넣기</span></div>');
  h.push('</div>');
  root.innerHTML=h.join("");
  bind(vr);
}

function selContains(r,c){
  if(!sel) return false;
  var r1=Math.min(sel.r1,sel.r2), r2=Math.max(sel.r1,sel.r2), c1=Math.min(sel.c1,sel.c2), c2=Math.max(sel.c1,sel.c2);
  return r>=r1&&r<=r2&&c>=c1&&c<=c2;
}
function rowSelected(ri){ if(!sel) return false; var r1=Math.min(sel.r1,sel.r2),r2=Math.max(sel.r1,sel.r2),c1=Math.min(sel.c1,sel.c2),c2=Math.max(sel.c1,sel.c2); return ri>=r1&&ri<=r2&&c1===0&&c2===COLS.length-1; }
function colSelected(ci){ if(!sel) return false; var c1=Math.min(sel.c1,sel.c2),c2=Math.max(sel.c1,sel.c2),r1=Math.min(sel.r1,sel.r2); return ci>=c1&&ci<=c2&&r1<=-1; }
function selDesc(){
  var r1=Math.min(sel.r1,sel.r2),r2=Math.max(sel.r1,sel.r2),c1=Math.min(sel.c1,sel.c2),c2=Math.max(sel.c1,sel.c2);
  return '선택: '+(r2-r1+1)+'행 × '+(c2-c1+1)+'열'+(r1<0?' (헤더 포함)':'');
}

function bind(vr){
  var byId=function(id){return document.getElementById(id);};
  byId("xl-search").oninput=function(e){ searchQ=e.target.value; sel=null; render(); var s=byId("xl-search"); if(s){s.focus(); var v=s.value; s.value=""; s.value=v;} };
  byId("xl-copy").onclick=function(){ copySelection(vr); };
  byId("xl-copyall").onclick=function(){ sel={r1:-1,c1:0,r2:vr.length-1,c2:COLS.length-1}; copySelection(vr); };
  byId("xl-xlsx").onclick=function(){ downloadXLSX(); };
  byId("xl-log").onclick=function(){ showLogModal(); };
  var ad=byId("xl-alert-demo"); if(ad) ad.onclick=function(){ showMasterAlert(); };
  var tabs=root.querySelectorAll(".xl-tab");
  for(var ti=0;ti<tabs.length;ti++){
    tabs[ti].onclick=function(){
      var t=this.getAttribute("data-tab");
      if(t===activeTab) return;
      activeTab=t; sel=null; editingCell=null; render();
      notify(t==="us"?("해외 단가 (USD · 환율 "+USD_RATE.toLocaleString()+" · 수수료 15% · 10달러 단위 올림)"):"국내 단가 (만원)");
    };
  }
  var rf=byId("xl-refresh"); if(rf) rf.onclick=function(){ notify("마스터 시트 확인 중..."); fetchSheet(false, true); };
  var rs=byId("xl-reset"); if(rs) rs.onclick=function(){ resetToSheet(); };
  byId("xl-undo").onclick=undo;
  byId("xl-redo").onclick=redo;
  var corner=byId("xl-selall"); if(corner){ corner.onclick=function(){ sel={r1:-1,c1:0,r2:vr.length-1,c2:COLS.length-1}; render(); }; }

  // 열 라벨(알파벳): 클릭=열선택, 우클릭=열메뉴
  var alphas=root.querySelectorAll(".xl-alpha");
  for(var a=0;a<alphas.length;a++){
    alphas[a].onmousedown=function(e){
      if(e.target.classList.contains("xl-resize")) return;
      if(e.button===2) return;
      var ci=parseInt(this.getAttribute("data-col"),10);
      anchor={r:-1,c:ci}; sel={r1:-1,c1:ci,r2:vr.length-1,c2:ci}; dragging="col";
      updateSelDom(); e.preventDefault();
    };
    alphas[a].onmouseenter=function(e){
      if(dragging!=="col"||!anchor) return;
      var ci=parseInt(this.getAttribute("data-col"),10);
      sel={r1:-1,c1:anchor.c,r2:vr.length-1,c2:ci}; updateSelDom();
    };
    alphas[a].oncontextmenu=function(e){
      e.preventDefault();
      var ci=parseInt(this.getAttribute("data-col"),10);
      if(!colSelected(ci)){ sel={r1:-1,c1:ci,r2:vr.length-1,c2:ci}; render(); }
      showColMenu(e.clientX, e.clientY, ci, vr);
    };
  }
  // 열 리사이즈 핸들
  var handles=root.querySelectorAll(".xl-resize");
  for(var rz=0;rz<handles.length;rz++){
    handles[rz].onmousedown=function(e){
      e.preventDefault(); e.stopPropagation();
      var ci=parseInt(this.getAttribute("data-col"),10);
      startResize(ci, e.clientX);
    };
  }
  // 헤더 정렬 버튼
  var sorts=root.querySelectorAll(".xl-sort");
  for(var s=0;s<sorts.length;s++){ sorts[s].onclick=function(ev){ ev.stopPropagation(); toggleSort(this.getAttribute("data-sort")); }; }

  // 셀 + 헤더셀 드래그 선택
  var selCells=root.querySelectorAll("td.xl-td, th.xl-th");
  for(var k=0;k<selCells.length;k++){
    var td=selCells[k];
    td.onmousedown=function(e){
      if(e.target.classList.contains("xl-sort")) return;
      if(e.button===2) return; // 우클릭은 선택 유지
      if(editingCell){ commitEdit(vr); }
      var r=parseInt(this.getAttribute("data-r"),10), c=parseInt(this.getAttribute("data-c"),10);
      anchor={r:r,c:c}; sel={r1:r,c1:c,r2:r,c2:c}; dragging="cell";
      updateSelDom(); e.preventDefault();
    };
    td.onmouseenter=function(e){
      if(dragging!=="cell"||!anchor) return;
      var r=parseInt(this.getAttribute("data-r"),10), c=parseInt(this.getAttribute("data-c"),10);
      sel={r1:anchor.r,c1:anchor.c,r2:r,c2:c}; updateSelDom();
    };
    td.ondblclick=function(){
      if(activeTab==="us"){ notify("해외 단가는 국내 단가에서 자동 계산됩니다. 국내 탭에서 수정하세요."); return; }
      var r=parseInt(this.getAttribute("data-r"),10), c=parseInt(this.getAttribute("data-c"),10);
      if(r<0) return;
      editingCell={r:r,c:c}; render();
      var inp=root.querySelector(".xl-input"); if(inp){ inp.focus(); inp.select(); }
    };
    td.oncontextmenu=function(e){
      e.preventDefault();
      var r=parseInt(this.getAttribute("data-r"),10), c=parseInt(this.getAttribute("data-c"),10);
      if(!selContains(r,c)){ anchor={r:r,c:c}; sel={r1:r,c1:c,r2:r,c2:c}; render(); }
      showCellMenu(e.clientX, e.clientY, vr);
    };
  }
  // 행번호: 클릭/드래그 = 행선택, 우클릭 = 행메뉴
  var rns=root.querySelectorAll(".xl-rownum");
  for(var j=0;j<rns.length;j++){
    rns[j].onmousedown=function(e){
      if(e.button===2) return;
      var r=parseInt(this.getAttribute("data-row"),10);
      anchor={r:r,c:0}; sel={r1:r,c1:0,r2:r,c2:COLS.length-1}; dragging="row";
      updateSelDom(); e.preventDefault();
    };
    rns[j].onmouseenter=function(e){
      if(dragging!=="row"||!anchor) return;
      var r=parseInt(this.getAttribute("data-row"),10);
      sel={r1:anchor.r,c1:0,r2:r,c2:COLS.length-1}; updateSelDom();
    };
    rns[j].oncontextmenu=function(e){
      e.preventDefault();
      var r=parseInt(this.getAttribute("data-row"),10);
      if(!rowSelected(r)){ sel={r1:r,c1:0,r2:r,c2:COLS.length-1}; render(); }
      showRowMenu(e.clientX, e.clientY, r, vr);
    };
  }
  // 편집 인풋
  var inp=root.querySelector(".xl-input");
  if(inp){
    inp.onkeydown=function(e){ if(e.key==="Enter"){commitEdit(vr);e.preventDefault();} else if(e.key==="Escape"){editingCell=null;render();} };
    inp.onblur=function(){ commitEdit(vr); };
  }
}

function updateSelDom(){
  var cells=root.querySelectorAll("td.xl-td, th.xl-th");
  for(var i=0;i<cells.length;i++){
    var r=parseInt(cells[i].getAttribute("data-r"),10), c=parseInt(cells[i].getAttribute("data-c"),10);
    cells[i].classList.toggle("xl-sel", selContains(r,c));
  }
  var alphas=root.querySelectorAll(".xl-alpha");
  for(var a=0;a<alphas.length;a++){ var ci=parseInt(alphas[a].getAttribute("data-col"),10); alphas[a].classList.toggle("xl-colsel", colSelected(ci)); }
  var rns=root.querySelectorAll(".xl-rownum");
  for(var j=0;j<rns.length;j++){ var rr=parseInt(rns[j].getAttribute("data-row"),10); rns[j].classList.toggle("xl-rowsel", rowSelected(rr)); }
  var sb=root.querySelector(".xl-status span"); if(sb&&sel) sb.textContent=selDesc();
}

document.addEventListener("mouseup",function(){ dragging=false; });

// ===== 열 리사이즈 =====
function startResize(ci, startX){
  var startW=COLS[ci].w;
  document.body.style.cursor="col-resize";
  function move(e){ var d=e.clientX-startX; COLS[ci].w=Math.max(36, startW+d); applyColW(ci); }
  function up(){ document.removeEventListener("mousemove",move); document.removeEventListener("mouseup",up); document.body.style.cursor=""; saveColW(); }
  document.addEventListener("mousemove",move); document.addEventListener("mouseup",up);
}
function applyColW(ci){
  var cols=root.querySelectorAll(".xl-table colgroup col");
  if(cols[ci+1]) cols[ci+1].style.width=COLS[ci].w+"px";
  var t=root.querySelector(".xl-table"); if(t){ var tw=COLS.reduce(function(a,c){return a+c.w;},0)+40; t.style.width=tw+"px"; }
}

function toggleSort(key){
  if(sortState.key===key){ sortState.dir=sortState.dir===1?-1:(sortState.dir===-1?0:1); if(sortState.dir===0) sortState.key=null; }
  else { sortState.key=key; sortState.dir=1; }
  sel=null; render();
}

function commitEdit(vr){
  if(!editingCell) return;
  var inp=root.querySelector(".xl-input"); if(!inp){ editingCell=null; return; }
  var val=inp.value, o=vr[editingCell.r], col=COLS[editingCell.c];
  if(o){
    var newVal=(col.type==="num")?(num(val)===""?"":String(num(val))):val;
    var oldVal=String(data[o.di][col.key]==null?"":data[o.di][col.key]);
    if(newVal!==oldVal){
      snapshot();
      data[o.di][col.key]=newVal; saveData();
    }
  }
  editingCell=null; render();
}

// ===== 컨텍스트 메뉴 =====
function closeMenu(){ var m=document.getElementById("xl-ctx"); if(m) m.parentNode.removeChild(m); }
function showMenu(x,y,items){
  closeMenu();
  var m=document.createElement("div"); m.id="xl-ctx"; m.className="xl-ctx";
  items.forEach(function(it){
    if(it.sep){ var s=document.createElement("div"); s.className="xl-ctx-sep"; m.appendChild(s); return; }
    var d=document.createElement("div"); d.className="xl-ctx-item"+(it.danger?" xl-ctx-danger":""); d.textContent=it.label;
    d.onclick=function(){ closeMenu(); it.fn(); };
    m.appendChild(d);
  });
  document.body.appendChild(m);
  var mw=m.offsetWidth, mh=m.offsetHeight, vw=window.innerWidth, vh=window.innerHeight;
  m.style.left=Math.min(x, vw-mw-6)+"px";
  m.style.top=Math.min(y, vh-mh-6)+"px";
}
document.addEventListener("mousedown",function(e){ var m=document.getElementById("xl-ctx"); if(m&&!m.contains(e.target)) closeMenu(); });
document.addEventListener("scroll",closeMenu,true);

function showCellMenu(x,y,vr){
  var ri=sel?Math.min(sel.r1,sel.r2):0;
  var items=[
    {label:"복사", fn:function(){ copySelection(vr); }},
    {label:"잘라내기", fn:function(){ cutSelection(vr); }},
    {label:"붙여넣기", fn:function(){ pasteFromBuf(vr); }},
    {sep:true}
  ];
  if(canMerge()) items.push({label:"셀 병합 (가로)", fn:function(){ mergeCells(vr); }});
  if(cellHasMerge(ri,vr)) items.push({label:"병합 해제", fn:function(){ unmergeCells(vr); }});
  if(canMerge()||cellHasMerge(ri,vr)) items.push({sep:true});
  items.push({label:"위에 행 삽입", fn:function(){ insertRow(vr,"above"); }});
  items.push({label:"아래에 행 삽입", fn:function(){ insertRow(vr,"below"); }});
  items.push({label:"행 삭제", danger:true, fn:function(){ delSelectedRows(vr); }});
  items.push({sep:true});
  items.push({label:"선택 영역 지우기(값)", danger:true, fn:function(){ clearSelection(vr); }});
  showMenu(x,y,items);
}
function showRowMenu(x,y,r,vr){
  showMenu(x,y,[
    {label:"복사", fn:function(){ copySelection(vr); }},
    {label:"잘라내기", fn:function(){ cutSelection(vr); }},
    {label:"붙여넣기", fn:function(){ pasteFromBuf(vr); }},
    {sep:true},
    {label:"위에 행 삽입", fn:function(){ insertRow(vr,"above"); }},
    {label:"아래에 행 삽입", fn:function(){ insertRow(vr,"below"); }},
    {label:"행 삭제", danger:true, fn:function(){ delSelectedRows(vr); }}
  ]);
}
function showColMenu(x,y,ci,vr){
  showMenu(x,y,[
    {label:"이 열 복사", fn:function(){ copySelection(vr); }},
    {sep:true},
    {label:"오름차순 정렬 ▲", fn:function(){ sortState={key:COLS[ci].key,dir:1}; sel=null; render(); }},
    {label:"내림차순 정렬 ▼", fn:function(){ sortState={key:COLS[ci].key,dir:-1}; sel=null; render(); }},
    {label:"정렬 해제", fn:function(){ sortState={key:null,dir:0}; render(); }},
    {sep:true},
    {label:"이 열 값 전체 지우기", danger:true, fn:function(){ clearColumn(ci,vr); }}
  ]);
}

// ===== 행/열 편집 동작 =====
function insertRow(vr, where){
  var r1=Math.max(0,Math.min(sel?sel.r1:0, sel?sel.r2:0));
  var o=vr[r1]; var at=o?o.di:0;
  if(where==="below") at=at+1;
  snapshot();
  var nr={id:"c"+Date.now(), n:"신규", s1:"",s2:"",s3:"",fd:"",lf:"",ig:"",tt:"",yt:""};
  data.splice(at,0,nr); saveData(); sel=null; render(); notify("행 삽입됨");
}
function delSelectedRows(vr){
  if(!sel){ notify("삭제할 행을 선택하세요"); return; }
  var r1=Math.max(0,Math.min(sel.r1,sel.r2)), r2=Math.max(sel.r1,sel.r2);
  var dis=[], names=[]; for(var r=r1;r<=r2;r++){ if(vr[r]){ dis.push(vr[r].di); names.push(vr[r].row.n||"(이름없음)"); } }
  if(!dis.length){ notify("삭제할 데이터 행이 없습니다"); return; }
  snapshot();
  var set={}; dis.forEach(function(d){set[d]=1;});
  data=data.filter(function(_,i){ return !set[i]; });
  saveData(); sel=null; render(); notify(dis.length+"개 행 삭제됨 (Ctrl+Z로 복구)");
}
function clearSelection(vr){
  if(!sel) return;
  var r1=Math.max(0,Math.min(sel.r1,sel.r2)), r2=Math.max(sel.r1,sel.r2), c1=Math.min(sel.c1,sel.c2), c2=Math.max(sel.c1,sel.c2);
  snapshot();
  for(var r=r1;r<=r2;r++){ var o=vr[r]; if(!o) continue; for(var c=c1;c<=c2;c++){ data[o.di][COLS[c].key]=""; } }
  saveData(); render(); notify("선택 영역 값 지움");
}
function clearColumn(ci,vr){
  if(!confirm('"'+COLS[ci].label+'" 열 값을 전체 지울까요?')) return;
  snapshot(); data.forEach(function(row){ row[COLS[ci].key]=""; }); saveData(); render(); notify(COLS[ci].label+" 열 지움");
}

// ===== 셀 병합 (가로, 엑셀 방식: 왼쪽 위 값만 유지) =====
function canMerge(){
  if(!sel) return false;
  var r1=Math.min(sel.r1,sel.r2), r2=Math.max(sel.r1,sel.r2), c1=Math.min(sel.c1,sel.c2), c2=Math.max(sel.c1,sel.c2);
  return r1>=0 && r1===r2 && c2>c1; // 한 행에서 2칸 이상 가로 선택
}
function mergeCells(vr){
  if(!canMerge()){ notify("같은 행에서 가로로 2칸 이상 선택하세요"); return; }
  var ri=Math.min(sel.r1,sel.r2), c1=Math.min(sel.c1,sel.c2), c2=Math.max(sel.c1,sel.c2);
  var o=vr[ri]; if(!o) return;
  snapshot();
  var row=data[o.di];
  // 엑셀 방식: 왼쪽 위(c1) 값만 유지, 나머지 비움
  for(var c=c1+1;c<=c2;c++){ row[COLS[c].key]=""; }
  // 기존 병합 중 겹치는 것 제거 후 추가
  var m=(row._m||[]).filter(function(g){ return g.c2<c1 || g.c1>c2; });
  m.push({c1:c1,c2:c2}); m.sort(function(a,b){return a.c1-b.c1;});
  row._m=m;
  saveData(); render(); notify("병합 완료 ("+COLS[c1].label+"~"+COLS[c2].label+")");
}
function unmergeCells(vr){
  if(!sel){ notify("병합 해제할 셀을 선택하세요"); return; }
  var ri=Math.min(sel.r1,sel.r2), c1=Math.min(sel.c1,sel.c2), c2=Math.max(sel.c1,sel.c2);
  var o=vr[ri]; if(!o||!data[o.di]._m) { notify("병합된 셀이 없습니다"); return; }
  snapshot();
  var row=data[o.di];
  row._m=(row._m||[]).filter(function(g){ return g.c2<c1 || g.c1>c2; });
  if(!row._m.length) delete row._m;
  saveData(); render(); notify("병합 해제됨");
}
function cellHasMerge(ri,vr){
  var o=vr[ri]; return o && data[o.di]._m && data[o.di]._m.length;
}

// ===== 잘라내기 / 붙여넣기 (내부 버퍼) =====
function cutSelection(vr){
  if(!sel) return;
  copySelection(vr); // 클립보드 + 내부 버퍼(rowMode 포함) 저장
  var r1=Math.max(0,Math.min(sel.r1,sel.r2)), r2=Math.max(sel.r1,sel.r2), c1=Math.min(sel.c1,sel.c2), c2=Math.max(sel.c1,sel.c2);
  snapshot();
  for(var r2i=r1;r2i<=r2;r2i++){ var o2=vr[r2i]; if(!o2) continue; for(var cc=c1;cc<=c2;cc++) data[o2.di][COLS[cc].key]=""; }
  saveData(); render(); notify("잘라내기 완료 (붙여넣기 가능)");
}
function pasteFromBuf(vr){
  if(!clipboardBuf){ notify("붙여넣을 내용이 없습니다 (먼저 복사/잘라내기)"); return; }
  if(!sel){ notify("붙여넣을 위치를 선택하세요"); return; }
  var startR=Math.max(0,Math.min(sel.r1,sel.r2)), startC=Math.min(sel.c1,sel.c2);
  snapshot();
  if(clipboardBuf.rowMode){
    // ── 행 단위 붙여넣기: 대상 행을 복사한 행 내용으로 통째로 덮어쓰기 (엑셀과 동일) ──
    var n=0;
    clipboardBuf.rows.forEach(function(srcRow,ri){
      var o=vr[startR+ri]; if(!o) return;
      var target=data[o.di];
      COLS.forEach(function(col){ target[col.key]=srcRow[col.key]==null?"":srcRow[col.key]; });
      if(srcRow._m) target._m=JSON.parse(JSON.stringify(srcRow._m)); else delete target._m;
      n++;
    });
    saveData(); render(); notify(n+"개 행 붙여넣기 완료 (Ctrl+Z로 복구)");
    return;
  }
  // ── 셀 범위 붙여넣기 ──
  clipboardBuf.rows.forEach(function(line,ri){
    var o=vr[startR+ri]; if(!o) return;
    line.forEach(function(val,ci){
      var col=COLS[startC+ci]; if(!col) return;
      data[o.di][col.key]=(col.type==="num")?(num(val)===""?"":String(num(val))):val;
    });
  });
  saveData(); render(); notify("붙여넣기 완료");
}

// ===== 선택 복사 (HTML+TSV) =====
