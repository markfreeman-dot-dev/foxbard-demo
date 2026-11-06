import assert from 'node:assert/strict';
import { Sandbox } from '@vercel/sandbox';
import WebSocket from 'ws';
import { enterDesktop, entryRequest } from './gate-client.mjs';
const visitor = await enterDesktop('Production verification');
const box = await Sandbox.get({ name: 'neko-kde-feasibility' });
const result = await box.runCommand({ cmd: 'bash', sudo: true, args: ['-lc', `set -e
! grep -q FOXBARD_IDLE_MS /etc/neko/supervisord/foxbard-gateway.conf
supervisorctl -c /etc/neko/supervisord.conf status neko hermes-chat foxbard-gateway docker
`] });
assert.equal(result.exitCode, 0); console.log(await result.stdout());
await new Promise((resolve, reject) => {
  const ws = new WebSocket(visitor.base.replace('https:', 'wss:') + '/api/ws');
  ws.on('unexpected-response', (_, response) => { response.resume(); assert.equal(response.statusCode, 401); ws.terminate(); resolve(); });
  ws.on('open', () => { ws.terminate(); reject(Error('Unauthenticated desktop socket opened.')); });
  ws.on('error', () => {});
});
const ws = new WebSocket(visitor.base.replace('https:', 'wss:') + '/api/ws', { headers: { cookie: visitor.cookie, origin: visitor.base } });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => { ws.terminate(); reject(Error('Hermes did not answer its status command.')); }, 15000);
  ws.on('error', reject);
  ws.on('message', raw => {
    const event = JSON.parse(raw);
    if (event.event === 'system/init') ws.send(JSON.stringify({ event: 'chat/message', payload: { text: '/status' } }));
    if (event.event === 'system/heartbeat') ws.send(JSON.stringify({ event: 'client/heartbeat' }));
    if (event.event === 'chat/message' && event.payload?.content?.text?.includes('OpenRouter key saved')) {
      clearTimeout(timer); console.log('Hermes chat is connected and its OpenRouter key is saved.'); resolve();
    }
  });
});
ws.close();
await fetch(visitor.base + '/gate/logout', { headers: { cookie: visitor.cookie }, redirect: 'manual' });
assert.equal((await fetch(visitor.base + '/api/whoami', { headers: { cookie: visitor.cookie } })).status, 401);
const logout = await entryRequest('/api/auth', { cookie: visitor.entryCookie, body: { action: 'logout' } });
assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
console.log('Production resume, 15-minute idle configuration, direct WebSocket rejection, Hermes status, and logout passed.');
