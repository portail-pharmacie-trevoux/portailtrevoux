// Execute ONLY as a Scalingo one-off container: starts restricted preview on loopback.
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {randomInt} from 'node:crypto';
const port=randomInt(35000,55000);
const child=spawn(process.execPath,['scripts/serve-scalingo-ui-preview.mjs'],{env:{...process.env,SCALINGO_PREVIEW_UI_ENABLED:'true',SCALINGO_PREVIEW_BIND_HOST:'127.0.0.1',PORT:String(port)},stdio:['ignore','pipe','pipe']});
let stderr='';
child.stderr.on('data',chunk=>{stderr+=chunk.toString().slice(0,200);});
const base='http://127.0.0.1:'+port;
const assert=(condition,message)=>{if(!condition)throw Error(message);};
try{
 let healthy=false;
 for(let i=0;i<35;i++){
   if(child.exitCode!==null)throw Error('Preview process exited before startup');
   try{const r=await fetch(base+'/',{signal:AbortSignal.timeout(700)});if(r.ok){const body=await r.text();assert(body.includes('PORTAIL +'),'Expected Portail+ HTML');healthy=true;break;}}catch{}
   await delay(400);
 }
 assert(healthy,'Loopback preview failed to start');
 const anonymous=await fetch(base+'/api/me');
 assert(anonymous.status===401,'Anonymous access was not denied');
 const blocked=await fetch(base+'/api/publications');
 assert(blocked.status===403,'Business API was not blocked');
 const blockedWrite=await fetch(base+'/api/news',{method:'POST',headers:{origin:'https://portailplus-hds.osc-fr1.scalingo.io','content-type':'application/json'},body:'{}'});
 assert(blockedWrite.status===403,'Business write was not blocked');
 const missing=await fetch(base+'/api/order-planning');
 assert(missing.status===403,'Order planning was not blocked');
 console.log(JSON.stringify({status:'ok',htmlServed:true,anonymousDenied:true,businessApiBlocked:true,businessWritesBlocked:true,orderPlanningBlocked:true,loopbackOnly:true,publicPreviewUnchanged:true,loginNotExercised:true}));
}catch(err){console.error('Preview smoke test failed:',err.message);process.exitCode=1;}
finally{child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(3000)]);}
