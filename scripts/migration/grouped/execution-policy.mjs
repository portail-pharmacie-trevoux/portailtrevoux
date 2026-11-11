// Evidence validation only. No network, environment credentials or writes.
import {readFile} from 'node:fs/promises';
import {hash,fail,makePlan} from './model.mjs';
import {prepareExecution} from './execution-preflight.mjs';
export const executionFiles=['model.mjs','database.mjs','diagnostics.mjs','execution-preflight.mjs','execution-policy.mjs','secure-executor.mjs','run.mjs'];
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const reference=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{8,160}$/.test(v);
export const snapshotDigest=s=>{const copy={...s};delete copy.digest;return hash(copy);};
export async function executionCodeDigest(){
 const checks=JSON.parse(await readFile(new URL('./checksums.json',import.meta.url),'utf8'));
 for(const [name,expected]of Object.entries(checks)){
  if(!/^[a-zA-Z0-9_.-]+$/.test(name)||hash(await readFile(new URL('./'+name,import.meta.url)))!==expected)throw fail('EXECUTION_CODE_INTEGRITY_FAILED');
 }
 const files={};for(const name of executionFiles)files[name]=hash(await readFile(new URL('./'+name,import.meta.url)));
 return hash(files);
}
export function identityMappingDigest(source,target,decisions){
 const plan=makePlan(source,target,decisions);
 return hash({mapping:plan.maps.users,source:source.users,target:target.users});
}
function fresh(value,age,now,code){const time=Date.parse(value);if(typeof value!=='string'||!Number.isFinite(time)||time>now||now-time>age)throw fail(code);return time;}
export function requirePaused(receipt,now=Date.now()){
 if(!receipt||!reference(receipt.reference)||!reference(receipt.generation)||receipt.schedulersStopped!==true||receipt.notificationsStopped!==true||receipt.ingressStopped!==true||receipt.inFlightTasks!==0||receipt.automaticResume!==false)throw fail('VERIFIED_QUIESCENCE_REQUIRED');
 fresh(receipt.observedAt,5*60_000,now,'STALE_QUIESCENCE');
 return receipt;
}
export function reviewSecureExecution({source,target,decisions,proofs,codeDigest,now=Date.now()}){
 if(!source||!target||!hex(source.digest)||!hex(target.digest)||snapshotDigest(source)!==source.digest||snapshotDigest(target)!==target.digest)throw fail('SNAPSHOT_INTEGRITY_FAILED');
 if(!hex(codeDigest))throw fail('EXECUTION_CODE_INTEGRITY_FAILED');
 const {backup,audit,identities,pause,previousAttempt}=proofs||{};
 if(!backup||backup.verified!==true||!reference(backup.reference)||!reference(backup.restorationReference)||backup.targetDigest!==target.digest)throw fail('VERIFIED_BACKUP_AND_RESTORATION_REQUIRED');
 const completed=fresh(backup.completedAt,24*60*60_000,now,'STALE_BACKUP');
 if(fresh(backup.verifiedAt,24*60*60_000,now,'STALE_BACKUP')<completed)throw fail('STALE_BACKUP');
 if(!previousAttempt||previousAttempt.reviewed!==true||!reference(previousAttempt.reference)||previousAttempt.targetDigest!==target.digest||!['NO_PRIOR_EXECUTION_CONFIRMED','PRIOR_COMMIT_VERIFIED'].includes(previousAttempt.outcome))throw fail('PREVIOUS_EXECUTION_REVIEW_REQUIRED');
 const identityDigest=identityMappingDigest(source,target,decisions);
 if(!identities||identities.verified!==true||!reference(identities.reference)||identities.mappingDigest!==identityDigest)throw fail('VERIFIED_IDENTITY_MAPPING_REQUIRED');
 if(!audit||!reference(audit.reference)||audit.ready!==true||!Array.isArray(audit.issues)||audit.issues.length!==0||audit.sourceDigest!==source.digest||audit.targetDigest!==target.digest||audit.decisionsDigest!==hash(decisions)||audit.identityDigest!==identityDigest||audit.codeDigest!==codeDigest||audit.dataWrites!==0||audit.executionLocked!==true)throw fail('MATCHING_CONFLICT_FREE_AUDIT_REQUIRED');
 const audited=fresh(audit.snapshotAt,15*60_000,now,'STALE_AUDIT');
 if(audited<completed)throw fail('AUDIT_PREDATES_BACKUP');
 requirePaused(pause,now);
 const preflight=prepareExecution({source,target,decisions,backupReceipt:backup,operatorApproval:{approved:true,reference:'review-only-no-execution'}});
 // Preflight approval is deliberately not an execution authorization and is not returned.
 const evidence={version:1,sourceDigest:source.digest,targetDigest:target.digest,decisionsDigest:hash(decisions),identityDigest,codeDigest,proofs};
 return {batchDigest:hash(evidence),sourceDigest:source.digest,targetDigest:target.digest,decisionsDigest:hash(decisions),identityDigest,codeDigest,archiveCounts:preflight.archiveCounts,executionEnabled:false};
}
export function requireFinalAuthorization(authorization,review,proofs,now=Date.now()){
 if(!authorization||authorization.approved!==true||authorization.scope!=='one-grouped-batch'||!reference(authorization.reference)||authorization.batchDigest!==review.batchDigest||[proofs.backup.reference,proofs.audit.reference,proofs.identities.reference,proofs.pause.reference,proofs.previousAttempt.reference].includes(authorization.reference))throw fail('DISTINCT_FINAL_HUMAN_AUTHORIZATION_REQUIRED');
 const issued=fresh(authorization.approvedAt,15*60_000,now,'EXPIRED_FINAL_AUTHORIZATION'),expires=Date.parse(authorization.expiresAt);
 if(!Number.isFinite(expires)||expires<=now||expires<=issued||expires-issued>15*60_000||issued<Date.parse(proofs.audit.snapshotAt)||issued<Date.parse(proofs.pause.observedAt))throw fail('EXPIRED_FINAL_AUTHORIZATION');
}
