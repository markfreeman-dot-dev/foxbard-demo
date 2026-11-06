import { createHmac, createHash, timingSafeEqual, randomUUID } from 'node:crypto';
export const COOKIE = '__Host-foxbard';
export function equal(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}
export function sign(payload, secret) {
  if (!secret) throw new Error('Session signing is not configured.');
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return data + '.' + createHmac('sha256', secret).update(data).digest('base64url');
}
export function verify(token, secret, audience, now = Date.now()) {
  try {
    if (!secret || typeof token !== 'string' || token.length > 4096) return null;
    const [data, signature, extra] = token.split('.');
    if (extra || !equal(signature, createHmac('sha256', secret).update(data).digest('base64url'))) return null;
    const value = JSON.parse(Buffer.from(data, 'base64url'));
    return value.aud === audience && Number.isFinite(value.exp) && value.exp > now && typeof value.sid === 'string' ? value : null;
  } catch { return null; }
}
export function cookies(header = '') {
  return Object.fromEntries(header.split(';').map(item => item.trim().split(/=(.*)/s).slice(0, 2)));
}
export function session(req) { return verify(cookies(req.headers.cookie)[COOKIE], process.env.DEMO_SESSION_SECRET, 'entry'); }
export function makeSession(name) { return { aud: 'entry', sid: randomUUID(), name, exp: Date.now() + 8 * 60 * 60 * 1000 }; }
export function passwordMatches(password) {
  return typeof password === 'string' && password.length <= 1024 && equal(createHash('sha256').update(password).digest('hex'), process.env.DEMO_PASSWORD_HASH);
}
export function sameOrigin(req) {
  const origin = req.headers.origin;
  return typeof origin === 'string' && origin === 'https://' + req.headers.host;
}
export function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}
