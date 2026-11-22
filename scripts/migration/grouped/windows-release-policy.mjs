import {createPublicKey,verify} from 'node:crypto';
import {buildPreviewPauseReceipt} from './preview-maintenance-evidence.mjs';
import {canonical,fail,hash} from './model.mjs';

export const approvedPlanDigest='39d94b4e061504b471e80e5f35cecffa2ad016d95e2407a777ec0f52c8464dff';
export const approvedTargetDigest='1fdd4461a3f62549cd1b180345b72f924ce059c80f25ac6ea82a3c9c9515e371';
// Populated only in a separately reviewed production release. No CLI or environment override.
export const productionTrustKeys=Object.freeze({platform:null,operator:null});
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const ref=value=>typeof value==='string'&&/^[a-zA-Z0-9_.:-]{8,160}$/.test(value);
const fresh=(value,now,age)=>typeof value==='string'&&Date.parse(value)<=now&&Date.parse(value)>now-age;

export function verifyPlatformEnvelope(envelope,key,role){
 if(!key)throw fail('WINDOWS_PRODUCTION_TRUST_NOT_CONFIGURED');
 let ok=false;
 try {
  const publicKey=createPublicKey(key);
  ok=publicKey.asymmetricKeyType==='ed25519'&&typeof envelope?.signature==='string'&&
   verify(null,Buffer.from(canonical({role,payload:envelope.payload})),publicKey,Buffer.from(envelope.signature,'base64'));
 }catch{}
 if(!ok)throw fail('WINDOWS_RELEASE_SIGNATURE_INVALID');
 return envelope.payload;
}

export function validateWindowsRelease({evidence,approval,revision,keys=productionTrustKeys},now=Date.now()){
 const platform=verifyPlatformEnvelope(evidence,keys.platform,'platform');
 const operator=verifyPlatformEnvelope(approval,keys.operator,'operator');
 const platformKey=createPublicKey(keys.platform).export({type:'spki',format:'der'});
 const operatorKey=createPublicKey(keys.operator).export({type:'spki',format:'der'});
 if(platformKey.equals(operatorKey))throw fail('DISTINCT_OPERATOR_TRUST_REQUIRED');
 const {manifest,backup,maintenance}=platform;
 if(!/^[a-f0-9]{40}$/.test(revision||'')||platform.revision!==revision||
    manifest?.mode!=='preserve-scalingo-v1'||manifest.planDigest!==approvedPlanDigest||
    manifest.targetDigest!==approvedTargetDigest||!sha(manifest.sourceDigest)||
    manifest.inserts!==1047||manifest.updates!==0||manifest.deletes!==0||manifest.ledgerInserts!==1)
  throw fail('WINDOWS_REVIEWED_LOT_MISMATCH');
 if(!ref(backup?.reference)||!ref(backup.restorationReference)||backup.reference===backup.restorationReference||
    backup.restoredTargetDigest!==manifest.targetDigest||backup.isolatedRestoreVerified!==true||
    !fresh(backup.completedAt,now,86400_000)||!fresh(backup.restoredAt,now,86400_000)||
    Date.parse(backup.restoredAt)<Date.parse(backup.completedAt))
  throw fail('WINDOWS_BACKUP_RESTORE_PROOF_REQUIRED');
 const pause=buildPreviewPauseReceipt(maintenance,now);
 const lease=platform.freezeLease,leaseUntil=Date.parse(lease?.expiresAt);
 if(!ref(lease?.reference)||lease.generation!==pause.generation||lease.enforced!==true||
    !Number.isFinite(leaseUntil)||leaseUntil<=now||leaseUntil>now+300_000)
  throw fail('WINDOWS_ENFORCED_FREEZE_LEASE_REQUIRED');
 const web=maintenance.probes.map(p=>({containerId:p.containerId,bootId:p.health.bootId}))
  .sort((a,b)=>a.containerId.localeCompare(b.containerId));
 const binding=hash({revision,manifest,backup,generation:pause.generation,leaseReference:lease.reference,web});
 if(operator?.approved!==true||operator.binding!==binding||!ref(operator.reference)||
    [backup.reference,backup.restorationReference,pause.reference].includes(operator.reference)||
    !fresh(operator.approvedAt,now,900_000)||Date.parse(operator.approvedAt)<Date.parse(backup.restoredAt)||
    Date.parse(operator.expiresAt)<=now||!(Date.parse(operator.expiresAt)<=Date.parse(operator.approvedAt)+900_000))
  throw fail('WINDOWS_DISTINCT_FINAL_AUTHORIZATION_REQUIRED');
 return {binding,manifest,generation:pause.generation,approvalReference:operator.reference,leaseReference:lease.reference,web};
}
