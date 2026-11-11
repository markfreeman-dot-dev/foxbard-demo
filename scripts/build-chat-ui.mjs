import { mkdtemp, cp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
const output = resolve(process.argv[3] || '/tmp/foxbard-chat-ui.tgz');
if (!source) throw new Error('Pass a Neko source checkout and an optional output archive path.');
const revision = '22e35dd52560acc4c17522b029c215c5cc6e14de';
const work = await mkdtemp(join(tmpdir(), 'foxbard-client-'));
const run = (cmd, args, cwd = work) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const archive = execFileSync('git', ['-C', resolve(source), 'archive', revision], { maxBuffer: 128 * 1024 * 1024 });
execFileSync('tar', ['-xf', '-', '-C', work], { input: archive });
for (const patch of ['neko-chat-ui.patch', 'neko-foxbard-design.patch']) {
  execFileSync('git', ['apply', '-'], { cwd: work, input: await readFile(join(root, 'patches', patch)) });
}
const client = join(work, 'client');
for (const name of ['design-system', 'fonts']) await cp(join(root, 'public', name), join(client, 'public', name), { recursive: true });
await cp(join(root, 'desktop/design/icons'), join(client, 'public'), { recursive: true });
await mkdir(join(client, 'public/licenses'), { recursive: true });
await cp(join(work, 'LICENSE'), join(client, 'public/licenses/neko-APACHE-2.0.txt'));
await writeFile(join(client, 'public/licenses/NOTICE.txt'), 'Foxbard desktop client\n\nBased on Neko (https://github.com/m1k1o/neko).\nFoxbard modifications: branding, typography, colors, avatars, and assistant chat presentation.\nSee neko-APACHE-2.0.txt for the upstream license and copyright notices.\n');
run('npm', ['ci'], client);
run('npm', ['test'], client);
run('npm', ['run', 'build'], client);
run('tar', ['-czf', output, '-C', join(client, 'dist'), '.']);
console.log(`Foxbard client archive: ${output}`);
