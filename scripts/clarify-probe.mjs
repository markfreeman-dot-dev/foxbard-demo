import WebSocket from 'ws';
const base=process.env.PROBE_URL;
const response=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'answer-check',password:process.env.PROBE_PASSWORD})});
if(!response.ok)throw new Error('Clarification test login failed.');
const {token,id}=await response.json();
const ws=new WebSocket(base.replace('https:','wss:')+'/api/ws?token='+encodeURIComponent(token));
const send=text=>ws.send(JSON.stringify({event:'chat/message',payload:{text}}));
let phase=0,sawQuestion=false,timer;
try {
 await new Promise((resolve,reject)=>{
  timer=setTimeout(()=>reject(new Error('Clarification test timed out.')),180000);
  ws.on('error',reject);
  ws.on('message',raw=>{
   const {event,payload}=JSON.parse(raw);
   if(event==='system/init')send('/new');
   if(event==='system/heartbeat')ws.send(JSON.stringify({event:'client/heartbeat',payload:{}}));
   if(event!=='chat/message'||payload.id===id)return;
   const text=payload.content.text;
   if(phase===0&&text.startsWith('Started a new conversation')){
    phase=1;send('Use the clarify tool to ask exactly "Foxbard test: choose a language" with choices Python and TypeScript. After my answer, reply with exactly "Recorded: <my answer>" and do nothing else.');return;
   }
   if(text.includes('already running'))reject(new Error('Another request is running; test did not proceed.'));
   if(text.startsWith('Foxbard test:'))sawQuestion=true;
   const match=text.match(/<!--hermes-question:(\{.*\})-->$/s);
   if(match&&sawQuestion){
    const q=JSON.parse(match[1]);
    if(q.kind!=='clarify')return;
    sawQuestion=false;
    if(phase===1){
     phase=2;send(q.choices[0]+'\n<!--hermes-answer:'+JSON.stringify({id:q.id,choice:0})+'-->');
     console.log('Selected an option using the button message format.');
    }else if(phase===3){phase=4;send('Go instead');console.log('Sent a custom answer as plain chat text.');}
   }
   if(phase===2&&text.includes('Recorded: Python')){
    phase=3;send('Use the clarify tool to ask exactly "Foxbard test: choose another language" with choices Python and TypeScript. After my answer, reply with exactly "Recorded: <my answer>" and do nothing else.');
   }else if(phase===4&&text.includes('Recorded: Go instead')){console.log('Both answers reached Hermes and resumed the conversation.');resolve();}
   if(text.startsWith('Hermes could not complete')||text.startsWith('The request failed'))reject(new Error(text));
  });
 });
}finally{
 clearTimeout(timer);ws.terminate();
 await fetch(base+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});
}
process.exit(0);
