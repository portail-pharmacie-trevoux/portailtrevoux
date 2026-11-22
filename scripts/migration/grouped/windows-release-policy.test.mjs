import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import test from 'node:test';
import {approvedPlanDigest,approvedTargetDigest,productionTrustKeys,validateWindowsRelease} from './windows-release-policy.mjs';
import {canonical,hash} from './model.mjs';

test('signed freeze, restoration and independent final approval bind the exact Windows lot',()=>{
 const platform=generateKeyPairSync('ed25519'),operator=generateKeyPairSync('ed25519');
 const keys=Object.fromEntries(Object.entries({platform,operator}).map(([role,key])=>[
  role,key.publicKey.export({type:'spki',format:'pem'})]));
 const now=Date.now(),past=new Date(now-1000).toISOString(),expiresAt=new Date(now+60000).toISOString();
 const revision='a'.repeat(40),generation='synthetic-generation';
 const manifest={mode:'preserve-scalingo-v1',planDigest:approvedPlanDigest,targetDigest:approvedTargetDigest,
  sourceDigest:'b'.repeat(64),inserts:1047,updates:0,deletes:0,ledgerInserts:1};
 const backup={reference:'fixture-backup',restorationReference:'fixture-restore',restoredTargetDigest:approvedTargetDigest,
  isolatedRestoreVerified:true,completedAt:past,restoredAt:past};
 const inventory={app:'portailplus-hds',generation,observedAt:past,web:['fixture-web-1','fixture-web-2']};
 const probes=inventory.web.map((containerId,i)=>({containerId,observedAt:past,healthStatus:200,
  health:{status:'maintenance',generation,bootId:'fixture-boot-'+i},applicationGetStatus:503,applicationPostStatus:503}));
 const drain={app:inventory.app,generation,observedAt:past,reference:'fixture-drain',previousProcessesDrained:true,
  otherWritersStopped:true,schedulersStopped:true,notificationsStopped:true,ingressStopped:true,inFlightTasks:0,automaticResume:false};
 const freezeLease={reference:'fixture-lease',generation,expiresAt,enforced:true};
 const payload={revision,manifest,backup,maintenance:{inventory,probes,drain,reference:'fixture-pause'},freezeLease};
 const binding=hash({revision,manifest,backup,generation,leaseReference:freezeLease.reference,
  web:probes.map(p=>({containerId:p.containerId,bootId:p.health.bootId}))});
 const signed=(role,payload,key)=>({payload,signature:sign(null,Buffer.from(canonical({role,payload})),key.privateKey).toString('base64')});
 const approval=signed('operator',{approved:true,binding,reference:'fixture-operator',approvedAt:past,expiresAt},operator);
 const verify=(value=payload,other=approval,at=now)=>validateWindowsRelease({
  evidence:signed('platform',value,platform),approval:other,revision,keys},at);
 assert.equal(verify().manifest.inserts,1047);
 assert.throws(()=>verify({...payload,backup:{...backup,restoredTargetDigest:'0'.repeat(64)}}),{code:'WINDOWS_BACKUP_RESTORE_PROOF_REQUIRED'});
 assert.throws(()=>verify({...payload,manifest:{...manifest,planDigest:'0'.repeat(64)}}),{code:'WINDOWS_REVIEWED_LOT_MISMATCH'});
 assert.throws(()=>verify({...payload,freezeLease:{...freezeLease,enforced:false}}),{code:'WINDOWS_ENFORCED_FREEZE_LEASE_REQUIRED'});
 assert.throws(()=>verify(payload,{...approval,payload:{...approval.payload,reference:'tampered'}}),{code:'WINDOWS_RELEASE_SIGNATURE_INVALID'});
 assert.throws(()=>verify(payload,approval,now+60001),{code:'WINDOWS_ENFORCED_FREEZE_LEASE_REQUIRED'});
 const wrong=signed('operator',{...approval.payload,binding:'0'.repeat(64)},operator);
 assert.throws(()=>verify(payload,wrong),{code:'WINDOWS_DISTINCT_FINAL_AUTHORIZATION_REQUIRED'});
});

test('published trust anchors remain unconfigured and fail closed',()=>{
 assert.deepEqual(productionTrustKeys,{platform:null,operator:null});
 assert.throws(()=>validateWindowsRelease({}),{code:'WINDOWS_PRODUCTION_TRUST_NOT_CONFIGURED'});
});
