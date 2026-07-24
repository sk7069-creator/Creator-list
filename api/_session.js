// 세션 쿠키 검사 (모든 보호된 API에서 사용)

import crypto from 'crypto';

export function verifySession(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)agent_session=([^;]+)/);
  if (!m) return null;

  const raw = m[1];
  const dot = raw.lastIndexOf('.');
  if (dot < 0) return null;

  const body = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);

  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');

  // 타이밍 공격 방지 비교
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

export function requireAuth(req, res) {
  const session = verifySession(req);
  if (!session) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return session;
}
