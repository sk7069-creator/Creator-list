// Vercel 서버리스 함수 — 시트 데이터 프록시
// 시트 CSV 주소를 서버에만 두고, 로그인한 사용자에게만 내용을 전달

import { requireAuth } from './_session.js';

const SHEETS = {
  // 전속 리스트 탭 (없으면 기존 단일 시트로 폴백)
  own: process.env.SHEET_OWN_CSV || process.env.SHEET_CURRENT_CSV,
  // 파트너 리스트 탭
  partner: process.env.SHEET_PARTNER_CSV,
  // 전체 리스트 탭
  all: process.env.SHEET_ALL_CSV,
  // 기존 단일 시트 (하위 호환)
  current: process.env.SHEET_CURRENT_CSV,
  // 단가 변경 이력 시트
  history: process.env.SHEET_HISTORY_CSV
};

export default async function handler(req, res) {
  const session = requireAuth(req, res);
  if (!session) return;

  const which = String(req.query.which || 'current');
  const url = SHEETS[which];

  if (!url) {
    // 아직 환경변수를 안 넣은 탭 → 404로 알려주고, 프론트는 그 탭만 건너뜀
    return res.status(404).json({ error: 'sheet_not_configured', which });
  }

  try {
    const fresh = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    const r = await fetch(fresh, { cache: 'no-store' });
    if (!r.ok) return res.status(502).json({ error: 'sheet_fetch_failed', status: r.status });

    const text = await r.text();

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(text);
  } catch (err) {
    res.status(500).json({ error: 'proxy_error', message: err.message });
  }
}
