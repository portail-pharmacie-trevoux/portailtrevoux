import assert from 'node:assert/strict';
import test from 'node:test';
import {preparationReport} from './prepare-preservation.mjs';

test('offline preparation fails closed with specific missing evidence',()=>{
 const report=preparationReport({});
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.productionDataWrites,0);
 assert.ok(report.reasons.includes('MATCHING_INSERT_ONLY_PREVIEW_REQUIRED'));
 assert.ok(report.reasons.includes('TWO_REPLICAS_AND_INDEPENDENT_DRAIN_EVIDENCE_REQUIRED'));
 assert.ok(report.reasons.includes('FRESH_BACKUP_AND_MATCHING_ISOLATED_RESTORE_REQUIRED'));
});
test('a consistent insert-only preview is counted but cannot enable execution',()=>{
 const digest='a'.repeat(64);
 const preview={ready:true,dataWrites:0,executionLocked:true,preserveExistingScalingoData:true,
  identities:{mapped:18},conflicts:{},sourceDigest:digest,targetDigest:digest,plannedWrites:{inserts:1047},
  reviewedPlan:{mode:'preserve-scalingo-v1',planDigest:digest,sourceDigest:digest,targetDigest:digest,
   inserts:1047,updates:0,deletes:0,ledgerInserts:1}};
 const report=preparationReport({preview,observedAt:new Date().toISOString()});
 assert.equal(report.plannedWrites.inserts,1047);
 assert.equal(report.executionEnabled,false);
 assert.equal(report.status,'BLOCKED');
 assert.equal(preparationReport({preview:{...preview,reviewedPlan:{...preview.reviewedPlan,deletes:1}}}).plannedWrites,null);
});
