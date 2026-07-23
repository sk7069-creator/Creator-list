/* AG-ENT 크리에이터 단가표 — 구글 시트 연동 (CSV 파싱 · 변경 감지 · 폴링) */
// ===== CSV 파싱 (따옴표·쉼표·줄바꿈 처리) =====
function parseCSV(text){
  text=text.replace(/^\ufeff/,""); // BOM 제거
  var rows=[], row=[], cur="", i=0, inQ=false;
  while(i<text.length){
    var ch=text[i];
    if(inQ){
      if(ch==='"'){ if(text[i+1]==='"'){ cur+='"'; i+=2; continue; } inQ=false; i++; continue; }
      cur+=ch; i++; continue;
    }
    if(ch==='"'){ inQ=true; i++; continue; }
    if(ch===','){ row.push(cur); cur=""; i++; continue; }
    if(ch==='\r'){ i++; continue; }
    if(ch==='\n'){ row.push(cur); rows.push(row); row=[]; cur=""; i++; continue; }
    cur+=ch; i++;
  }
  if(cur!==""||row.length){ row.push(cur); rows.push(row); }
  return rows;
}
// 시트 헤더 → 도구 필드 매핑
var HEADER_MAP={
  "크리에이터명":"n","이름":"n","name":"n",
  "숏폼 1채널":"s1","숏폼1채널":"s1","1채널":"s1","s1":"s1",
  "2채널":"s2","숏폼 2채널":"s2","s2":"s2",
  "3채널":"s3","숏폼 3채널":"s3","s3":"s3",
  "피드":"fd","feed":"fd",
  "롱폼":"lf","long":"lf",
  "인스타그램":"ig","인스타":"ig","instagram":"ig",
  "틱톡":"tt","tiktok":"tt",
  "유튜브":"yt","youtube":"yt"
};
// 안내문/참고사항 행 판별 (크리에이터 이름이 아님)
function isNoteRow(name){
  var t=String(name||"").replace(/\s/g,"");
  if(!t) return true;
  if(t.indexOf("참고사항")>=0) return true;
  if(t.indexOf("VAT")>=0 || t.indexOf("vat")>=0) return true;
  if(/^[*※·\-–—]/.test(t)) return true;           // 기호로 시작
  if(t.indexOf("Remmitance")>=0 || t.indexOf("Remittance")>=0) return true;
  if(t.length>25) return true;                      // 지나치게 긴 문자열은 이름이 아님
  return false;
}

function csvToData(text){
  var rows=parseCSV(text);
  if(!rows.length) return null;
  // 헤더 행 찾기 (크리에이터명 포함된 행)
  var hi=-1;
  for(var r=0;r<Math.min(rows.length,5);r++){
    if(rows[r].some(function(c){ return String(c).replace(/\s/g,"").indexOf("크리에이터명")>=0 || HEADER_MAP[String(c).trim()]==="n"; })){ hi=r; break; }
  }
  if(hi===-1) hi=0;
  var headers=rows[hi].map(function(c){ return String(c).trim(); });
  var colMap=headers.map(function(h){ return HEADER_MAP[h]||HEADER_MAP[h.replace(/\s/g,"")]||null; });
  // 수정시각/수정번호 칸 찾기 (헤더에 '수정'이 있으면 그 열, 없으면 데이터 마지막 열 다음)
  var stampCol=-1;
  headers.forEach(function(h,ci){ if(stampCol<0 && h && h.replace(/\s/g,"").indexOf("수정")>=0) stampCol=ci; });
  if(stampCol<0){
    // 헤더가 비어있는 경우: 매핑된 데이터 열들의 최대 index 다음 열을 시각 열로 간주
    var lastMapped=-1;
    colMap.forEach(function(k,ci){ if(k) lastMapped=Math.max(lastMapped,ci); });
    if(lastMapped>=0 && headers.length>lastMapped+1) stampCol=lastMapped+1;
  }
  var stamp="";
  if(stampCol>=0){
    for(var si=hi+1;si<Math.min(rows.length,hi+6);si++){
      var v=rows[si]&&rows[si][stampCol]!=null?String(rows[si][stampCol]).trim():"";
      if(v){ stamp=v; break; }
    }
  }
  var out=[];
  var noteText="";
  for(var i=hi+1;i<rows.length;i++){
    var rr=rows[i]; if(!rr) continue;
    var obj={id:"", n:"",s1:"",s2:"",s3:"",fd:"",lf:"",ig:"",tt:"",yt:""};
    colMap.forEach(function(key,ci){ if(key){ var v=String(rr[ci]==null?"":rr[ci]).trim(); if(key==="s1"||key==="s2"||key==="s3"||key==="fd"||key==="lf"){ v=v.replace(/[^0-9]/g,""); } obj[key]=v; } });
    if(!obj.n) continue;
    // 안내문/참고사항 행은 크리에이터가 아님 → 별도 보관
    if(isNoteRow(obj.n)){ if(!noteText) noteText=String(rr.join(" ")).replace(/\s*,\s*/g," ").trim(); continue; }
    obj.id="sheet_"+obj.n.replace(/\s/g,"_")+"_"+i;
    autoMerge(obj); // 시트 병합 자동 반영
    out.push(obj);
  }
  out._stamp=stamp; // 시트의 수정시각(또는 번호)
  out._note=noteText;
  return out;
}

