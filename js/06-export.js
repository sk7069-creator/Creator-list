/* AG-ENT 크리에이터 단가표 — 복사 · 엑셀 다운로드 · 수정 기록 · 알림 */
function copySelection(vr){
  if(!sel){ notify("복사할 셀을 선택하세요"); return; }
  var r1=Math.min(sel.r1,sel.r2), r2=Math.max(sel.r1,sel.r2), c1=Math.min(sel.c1,sel.c2), c2=Math.max(sel.c1,sel.c2);
  var includeHeader=(r1<0), dr1=Math.max(0,r1);
  // ── 내부 버퍼 저장 (도구 안에서 붙여넣기용) ──
  var isRowMode=(c1===0 && c2===COLS.length-1); // 행 전체 선택이면 행 단위 복사
  var bufRows=[];
  for(var br=dr1;br<=r2;br++){
    var bo=vr[br]; if(!bo) continue;
    if(isRowMode){
      // 행 전체: 데이터 객체를 통째로 복사 (병합정보 포함, id는 제외)
      var copy={}; COLS.forEach(function(cc){ copy[cc.key]=bo.row[cc.key]; });
      if(bo.row._m) copy._m=JSON.parse(JSON.stringify(bo.row._m));
      bufRows.push(copy);
    }else{
      var line=[]; for(var bc=c1;bc<=c2;bc++) line.push(cellRaw(bo.row,COLS[bc]));
      bufRows.push(line);
    }
  }
  clipboardBuf={rows:bufRows, c1:c1, rowMode:isRowMode};
  var tsvLines=[], htmlRows=[];
  if(includeHeader){
    var hcells=[]; for(var c=c1;c<=c2;c++) hcells.push(COLS[c].label);
    tsvLines.push(hcells.join("\t"));
    htmlRows.push('<tr>'+hcells.map(function(t){return '<td style="background:'+HEADER_BG+';border:1px solid '+BORDER+';padding:4px 8px;font-family:Malgun Gothic,sans-serif;font-size:12px;text-align:center;">'+esc(t)+'</td>';}).join("")+'</tr>');
  }
  for(var r=dr1;r<=r2;r++){
    var o=vr[r]; if(!o) continue;
    var merges=o.row._m||[];
    var tcells=[], hc=[];
    var cc=c1;
    while(cc<=c2){
      var col=COLS[cc];
      // 병합 시작?
      var mg=null; for(var mi=0;mi<merges.length;mi++){ if(merges[mi].c1===cc && merges[mi].c2<=c2){ mg=merges[mi]; break; } }
      if(mg){
        var span=mg.c2-mg.c1+1;
        var raw=cellRaw(o.row,col), disp=cellText(o.row,col);
        tcells.push(raw.replace(/[\t\r\n]/g," "));
        for(var k=1;k<span;k++) tcells.push(""); // 엑셀 붙여넣기용 빈칸
        var stm='border:1px solid '+BORDER+';padding:4px 8px;font-family:Malgun Gothic,sans-serif;font-size:12px;text-align:center;'+(col.bold?'font-weight:700;':'');
        hc.push('<td colspan="'+span+'" style="'+stm+'">'+esc(disp)+'</td>');
        cc=mg.c2+1;
      }else{
        var col2=COLS[cc], raw2=cellRaw(o.row,col2), disp2=cellText(o.row,col2);
        tcells.push(raw2.replace(/[\t\r\n]/g," "));
        var st='border:1px solid '+BORDER+';padding:4px 8px;font-family:Malgun Gothic,sans-serif;font-size:12px;'+(col2.center?'text-align:center;':'')+(col2.bold?'font-weight:700;':'')+(col2.link?'color:'+LINK+';':'');
        hc.push('<td style="'+st+'">'+esc(disp2)+'</td>');
        cc++;
      }
    }
    tsvLines.push(tcells.join("\t")); htmlRows.push('<tr>'+hc.join("")+'</tr>');
  }
  // 헤더부터 전체를 복사한 경우 안내문도 함께
  if(includeHeader && c1===0 && c2===COLS.length-1 && r2>=vr.length-1){
    var nt=currentNote();
    tsvLines.push(""); tsvLines.push(nt.replace(/\n/g," "));
    htmlRows.push('<tr><td colspan="'+COLS.length+'" style="border:1px solid '+BORDER+';background:#F9E4E4;padding:8px 10px;font-family:Malgun Gothic,sans-serif;font-size:11px;white-space:pre-wrap;">'+esc(nt)+'</td></tr>');
  }
  var tsv=tsvLines.join("\n"), html='<table style="border-collapse:collapse;">'+htmlRows.join("")+'</table>';
  copyDual(html, tsv, function(ok){ notify(ok?('복사 완료 ('+tsvLines.length+'행 × '+(c2-c1+1)+'열'+(includeHeader?', 헤더 포함':'')+'). 붙여넣기(Ctrl+V)'):'복사 실패'); });
}
function copyDual(html, tsv, cb){
  if(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write){
    try{ var item=new ClipboardItem({"text/html":new Blob([html],{type:"text/html"}),"text/plain":new Blob([tsv],{type:"text/plain"})});
      navigator.clipboard.write([item]).then(function(){cb(true);},function(){ fallbackCopy(html,tsv,cb); }); return;
    }catch(e){}
  }
  fallbackCopy(html,tsv,cb);
}
function fallbackCopy(html, tsv, cb){
  var done=false;
  function onCopy(e){ e.clipboardData.setData("text/html",html); e.clipboardData.setData("text/plain",tsv); e.preventDefault(); done=true; }
  document.addEventListener("copy",onCopy,{once:true});
  try{
    var tmp=document.createElement("div"); tmp.contentEditable="true"; tmp.style.position="fixed"; tmp.style.left="-9999px"; tmp.innerHTML=html;
    document.body.appendChild(tmp);
    var range=document.createRange(); range.selectNodeContents(tmp);
    var s=window.getSelection(); s.removeAllRanges(); s.addRange(range);
    var ok=document.execCommand("copy"); s.removeAllRanges(); document.body.removeChild(tmp); cb(ok||done);
  }catch(e){ document.removeEventListener("copy",onCopy); cb(false); }
}

