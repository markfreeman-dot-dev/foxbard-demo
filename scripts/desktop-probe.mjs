import { Sandbox } from '@vercel/sandbox';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const projectId = 'prj_FmEBPE4H8628ZRLCJVvfwRIOCFAg';
const teamId = 'team_F8SKlf6Ja69GFWw5dC0d7Y8C';
const image = 'neko-kde@sha256:e580957c91acb502522d62d0f0b1273e915e667ca71320c7f3fedd23cdd80ba7';
const name = 'neko-kde-feasibility';
const action = process.argv[2];
if (!['create', 'start', 'stop', 'status', 'write-state', 'read-state'].includes(action)) {
  throw new Error('Choose create, start, stop, status, write-state, or read-state.');
}
const linked = JSON.parse(await readFile('.vercel/project.json', 'utf8'));
if (linked.projectId !== projectId || linked.orgId !== teamId) {
  throw new Error('This directory must be linked to the intended foxbard-demo project.');
}
if (action === 'status') {
  const result = await Sandbox.list();
  console.log(JSON.stringify(result.sandboxes.filter(item => item.name === name).map(({name, status, currentSessionId}) => ({name, status, currentSessionId})), null, 2));
  process.exit(0);
}
const box = action === 'create'
  ? await Sandbox.create({name, image, ports:[8080], resources:{vcpus:2}, timeout:900_000,
      persistent:true, snapshotExpiration:0, keepLastSnapshots:{count:1,expiration:0}})
  : await Sandbox.get({name});

async function command(script) {
  const result = await box.runCommand({cmd:'bash', args:['-lc',script], sudo:true});
  if (result.exitCode !== 0) throw new Error(await result.stderr());
  return (await result.stdout()).trim();
}

if (action === 'stop') {
  await box.stop();
  console.log('Desktop stopped. Its latest filesystem snapshot is retained without automatic expiration.');
} else if (action === 'status') {
  const result = await Sandbox.list();
  console.log(JSON.stringify(result.sandboxes.filter(item=>item.name===name).map(({name,status,currentSessionId})=>({name,status,currentSessionId})),null,2));
} else if (action === 'write-state') {
  console.log(await command(`
    install -d -o neko -g neko /home/neko/.config
    printf 'desktop persistence probe\\n' > /home/neko/persistence-probe.txt
    chown neko:neko /home/neko/persistence-probe.txt
    runuser -u neko -- env HOME=/home/neko LANG=C.UTF-8 kwriteconfig6 --file kdeglobals --group KDE --key SingleClick false
    cat /home/neko/persistence-probe.txt
  `));
} else if (action === 'read-state') {
  console.log(await command(`
    cat /home/neko/persistence-probe.txt
    runuser -u neko -- env HOME=/home/neko LANG=C.UTF-8 kreadconfig6 --file kdeglobals --group KDE --key SingleClick
  `));
} else {
  const gate = await command('test -f /opt/foxbard/start.py && echo installed || true');
  if (gate) {
    console.log(await command('python3 /opt/foxbard/start.py'));
    console.log('Open https://foxbard-demo-mark-5769s-projects.vercel.app to sign in.');
    process.exit(0);
  }
  const password = process.env.PROBE_PASSWORD || randomBytes(24).toString('base64url');
  const adminPassword = process.env.PROBE_ADMIN_PASSWORD || randomBytes(24).toString('base64url');
  const began = Date.now();
  const running = await command('pgrep -x supervisord >/dev/null && echo running || true');
  if (running && (!process.env.PROBE_PASSWORD || !process.env.PROBE_ADMIN_PASSWORD)) {
    throw new Error('Desktop is already running. Stop it before starting with new test credentials.');
  }
  if (!running) {
    await command(`
      rm -f /tmp/.X99-lock /tmp/.X11-unix/X99 /run/dbus/pid /var/run/docker.pid /run/docker/containerd/containerd.pid
      mkdir -p /run/dbus
      if ! pgrep -x dbus-daemon >/dev/null; then dbus-daemon --system --fork; fi
    `);
    // Explicit env arguments survive sudo's environment filtering.
    await box.runCommand({cmd:'env',sudo:true,detached:true,args:[
      'USER=neko','DISPLAY=:99.0','LANG=C.UTF-8','QT_ACCESSIBILITY=1',
      'NEKO_MEMBER_MULTIUSER_USER_PASSWORD='+password,
      'NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD='+adminPassword,
      'NEKO_DESKTOP_SCREEN=1280x720@30',
      'NEKO_SESSION_IMPLICIT_HOSTING=true',
      '/usr/bin/supervisord','-c','/etc/neko/supervisord.conf'
    ]});
  }
  let ready=false;
  for(let i=0;i<45;i++) {
    const status=await command('curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 || true');
    if(status==='200'){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!ready) {
    await box.stop();
    throw new Error('Desktop did not become ready within 45 checks. The test Sandbox was stopped.');
  }
  const url=box.domain(8080);
  await writeFile('.env.probe',`PROBE_URL=${url}\nPROBE_PASSWORD=${password}\nPROBE_ADMIN_PASSWORD=${adminPassword}\n`,{mode:0o600});
  console.log(JSON.stringify({url,startupMs:Date.now()-began,credentialsFile:'.env.probe'}));
}
