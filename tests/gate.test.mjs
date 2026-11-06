import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
import { sign, verify } from '../lib/auth.mjs';
const secret = 'test-secret-only';
test('signed sessions reject tampering, wrong audiences, and expiration', () => {
  const payload = { aud: 'entry', sid: 'one', exp: 2000 };
  const token = sign(payload, secret);
  assert.deepEqual(verify(token, secret, 'entry', 1000), payload);
  assert.equal(verify(token + 'x', secret, 'entry', 1000), null);
  assert.equal(verify(token, secret, 'desktop', 1000), null);
  assert.equal(verify(token, secret, 'entry', 2000), null);
  assert.equal(verify('malformed', secret, 'entry'), null);
});
test('desktop gate protects HTTP and WebSockets, rejects ticket replay, revokes logout, and claims idle safely', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'foxbard-gate-'));
  let idleCalls = 0;
  const backend = createServer((req, res) => {
    if (req.url === '/api/login') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ token: 'neko-test-token' })); }
    else if (req.url === '/api/desktop') { idleCalls++; res.end('{}'); }
    else if (req.url === '/api/whoami') { assert.equal(req.headers.authorization, 'Bearer neko-test-token'); res.end('{}'); }
    else res.end('<html><body>Desktop</body></html>');
  });
  const wss = new WebSocketServer({ server: backend });
  wss.on('connection', ws => { ws.send('desktop-state'); ws.on('message', data => ws.send(data)); });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  const upstream = 'http://127.0.0.1:' + backend.address().port;
  const reserve = createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const base = 'http://127.0.0.1:' + port;
  const configPath = join(dir, 'config.json');
  await writeFile(configPath, JSON.stringify({ secret, password: 'unused', entryUrl: upstream, desktopUrl: base }));
  await writeFile(join(dir, 'gateway.mjs'), await readFile('desktop/gateway.mjs'));
  await writeFile(join(dir, 'auth.mjs'), await readFile('lib/auth.mjs'));
  await symlink(join(process.cwd(), 'node_modules'), join(dir, 'node_modules'));
  const child = spawn(process.execPath, [join(dir, 'gateway.mjs')], { env: { ...process.env, FOXBARD_GATE_CONFIG: configPath, FOXBARD_UPSTREAM: upstream, FOXBARD_GATE_PORT: String(port), FOXBARD_IDLE_MS: '200' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Gateway did not start.')), 5000); child.stdout.once('data', () => { clearTimeout(timer); resolve(); }); child.once('exit', code => { clearTimeout(timer); reject(Error('Gateway exited: ' + code)); }); });
    assert.equal((await fetch(base)).status, 401);
    await new Promise((resolve, reject) => { const ws = new WebSocket(base.replace('http', 'ws') + '/api/ws?token=stolen'); ws.on('unexpected-response', (_, res) => { assert.equal(res.statusCode, 401); res.resume(); ws.terminate(); resolve(); }); ws.on('open', () => reject(Error('Unauthenticated socket opened.'))); ws.on('error', () => {}); });
    const ticket = sign({ aud: 'desktop', sid: 'ticket-one', name: 'Test visitor', exp: Date.now() + 60000, sessionExp: Date.now() + 60000 }, secret);
    const enter = () => fetch(base + '/gate/enter', { method: 'POST', body: new URLSearchParams({ ticket }) });
    const response = await enter(); assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
    assert.equal((await enter()).status, 401);
    assert.equal((await fetch(base + '/api/whoami', { headers: { cookie } })).status, 200);
    const ws = new WebSocket(base.replace('http', 'ws') + '/api/ws', { headers: { cookie, origin: base } });
    await new Promise((resolve, reject) => { ws.once('message', data => { assert.equal(data.toString(), 'desktop-state'); resolve(); }); ws.once('error', reject); });
    await new Promise(resolve => setTimeout(resolve, 250));
    const claim = () => fetch(base + '/gate/claim-idle', { method: 'POST', headers: { authorization: 'Bearer ' + secret } });
    assert.equal((await claim()).status, 409);
    const closed = new Promise(resolve => ws.once('close', resolve));
    await fetch(base + '/gate/logout', { headers: { cookie }, redirect: 'manual' }); await closed;
    assert.equal((await fetch(base + '/api/whoami', { headers: { cookie } })).status, 401);
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal((await claim()).status, 200);
    const fresh = sign({ aud: 'desktop', sid: 'fresh', name: 'Test', exp: Date.now() + 60000, sessionExp: Date.now() + 60000 }, secret);
    assert.equal((await fetch(base + '/gate/enter', { method: 'POST', body: new URLSearchParams({ ticket: fresh }) })).status, 409);
    assert.equal(idleCalls, 0);
  } finally { child.kill(); for (const ws of wss.clients) ws.terminate(); wss.close(); await new Promise(resolve => backend.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});
