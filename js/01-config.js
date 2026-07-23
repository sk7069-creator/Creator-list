/* AG-ENT 크리에이터 단가표 — 설정 · 상수 · 컬럼 정의 · 상태 변수 */
// 초기 데이터 (00-seed.js에서 로드)
var SEED = (typeof SEED_DATA !== "undefined" && Array.isArray(SEED_DATA)) ? SEED_DATA : [];
var LS_KEY="agent_excel_roster_v1", LS_W="agent_excel_colw_v1", LS_LOG="agent_excel_log_v1";
var LS_SNAP="agent_excel_sheetsnap_v1"; // 마지막으로 확인한 시트 스냅샷 (변경 감지용)
// ===== 구글 시트 연동 =====
var SHEET_CSV_URL="https://docs.google.com/spreadsheets/d/e/2PACX-1vTzUU4epCiIOeNcIWiRKpS7YHau_e4Lxr7RQunedSF0aD0fNkBw2yEz9SindNPHQhfzNpJsphOgHdla/pub?gid=0&single=true&output=csv";
var SHEET_POLL_MS=15000; // 15초마다 시트 변경 확인

var COLS=[
  {key:"n",  label:"크리에이터명", w:120, type:"text", center:true,  bold:true},
  {key:"s1", label:"숏폼 1채널",  w:80,  type:"num",  center:true,  bold:true},
  {key:"s2", label:"2채널",       w:64,  type:"num",  center:true,  bold:true},
  {key:"s3", label:"3채널",       w:64,  type:"num",  center:true,  bold:true},
  {key:"fd", label:"피드",        w:64,  type:"num",  center:true,  bold:true},
  {key:"lf", label:"롱폼",        w:64,  type:"num",  center:true,  bold:true},
  {key:"ig", label:"인스타그램",  w:220, type:"text", center:true, bold:false, link:true},
  {key:"tt", label:"틱톡",        w:220, type:"text", center:true, bold:false, link:true},
  {key:"yt", label:"유튜브",      w:220, type:"text", center:true, bold:false, link:true}
];
loadColW();
var HEADER_BG="#FCE5CD", BORDER="#000", LINK="#1155cc";
var ALPHA="ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

var data=loadData();
var hist=[], future=[];
var sortState={key:null, dir:0};
var searchQ="";
var sel=null;        // {r1,c1,r2,c2}  (r: -1=헤더행, 0..=데이터, c: 열index)
var anchor=null;
var dragging=false;  // false | "cell" | "row" | "col"
var editingCell=null;
var clipboardBuf=null; // 내부 잘라내기/복사 버퍼 (붙여넣기용) {rows:[[...]], cut:bool, di:[]}
var editLog=loadLog();
var logSearch="";

function loadLog(){ try{ var s=localStorage.getItem(LS_LOG); if(s){ var p=JSON.parse(s); if(Array.isArray(p)) return p; } }catch(e){} return []; }
function saveLog(){ try{ localStorage.setItem(LS_LOG, JSON.stringify(editLog.slice(0,2000))); }catch(e){} }
function nowStr(){ var d=new Date(); function z(n){return (n<10?"0":"")+n;} return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate())+" "+z(d.getHours())+":"+z(d.getMinutes()); }
function logEdit(name, field, before, after){ editLog.unshift({t:nowStr(), name:name, field:field, before:String(before==null?"":before), after:String(after==null?"":after), kind:"edit"}); saveLog(); }
function logAction(name, action){ editLog.unshift({t:nowStr(), name:name, field:"", before:"", after:"", kind:action}); saveLog(); }

// 숏폼 1·2·3채널: 값이 있는 마지막 칸이 뒤따르는 빈칸을 흡수해 병합
//   1400, 빈,  빈  → 1~3 병합 / 800, 1000, 빈 → 2~3 병합 / 값,값,값 → 병합 없음
function autoMerge(obj){
  var sv=[obj.s1,obj.s2,obj.s3].map(function(v){ return String(v==null?"":v).trim(); });
  var lastFilled=-1;
  for(var i=0;i<3;i++){ if(sv[i]!=="") lastFilled=i; }
  if(lastFilled>=0 && lastFilled<2){
    var allEmptyAfter=true;
    for(var j=lastFilled+1;j<3;j++){ if(sv[j]!==""){ allEmptyAfter=false; break; } }
    if(allEmptyAfter){ obj._m=[{c1:1+lastFilled, c2:3}]; return obj; }
  }
  if(obj._m) delete obj._m;
  return obj;
}
