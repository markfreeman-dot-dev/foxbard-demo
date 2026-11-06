import { COOKIE, sign, session, makeSession, passwordMatches, sameOrigin, json } from '../lib/auth.mjs';
const attempts = new Map();
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const user = session(req);
    return json(res, user ? 200 : 401, user ? { name: user.name } : { error: 'Enter the demo password to continue.' });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST for this action.' });
  if (!sameOrigin(req)) return json(res, 403, { error: 'Open the demo page and try again.' });
  if (req.body?.action === 'logout') {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
    return json(res, 200, { ok: true });
  }
  const ip = req.headers['x-real-ip'] || 'unknown';
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
  const attempt = attempts.get(ip) || { count: 0, until: now + 60000 };
  if (attempt.count >= 10) return json(res, 429, { error: 'Too many attempts. Wait one minute and try again.' });
  attempt.count++; attempts.set(ip, attempt);
  if (!passwordMatches(req.body?.password)) return json(res, 401, { error: 'That password is incorrect. Try again.' });
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 40) : '';
  if (!name) return json(res, 400, { error: 'Enter your display name.' });
  attempts.delete(ip);
  const value = makeSession(name);
  res.setHeader('Set-Cookie', `${COOKIE}=${sign(value, process.env.DEMO_SESSION_SECRET)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=28800`);
  return json(res, 200, { name });
}
