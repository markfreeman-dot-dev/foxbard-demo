import WebSocket from 'ws';
const base=process.env.PROBE_URL;
const request=process.argv[2];
if(!request)throw new Error('Pass a chat request as the first argument.');
const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'integration-check',password:process.env.PROBE_PASSWORD})});
if(!r.ok)throw new Error('Chat login failed.');
const {token,id}=await r.json();
const ws=new WebSocket(base.replace('https:','wss:')+'/api/ws?token='+encodeURIComponent(token));
const timer=setTimeout(()=>ws.close(),180000);
ws.on('message',raw=>{
 const {event,payload:p}=JSON.parse(raw);
 if(event==='system/init')ws.send(JSON.stringify({event:'chat/message',payload:{text:request}}));
 if(event==='system/heartbeat')ws.send(JSON.stringify({event:'client/heartbeat',payload:{}}));
 if(event==='chat/message'&&p.id!==id){
  console.log(p.content.text);
  if(!p.content.text.startsWith('Working:')&&!p.content.text.startsWith('Starting.'))setTimeout(()=>ws.close(),1000);
 }
});
await new Promise(resolve=>ws.on('close',resolve));
clearTimeout(timer);
await fetch(base+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});
