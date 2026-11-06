import { Sandbox } from '@vercel/sandbox';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const entryUrl = 'https://foxbard-demo-mark-5769s-projects.vercel.app';
let secrets;
try { secrets = JSON.parse(await readFile('.env.gate.json', 'utf8')); }
catch { secrets = { secret: randomBytes(32).toString('base64url'), password: process.env.PROBE_PASSWORD, adminPassword: process.env.PROBE_ADMIN_PASSWORD, entryUrl, desktopUrl: process.env.PROBE_URL }; await writeFile('.env.gate.json', JSON.stringify(secrets), { mode: 0o600 }); }
if (!secrets.password || !secrets.adminPassword) throw new Error('Load the existing desktop credentials before installing the gate.');
const box = await Sandbox.get({ name: 'neko-kde-feasibility' });
await box.update({ timeout: 2700000, snapshotExpiration: 0, keepLastSnapshots: { count: 1, expiration: 0, deleteEvicted: true } });
execFileSync('tar', ['-czf', '/tmp/foxbard-ws.tgz', '-C', 'node_modules', 'ws']);
await box.writeFiles(await Promise.all([
  ['desktop/gateway.mjs', '/tmp/foxbard-gateway.mjs'], ['desktop/start.py', '/tmp/foxbard-start.py'],
  ['desktop/gateway.conf', '/tmp/foxbard-gateway.conf'], ['lib/auth.mjs', '/tmp/foxbard-auth.mjs'], ['/tmp/foxbard-ws.tgz', '/tmp/foxbard-ws.tgz'],
].map(async ([source, path]) => ({ path, content: await readFile(source) }))));
await box.writeFiles([{ path: '/tmp/foxbard-gate.json', content: Buffer.from(JSON.stringify(secrets)), mode: 0o600 }]);
const command = await box.runCommand({ cmd: 'bash', sudo: true, args: ['-lc', `set -e
install -d -m 700 /etc/foxbard
install -m 600 /tmp/foxbard-gate.json /etc/foxbard/gate.json
rm /tmp/foxbard-gate.json
install -d /opt/foxbard/node_modules
install -m 644 /tmp/foxbard-gateway.mjs /opt/foxbard/gateway.mjs
install -m 644 /tmp/foxbard-auth.mjs /opt/foxbard/auth.mjs
install -m 755 /tmp/foxbard-start.py /opt/foxbard/start.py
tar -xzf /tmp/foxbard-ws.tgz -C /opt/foxbard/node_modules
install -m 644 /tmp/foxbard-gateway.conf /etc/neko/supervisord/foxbard-gateway.conf
python3 - <<'PY'
from pathlib import Path
p = Path('/etc/neko/supervisord.conf')
s = p.read_text()
if '--server.bind 127.0.0.1:8081' not in s:
    s = s.replace('/usr/bin/neko serve ', '/usr/bin/neko serve --server.bind 127.0.0.1:8081 ')
p.write_text(s)
p = Path('/opt/foxbard/hermes-chat.py')
p.write_text(p.read_text().replace('127.0.0.1:8080', '127.0.0.1:8081'))
PY
if pgrep -x supervisord >/dev/null; then
  supervisorctl -c /etc/neko/supervisord.conf reread
  supervisorctl -c /etc/neko/supervisord.conf update
  supervisorctl -c /etc/neko/supervisord.conf restart hermes-chat
else
  python3 /opt/foxbard/start.py
fi
supervisorctl -c /etc/neko/supervisord.conf status neko foxbard-gateway hermes-chat
`] });
console.log(await command.stdout());
if (command.exitCode !== 0) throw new Error(await command.stderr());
await writeFile('/tmp/foxbard-password-hash', createHash('sha256').update(secrets.password).digest('hex'), { mode: 0o600 });
await writeFile('/tmp/foxbard-session-secret', secrets.secret, { mode: 0o600 });
console.log('Gate installed. Server-side deployment secrets are staged in private temporary files.');