// ===== 3. 엑셀(.xls) 다운로드 — SpreadsheetML(XML) 방식, 라이브러리 불필요 =====
function downloadXLSX(){
  var xmlRows=[];
  var hc=COLS.map(function(c){ return '<Cell ss:StyleID="hdr"><Data ss:Type="String">'+xesc(colLabel(c))+'</Data></Cell>'; }).join("");
  xmlRows.push('<Row>'+hc+'</Row>');
  currentData().forEach(function(row){
    var cells=COLS.map(function(c){
      if(c.type==="num"){ var n=num(row[c.key]); return n===""?'<Cell ss:StyleID="d"/>':'<Cell ss:StyleID="d"><Data ss:Type="Number">'+n+'</Data></Cell>'; }
      var v=String(row[c.key]==null?"":row[c.key]);
      return v===""?'<Cell ss:StyleID="t"/>':'<Cell ss:StyleID="t"><Data ss:Type="String">'+xesc(v)+'</Data></Cell>';
    }).join("");
    xmlRows.push('<Row>'+cells+'</Row>');
  });
  // 안내문 행 (데이터 마지막 다음, A열 병합)
  xmlRows.push('<Row/>');
  xmlRows.push('<Row><Cell ss:MergeAcross="'+(COLS.length-1)+'" ss:StyleID="note"><Data ss:Type="String">'+xesc(currentNote())+'</Data></Cell></Row>');
  var cols=COLS.map(function(c){ return '<Column ss:Width="'+Math.round(c.w*0.75)+'"/>'; }).join("");
  var xml='<?xml version="1.0" encoding="UTF-8"?>\n'
    +'<?mso-application progid="Excel.Sheet"?>\n'
    +'<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n'
    +'<Styles>'
    +'<Style ss:ID="hdr"><Interior ss:Color="#FCE5CD" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders>'+borderXML()+'</Borders></Style>'
    +'<Style ss:ID="d"><Font ss:Bold="1"/><Alignment ss:Horizontal="Center"/><Borders>'+borderXML()+'</Borders></Style>'
    +'<Style ss:ID="t"><Borders>'+borderXML()+'</Borders></Style>'
    +'<Style ss:ID="note"><Interior ss:Color="#F4CCCC" ss:Pattern="Solid"/><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders>'+borderXML()+'</Borders></Style>'
    +'</Styles>'
    +'<Worksheet ss:Name="'+(activeTab==="us"?"Creator List":"크리에이터 단가")+'"><Table>'+cols+xmlRows.join("")+'</Table></Worksheet>'
    +'</Workbook>';
  var blob=new Blob(["\ufeff"+xml],{type:"application/vnd.ms-excel;charset=utf-8"});
  var fname=(activeTab==="us"?"AG-ENT_Creator_List_USD_":"AG-ENT_크리에이터_단가표_")+nowStr().replace(/[: ]/g,"").slice(0,12)+".xls";
  downloadBlob(blob, fname);
  notify("엑셀 파일 다운로드 ("+data.length+"명)");
}
function borderXML(){ return ['Left','Top','Right','Bottom'].map(function(p){return '<Border ss:Position="'+p+'" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>';}).join(""); }
function xesc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function downloadBlob(blob, fname){
  try{
    var url=URL.createObjectURL(blob), a=document.createElement("a");
    a.href=url; a.download=fname; document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); },800);
    return true;
  }catch(e){ notify("다운로드 실패: "+(e.message||e)); return false; }
}

