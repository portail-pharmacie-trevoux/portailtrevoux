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
  container:/^web-[1-9][0-9]*$/.test(env.CONTAINER||'')?env.CONTAINER:null,
  containerVersion:/^[a-f0-9]{40}$/.test(env.CONTAINER_VERSION||'')?env.CONTAINER_VERSION:null,
  port:Number(env.PORT)||3000,host:env.SCALINGO_PREVIEW_BIND_HOST==='127.0.0.1'?'127.0.0.1':'0.0.0.0'};
}

export function startPreviewMaintenance({generation,port,host,container,containerVersion}){
 const bootId=randomUUID();
 const health=JSON.stringify({status:'maintenance',generation,bootId});
 const evidence={generation,bootId,container,containerVersion};
 const record=(event,extra={})=>console.log(JSON.stringify({event,...evidence,
  observedAt:new Date().toISOString(),...extra}));
 const latestProbe=new Map();
 const server=createServer((req,res)=>{
  const isHealth=req.url==='/health'&&['GET','HEAD'].includes(req.method);
  const status=isHealth?200:503;
  const probe=req.headers['x-portail-maintenance-probe'];
  const kind=req.method==='GET'&&req.url==='/health'?'health':
   req.method==='GET'&&req.url==='/trevoux'?'application-get':
   req.method==='POST'&&req.url==='/api/login'?'application-post':null;
  if(container&&containerVersion&&kind&&typeof probe==='string'&&/^[a-f0-9]{32}$/.test(probe)){
   res.once('finish',()=>{
    const now=Date.now();
    if(now-(latestProbe.get(kind)||0)<1000)return;
    latestProbe.set(kind,now);
    record('preview_maintenance_probe',{kind,status,probe});
   });
  }
  res.writeHead(status,{'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8',
   ...(!isHealth?{'Connection':'close'}:{})});
  res.end(req.method==='HEAD'?undefined:isHealth?health:'{"status":"maintenance"}');
 });
 return server.listen(port,host,()=>{if(container&&containerVersion)record('preview_maintenance_listening');});
}
