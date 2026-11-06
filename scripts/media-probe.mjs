import WebSocket from 'ws';
import wrtc from '@roamhq/wrtc';

const base=process.env.PROBE_URL;
const password=process.env.PROBE_PASSWORD;
if(!base || !password) throw new Error('Run probe:desktop start first, or set PROBE_URL and PROBE_PASSWORD.');
if(new URL(base).protocol!=='https:') throw new Error('The probe requires an HTTPS endpoint.');
const login=async (username,value)=>fetch(base+'/api/login',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({username,password:value}),signal:AbortSignal.timeout(15000)
});
const bad=await login('incorrect-password-probe','incorrect-'+Date.now());
if(bad.status!==401) throw new Error('Incorrect password was not rejected with HTTP 401.');
console.log('Incorrect password rejected: HTTP 401.');
const whoami=await fetch(base+'/api/whoami',{signal:AbortSignal.timeout(15000)});
if(whoami.status!==401) throw new Error('Unauthenticated API request was not rejected.');
await new Promise((resolve,reject)=>{
  const socket=new WebSocket(base.replace('https:','wss:')+'/api/ws',{handshakeTimeout:15000});
  let rejected=false;
  const timer=setTimeout(()=>{socket.terminate();reject(new Error('Unauthenticated socket was not closed within five seconds.'));},5000);
  socket.on('message',raw=>{
    const message=JSON.parse(raw.toString());
    if(message.event==='system/disconnect') rejected=true;
    else {clearTimeout(timer);socket.terminate();reject(new Error('Unauthenticated socket received '+message.event));}
  });
  socket.on('unexpected-response',(_,response)=>{
    response.resume();clearTimeout(timer);
    if(response.statusCode===401)resolve();
    else reject(new Error('Unexpected unauthenticated WebSocket status: '+response.statusCode));
  });
  socket.on('close',(code,reason)=>{
    clearTimeout(timer);
    console.log('Unauthenticated WebSocket closed:',code,reason.toString());
    if(rejected || code===1008)resolve();
    else reject(new Error('Socket closed without an explicit authentication rejection.'));
  });
  socket.on('error',error=>{clearTimeout(timer);reject(error);});
});
console.log('Unauthenticated API rejected; unauthenticated WebSocket closed without desktop state.');

async function visitor(username) {
  const response=await login(username,password);
  if(!response.ok)throw new Error('Login failed: HTTP '+response.status);
  const body=await response.json();
  const token=(body.data??body).token;
  if(!token)throw new Error('Neko did not return a session token.');
  const ws=new WebSocket(base.replace('https:','wss:')+'/api/ws?token='+encodeURIComponent(token),{handshakeTimeout:15000});
  let pc,sink,frames=0,width=0,height=0,inputChannel=false,pending=[],failure;
  const send=(event,payload)=>ws.send(JSON.stringify({event,payload}));
  ws.on('error',error=>{failure=error.message;});
  ws.on('message',async raw=>{try {
    const wire=JSON.parse(raw.toString());
    const m={event:wire.event,...wire.payload};
    if(m.event==='system/init') send('signal/request',{video:{},audio:{disabled:true}});
    if(m.event==='signal/candidate') {
      if(pc?.remoteDescription)await pc.addIceCandidate(m);else pending.push(m);
    }
    if(m.event==='signal/provide') {
      pc=new wrtc.RTCPeerConnection({iceServers:m.iceservers??[]});
      pc.onicecandidate=event=>event.candidate&&send('signal/candidate',event.candidate.toJSON());
      pc.ontrack=event=>{
        if(event.track.kind==='video') {
          sink=new wrtc.nonstandard.RTCVideoSink(event.track);
          sink.onframe=({frame})=>{frames++;width=frame.width;height=frame.height;};
        }
      };
      pc.ondatachannel=event=>{event.channel.onopen=()=>{inputChannel=true;};};
      await pc.setRemoteDescription({type:'offer',sdp:m.sdp});
      for(const candidate of pending)await pc.addIceCandidate(candidate);
      pending=[];
      await pc.setLocalDescription(await pc.createAnswer());
      send('signal/answer',{sdp:pc.localDescription.sdp});
    }
  }catch(error){failure=error.message;}});
  await new Promise(resolve=>setTimeout(resolve,40000));
  const result={username,frames,width,height,inputChannel,connectionState:pc?.connectionState??'no-offer',failure};
  sink?.stop();pc?.close();ws.terminate();
  console.log(JSON.stringify(result));
  if(failure || frames<10 || width!==1280 || height!==720 || !inputChannel) {
    throw new Error('Media probe failed for '+username+'. This test does not verify browser rendering or input.');
  }
}
try {
  await Promise.all([visitor('visitor-one'),visitor('visitor-two')]);
  console.log('Both native clients received desktop video. Browser and input checks remain required.');
  process.exit(0);
} catch(error) {
  console.error(error.message);
  process.exit(1);
}
