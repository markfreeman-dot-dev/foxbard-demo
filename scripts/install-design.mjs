import { Sandbox } from '@vercel/sandbox';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const box = await Sandbox.get({ name: 'neko-kde-feasibility' });
const files = [];
async function addTree(source, target) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const local = join(source, entry.name), remote = `${target}/${entry.name}`;
    if (entry.isDirectory()) await addTree(local, remote);
    else files.push({ path: remote, content: await readFile(local) });
  }
}
await addTree('desktop/design', '/tmp/foxbard-design');
await addTree('public/design-system/logo', '/tmp/foxbard-design/logo');
await addTree('public/fonts', '/tmp/foxbard-design/fonts');
await box.writeFiles(files);
const result = await box.runCommand({ cmd: 'bash', sudo: true, args: ['-lc', `set -e
install -d /opt/foxbard/design /usr/share/color-schemes /usr/share/plasma/desktoptheme/foxbard /usr/local/share/fonts/foxbard
cp -a /tmp/foxbard-design/. /opt/foxbard/design/
install -m 644 /opt/foxbard/design/Foxbard.colors /usr/share/color-schemes/Foxbard.colors
cp -a /opt/foxbard/design/plasma/. /usr/share/plasma/desktoptheme/foxbard/
find /opt/foxbard/design/fonts -name '*.ttf' -exec install -m 644 {} /usr/local/share/fonts/foxbard/ \\;
fc-cache -f /usr/local/share/fonts/foxbard
chmod 755 /opt/foxbard/design/apply.sh
install -d -o neko -g neko /home/neko/.config/autostart
cat > /home/neko/.config/autostart/foxbard-design.desktop <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Foxbard appearance
Exec=/opt/foxbard/design/apply.sh
OnlyShowIn=KDE;
X-KDE-autostart-phase=2
DESKTOP
chown neko:neko /home/neko/.config/autostart/foxbard-design.desktop
python3 - <<'PY'
from pathlib import Path
for directory in [Path('/home/neko/Desktop'), Path('/home/neko/.local/share/applications')]:
    path = directory / 'Hermes.desktop'
    if path.exists():
        lines = path.read_text().splitlines()
        replacements = {'Name': 'Foxbard', 'Comment': 'Chat with Foxbard in a terminal', 'Icon': '/opt/foxbard/design/logo/mark-ink.svg'}
        path.write_text('\\n'.join(key + '=' + replacements[key] if (key := line.split('=', 1)[0]) in replacements else line for line in lines) + '\\n')
PY
printf '%s\\n' 'Foxbard desktop appearance installed. It applies at the next desktop login.'
`] });
console.log(await result.stdout());
if (result.exitCode !== 0) throw new Error(await result.stderr());