// 두 데이터셋 비교 → 변경 목록 [{name, field, before, after}]
function diffData(oldArr, newArr){
  var changes=[];
  var oldByName={}; (oldArr||[]).forEach(function(r){ oldByName[r.n]=r; });
  var newByName={}; (newArr||[]).forEach(function(r){ newByName[r.n]=r; });
  var FIELDS=[["s1","숏폼 1채널"],["s2","2채널"],["s3","3채널"],["fd","피드"],["lf","롱폼"],["ig","인스타그램"],["tt","틱톡"],["yt","유튜브"]];
  newArr.forEach(function(nw){
    var od=oldByName[nw.n];
    if(!od){ changes.push({name:nw.n, field:"", before:"", after:"", kind:"신규 추가(시트)"}); return; }
    FIELDS.forEach(function(f){
      var a=String(od[f[0]]==null?"":od[f[0]]), b=String(nw[f[0]]==null?"":nw[f[0]]);
      if(a!==b) changes.push({name:nw.n, field:f[1], before:a, after:b, kind:"edit"});
    });
  });
  (oldArr||[]).forEach(function(od){ if(!newByName[od.n]) changes.push({name:od.n, field:"", before:"", after:"", kind:"시트에서 삭제됨"}); });
  return changes;
}

function loadSnap(){ try{ var s=localStorage.getItem(LS_SNAP); return s?JSON.parse(s):null; }catch(e){ return null; } }
function saveSnap(arr){ try{ localStorage.setItem(LS_SNAP, JSON.stringify(arr)); }catch(e){} }

