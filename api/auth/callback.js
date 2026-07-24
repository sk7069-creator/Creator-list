// Vercel 서버리스 함수 — 구글 로그인 콜백
// 인증 코드를 토큰으로 바꾸고, 회사 도메인 확인 후 세션 쿠키 발급

import crypto from 'crypto';

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  const allowedDomain = process.env.ALLOWED_DOMAIN;

  if (!clientId || !clientSecret || !sessionSecret) {
    return res.status(500).send('환경변수(GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / SESSION_SECRET)를 설정해 주세요.');
  }

  const code = req.query.code;
  if (!code) return res.status(400).send('인증 코드가 없습니다.');

  const redirectUri = `https://${req.headers.host}/api/auth/callback`;

  try {
    // 1) 코드 → 토큰 교환
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      return res.status(401).send('토큰 교환 실패: ' + t.slice(0, 200));
    }

    const tokens = await tokenRes.json();

    // 2) 사용자 정보 조회
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    if (!userRes.ok) return res.status(401).send('사용자 정보 조회 실패');

    const user = await userRes.json();
    const email = String(user.email || '').toLowerCase();

    // 3) 회사 도메인 검사
    if (allowedDomain) {
      const domain = email.split('@')[1] || '';
      if (domain !== allowedDomain.toLowerCase()) {
        return res
          .status(403)
          .send(
            `<!doctype html><meta charset="utf-8">
             <div style="font-family:Malgun Gothic,sans-serif;padding:60px;text-align:center">
               <h2 style="font-size:18px">접근 권한이 없습니다</h2>
               <p style="color:#666;font-size:13px;line-height:1.7">
                 ${email} 계정은 허용되지 않습니다.<br>
                 ${allowedDomain} 계정으로 로그인해 주세요.
               </p>
               <a href="/api/auth/login" style="display:inline-block;margin-top:16px;font-size:13px;color:#2E5CB8">다시 로그인</a>
             </div>`
          );
      }
    }

    // 4) 세션 쿠키 발급 (8시간)
    const maxAge = 8 * 60 * 60;
    const session = sign(
      { email, name: user.name || '', exp: Date.now() + maxAge * 1000 },
      sessionSecret
    );

    res.setHeader(
      'Set-Cookie',
      `agent_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
    );

    // 5) 원래 가려던 페이지로
    let next = '/';
    try {
      if (req.query.state) {
        const decoded = JSON.parse(Buffer.from(String(req.query.state), 'base64url').toString());
        if (decoded && typeof decoded.next === 'string' && decoded.next.startsWith('/')) next = decoded.next;
      }
    } catch (e) {}

    res.redirect(302, next);
  } catch (err) {
    res.status(500).send('로그인 처리 중 오류: ' + (err.message || String(err)));
  }
}
