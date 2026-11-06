import WebSocket from 'ws';
const base=process.env.PROBE_URL;
const response=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'chat-check',password:process.env.PROBE_PASSWORD})});
if(!response.ok)throw new Error('Chat test login failed.');
const {token,id}=await response.json();
const ws=new WebSocket(base.replace('https:','wss:')+'/api/ws?token='+encodeURIComponent(token));
let readyResolve;
const ready=new Promise(resolve=>readyResolve=resolve);
const replies=[];
ws.on('message',raw=>{
 const {event,payload}=JSON.parse(raw.toString());
 if(event==='system/init')readyResolve();
 if(event==='system/heartbeat')ws.send(JSON.stringify({event:'client/heartbeat',payload:{}}));
 if(event==='chat/message'&&payload.id!==id)replies.push(payload.content.text);
});
try {
 await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Chat did not connect.')),15000))]);
 for(const [text,expected] of [['/status','Hermes is'],['/help','Type a request'],['/stop','No request is running.']]) {
  const start=replies.length;
  ws.send(JSON.stringify({event:'chat/message',payload:{text}}));
  const deadline=Date.now()+10000;
  while(Date.now()<deadline&&!replies.slice(start).some(reply=>reply.includes(expected)))await new Promise(resolve=>setTimeout(resolve,100));
  const found=replies.slice(start).find(reply=>reply.includes(expected));
  if(!found)throw new Error('Chat command failed: '+text);
  console.log(found);
 }
}finally{
 ws.terminate();
 await fetch(base+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});
}
process.exit(0);
