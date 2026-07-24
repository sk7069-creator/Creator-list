// Vercel 서버리스 함수 — 로그아웃

export default function handler(req, res) {
  res.setHeader(
    'Set-Cookie',
    'agent_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
  );
  res.redirect(302, '/api/auth/login');
}