var pendingSheet=null; // 변경 감지 후 확인 대기 중인 새 데이터
var highlightCells={}; // 최근 반영된 변경 셀 강조 {"이름|필드키":true}
var highlightTimer=null;
// 직전에 반영하기 전의 시트 상태 — 구글 캐시가 옛 값을 되돌려줄 때 감지용
var confirmFp=null; // (미사용) 예비
// ── 시트 수정시각(J열) 관리 ──
function loadStamp(){ try{ return localStorage.getItem(LS_KEY+"_stamp")||""; }catch(e){ return ""; } }
function saveStamp(s){ try{ localStorage.setItem(LS_KEY+"_stamp", String(s||"")); }catch(e){} }
// 시각/번호 비교: a가 b보다 최신이면 true
function isNewerStamp(a,b){
  if(!b) return true;
  var na=parseStamp(a), nb=parseStamp(b);
  if(na!==null && nb!==null) return na>nb;
  return String(a)!==String(b); // 파싱 불가 시 다르면 새 것으로 취급
}
function parseStamp(s){
  s=String(s==null?"":s).trim();
  if(!s) return null;
  if(/^[0-9]+(\.[0-9]+)?$/.test(s)) return parseFloat(s); // 순수 숫자(번호)
  var t=Date.parse(s.replace(/\./g,"-").replace(/\//g,"-")); // 날짜/시각 문자열
  if(!isNaN(t)) return t;
  // "2026. 7. 22 오후 3:04:05" 같은 한국식도 시도
  var m=s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if(m){
    var hh=parseInt(m[4],10);
    if(/오후/.test(s)&&hh<12) hh+=12;
    if(/오전/.test(s)&&hh===12) hh=0;
    return new Date(+m[1],+m[2]-1,+m[3],hh,+m[5],+(m[6]||0)).getTime();
  }
  return null;
}
function dataFingerprint(arr){
  var s="";
  (arr||[]).forEach(function(r){ s+=(r.n||"")+"|"+(r.s1||"")+","+(r.s2||"")+","+(r.s3||"")+","+(r.fd||"")+","+(r.lf||"")+";"; });
  var h=0; for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; }
  return String(h)+"_"+(arr?arr.length:0);
}
var fetching=false;    // 중복 fetch 방지
function fetchSheet(isFirst, isManual){
  if(!SHEET_CSV_URL){ if(isFirst) render(); return; }
  if(fetching){ if(isManual) notify("확인 중입니다..."); return; }
  if(pendingSheet && !isFirst && !isManual) return;
  fetching=true;
  var url=SHEET_CSV_URL+(SHEET_CSV_URL.indexOf("?")>=0?"&":"?")+"_t="+Date.now();
  fetch(url, {cache:"no-store"}).then(function(r){
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.text();
  }).then(function(text){
    fetching=false;
    var newData=csvToData(text);
    if(!newData||!newData.length){
      if(isFirst) render();
      if(isManual) showDiag("시트를 읽었지만 데이터가 없습니다.", "받은 내용 앞부분:\n"+text.slice(0,300));
      return;
    }
    var snap=loadSnap();
    if(!snap){
      data=newData.map(function(x){ return assign({},x); });
      saveData(); saveSnap(newData); if(newData._stamp) saveStamp(newData._stamp); render();
      notify("구글 시트에서 "+newData.length+"명 불러왔습니다.");
      return;
    }
    var changes=diffData(snap, newData);
    if(changes.length){
      if(pendingSheet && sameChanges(pendingSheet.changes, changes)){ return; }
      // 시트의 수정시각(J열) 기준 판단: 저장된 것보다 최신일 때만 반영
      var newStamp=newData._stamp||"";
      var lastStamp=loadStamp();
      if(newStamp && lastStamp && !isNewerStamp(newStamp, lastStamp)){
        // 캐시가 옛 데이터를 준 것 → 무시
        if(isManual) showDiag("최신 상태입니다",
          "받은 데이터가 이전 버전입니다 (구글 게시 CSV 갱신 지연).\n현재 내용을 그대로 유지합니다.\n\n시트 수정시각: "+newStamp+"\n반영된 시각: "+lastStamp);
        return;
      }
      pendingSheet={data:newData, changes:changes, stamp:newStamp};
      showMasterAlert(changes);
    }else{
      // 값 변경이 없으면 시각만 갱신 (NOW() 재계산 등) — 알림 없이 조용히
      if(newData._stamp) saveStamp(newData._stamp);
      if(isManual){
        var sample=newData.slice(0,3).map(function(r){ return r.n+": 숏폼1="+(r.s1||"-")+" 피드="+(r.fd||"-")+" 롱폼="+(r.lf||"-"); }).join("\n");
        showDiag("마스터 시트와 동일합니다 (변경 없음)",
          "시트에서 읽은 인원: "+newData.length+"명\n\n[시트에서 실제로 읽은 값]\n"+sample+
          "\n\n※ 위 값이 시트에서 방금 바꾼 값과 다르다면,\n구글의 게시 CSV가 아직 갱신되지 않은 것입니다.\n잠시 후 다시 확인해 주세요.");
      }
    }
  }).catch(function(e){
    fetching=false;
    if(isFirst){ render(); notify("시트를 불러오지 못했습니다. 저장된 데이터로 표시합니다."); }
    else if(isManual){ showDiag("시트 확인 실패", "오류: "+(e.message||e)+"\n\n확인할 점:\n· 인터넷 연결\n· 시트가 '웹에 게시' 상태인지\n· 이 페이지가 https:// 로 열렸는지"); }
  });
}
// 진단 정보 표시 모달
function showDiag(title, body){
  closeOverlay();
  var ov=document.createElement("div"); ov.id="xl-overlay"; ov.className="xl-overlay";
  var box=document.createElement("div"); box.className="xl-modal";
  box.innerHTML='<div class="xl-modal-head"><b>'+esc(title)+'</b><button class="xl-modal-x" id="xl-diag-x">✕</button></div>'
    +'<div style="padding:18px 20px;font-size:12.5px;line-height:1.7;white-space:pre-wrap;color:#333;max-height:60vh;overflow:auto">'+esc(body)+'</div>';
  ov.appendChild(box); document.body.appendChild(ov);
  box.querySelector("#xl-diag-x").onclick=closeOverlay;
  ov.onclick=function(e){ if(e.target===ov) closeOverlay(); };
}
// ===== 초기화: 도구에서 수정한 내용 버리고 마스터 시트 상태로 =====
function resetToSheet(){
  if(!confirm("도구에서 수정한 내용을 모두 버리고\n마스터 시트의 최신 내용으로 되돌립니다.\n\n계속할까요?")) return;
  notify("마스터 시트에서 다시 불러오는 중...");
  var url=SHEET_CSV_URL+(SHEET_CSV_URL.indexOf("?")>=0?"&":"?")+"_t="+Date.now();
  fetch(url, {cache:"no-store"}).then(function(r){ return r.text(); }).then(function(text){
    var newData=csvToData(text);
    if(!newData||!newData.length){ notify("시트를 읽지 못했습니다. 잠시 후 다시 시도하세요."); return; }
    snapshot(); // Ctrl+Z로 되돌릴 수 있게
    data=newData.map(function(x){ return assign({},x); });
    saveData(); saveSnap(newData); if(newData._stamp) saveStamp(newData._stamp);
    pendingSheet=null;
    sel=null; searchQ=""; sortState={key:null,dir:0};
    render();
    notify("마스터 시트 상태로 초기화되었습니다 ("+newData.length+"명)");
  }).catch(function(e){
    notify("초기화 실패: 인터넷 연결을 확인하세요.");
  });
}

// 변경 목록이 동일한지 (반복 알림 방지용)
function sameChanges(a,b){
  if(a.length!==b.length) return false;
  for(var i=0;i<a.length;i++){ if(a[i].name!==b[i].name||a[i].field!==b[i].field||a[i].after!==b[i].after) return false; }
  return true;
}
function applyPendingSheet(){
  if(!pendingSheet) return;
  // 필드명 → 키 매핑 (강조용)
  var LABEL2KEY={"숏폼 1채널":"s1","2채널":"s2","3채널":"s3","피드":"fd","롱폼":"lf","인스타그램":"ig","틱톡":"tt","유튜브":"yt"};
  highlightCells={};
  // 변경분을 수정 기록에 남김 (마스터 시트 변경만 기록됨)
  pendingSheet.changes.forEach(function(ch){
    if(ch.kind==="edit"){
      editLog.unshift({t:nowStr(), name:ch.name, field:ch.field, before:ch.before, after:ch.after, kind:"edit"});
      var k=LABEL2KEY[ch.field];
      if(k) highlightCells[ch.name+"|"+k]=true;
    }else{
      editLog.unshift({t:nowStr(), name:ch.name, field:"", before:"", after:"", kind:ch.kind});
      highlightCells[ch.name+"|__row"]=true; // 신규/삭제는 행 전체 강조
    }
  });
  saveLog();
  data=pendingSheet.data.map(function(x){ return assign({},x); });
  saveData();
      saveSnap(pendingSheet.data); // 기준선 갱신
  if(pendingSheet.stamp) saveStamp(pendingSheet.stamp); // 반영한 시트의 수정시각 기록
  pendingSheet=null; render();
  // 변경된 셀로 스크롤 + 일정 시간 후 강조 해제
  setTimeout(function(){
    var first=root.querySelector(".xl-changed");
    if(first && first.scrollIntoView) { try{ first.scrollIntoView({block:"center"}); }catch(e){} }
  }, 100);
  clearTimeout(highlightTimer);
  highlightTimer=setTimeout(function(){ highlightCells={}; render(); }, 20000); // 20초 후 강조 해제
  var cnt=Object.keys(highlightCells).length;
  notify("최신 단가가 반영되었습니다."+(cnt?" (변경 "+cnt+"곳 노란색 표시)":""));
}
