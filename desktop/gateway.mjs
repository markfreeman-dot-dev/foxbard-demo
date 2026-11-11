import http from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { sign, verify, cookies, equal } from './auth.mjs';
const config = JSON.parse(readFileSync(process.env.FOXBARD_GATE_CONFIG || '/etc/foxbard/gate.json', 'utf8'));
const cookieName = '__Host-foxbard-desktop';
const upstream = process.env.FOXBARD_UPSTREAM || 'http://127.0.0.1:8081';
const port = Number(process.env.FOXBARD_GATE_PORT || 8080);
const idleMs = Number(process.env.FOXBARD_IDLE_MS || 900000);
if (process.argv.includes('--claim-idle')) {
  const response = await fetch(`http://127.0.0.1:${port}/gate/claim-idle`, { method: 'POST', headers: { authorization: 'Bearer ' + config.secret } });
  process.exit(response.ok ? 0 : 1);
}
const sessions = new Map(), usedTickets = new Map();
let lastVisitor = Date.now(), draining = false, notifying = false;
const activeCount = () => [...sessions.values()].reduce((count, item) => count + item.sockets.size, 0);
function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' }); res.end(body);
}
function getSession(req) {
  const value = verify(cookies(req.headers.cookie)[cookieName], config.secret, 'gateway');
  return value && sessions.get(value.sid);
}
function clearSession(item) {
  if (!item) return;
  sessions.delete(item.sid);
  for (const ws of item.sockets) ws.close(1008, 'Session ended. Return to the demo page.');
  fetch(upstream + '/api/logout', { method: 'POST', headers: { authorization: 'Bearer ' + item.token }, signal: AbortSignal.timeout(5000) }).catch(() => {});
}
async function body(req) {
  let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 8192) throw new Error('Request too large.'); } return data;
}
const banner = `<div style="position:fixed;bottom:8px;left:8px;z-index:2147483647;background:#161618;border:1px solid #4A4A4E;border-radius:6px;padding:6px 10px;font:12px "Geist Mono",monospace;display:flex;gap:12px"><a style="color:#F4F4F2" href="${config.entryUrl}">Demo / Reconnect</a><a style="color:#F4F4F2" href="/gate/logout">Log out</a></div><script src="/gate/client.js"></script>`;
const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/gate/claim-idle') {
      if (req.method !== 'POST' || !equal(req.headers.authorization, 'Bearer ' + config.secret)) return send(res, 401, 'Authentication required.');
      if (activeCount() || Date.now() - lastVisitor < idleMs) return send(res, 409, 'The desktop is in use.');
      draining = true; return send(res, 200, 'Stopping.');
    }
    if (path === '/gate/enter') {
      if (req.method !== 'POST' || draining) return send(res, 409, 'The desktop is saving. Return to the demo page and reconnect.');
      const ticket = verify(new URLSearchParams(await body(req)).get('ticket'), config.secret, 'desktop');
      if (!ticket || usedTickets.has(ticket.sid) || !Number.isFinite(ticket.sessionExp) || ticket.sessionExp <= Date.now()) return send(res, 401, 'This launch link expired or was already used. Return to the demo page and open the desktop again.');
      usedTickets.set(ticket.sid, ticket.exp);
      const response = await fetch(upstream + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: ticket.name, password: config.password }), signal: AbortSignal.timeout(10000) });
      if (!response.ok) return send(res, 503, 'The desktop is still starting. Return to the demo page and try again.');
      const data = await response.json(); const token = (data.data || data).token;
      if (!token) return send(res, 503, 'Desktop sign-in failed. Return to the demo page and try again.');
      clearSession(getSession(req));
      const item = { sid: randomUUID(), token, exp: Math.min(ticket.sessionExp, Date.now() + 28800000), sockets: new Set() };
      sessions.set(item.sid, item); lastVisitor = Date.now();
      const signed = sign({ aud: 'gateway', sid: item.sid, exp: item.exp }, config.secret);
      res.setHeader('Set-Cookie', `${cookieName}=${signed}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor((item.exp - Date.now()) / 1000)}`);
      const nonce = randomUUID();
      res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
      return send(res, 200, `<!doctype html><title>Opening desktop</title><p>Opening your desktop…</p><script nonce="${nonce}">localStorage.setItem('neko_session',${JSON.stringify(token).replaceAll('<', '\\u003c')});location.replace('/');</script>`, 'text/html; charset=utf-8');
    }
    if (path === '/gate/logout' || path === '/api/logout') {
      clearSession(getSession(req));
      res.setHeader('Set-Cookie', `${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
      if (path === '/api/logout') return send(res, 200, '{}', 'application/json');
      res.writeHead(303, { location: config.entryUrl + '/?loggedout=1', 'cache-control': 'no-store' }); return res.end();
    }
    const item = getSession(req);
    if (!item) return send(res, 401, `<!doctype html><title>Sign in required</title><p>Your desktop login expired. <a href="${config.entryUrl}">Return to the demo page</a> to sign in and reconnect.</p>`, 'text/html; charset=utf-8');
    if (draining) return send(res, 503, 'The desktop is saving. Return to the demo page and reconnect.');
    if (path === '/gate/ping') return send(res, 200, '{}', 'application/json');
    if (path === '/gate/client.js') return send(res, 200, `let misses=0;setInterval(async()=>{try{const r=await fetch('/gate/ping',{cache:'no-store'});if(r.status===401||r.status===410)location.href=${JSON.stringify(config.entryUrl + '/?reconnect=1')};if(!r.ok)throw Error();misses=0}catch{if(++misses>=3)location.href=${JSON.stringify(config.entryUrl + '/?reconnect=1')}}},10000);`, 'text/javascript');
    if (path === '/api/login') return send(res, 403, 'Use the demo page to sign in.');
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin !== config.desktopUrl) return send(res, 403, 'Open the desktop and try again.');
    const headers = { ...req.headers, host: '127.0.0.1:8081', authorization: 'Bearer ' + item.token, 'accept-encoding': 'identity' };
    delete headers.cookie; delete headers.connection;
    const proxy = http.request(upstream + req.url, { method: req.method, headers }, response => {
      const outgoing = { ...response.headers, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' };
      delete outgoing['set-cookie']; delete outgoing['content-length'];
      if (path === '/' && (response.headers['content-type'] || '').includes('text/html')) {
        let html = ''; response.setEncoding('utf8'); response.on('data', chunk => { html += chunk; });
        response.on('end', () => { res.writeHead(response.statusCode, outgoing); res.end(html.replace('</body>', banner + '</body>')); });
      } else { res.writeHead(response.statusCode, outgoing); response.pipe(res); }
    });
    proxy.on('error', () => { if (!res.headersSent) send(res, 503, 'The desktop is restarting. Return to the demo page and reconnect.'); else res.destroy(); });
    req.pipe(proxy);
  } catch { if (!res.headersSent) send(res, 400, 'The request could not be completed. Return to the demo page and try again.'); else res.destroy(); }
});
const wsServer = new WebSocketServer({ noServer: true, maxPayload: 1048576 });
server.on('upgrade', (req, socket, head) => {
  const item = getSession(req);
  if (!item || draining || new URL(req.url, 'http://localhost').pathname !== '/api/ws' || (req.headers.origin && req.headers.origin !== config.desktopUrl)) {
    socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return;
  }
  wsServer.handleUpgrade(req, socket, head, client => {
    item.sockets.add(client); lastVisitor = Date.now();
    const remote = new WebSocket(upstream.replace('http:', 'ws:') + '/api/ws?token=' + encodeURIComponent(item.token), { handshakeTimeout: 10000 });
    const pending = [];
    client.on('message', (data, binary) => { if (remote.readyState === WebSocket.OPEN) remote.send(data, { binary }); else if (pending.length < 32) pending.push([data, binary]); else client.close(1008); });
    remote.on('open', () => { for (const [data, binary] of pending) remote.send(data, { binary }); pending.length = 0; });
    remote.on('message', (data, binary) => { if (client.readyState === WebSocket.OPEN) client.send(data, { binary }); });
    remote.on('error', () => client.close(1011, 'Desktop connection failed. Reconnect from the demo page.'));
    remote.on('close', () => client.close(1001, 'Desktop connection ended.'));
    client.on('error', () => remote.terminate());
    client.on('close', () => { item.sockets.delete(client); lastVisitor = Date.now(); remote.terminate(); });
  });
});
setInterval(async () => {
  const now = Date.now();
  for (const [sid, exp] of usedTickets) if (exp < now) usedTickets.delete(sid);
  for (const item of sessions.values()) if (item.exp <= now) clearSession(item);
  if (activeCount()) lastVisitor = now;
  if (!activeCount() && now - lastVisitor >= idleMs && !notifying) {
    notifying = true;
    try {
      await fetch(config.entryUrl + '/api/desktop', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + sign({ aud: 'idle', sid: randomUUID(), exp: now + 60000 }, config.secret) }, body: JSON.stringify({ action: 'idle' }), signal: AbortSignal.timeout(90000) });
    } catch { /* Retry on the next interval if Vercel is unavailable. */ }
    finally { notifying = false; }
  }
}, 10000).unref();
server.listen(port, '0.0.0.0', () => console.log('Desktop password gate is ready.'));