// ===== 4. 수정 기록 모달 =====
function showLogModal(){
  closeOverlay();
  var ov=document.createElement("div"); ov.id="xl-overlay"; ov.className="xl-overlay";
  var box=document.createElement("div"); box.className="xl-modal"; ov.appendChild(box);
  function draw(){
    var list=editLog;
    var h=[];
    h.push('<div class="xl-modal-head"><b>수정 기록</b> <span class="xl-modal-sub">'+editLog.length+'건 · 최신순</span>');
    h.push('<button class="xl-modal-x" id="xl-log-x">✕</button></div>');
    h.push('<div class="xl-modal-tools">');
    h.push('<button class="xl-btn" id="xl-log-export">기록 내보내기(CSV)</button>');
    h.push('<button class="xl-btn" id="xl-log-clear" style="color:#c0392b">기록 전체 삭제</button></div>');
    h.push('<div class="xl-log-list">');
    if(list.length===0) h.push('<div class="xl-log-empty">기록이 없습니다.</div>');
    list.forEach(function(e){
      if(e.kind==="edit"){
        h.push('<div class="xl-log-row"><span class="xl-log-t">'+esc(e.t)+'</span>'
          +'<span class="xl-log-name">'+esc(e.name)+'</span>'
          +'<span class="xl-log-field">'+esc(e.field)+'</span>'
          +'<span class="xl-log-chg"><span class="xl-log-b">'+esc(e.before||"(빈값)")+'</span> → <span class="xl-log-a">'+esc(e.after||"(빈값)")+'</span></span></div>');
      }else{
        h.push('<div class="xl-log-row"><span class="xl-log-t">'+esc(e.t)+'</span>'
          +'<span class="xl-log-name">'+esc(e.name)+'</span>'
          +'<span class="xl-log-act">'+esc(e.kind)+'</span></div>');
      }
    });
    h.push('</div>');
    box.innerHTML=h.join("");
    box.querySelector("#xl-log-x").onclick=closeOverlay;
    box.querySelector("#xl-log-export").onclick=exportLogCSV;
    box.querySelector("#xl-log-clear").onclick=function(){ if(confirm("수정 기록을 전체 삭제할까요? (되돌릴 수 없음)")){ editLog=[]; saveLog(); draw(); render(); } };
  }
  draw();
  ov.onclick=function(e){ if(e.target===ov) closeOverlay(); };
  document.body.appendChild(ov);
}
function exportLogCSV(){
  var rows=[["일시","크리에이터","항목","변경전","변경후","동작"]];
  editLog.forEach(function(e){ rows.push([e.t,e.name,e.field,e.before,e.after,e.kind==="edit"?"수정":e.kind]); });
  var csv=rows.map(function(r){ return r.map(function(c){ var s=String(c==null?"":c); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }).join(","); }).join("\r\n");
  downloadBlob(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}), "AG-ENT_수정기록_"+nowStr().replace(/[: ]/g,"").slice(0,12)+".csv");
  notify("수정 기록 CSV 내보냄");
}
function closeOverlay(){ var o=document.getElementById("xl-overlay"); if(o) o.parentNode.removeChild(o); }

