import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import test from 'node:test';
import {canonical} from './model.mjs';
import {verifyLiveFreeze} from './windows-freeze-controller.mjs';

test('live freeze rejects replay, loss of drain, replica replacement and missing controller',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const release={binding:'a'.repeat(64),generation:'fixture-generation',leaseReference:'fixture-lease',
  web:[{containerId:'web-1',bootId:'fixture-boot-1'},{containerId:'web-2',bootId:'fixture-boot-2'}]};
 const args={endpoint:'https://controller.example.invalid/freeze',platformKey:publicKey.export({type:'spki',format:'pem'}),
  release,phase:'before-commit'};
 const response=(modify=state=>state)=>async(url,request)=>{
  assert.equal(url.toString(),args.endpoint);assert.equal(request.redirect,'error');
  const payload=modify({...JSON.parse(request.body),generation:release.generation,enforced:true,manualReleaseOnly:true,
   inFlightTasks:0,otherWritersStopped:true,schedulersStopped:true,notificationsStopped:true,
   previousProcessesDrained:true,ingressStopped:true,observedAt:new Date().toISOString(),
   expiresAt:new Date(Date.now()+60000).toISOString(),
   web:release.web.map(entry=>({...entry,generation:release.generation,status:'maintenance'}))});
  const signature=sign(null,Buffer.from(canonical({role:'freeze-controller',payload})),privateKey).toString('base64');
  return new Response(JSON.stringify({payload,signature}));
 };
 await verifyLiveFreeze(args,response());
 await assert.rejects(verifyLiveFreeze(args,response(state=>({...state,nonce:'old'}))),{code:'WINDOWS_LIVE_FREEZE_NOT_VERIFIED'});
 await assert.rejects(verifyLiveFreeze(args,response(state=>({...state,inFlightTasks:1}))),{code:'WINDOWS_LIVE_FREEZE_NOT_VERIFIED'});
 await assert.rejects(verifyLiveFreeze(args,response(state=>({...state,manualReleaseOnly:false}))),{code:'WINDOWS_LIVE_FREEZE_NOT_VERIFIED'});
 await assert.rejects(verifyLiveFreeze(args,response(state=>({...state,web:[state.web[0],{...state.web[1],bootId:'replacement'}]}))),{code:'WINDOWS_LIVE_FREEZE_REPLICA_CHANGED'});
 await assert.rejects(verifyLiveFreeze(args,async()=>{throw Error();}),{code:'WINDOWS_FREEZE_CONTROLLER_UNAVAILABLE'});
 await assert.rejects(verifyLiveFreeze({...args,endpoint:null}),{code:'WINDOWS_FREEZE_CONTROLLER_NOT_CONFIGURED'});
});
