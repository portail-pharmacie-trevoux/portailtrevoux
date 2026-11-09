// Migration execution preflight. This module deliberately has no database write path.
// It is intended to be reviewed before any separate execution release.
import {hash,fail,makePlan} from './model.mjs';
import {reviewSchema,summarize} from './database.mjs';

export function prepareExecution({source,target,decisions,backupReceipt,operatorApproval}){
 if(!backupReceipt||typeof backupReceipt!=='object'||backupReceipt.verified!==true||
    typeof backupReceipt.reference!=='string'||backupReceipt.reference.trim().length<8||
    typeof backupReceipt.completedAt!=='string'||!Number.isFinite(Date.parse(backupReceipt.completedAt)))
    throw fail('VERIFIED_TARGET_BACKUP_REQUIRED');
 if(!operatorApproval||operatorApproval.approved!==true||
    typeof operatorApproval.reference!=='string'||operatorApproval.reference.trim().length<8)
    throw fail('EXPLICIT_OPERATOR_APPROVAL_REQUIRED');
 if(!source?.digest||!target?.digest)throw fail('FRESH_SOURCE_AND_TARGET_SNAPSHOTS_REQUIRED');
 if(!decisions||decisions.publicationConflicts!=='preserve-both'||
    decisions.readHistory!=='preserve-target-archive-source'||
    decisions.planningConflicts!=='preserve-target-archive-source'||
    decisions.orphanTemplates!=='archive-source-unmapped')
    throw fail('FOUR_EXPLICIT_MERGE_DECISIONS_REQUIRED');
 const plan=makePlan(source,target,decisions);
 plan.issues.push(...reviewSchema(source,target));
 if(plan.issues.length)throw fail('PREFLIGHT_CONFLICTS',{count:plan.issues.length});
 const archives=Object.values(plan.nextLedger.planningArchives||{});
 const weeks=archives.filter(a=>a.table==='schedule_weeks');
 const templates=archives.filter(a=>a.table==='schedule_templates');
 if(!weeks.some(a=>a.sourceKey==='["2026-11-02"]')||
    !['["1"]','["2"]'].every(k=>templates.some(a=>a.sourceKey===k)))
    throw fail('EXPECTED_PLANNING_ARCHIVES_NOT_VERIFIED');
 for(const a of archives)if(!a.source||a.sourceHash!==hash(a.source))
    throw fail('ARCHIVE_INTEGRITY_FAILED');
 if(JSON.stringify(plan.nextLedger).length>2*1024*1024)
    throw fail('ARCHIVE_LEDGER_SIZE_REQUIRES_REVIEW');
 const approval={
   approved:true,reference:operatorApproval.reference,
   backupReference:backupReceipt.reference,
   sourceDigest:source.digest,targetDigest:target.digest,
   decisionsDigest:hash(decisions)
 };
 return {readyForSeparateExecutionReview:true,executionEnabled:false,
   dataWrites:0,sourceDigest:source.digest,targetDigest:target.digest,
   decisionsDigest:approval.decisionsDigest,
   backupReference:backupReceipt.reference,approvalReference:operatorApproval.reference,
   archiveCounts:{weeks:weeks.length,templates:templates.length},
   summary:summarize(plan),approval};
}
