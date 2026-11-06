import { Sandbox } from '@vercel/sandbox';
import WebSocket from 'ws';
import wrtc from '@roamhq/wrtc';
const base=process.env.PROBE_URL,password=process.env.PROBE_PASSWORD;
if(!base || !password)throw new Error('Set PROBE_URL and PROBE_PASSWORD before running this test.');
const box=await Sandbox.get({name:'neko-kde-feasibility'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function shell(script){
 const r=await box.runCommand({cmd:'bash',args:['-lc',script],sudo:true});
 if(r.exitCode!==0)throw new Error(await r.stderr());
 return await r.stdout();
}
const initialPid=(await shell("pgrep -x neko")).trim();
let pc,ws,windowId,token;
try {
 await box.runCommand({cmd:'bash',args:['-lc','exec runuser -u neko -- env DISPLAY=:99.0 HOME=/home/neko stdbuf -oL xev -name FoxbardInputProbe -geometry 300x180+100+100 -event mouse -event keyboard >/tmp/foxbard-input.log 2>&1'],sudo:true,detached:true});
 const geometry=await shell('export DISPLAY=:99.0; id=$(xdotool search --sync --onlyvisible --name "^FoxbardInputProbe$" | head -1); xdotool windowactivate --sync "$id"; xdotool getwindowgeometry --shell "$id"');
 const values=Object.fromEntries(geometry.trim().split('\n').map(line=>line.split('=')));
 windowId=values.WINDOW;
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'input-probe',password})});
 if(!login.ok)throw new Error('Probe login failed: '+login.status);
 const body=await login.json();token=(body.data??body).token;
 ws=new WebSocket(base.replace('https:','wss:')+'/api/ws?token='+encodeURIComponent(token));
 const send=(event,payload={})=>ws.send(JSON.stringify({event,payload}));
 let pending=[];
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Input channel did not become ready in 35 seconds.')),35000);
  ws.on('error',reject);
  ws.on('message',async raw=>{try {
   const wire=JSON.parse(raw.toString()),m={event:wire.event,...wire.payload};
   if(m.event==='system/init')send('signal/request',{video:{},audio:{disabled:true}});
   if(m.event==='signal/candidate'){if(pc?.remoteDescription)await pc.addIceCandidate(m);else pending.push(m);}
   if(m.event==='signal/provide'){
    pc=new wrtc.RTCPeerConnection({iceServers:m.iceservers??[]});
    pc.onicecandidate=e=>e.candidate&&send('signal/candidate',e.candidate.toJSON());
    pc.ondatachannel=e=>{e.channel.onopen=async()=>{try{
     send('control/request');await delay(300);
     const packet=(op,value)=>{const b=Buffer.alloc(7);b[0]=op;b.writeUInt16BE(4,1);b.writeUInt32BE(value,3);e.channel.send(b);};
     const move=Buffer.alloc(7);move[0]=1;move.writeUInt16BE(4,1);move.writeUInt16BE(Number(values.X)+80,3);move.writeUInt16BE(Number(values.Y)+80,5);e.channel.send(move);
     await delay(150);packet(5,1);await delay(100);packet(6,1);
     await delay(200);packet(3,0x6b);await delay(100);packet(4,0x6b);
     await delay(700);send('control/release');clearTimeout(timer);resolve();
    }catch(error){clearTimeout(timer);reject(error);}};};
    await pc.setRemoteDescription({type:'offer',sdp:m.sdp});
    for(const c of pending)await pc.addIceCandidate(c);pending=[];
    await pc.setLocalDescription(await pc.createAnswer());send('signal/answer',{sdp:pc.localDescription.sdp});
   }
  }catch(error){clearTimeout(timer);reject(error);}});
 });
 const events=await shell('cat /tmp/foxbard-input.log');
 const result={mousePress:events.includes('ButtonPress event'),mouseRelease:events.includes('ButtonRelease event'),keyPress:events.includes('KeyPress event')&&events.includes('0x6b, k'),keyRelease:events.includes('KeyRelease event')};
 console.log(JSON.stringify(result));
 if(!Object.values(result).every(Boolean))throw new Error('Desktop input did not pass every check.');
} finally {
 pc?.close();ws?.terminate();
 if(token)await fetch(base+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});
 if(windowId && /^\d+$/.test(windowId))await shell('DISPLAY=:99.0 xdotool windowclose '+windowId+' || true');
}
await delay(1000);
const finalPid=(await shell("pgrep -x neko")).trim();
if(finalPid!==initialPid)throw new Error("Neko restarted during the input test or window cleanup.");
console.log(JSON.stringify({processSurvivedWindowClose:true}));
process.exit(0);
