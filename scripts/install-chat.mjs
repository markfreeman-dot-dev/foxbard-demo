import { Sandbox } from '@vercel/sandbox';
import { readFile } from 'node:fs/promises';
if (!process.env.PROBE_PASSWORD) throw new Error('Load .env.probe before installing the chat bridge.');
const box = await Sandbox.get({name:'neko-kde-feasibility'});
const files = await Promise.all([
  ['desktop/hermes-chat.py', '/tmp/hermes-chat.py'],
  ['desktop/foxbard_runner.py', '/tmp/foxbard_runner.py'],
  ['desktop/openrouter-setup.py', '/tmp/openrouter-setup.py'],
  ['desktop/developer.conf', '/tmp/developer.conf'],
].map(async ([source,path])=>({path,content:await readFile(source)})));
await box.writeFiles(files);
await box.writeFiles([{path:'/tmp/foxbard-neko.json',content:Buffer.from(JSON.stringify({password:process.env.PROBE_PASSWORD})),mode:0o600}]);
const script = `set -e
install -d -m 755 /opt/foxbard
install -m 755 /tmp/hermes-chat.py /opt/foxbard/hermes-chat.py
install -o neko -g neko -m 644 /tmp/foxbard_runner.py /home/neko/.hermes/hermes-agent/foxbard_runner.py
install -o neko -g neko -m 755 /tmp/openrouter-setup.py /home/neko/.local/bin/foxbard-openrouter
install -d -o neko -g neko -m 700 /home/neko/.config/foxbard
install -o neko -g neko -m 600 /tmp/foxbard-neko.json /home/neko/.config/foxbard/neko.json
rm /tmp/foxbard-neko.json
install -m 644 /tmp/developer.conf /etc/neko/supervisord/developer.conf
install -d -o neko -g neko /home/neko/Desktop /home/neko/.local/share/applications
cat > /home/neko/Desktop/OpenRouter.desktop <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Set up OpenRouter
Comment=Enter your API key and choose a Hermes model
Exec=konsole --separate -e /home/neko/.local/bin/foxbard-openrouter
Icon=preferences-desktop-user-password
Terminal=false
DESKTOP
cat > /home/neko/Desktop/Hermes.desktop <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Hermes Agent
Comment=Chat with Hermes in a terminal
Exec=konsole --separate -e /home/neko/.local/bin/hermes
Icon=utilities-terminal
Terminal=false
DESKTOP
cp /usr/share/applications/org.kde.konsole.desktop /home/neko/Desktop/Terminal.desktop
cp /home/neko/Desktop/OpenRouter.desktop /home/neko/Desktop/Hermes.desktop /home/neko/.local/share/applications/
chown neko:neko /home/neko/Desktop/*.desktop /home/neko/.local/share/applications/*.desktop
chmod 755 /home/neko/Desktop/*.desktop
if ! supervisorctl -c /etc/neko/supervisord.conf status docker >/dev/null 2>&1; then
  if pgrep -x dockerd >/dev/null; then
    kill -TERM "$(pgrep -x dockerd)"
    for i in $(seq 1 20); do pgrep -x dockerd >/dev/null || break; sleep 1; done
  fi
fi
supervisorctl -c /etc/neko/supervisord.conf reread
supervisorctl -c /etc/neko/supervisord.conf update
supervisorctl -c /etc/neko/supervisord.conf restart hermes-chat
supervisorctl -c /etc/neko/supervisord.conf status docker hermes-chat
`;
const result=await box.runCommand({cmd:'bash',args:['-lc',script],sudo:true});
console.log(await result.stdout());
if(result.exitCode!==0)throw new Error(await result.stderr());
