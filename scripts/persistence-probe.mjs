import assert from 'node:assert/strict';
import { Sandbox } from '@vercel/sandbox';
import { entryRequest, enterDesktop } from './gate-client.mjs';
const first = await enterDesktop('Persistence check');
let box = await Sandbox.get({ name: 'neko-kde-feasibility' });
async function readState() {
  const result = await box.runCommand({ cmd: 'bash', sudo: true, args: ['-lc', `set -e
cat /home/neko/persistence-probe.txt
runuser -u neko -- env HOME=/home/neko LANG=C.UTF-8 kreadconfig6 --file kdeglobals --group KDE --key SingleClick
python3 - <<'PY'
from pathlib import Path
p=Path('/home/neko/.hermes/.env')
print('OpenRouter key saved:', p.exists() and any(x.startswith('OPENROUTER_API_KEY=') and len(x.split('=',1)[1].strip()) > 5 for x in p.read_text().splitlines()))
PY
`] });
  assert.equal(result.exitCode, 0); return await result.stdout();
}
const before = await readState();
const response = await entryRequest('/api/desktop', { cookie: first.entryCookie, body: { action: 'stop' } });
assert.equal(response.status, 200, await response.text());
for (let n = 0; n < 60; n++) {
  const listing = await Sandbox.list();
  if (listing.sandboxes.find(item => item.name === 'neko-kde-feasibility').status === 'stopped') break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
console.log('Stopped through the deployed lifecycle API.');
const second = await enterDesktop('Persistence check after resume');
box = await Sandbox.get({ name: 'neko-kde-feasibility' });
assert.equal(await readState(), before);
assert.equal((await fetch(second.base + '/api/whoami', { headers: { cookie: first.cookie } })).status, 401);
await fetch(second.base + '/gate/logout', { headers: { cookie: second.cookie }, redirect: 'manual' });
console.log('File, KDE setting, and saved OpenRouter key survived stop/resume. The old desktop cookie was rejected.');
