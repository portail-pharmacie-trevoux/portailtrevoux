import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';

const generationPattern=/^[a-zA-Z0-9][a-zA-Z0-9_-]{15,79}$/;

export function previewMaintenanceConfig(env){
 const mode=env.SCALINGO_PREVIEW_MAINTENANCE;
 if(mode===undefined||mode==='false')return null;
 if(mode!=='true'||env.SCALINGO_PREVIEW_SAFE_MODE!=='true'||env.SCALINGO_PREVIEW_UI_ENABLED!=='true'||
    env.SCALINGO_ENABLE_BUSINESS_STARTUP==='true'||env.SCALINGO_ENABLE_SCHEDULED_JOBS==='true'||
    !generationPattern.test(env.SCALINGO_PREVIEW_MAINTENANCE_GENERATION||''))
  throw Error('PREVIEW_MAINTENANCE_CONFIGURATION_INVALID');
 return {generation:env.SCALINGO_PREVIEW_MAINTENANCE_GENERATION,
  port:Number(env.PORT)||3000,host:env.SCALINGO_PREVIEW_BIND_HOST==='127.0.0.1'?'127.0.0.1':'0.0.0.0'};
}

export function startPreviewMaintenance({generation,port,host}){
 const health=JSON.stringify({status:'maintenance',generation,bootId:randomUUID()});
 const server=createServer((req,res)=>{
  const isHealth=req.url==='/health'&&['GET','HEAD'].includes(req.method);
  res.writeHead(isHealth?200:503,{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8',
   ...(!isHealth?{'Connection':'close'}:{})});
  res.end(req.method==='HEAD'?undefined:isHealth?health:'{"status":"maintenance"}');
 });
 return server.listen(port,host);
}
