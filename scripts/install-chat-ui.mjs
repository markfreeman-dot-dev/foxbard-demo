import { Sandbox } from '@vercel/sandbox';
import { readFile } from 'node:fs/promises';
const archive=process.argv[2];
if(!archive)throw new Error('Pass the tar.gz archive of the built Foxbard client.');
const box=await Sandbox.get({name:'neko-kde-feasibility'});
await box.writeFiles([{path:'/tmp/neko-chat-ui.tgz',content:await readFile(archive)}]);
const result=await box.runCommand({cmd:'bash',sudo:true,args:['-lc',`set -e
mkdir -p /tmp/neko-chat-ui
 tar -xzf /tmp/neko-chat-ui.tgz -C /tmp/neko-chat-ui
 test -f /var/www/index.before-hermes.html || cp /var/www/index.html /var/www/index.before-hermes.html
 mv /tmp/neko-chat-ui/index.html /tmp/neko-index-next.html
 cp -a /tmp/neko-chat-ui/. /var/www/
 install -m 644 /tmp/neko-index-next.html /var/www/index.html.next
 mv /var/www/index.html.next /var/www/index.html
 echo 'Foxbard desktop UI installed.'
`]});
console.log(await result.stdout());
if(result.exitCode!==0)throw new Error(await result.stderr());
