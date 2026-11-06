import WebSocket from 'ws';
import wrtc from '@roamhq/wrtc';
import assert from 'node:assert/strict';
import { entryRequest, enterDesktop } from './gate-client.mjs';
const bad = await entryRequest('/api/auth', { body: { name: 'Test', password: 'incorrect' } });
assert.equal(bad.status, 401);
assert.equal((await entryRequest('/api/desktop')).status, 401);
assert.equal((await entryRequest('/api/auth', { body: { name: 'Test', password: process.env.DEMO_PASSWORD || process.env.PROBE_PASSWORD }, origin: 'https://attacker.example' })).status, 403);
assert.equal((await fetch(process.env.PROBE_URL)).status, 401);
console.log('Incorrect password, unauthenticated lifecycle and direct HTTP, and cross-origin login rejected.');
async function visitor(username) {
  const { base, cookie } = await enterDesktop(username);
  const ws = new WebSocket(base.replace('https:', 'wss:') + '/api/ws', { headers: { cookie, origin: base }, handshakeTimeout: 15000 });
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
  await new Promise(resolve=>setTimeout(resolve,12000));
  const result={username,frames,width,height,inputChannel,connectionState:pc?.connectionState??'no-offer',failure};
  sink?.stop();pc?.close();ws.terminate();
  console.log(JSON.stringify(result));
  await fetch(base + '/gate/logout', { headers: { cookie }, redirect: 'manual' });
  if(failure || frames<10 || width!==1280 || height!==720 || !inputChannel) {
    throw new Error('Media probe failed for '+username+'. This test does not verify browser rendering or input.');
  }
}
try {
  await Promise.all([visitor('Gate visitor one'), visitor('Gate visitor two')]);
  console.log('Two authenticated visitors received live KDE video and input channels through the gate.');
  process.exit(0);
} catch (error) { console.error(error.message); process.exit(1); }
