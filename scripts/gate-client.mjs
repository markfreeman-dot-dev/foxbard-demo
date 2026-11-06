import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export const entry = process.env.PROBE_ENTRY || 'https://foxbard-demo-mark-5769s-projects.vercel.app';
export async function entryRequest(path, { body, cookie, origin = entry } = {}) {
  const headers = { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) };
  if (!process.env.PROBE_STAGED) return fetch(entry + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
  const dir = await mkdtemp(join(tmpdir(), 'foxbard-request-'));
  try {
    const args = ['curl', entry + path, '--', '-sS', '-D', join(dir, 'headers')];
    await writeFile(join(dir, 'request-headers'), Object.entries(headers).map(([key, value]) => key + ': ' + value).join('\n'), { mode: 0o600 });
    args.push('-H', '@' + join(dir, 'request-headers'));
    if (body) { await writeFile(join(dir, 'body'), JSON.stringify(body), { mode: 0o600 }); args.push('--data-binary', '@' + join(dir, 'body')); }
    const output = execFileSync('vercel', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const raw = await readFile(join(dir, 'headers'), 'utf8');
    const final = raw.trim().split(/\r?\n\r?\n/).at(-1).split(/\r?\n/);
    const status = Number(final.shift().split(' ')[1]);
    const responseHeaders = new Headers();
    for (const line of final) { const at = line.indexOf(':'); if (at > 0) responseHeaders.append(line.slice(0, at), line.slice(at + 1).trim()); }
    return new Response(output, { status, headers: responseHeaders });
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export async function enterDesktop(name) {
  const login = await entryRequest('/api/auth', { body: { name, password: process.env.DEMO_PASSWORD || process.env.PROBE_PASSWORD } });
  if (!login.ok) throw new Error('Entry login failed: ' + login.status + ' ' + await login.text());
  const entryCookie = login.headers.get('set-cookie').split(';')[0];
  const started = Date.now();
  const launch = await entryRequest('/api/desktop', { cookie: entryCookie, body: { action: 'launch' } });
  if (!launch.ok) throw new Error('Desktop launch failed: ' + launch.status + ' ' + await launch.text());
  const handoff = await launch.json();
  const response = await fetch(handoff.url, { method: 'POST', body: new URLSearchParams({ ticket: handoff.ticket }) });
  if (!response.ok) throw new Error('Desktop handoff failed: ' + response.status + ' ' + await response.text());
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const html = await response.text();
  if (!html.includes('localStorage.setItem')) throw new Error('Desktop handoff did not initialize the Neko client.');
  console.log('Authenticated desktop launch:', name, Date.now() - started, 'ms');
  return { base: new URL(handoff.url).origin, cookie, entryCookie, handoff };
}
