/* AG-ENT 크리에이터 단가표 — 해외 단가 계산 (USD 환산 · 영문 헤더/안내문) */
// ===== 해외 단가 계산 (매크로 로직 동일) =====
// 만원(KRW) → 원 → ÷환율 → ×1.15 수수료 → 10달러 단위 올림
var USD_RATE=1440, USD_FEE=1.15;
function toUSD(manwon){
  var n=num(manwon);
  if(n==="" || n===0) return "";
  var usd=(n*10000)/USD_RATE*USD_FEE;
  return String(Math.ceil(usd/10)*10);
}
var OVERSEAS_HEADERS={n:"Creator(KOL)",s1:"Short 1Ch",s2:"Short 2Ch",s3:"Short 3Ch",fd:"Feed",lf:"Long",ig:"IG URL",tt:"TT URL",yt:"YT URL"};
var OVERSEAS_NOTE='* Remmitance fee excluded / USD\n'
  +'* Creators without a cost range will follow the "1 channel = all channels" rule.\n'
  +'* Short-form/Feed Campaigns: Includes 1 month of licensing plus complimentary Instagram/TikTok Story uploads (may vary by creator).\n'
  +'* Feed Pricing: Priced at 60-70% of the Short-form collaboration fee. (Includes mirrored uploads to TikTok & YouTube feeds; varies by creator).\n'
  +'* Long-form Pricing: 1.5x to 1.8x the Short-form fee. (Standard video length: 7-8 mins; Brand exposure: 2-3 mins).\n'
  +'* Licensing Fees: Calculated as a percentage of the Short-form fee:\n'
  +'1 Month: 20% (Included in basic package)/ 3 Months: 40% / 6 Months: 80% (Terms may vary depending on the creator.)\n'
  +'* The default payment method is wire transfer.\n'
  +'* If the collaborating company is based in a country without mutual VAT exemption with Korea, or if wire transfer is not available (e.g. PayPal), a 10% surcharge will be added to the agreed amount.';
var DOMESTIC_NOTE='* 참고 사항 *\n'
  +'  - 모든 비용 VAT 별도 / 단위 만 원\n'
  +'  - 숏폼 또는 피드 진행시, 라이선스 1개월 + 틱톡&인스타그램 스토리 서비스 제공 (크리에이터별로 상이)\n'
  +'  - 피드 비용 = 숏폼 협업비의 60 ~ 70% (틱톡&유튜브 피드 미러링 업로드 서비스 / 크리에이터별로 상이)\n'
  +'  - 롱폼 비용 = 숏폼 협업비의 1.5 ~ 1.8 배 (롱폼 기본 약 7~8분 중 2~3분 노출)\n'
  +'  - 라이선스 비용 = 숏폼 협업비의 20% (1개월 / 3개월 = 40%, 6개월 = 80% / 크리에이터별로 상이)';
function currentNote(){ return activeTab==="us" ? OVERSEAS_NOTE : DOMESTIC_NOTE; }

// 국내 데이터 → 해외 데이터 변환 (병합정보 유지)
function toOverseasData(arr){
  return (arr||[]).map(function(r){
    var o={id:r.id, n:r.n, s1:toUSD(r.s1), s2:toUSD(r.s2), s3:toUSD(r.s3), fd:toUSD(r.fd), lf:toUSD(r.lf), ig:r.ig, tt:r.tt, yt:r.yt};
    if(r._m) o._m=JSON.parse(JSON.stringify(r._m));
    return o;
  });
}
