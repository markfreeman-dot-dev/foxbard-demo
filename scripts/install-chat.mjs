import { Sandbox } from '@vercel/sandbox';
import { readFile } from 'node:fs/promises';
if (!process.env.PROBE_PASSWORD) throw new Error('Load .env.probe before installing the chat bridge.');
const box = await Sandbox.get({name:'neko-kde-feasibility'});
const files = await Promise.all([
  ['desktop/hermes-chat.py', '/tmp/hermes-chat.py'],
  ['desktop/foxbard_runner.py', '/tmp/foxbard_runner.py'],
  ['desktop/foxbard_catalog.py', '/tmp/foxbard_catalog.py'],
  ['desktop/developer.conf', '/tmp/developer.conf'],
  ['public/design-system/logo/mark-ink.svg', '/tmp/foxbard-mark.svg'],
].map(async ([source,path])=>({path,content:await readFile(source)})));
await box.writeFiles(files);
await box.writeFiles([{path:'/tmp/foxbard-neko.json',content:Buffer.from(JSON.stringify({password:process.env.PROBE_PASSWORD})),mode:0o600}]);
const script = `set -e
install -d -m 755 /opt/foxbard/design/logo
install -m 644 /tmp/foxbard-mark.svg /opt/foxbard/design/logo/mark-ink.svg
install -m 755 /tmp/hermes-chat.py /opt/foxbard/hermes-chat.py
install -o neko -g neko -m 644 /tmp/foxbard_runner.py /home/neko/.hermes/hermes-agent/foxbard_runner.py
install -o neko -g neko -m 644 /tmp/foxbard_catalog.py /home/neko/.hermes/hermes-agent/foxbard_catalog.py
install -d -o neko -g neko -m 700 /home/neko/.config/foxbard
install -o neko -g neko -m 600 /tmp/foxbard-neko.json /home/neko/.config/foxbard/neko.json
rm /tmp/foxbard-neko.json
install -m 644 /tmp/developer.conf /etc/neko/supervisord/developer.conf
install -d -o neko -g neko /home/neko/Desktop /home/neko/.local/share/applications
rm -f /home/neko/Desktop/OpenRouter.desktop /home/neko/.local/share/applications/OpenRouter.desktop
cat > /home/neko/Desktop/Subscription.desktop <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Foxbard subscription
Comment=Choose ChatGPT / Codex Subscription and sign in
Exec=konsole --separate -e /home/neko/.local/bin/hermes model
Icon=preferences-desktop-user-password
Terminal=false
DESKTOP
cat > /home/neko/Desktop/Hermes.desktop <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Foxbard
Comment=Chat with Foxbard in a terminal
Exec=konsole --separate -e /home/neko/.local/bin/hermes
Icon=/opt/foxbard/design/logo/mark-ink.svg
Terminal=false
DESKTOP
cp /usr/share/applications/org.kde.konsole.desktop /home/neko/Desktop/Terminal.desktop
cp /home/neko/Desktop/Subscription.desktop /home/neko/Desktop/Hermes.desktop /home/neko/.local/share/applications/
chown neko:neko /home/neko/Desktop/*.desktop /home/neko/.local/share/applications/*.desktop
chmod 755 /home/neko/Desktop/*.desktop
if ! supervisorctl -c /etc/neko/supervisord.conf status docker >/dev/null 2>&1; then
  if pgrep -x dockerd >/dev/null; then
    kill -TERM "$(pgrep -x dockerd)"
    for i in $(seq 1 20); do pgrep -x dockerd >/dev/null || break; sleep 1; done
  fi
fi
runuser -u neko -- /home/neko/.local/bin/hermes --run-module foxbard_catalog
install -m 644 /home/neko/.config/foxbard/models.json /var/www/foxbard-models.json
supervisorctl -c /etc/neko/supervisord.conf reread
supervisorctl -c /etc/neko/supervisord.conf update
supervisorctl -c /etc/neko/supervisord.conf restart hermes-chat
supervisorctl -c /etc/neko/supervisord.conf status docker hermes-chat
`;
const result=await box.runCommand({cmd:'bash',args:['-lc',script],sudo:true});
console.log(await result.stdout());
if(result.exitCode!==0)throw new Error(await result.stderr());
