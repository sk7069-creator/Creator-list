/* AG-ENT 크리에이터 단가표 — 초기화 및 시작 */

// 최초 로드: 시트에서 데이터 가져오기 (실패 시 저장된 데이터로)
render(); // 우선 저장된 데이터로 즉시 표시
fetchSheet(true); // 그 다음 시트 확인
// 주기적으로 시트 변경 확인
if(SHEET_CSV_URL){ setInterval(function(){ if(!pendingSheet) fetchSheet(false); }, SHEET_POLL_MS); }
// 다른 탭 갔다가 돌아오면 즉시 확인 (반영 체감 속도 향상)
document.addEventListener("visibilitychange", function(){
  if(!document.hidden && SHEET_CSV_URL && !pendingSheet) fetchSheet(false);
});
window.addEventListener("focus", function(){
  if(SHEET_CSV_URL && !pendingSheet) fetchSheet(false);
});
