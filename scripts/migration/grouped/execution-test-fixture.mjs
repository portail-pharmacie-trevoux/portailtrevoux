// Synthetic metadata only. Never used by a runtime entry.
import {tables,hash} from './model.mjs';
import {identityMappingDigest,reviewSecureExecution} from './execution-policy.mjs';
export const fourDecisions={publicationConflicts:'preserve-both',readHistory:'preserve-target-archive-source',planningConflicts:'preserve-target-archive-source',orphanTemplates:'archive-source-unmapped'};
export function syntheticSnapshots(){
 const pairs=[[3,7],[2,8],[16,9],[17,10],[4,11],[12,12],[13,13],[10,14],[6,15],[8,16],[5,17],[21,18],[9,19],[11,20],[7,21],[20,22],[1,59],[15,60]];
 const blank=()=>({tables:Object.fromEntries(Object.keys(tables).map(k=>[k,[]])),users:[],services:[],settings:[],ledger:null,schema:[],ddl:[]});
 const source=blank(),target=blank();
 for(const [a,b]of pairs){const u={id:a,first_name:'Synthetic-'+a,last_name:'Fixture',email:'synthetic-'+a+'@example.invalid',role:[1,15].includes(a)?'admin':'employee',active:true};source.users.push(u);target.users.push({...u,id:b});}
 source.tables.schedule_weeks=[{week:'2026-11-02',draft:{source:true}}];target.tables.schedule_weeks=[{week:'2026-11-02',draft:{protected:true}}];
 source.tables.schedule_templates=[1,2].map(id=>({id,name:'Synthetic template '+id,content:{'14:0':{userId:14}}}));
 for(const s of [source,target])s.digest=hash(s);return {source,target};
}
export function syntheticEvidence(source,target,codeDigest='a'.repeat(64),now=Date.now()){
 const decisions=structuredClone(fourDecisions),identityDigest=identityMappingDigest(source,target,decisions),iso=offset=>new Date(now+offset).toISOString();
 const proofs={
  previousAttempt:{reviewed:true,reference:'fixture-prior-attempt-review',targetDigest:target.digest,outcome:target.ledger?'PRIOR_COMMIT_VERIFIED':'NO_PRIOR_EXECUTION_CONFIRMED'},
  backup:{verified:true,reference:'fixture-backup-001',restorationReference:'fixture-restore-001',targetDigest:target.digest,completedAt:iso(-5000),verifiedAt:iso(-4000)},
  audit:{reference:'fixture-audit-001',ready:true,issues:[],snapshotAt:iso(-2000),sourceDigest:source.digest,targetDigest:target.digest,decisionsDigest:hash(decisions),identityDigest,codeDigest,dataWrites:0,executionLocked:true},
  identities:{verified:true,reference:'fixture-identities-001',mappingDigest:identityDigest},
  pause:{reference:'fixture-pause-001',generation:'fixture-generation-001',observedAt:iso(-1000),schedulersStopped:true,notificationsStopped:true,ingressStopped:true,inFlightTasks:0,automaticResume:false}
 };
 const review=reviewSecureExecution({source,target,decisions,proofs,codeDigest,now});
 const authorization={approved:true,reference:'fixture-final-authorization-001',scope:'one-grouped-batch',batchDigest:review.batchDigest,approvedAt:iso(0),expiresAt:iso(5*60_000)};
 return {source,target,decisions,proofs,authorization,review,codeDigest,now};
}
