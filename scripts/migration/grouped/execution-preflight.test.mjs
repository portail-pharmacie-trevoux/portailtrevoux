import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareExecution} from './execution-preflight.mjs';

const base={
 source:{digest:'source-test'},target:{digest:'target-test'},
 decisions:{publicationConflicts:'preserve-both',readHistory:'preserve-target-archive-source',planningConflicts:'preserve-target-archive-source',orphanTemplates:'archive-source-unmapped'},
 backupReceipt:{verified:true,reference:'backup-test-2026',completedAt:'2026-11-09T15:06:00Z'},
 operatorApproval:{approved:true,reference:'approval-test-only'}
};
function blocked(changes,expected){
 assert.throws(()=>prepareExecution({...base,...changes}),e=>e.code===expected);
}
test('fail closed without verified backup',()=>{
 blocked({backupReceipt:null},'VERIFIED_TARGET_BACKUP_REQUIRED');
 blocked({backupReceipt:{...base.backupReceipt,reference:'   '}},'VERIFIED_TARGET_BACKUP_REQUIRED');
 blocked({backupReceipt:{...base.backupReceipt,verified:'true'}},'VERIFIED_TARGET_BACKUP_REQUIRED');
 blocked({backupReceipt:{...base.backupReceipt,verified:false}},'VERIFIED_TARGET_BACKUP_REQUIRED');
 blocked({backupReceipt:{...base.backupReceipt,completedAt:'invalid'}},'VERIFIED_TARGET_BACKUP_REQUIRED');
});
test('fail closed without explicit operator authorization',()=>{
 blocked({operatorApproval:null},'EXPLICIT_OPERATOR_APPROVAL_REQUIRED');
 blocked({operatorApproval:{...base.operatorApproval,approved:false}},'EXPLICIT_OPERATOR_APPROVAL_REQUIRED');
});
test('fail closed without snapshots or all decisions',()=>{
 blocked({source:{}},'FRESH_SOURCE_AND_TARGET_SNAPSHOTS_REQUIRED');
 blocked({decisions:{...base.decisions,orphanTemplates:undefined}},'FOUR_EXPLICIT_MERGE_DECISIONS_REQUIRED');
});
test('audit-only launcher remains locked and no migration is run by this test',()=>{
 const run=readFileSync(new URL('./run.mjs',import.meta.url),'utf8');
 assert.match(run,/runtime\.mode\s*!==\s*'audit'/);
 assert.match(run,/AUDIT_ONLY_RELEASE_EXECUTION_LOCKED/);
 assert.doesNotMatch(run,/applyGrouped\s*\(/);
});