// ===== 마스터 시트 변경 알림 =====
function showMasterAlert(changes){
  closeOverlay();
  var isDemo=!changes||!changes.length;
  var list=changes||[];
  var ov=document.createElement("div"); ov.id="xl-overlay"; ov.className="xl-overlay xl-overlay-alert";
  var box=document.createElement("div"); box.className="xl-modal xl-modal-alert";
  var h=[];
  h.push('<div class="xl-alert-icon">🔔</div>');
  h.push('<div class="xl-alert-title">단가표가 업데이트되었습니다</div>');
  if(isDemo){
    h.push('<div class="xl-alert-body">마스터 시트에서 단가가 변동되었습니다.<br>확인을 눌러 최신 내용을 반영하세요. (예시)</div>');
  }else{
    var editCnt=list.filter(function(c){return c.kind==="edit";}).length;
    h.push('<div class="xl-alert-body">마스터 시트에서 <b>'+list.length+'건</b>이 변경되었습니다.<br>확인을 눌러 최신 내용을 반영하세요.</div>');
    h.push('<div class="xl-alert-changes">');
    list.slice(0,12).forEach(function(c){
      if(c.kind==="edit") h.push('<div class="xl-alert-chg"><b>'+esc(c.name)+'</b> · '+esc(c.field)+' <span class="xl-log-b">'+esc(c.before||"(빈값)")+'</span> → <span class="xl-log-a">'+esc(c.after||"(빈값)")+'</span></div>');
      else h.push('<div class="xl-alert-chg"><b>'+esc(c.name)+'</b> · '+esc(c.kind)+'</div>');
    });
    if(list.length>12) h.push('<div class="xl-alert-more">외 '+(list.length-12)+'건…</div>');
    h.push('</div>');
  }
  h.push('<button class="xl-btn xl-btn-p xl-alert-ok" id="xl-alert-ok">확인하고 최신 내용 보기</button>');
  box.innerHTML=h.join("");
  ov.appendChild(box); document.body.appendChild(ov);
  box.querySelector("#xl-alert-ok").onclick=function(){
    closeOverlay();
    if(isDemo){ notify("최신 내용이 반영되었습니다. (예시)"); }
    else { applyPendingSheet(); }
  };
}

document.addEventListener("keydown",function(e){
  if(editingCell) return;
  var mod=e.ctrlKey||e.metaKey;
  if(mod && (e.key==="c"||e.key==="C")){ var vr=viewRows(); if(sel){ copySelection(vr); e.preventDefault(); } }
  else if(mod && (e.key==="x"||e.key==="X")){ var v2=viewRows(); if(sel){ cutSelection(v2); e.preventDefault(); } }
  else if(mod && (e.key==="v"||e.key==="V")){ var v3=viewRows(); if(sel&&clipboardBuf){ pasteFromBuf(v3); e.preventDefault(); } }
  else if(mod && (e.key==="z"||e.key==="Z")){ undo(); e.preventDefault(); }
  else if(mod && (e.key==="y"||e.key==="Y")){ redo(); e.preventDefault(); }
  else if(mod && (e.key==="a"||e.key==="A")){ var v4=viewRows(); sel={r1:-1,c1:0,r2:v4.length-1,c2:COLS.length-1}; render(); e.preventDefault(); }
  else if(e.key==="Delete"||e.key==="Backspace"){ var v5=viewRows(); if(sel){ clearSelection(v5); e.preventDefault(); } }
  else if((e.key==="d"||e.key==="D")&&!mod){
    // 행 또는 열이 통째로 선택된 상태에서만 삭제
    var v6=viewRows();
    var rowMode = sel && Math.min(sel.c1,sel.c2)===0 && Math.max(sel.c1,sel.c2)===COLS.length-1;
    var colMode = sel && Math.min(sel.r1,sel.r2)<=-1;
    if(rowMode && !colMode){ delSelectedRows(v6); e.preventDefault(); }
    else if(colMode){ var ci=Math.min(sel.c1,sel.c2); clearColumn(ci,v6); e.preventDefault(); }
  }
});

var notifyTimer=null;
function notify(msg){
  var n=document.getElementById("xl-notify");
  if(!n){ n=document.createElement("div"); n.id="xl-notify"; document.body.appendChild(n); }
  n.textContent=msg; n.className="show"; clearTimeout(notifyTimer); notifyTimer=setTimeout(function(){ n.className=""; },3000);
}
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
