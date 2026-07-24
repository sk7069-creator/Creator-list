// Vercel 서버리스 함수 — 구글 로그인 시작
// 사용자를 구글 로그인 화면으로 보냄

export default function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `https://${req.headers.host}/api/auth/callback`;

  if (!clientId) {
    return res.status(500).send('GOOGLE_CLIENT_ID 환경변수가 설정되지 않았습니다.');
  }

  // 로그인 후 돌아갈 페이지 (기본: 첫 화면)
  const next = typeof req.query.next === 'string' ? req.query.next : '/';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state: Buffer.from(JSON.stringify({ next })).toString('base64url')
  });

  // 회사 계정만 보이도록 힌트 (실제 검사는 콜백에서)
  const hd = process.env.ALLOWED_DOMAIN;
  if (hd) params.set('hd', hd);

  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
