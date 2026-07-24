// Vercel Edge Middleware — 로그인하지 않은 접근을 차단
// 정적 파일(HTML/JS/CSS)까지 보호하므로 소스 열람도 막힘

export const config = {
  matcher: ['/((?!api/auth|_next|favicon.ico).*)']
};

async function verify(token, secret) {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;

  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));

  // base64url 인코딩
  let bin = '';
  const bytes = new Uint8Array(sigBuf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const expected = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  if (mac !== expected) return null;

  try {
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const secret = process.env.SESSION_SECRET;

  // 환경변수 미설정 시 안내 (설정 전에는 차단하지 않으면 위험하므로 막음)
  if (!secret) {
    return new Response(
      '<!doctype html><meta charset="utf-8"><div style="font-family:sans-serif;padding:60px;text-align:center">' +
        '<h2>설정이 필요합니다</h2><p>Vercel 환경변수 SESSION_SECRET 을 설정해 주세요.</p></div>',
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)agent_session=([^;]+)/);
  const session = await verify(m ? m[1] : null, secret);

  if (!session) {
    const next = url.pathname + url.search;
    return Response.redirect(
      `${url.origin}/api/auth/login?next=${encodeURIComponent(next)}`,
      302
    );
  }

  return undefined; // 통과
}
