import assert from 'node:assert/strict';
import { Sandbox } from '@vercel/sandbox';
import { readFile } from 'node:fs/promises';
const name = 'neko-kde-feasibility';
const box = await Sandbox.get({ name });
const original = await readFile('desktop/gateway.conf', 'utf8');
await box.writeFiles([{ path: '/tmp/gateway-default.conf', content: Buffer.from(original) }, { path: '/tmp/gateway-idle-test.conf', content: Buffer.from(original.replace('[program:foxbard-gateway]', '[program:foxbard-gateway]\nenvironment=FOXBARD_IDLE_MS="5000"')) }]);
const result = await box.runCommand({ cmd: 'bash', sudo: true, args: ['-lc', `set -e
trap 'install -m 644 /tmp/gateway-default.conf /etc/neko/supervisord/foxbard-gateway.conf' EXIT
install -m 644 /tmp/gateway-idle-test.conf /etc/neko/supervisord/foxbard-gateway.conf
supervisorctl -c /etc/neko/supervisord.conf reread
supervisorctl -c /etc/neko/supervisord.conf update
`] });
assert.equal(result.exitCode, 0, await result.stderr());
let stopped = false;
for (let i = 0; i < 80; i++) {
  const list = await Sandbox.list();
  const status = list.sandboxes.find(item => item.name === name).status;
  if (status === 'stopped') { stopped = true; break; }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.ok(stopped, 'The deployed idle callback did not stop the desktop.');
console.log('The live gateway called the production lifecycle API and stopped the idle desktop. Test delay: five seconds; the saved production configuration retains 15 minutes.');
