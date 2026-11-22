import {randomBytes} from 'node:crypto';
import {fail} from './model.mjs';
import {verifyPlatformEnvelope} from './windows-release-policy.mjs';

// Pin the authorized service in the reviewed release. It may never be selected by evidence or CLI input.
export const productionFreezeController=null;

export async function verifyLiveFreeze({endpoint,platformKey,release,phase},fetchImpl=fetch){
 if(!endpoint||!platformKey)throw fail('WINDOWS_FREEZE_CONTROLLER_NOT_CONFIGURED');
 let url;
 try{url=new URL(endpoint);}catch{throw fail('WINDOWS_FREEZE_CONTROLLER_NOT_CONFIGURED');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw fail('WINDOWS_FREEZE_CONTROLLER_NOT_CONFIGURED');
 if(!['before-write','before-commit','after-commit'].includes(phase))throw fail('WINDOWS_FREEZE_PHASE_INVALID');
 const nonce=randomBytes(32).toString('hex');
 let envelope;
 try{
  const response=await fetchImpl(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(4000),
   headers:{'content-type':'application/json',accept:'application/json','cache-control':'no-store'},
   body:JSON.stringify({nonce,app:'portailplus-hds',phase,binding:release.binding,leaseReference:release.leaseReference})});
  if(!response.ok||!response.body)throw Error();
  let bytes=0;
  const chunks=[];
  for await(const chunk of response.body){
   bytes+=chunk.length;
   if(bytes>16384)throw Error();
   chunks.push(chunk);
  }
  envelope=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }catch{throw fail('WINDOWS_FREEZE_CONTROLLER_UNAVAILABLE');}
 const state=verifyPlatformEnvelope(envelope,platformKey,'freeze-controller');
 const now=Date.now(),observed=Date.parse(state?.observedAt),expires=Date.parse(state?.expiresAt);
 if(state?.app!=='portailplus-hds'||state.nonce!==nonce||state.phase!==phase||state.binding!==release.binding||
    state.leaseReference!==release.leaseReference||state.generation!==release.generation||
    state.enforced!==true||state.manualReleaseOnly!==true||state.inFlightTasks!==0||
    state.otherWritersStopped!==true||state.schedulersStopped!==true||state.notificationsStopped!==true||
    state.previousProcessesDrained!==true||state.ingressStopped!==true||
    !Number.isFinite(observed)||observed>now||now-observed>15000||
    !Number.isFinite(expires)||expires<now+15000||expires>now+300000||
    !Array.isArray(state.web)||state.web.length!==2)
  throw fail('WINDOWS_LIVE_FREEZE_NOT_VERIFIED');
 for(const expected of release.web){
  const current=state.web.find(web=>web?.containerId===expected.containerId);
  if(!current||current.bootId!==expected.bootId||current.generation!==release.generation||current.status!=='maintenance')
   throw fail('WINDOWS_LIVE_FREEZE_REPLICA_CHANGED');
 }
}
