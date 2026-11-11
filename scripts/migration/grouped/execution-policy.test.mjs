import test from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {hash} from './model.mjs';
import {syntheticSnapshots,syntheticEvidence} from './execution-test-fixture.mjs';
import {reviewSecureExecution,requireFinalAuthorization} from './execution-policy.mjs';
import {executeSecureGrouped,executeIsolatedFixture,REAL_EXECUTION_ENABLED} from './secure-executor.mjs';
const fresh=()=>syntheticEvidence(...Object.values(syntheticSnapshots()));
function refused(change,code){const f=fresh();change(f);assert.throws(()=>reviewSecureExecution(f),e=>e.code===code);}
test('Complete review remains non-executable and requires a distinct final approval',()=>{
 const f=fresh();assert.equal(f.review.executionEnabled,false);assert.doesNotThrow(()=>requireFinalAuthorization(f.authorization,f.review,f.proofs,f.now));assert.throws(()=>requireFinalAuthorization(null,f.review,f.proofs,f.now),/DISTINCT_FINAL/);
});
test('Missing, unverified, wrong-snapshot backup or missing restoration reference refuses',()=>{
 for(const mutate of [f=>delete f.proofs.backup,f=>f.proofs.backup.verified=false,f=>delete f.proofs.backup.restorationReference,f=>f.proofs.backup.targetDigest='b'.repeat(64)])refused(mutate,'VERIFIED_BACKUP_AND_RESTORATION_REQUIRED');
});
test('Stale or future backup refuses',()=>{
 for(const delta of [-25*60*60_000,1000])refused(f=>f.proofs.backup.completedAt=new Date(f.now+delta).toISOString(),'STALE_BACKUP');
});
test('Stale, conflicting, wrong-code or mismatched audit refuses',()=>{
 refused(f=>f.proofs.audit.snapshotAt=new Date(f.now-16*60_000).toISOString(),'STALE_AUDIT');
 for(const mutate of [f=>f.proofs.audit.issues.push({code:'TEST'}),f=>f.proofs.audit.ready=false,f=>f.proofs.audit.codeDigest='b'.repeat(64),f=>f.proofs.audit.targetDigest='b'.repeat(64),f=>f.proofs.audit.executionLocked=false])refused(mutate,'MATCHING_CONFLICT_FREE_AUDIT_REQUIRED');
});
test('Corrupted snapshots and changed identity approvals refuse',()=>{
 refused(f=>f.source.users[0].first_name='Altered','SNAPSHOT_INTEGRITY_FAILED');refused(f=>f.target.digest='b'.repeat(64),'SNAPSHOT_INTEGRITY_FAILED');refused(f=>f.proofs.identities.mappingDigest='b'.repeat(64),'VERIFIED_IDENTITY_MAPPING_REQUIRED');
});
test('Each of the four archival decisions is individually mandatory',()=>{
 for(const key of Object.keys(fresh().decisions)){const f=fresh();delete f.decisions[key];f.proofs.audit.decisionsDigest=hash(f.decisions);assert.throws(()=>reviewSecureExecution(f),/FOUR_EXPLICIT_MERGE_DECISIONS_REQUIRED/);}
});
test('Every external pause condition is mandatory and automatic resumption is forbidden',()=>{
 for(const key of ['schedulersStopped','notificationsStopped','ingressStopped'])refused(f=>f.proofs.pause[key]=false,'VERIFIED_QUIESCENCE_REQUIRED');refused(f=>f.proofs.pause.inFlightTasks=1,'VERIFIED_QUIESCENCE_REQUIRED');refused(f=>f.proofs.pause.automaticResume=true,'VERIFIED_QUIESCENCE_REQUIRED');refused(f=>f.proofs.pause.observedAt=new Date(f.now-6*60_000).toISOString(),'STALE_QUIESCENCE');
});
test('Final approval cannot reuse audit approval, target another batch, expire or authorize a broad scope',()=>{
 for(const mutate of [f=>f.authorization.reference=f.proofs.audit.reference,f=>f.authorization.batchDigest='b'.repeat(64),f=>f.authorization.scope='all-batches']){const f=fresh();mutate(f);assert.throws(()=>requireFinalAuthorization(f.authorization,f.review,f.proofs,f.now),/DISTINCT_FINAL/);}
 const f=fresh();f.authorization.expiresAt=new Date(f.now-1).toISOString();assert.throws(()=>requireFinalAuthorization(f.authorization,f.review,f.proofs,f.now),/EXPIRED/);
});
test('Real executor refuses before any DB or pause controller access regardless of activation flags',async()=>{
 let touched=0;assert.equal(REAL_EXECUTION_ENABLED,false);await assert.rejects(executeSecureGrouped({enabled:true,approved:true,pool:{connect(){touched++;}},quiescence:{verifyPaused(){touched++;}}}),/REAL_EXECUTION_RELEASE_LOCKED/);assert.equal(touched,0);
});
test('Test-only executor rejects non-loopback targets before connecting',async()=>{
 let touched=0;await assert.rejects(executeIsolatedFixture({sourcePool:{options:{host:'external.invalid'},connect(){touched++;}}}),/ISOLATED_SYNTHETIC/);assert.equal(touched,0);
});
test('Direct executable invocation is always locked, with no credential or database access',()=>{
 const result=spawnSync(process.execPath,[new URL('./secure-executor.mjs',import.meta.url).pathname],{encoding:'utf8'});assert.equal(result.status,1);assert.deepEqual(JSON.parse(result.stdout),{event:'blocked',code:'REAL_EXECUTION_RELEASE_LOCKED',dataWrites:0,executionEnabled:false});
});

test('Missing commit receipt alone never authorizes a new execution',()=>{
 refused(f=>delete f.proofs.previousAttempt,'PREVIOUS_EXECUTION_REVIEW_REQUIRED');refused(f=>f.proofs.previousAttempt.outcome='NO_COMMIT_RECEIPT','PREVIOUS_EXECUTION_REVIEW_REQUIRED');
});
