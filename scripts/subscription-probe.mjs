import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { enterDesktop, entryRequest } from './gate-client.mjs';

const visitor = await enterDesktop('Subscription verification');
const ws = new WebSocket(visitor.base.replace('https:', 'wss:') + '/api/ws', {
  headers: { cookie: visitor.cookie, origin: visitor.base },
});
const replies = [];
ws.on('message', (raw) => {
  const event = JSON.parse(raw);
  if (event.event === 'system/heartbeat') ws.send(JSON.stringify({ event: 'client/heartbeat' }));
  if (event.event === 'chat/message' && event.payload?.content?.text) replies.push(event.payload.content.text);
});
async function request(text, options, expected) {
  const start = replies.length;
  ws.send(JSON.stringify({ event: 'chat/message', payload: {
    text: text + '\n<!--foxbard-options:' + JSON.stringify(options) + '-->',
  } }));
  for (let i = 0; i < 120; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const fresh = replies.slice(start);
    if (fresh.some((reply) => reply.trim() === expected)) return;
    if (fresh.some((reply) => /could not complete|request failed|unavailable|already running/.test(reply))) {
      throw new Error('Subscription request failed: ' + fresh.join('\n'));
    }
  }
  throw new Error('Subscription response timed out.');
}
try {
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const response = await fetch(visitor.base + '/foxbard-models.json', { headers: { cookie: visitor.cookie } });
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert(catalog.models.some((model) => model.id === 'gpt-6-sol'));
  assert(catalog.models.some((model) => model.id === 'gpt-6-luna'));
  await request('Remember the verification code PAPER_FOX_73. Reply exactly PAPER_FOX_73. Do not use tools.',
    { model: 'gpt-6-sol', effort: 'low' }, 'PAPER_FOX_73');
  console.log('OpenAI subscription response passed: gpt-6-sol, low effort.');
  await request('Reply with only the verification code from my previous request. Do not use tools.',
    { model: 'gpt-6-luna', effort: 'medium' }, 'PAPER_FOX_73');
  console.log('Model and effort switch passed; conversation context was preserved.');
} finally {
  ws.close();
  await fetch(visitor.base + '/gate/logout', { headers: { cookie: visitor.cookie }, redirect: 'manual' });
  await entryRequest('/api/auth', { cookie: visitor.entryCookie, body: { action: 'logout' } });
}
