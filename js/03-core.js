/* AG-ENT 크리에이터 단가표 — 데이터 로드·저장 · 공통 유틸 */
function loadData(){
  try{
    var s=localStorage.getItem(LS_KEY);
    if(s){
      var p=JSON.parse(s);
      if(Array.isArray(p)&&p.length){
        // 구버전 저장 데이터(병합정보 없음)는 1회만 자동 병합 적용
        var ver=localStorage.getItem(LS_KEY+"_mv");
        if(ver!=="1"){
          p=p.map(function(x){ return autoMerge(x); });
          try{ localStorage.setItem(LS_KEY, JSON.stringify(p)); localStorage.setItem(LS_KEY+"_mv","1"); }catch(e){}
        }
        return p;
      }
    }
  }catch(e){}
  try{ localStorage.setItem(LS_KEY+"_mv","1"); }catch(e){}
  return SEED.map(function(x,i){ return autoMerge(assign({}, x, {id:x.id||("c"+i)})); });
}
function saveData(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(data)); }catch(e){} }
function loadColW(){ try{ var s=localStorage.getItem(LS_W); if(s){ var p=JSON.parse(s); COLS.forEach(function(c){ if(p[c.key]) c.w=p[c.key]; }); } }catch(e){} }
function saveColW(){ try{ var o={}; COLS.forEach(function(c){o[c.key]=c.w;}); localStorage.setItem(LS_W, JSON.stringify(o)); }catch(e){} }
function assign(t){ for(var i=1;i<arguments.length;i++){var s=arguments[i]; for(var k in s) if(Object.prototype.hasOwnProperty.call(s,k)) t[k]=s[k];} return t; }
function snapshot(){ hist.push(JSON.stringify(data)); if(hist.length>80) hist.shift(); future=[]; }
function undo(){ if(!hist.length){notify("되돌릴 작업 없음");return;} future.push(JSON.stringify(data)); data=JSON.parse(hist.pop()); saveData(); render(); notify("실행취소"); }
function redo(){ if(!future.length){notify("다시 실행할 작업 없음");return;} hist.push(JSON.stringify(data)); data=JSON.parse(future.pop()); saveData(); render(); notify("다시 실행"); }

function num(v){ var s=String(v==null?"":v).replace(/[^0-9]/g,""); return s?parseInt(s,10):""; }
function fmtNum(v){ var n=num(v); return n===""?"":n.toLocaleString(); }
function cellText(row,col){ return col.type==="num"?fmtNum(row[col.key]):String(row[col.key]==null?"":row[col.key]); }
function cellRaw(row,col){ if(col.type==="num"){var n=num(row[col.key]);return n===""?"":String(n);} return String(row[col.key]==null?"":row[col.key]); }

var activeTab="kr"; // "kr" | "us"
function colLabel(c){ return activeTab==="us" ? (OVERSEAS_HEADERS[c.key]||c.label) : c.label; }
function currentData(){ return activeTab==="us" ? toOverseasData(data) : data; }
function viewRows(){
  var src=currentData();
  var rows=src.map(function(r,i){ return {row:r, di:i}; });
  if(searchQ){ var q=searchQ.toLowerCase(); rows=rows.filter(function(o){ return String(o.row.n||"").toLowerCase().indexOf(q)>=0; }); }
  if(sortState.key&&sortState.dir){
    var col=null; COLS.forEach(function(c){ if(c.key===sortState.key) col=c; });
    rows.sort(function(a,b){
      var va=a.row[sortState.key], vb=b.row[sortState.key];
      if(col&&col.type==="num"){ return ((num(va)||0)-(num(vb)||0))*sortState.dir; }
      return String(va==null?"":va).localeCompare(String(vb==null?"":vb),"ko")*sortState.dir;
    });
  }
  return rows;
}

var root=document.getElementById("root");
