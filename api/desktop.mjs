import { Sandbox } from '@vercel/sandbox';
import { randomUUID } from 'node:crypto';
import { session, sameOrigin, sign, verify, json } from '../lib/auth.mjs';
const name = 'neko-kde-feasibility';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const internal = verify((req.headers.authorization || '').replace(/^Bearer /, ''), process.env.DEMO_SESSION_SECRET, 'idle');
  const user = session(req);
  if (!user && !internal) return json(res, 401, { error: 'Your login expired. Sign in again to reconnect.' });
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Use GET or POST.' });
  if (req.method === 'POST' && !internal && !sameOrigin(req)) return json(res, 403, { error: 'Open the demo page and try again.' });
  try {
    const listing = await Sandbox.list({ namePrefix: name, sortBy: "name" });
    const item = listing.sandboxes.find(box => box.name === name);
    if (!item) return json(res, 503, { error: 'The saved desktop is unavailable. Ask the demo owner to check Vercel Sandbox.' });
    if (req.method === 'GET') return json(res, 200, { status: item.status });
    const action = req.body?.action;
    if (internal && action !== 'idle') return json(res, 403, { error: 'Invalid action.' });
    if (action === 'stop' || action === 'idle') {
      if (item.status !== 'running') return json(res, 200, { status: item.status });
      const box = await Sandbox.get({ name });
      if (action === 'idle') {
        const check = await box.runCommand({ cmd: 'node', args: ['/opt/foxbard/gateway.mjs', '--claim-idle'], sudo: true });
        if (check.exitCode !== 0) return json(res, 409, { error: 'Visitors are connected, or the idle period has not elapsed.' });
      }
      await box.stop();
      return json(res, 200, { status: 'stopped' });
    }
    if (action !== 'launch') return json(res, 400, { error: 'Choose launch or stop.' });
    if (['stopping', 'snapshotting'].includes(item.status)) return json(res, 409, { error: 'The desktop is saving. Wait a few seconds, then reconnect.' });
    const box = await Sandbox.get({ name });
    const start = await box.runCommand({ cmd: 'python3', args: ['/opt/foxbard/start.py'], sudo: true });
    if (start.exitCode !== 0) throw new Error('Desktop services did not start.');
    const ticket = sign({ aud: 'desktop', sid: randomUUID(), name: user.name, exp: Date.now() + 60000, sessionExp: user.exp }, process.env.DEMO_SESSION_SECRET);
    return json(res, 200, { url: box.domain(8080) + '/gate/enter', ticket, expiresAt: box.expiresAt });
  } catch (error) {
    console.error('Desktop lifecycle failed:', error.name, error.status || '', String(error.message).slice(0, 180));
    return json(res, 503, { error: 'The desktop could not start or save. Wait 30 seconds and try again. If this continues, ask the owner to check Sandbox status and usage limits in Vercel.' });
  }
}
