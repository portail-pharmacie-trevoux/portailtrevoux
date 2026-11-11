// Separate from run.mjs. This release has NO activation flag and NO real execution path.
import {pathToFileURL} from 'node:url';
import {hash,fail} from './model.mjs';
import {applyGrouped,sourceSnapshot,targetSnapshot,guard} from './database.mjs';
import {executionCodeDigest,reviewSecureExecution,requireFinalAuthorization,requirePaused} from './execution-policy.mjs';
export const REAL_EXECUTION_ENABLED=false;
export async function executeSecureGrouped(){throw fail('REAL_EXECUTION_RELEASE_LOCKED',{dataWrites:0});}
export const executionReceiptKey=reference=>'migration:secure-execution:v1:'+hash(reference);
function parseReceipt(value,reference){
 let receipt;try{receipt=JSON.parse(value);}catch{throw fail('EXECUTION_RECEIPT_CORRUPT');}
 const {receiptDigest,...body}=receipt||{};
 if(receipt?.event!=='execution_committed'||receipt.authorizationReference!==reference||receipt.accountsUpdated!==0||receipt.outboundNotifications!==0||receipt.version!==1||receiptDigest!==hash(body)||receipt.automaticResume!==false||receipt.pauseConfirmedBeforeCommit!==true||['sourceDigest','targetBeforeDigest','targetAfterDigest','decisionsDigest','identityDigest','codeDigest','ledgerDigest','batchDigest'].some(k=>!(/^[a-f0-9]{64}$/.test(receipt[k]||'')))||!Number.isSafeInteger(receipt.totalInserted)||receipt.totalInserted<0||!Number.isSafeInteger(receipt.totalUpdated)||receipt.totalUpdated<0)throw fail('EXECUTION_RECEIPT_CORRUPT');
 return receipt;
}
// Missing receipt is never proof of rollback. This inspection always uses READ ONLY.
export async function readExecutionReceipt(pool,reference){
 const c=await pool.connect();try{await c.query('BEGIN READ ONLY');await guard(c,'portailplus_7495',true);const row=(await c.query('SELECT value FROM public.settings WHERE key=$1',[executionReceiptKey(reference)])).rows[0];return row?{state:'COMMIT_RECORDED',receipt:parseReceipt(row.value,reference),executionAllowed:false}:{state:'NO_COMMIT_RECEIPT',rollbackProven:false,executionAllowed:false};}finally{await c.query('ROLLBACK').catch(()=>{});c.release();}
}
async function fixturePool(pool){
 if(!pool||pool.options?.host!=='127.0.0.1'||pool.options?.ssl?.rejectUnauthorized!==true||pool.options?.connectionString)throw fail('ISOLATED_SYNTHETIC_CLUSTER_REQUIRED');
 const c=await pool.connect();try{await c.query('BEGIN READ ONLY');if((await c.query('SHOW cluster_name')).rows[0].cluster_name!=='portailplus-grouped-synthetic'||(await c.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl!==true)throw fail('ISOLATED_SYNTHETIC_CLUSTER_REQUIRED');}finally{await c.query('ROLLBACK').catch(()=>{});c.release();}
}
// The only test entry requires two TLS loopback pools and a positive cluster marker.
// It cannot enable the permanently locked production entry above.
export async function executeIsolatedFixture(options){
 await fixturePool(options.sourcePool);await fixturePool(options.targetPool);
 return executeCore(options);
}
async function executeCore({sourcePool,targetPool,source,target,decisions,proofs,authorization,quiescence,beforeCommit}){
 if(!Number.isInteger(targetPool.options?.max)||targetPool.options.max<2)throw fail('EXECUTOR_POOL_REQUIRES_TWO_CONNECTIONS');
 const batch=structuredClone({source,target,decisions,proofs,authorization});
 const codeDigest=await executionCodeDigest();
 const review=reviewSecureExecution({...batch,codeDigest});requireFinalAuthorization(batch.authorization,review,batch.proofs);
 if(typeof quiescence?.verifyPaused!=='function')throw fail('EXTERNAL_PAUSE_CONTROLLER_REQUIRED');
 const pauseCheck=async()=>{const status=requirePaused(await quiescence.verifyPaused());if(status.reference!==batch.proofs.pause.reference||status.generation!==batch.proofs.pause.generation)throw fail('QUIESCENCE_GENERATION_CHANGED');};
 const c=await targetPool.connect(),locks=[];let receipt,started=false;
 try{
  for(const id of [1,2]){if(!(await c.query('SELECT pg_try_advisory_lock(20261028,$1) AS acquired',[id])).rows[0].acquired)throw fail('SCHEDULER_OR_STARTUP_BUSY');locks.push(id);}
  await pauseCheck();
  const old=(await c.query('SELECT value FROM public.settings WHERE key=$1',[executionReceiptKey(batch.authorization.reference)])).rows[0];
  if(old){const previous=parseReceipt(old.value,batch.authorization.reference);if(previous.batchDigest!==review.batchDigest)throw fail('AUTHORIZATION_ALREADY_USED_FOR_OTHER_BATCH');return {...previous,replayed:true,commitConfirmed:true,automaticResume:false};}
  if((await sourceSnapshot(sourcePool)).digest!==batch.source.digest)throw fail('SOURCE_CHANGED_SINCE_AUDIT');
  if((await targetSnapshot(targetPool)).digest!==batch.target.digest)throw fail('DESTINATION_CHANGED_SINCE_AUDIT');
  // Repeat all policy checks under engine table locks, including expiries and pause state.
  started=true;
  const result=await applyGrouped({source:batch.source,pool:targetPool,decisions:batch.decisions,approval:{approved:true,reference:batch.authorization.reference,backupReference:batch.proofs.backup.reference,sourceDigest:review.sourceDigest,targetDigest:review.targetDigest,decisionsDigest:review.decisionsDigest},beforeWrite:async(client,lockedTarget)=>{
   if(await executionCodeDigest()!==codeDigest)throw fail('EXECUTION_CODE_CHANGED');
   reviewSecureExecution({...batch,target:lockedTarget,codeDigest});requireFinalAuthorization(batch.authorization,review,batch.proofs);await pauseCheck();
   if((await client.query('SELECT 1 FROM public.settings WHERE key=$1',[executionReceiptKey(batch.authorization.reference)])).rowCount)throw fail('AUTHORIZATION_ALREADY_USED_FOR_OTHER_BATCH');
  },beforeCommit:async(result,client)=>{
   await pauseCheck();requireFinalAuthorization(batch.authorization,review,batch.proofs);
   const body={event:'execution_committed',version:1,batchDigest:review.batchDigest,sourceDigest:review.sourceDigest,targetBeforeDigest:review.targetDigest,targetAfterDigest:result.targetAfterDigest,decisionsDigest:review.decisionsDigest,identityDigest:review.identityDigest,codeDigest,ledgerDigest:result.ledgerDigest,authorizationReference:batch.authorization.reference,backupReference:batch.proofs.backup.reference,restorationReference:batch.proofs.backup.restorationReference,pauseReference:batch.proofs.pause.reference,pauseConfirmedBeforeCommit:true,automaticResume:false,accountsUpdated:result.accountsUpdated,outboundNotifications:result.outboundNotifications,totalInserted:result.totalInserted,totalUpdated:result.totalUpdated};
   receipt={...body,receiptDigest:hash(body)};
   // This row becomes visible atomically with business data; nothing is emitted pre-COMMIT.
   await client.query('INSERT INTO public.settings(key,value) VALUES($1,$2)',[executionReceiptKey(batch.authorization.reference),JSON.stringify(receipt)]);
   if(beforeCommit)await beforeCommit(); // Synthetic fault injection after the atomic receipt insert.
  }});
  let pauseAfterCommit='confirmed';try{await pauseCheck();}catch{pauseAfterCommit='UNKNOWN_REQUIRES_OPERATOR';}
  return {...receipt,commitConfirmed:result.committed===true,observedAfterCommitAt:new Date().toISOString(),pauseAfterCommit,replayed:false,automaticResume:false};
 }catch(error){
  const state=error.migrationTransactionState||(started?'UNKNOWN':'NOT_STARTED');
  throw Object.assign(fail(/^[A-Z_0-9]+$/.test(error.code||'')?error.code:'SECURE_EXECUTION_FAILED'),{commitState:state,receiptKey:executionReceiptKey(batch.authorization.reference),neverRetryAutomatically:true});
 }finally{
  // Releasing DB mutexes never resumes workers, ingress, mail or notifications.
  let broken=false;for(const id of locks.reverse())try{await c.query('SELECT pg_advisory_unlock(20261028,$1)',[id]);}catch{broken=true;}
  c.release(broken);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 console.log(JSON.stringify({event:'blocked',code:'REAL_EXECUTION_RELEASE_LOCKED',dataWrites:0,executionEnabled:false}));process.exitCode=1;
}
