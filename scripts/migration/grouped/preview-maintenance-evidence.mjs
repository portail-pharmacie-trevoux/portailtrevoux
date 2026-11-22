import {requirePaused} from './execution-policy.mjs';
import {fail} from './model.mjs';

const maxAge=5*60_000;

function fresh(at,now){
 const time=Date.parse(at);
 return typeof at==='string'&&Number.isFinite(time)&&time<=now&&now-time<maxAge;
}
function ref(value){return typeof value==='string'&&value.trim().length>=8;}

// Inputs must come from authenticated, direct platform inventory/probes and an
// independent operator observation. This function does not establish provenance.
export function buildPreviewPauseReceipt({inventory,probes,drain,reference},now=Date.now()){
 const generation=inventory?.generation;
 if(inventory?.app!=='portailplus-hds'||!ref(generation)||!ref(reference)||
    !fresh(inventory.observedAt,now)||!Array.isArray(inventory.web)||inventory.web.length!==2||
    inventory.web.some(id=>!ref(id))||new Set(inventory.web).size!==2||
    !Array.isArray(probes)||probes.length!==2||new Set(probes.map(p=>p?.containerId)).size!==2||
    new Set(probes.map(p=>p?.health?.bootId)).size!==2)
  throw fail('TWO_DISTINCT_MAINTENANCE_REPLICAS_REQUIRED');
 for(const p of probes){
  if(!p||!inventory.web.includes(p.containerId)||!fresh(p.observedAt,now)||p.healthStatus!==200||
     p.health?.status!=='maintenance'||p.health.generation!==generation||!ref(p.health.bootId)||
     p.applicationGetStatus!==503||p.applicationPostStatus!==503)
   throw fail('MAINTENANCE_REPLICA_NOT_VERIFIED');
 }
 if(drain?.app!==inventory.app||drain.generation!==generation||!ref(drain.reference)||
    !fresh(drain.observedAt,now)||Date.parse(drain.observedAt)<Math.max(...probes.map(p=>Date.parse(p.observedAt)),Date.parse(inventory.observedAt))||
    drain.previousProcessesDrained!==true||drain.otherWritersStopped!==true||
    drain.schedulersStopped!==true||drain.notificationsStopped!==true||drain.ingressStopped!==true||
    drain.inFlightTasks!==0||drain.automaticResume!==false)
  throw fail('INDEPENDENT_MAINTENANCE_DRAIN_NOT_VERIFIED');
 const observedAt=[inventory.observedAt,...probes.map(p=>p.observedAt),drain.observedAt]
  .sort((a,b)=>Date.parse(a)-Date.parse(b))[0];
 return requirePaused({reference,generation,observedAt,schedulersStopped:true,notificationsStopped:true,
  ingressStopped:true,inFlightTasks:0,automaticResume:false},now);
}
