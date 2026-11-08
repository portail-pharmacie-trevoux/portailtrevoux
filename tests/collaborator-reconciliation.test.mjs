import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileCollaborators} from '../scripts/reconcile-collaborator-accounts.mjs';
const inventories=()=>{const source=Array.from({length:16},(_,i)=>({id:i+100,email:`fixture${i}@example.invalid`,firstName:'Fictif',lastName:String(i),role:'employee',active:true,passwordPresent:true,passwordFormatValid:true}));return {source,target:source.map((p,i)=>({...p,id:i+1})),scopeTargetIds:Array.from({length:16},(_,i)=>i+1)};};
test('offline reconciliation: exact emails, separate stable IDs, 16 candidates, no write authorization or mutation',()=>{
 const input=inventories(),before=JSON.stringify(input),r=reconcileCollaborators(input);assert.equal(r.rows.length,16);assert.equal(r.unresolved,0);assert(r.rows.every(r=>r.status==='EMAIL_CANDIDATE'&&r.sourceId!==r.targetId));assert.equal(r.eligibleForDataWrite,false);assert.equal(r.requiresHumanApproval,true);assert.equal(JSON.stringify(input),before);
});
test('collisions include out-of-scope admins; names and identical numeric IDs are never sufficient',()=>{
 const input=inventories();input.target.push({id:99,role:'admin',email:input.target[0].email.toUpperCase()});input.source[1].email=input.source[0].email;input.target[2].email=null;input.source[3].id=4;input.target[3].email='other@example.invalid';
 const r=reconcileCollaborators(input);assert.equal(r.rows[0].status,'CONFLICT');assert.equal(r.rows[1].sourceId,null);assert.equal(r.rows[2].status,'REVIEW_REQUIRED');assert.equal(r.rows[2].sourceId,null);assert.equal(r.rows[3].sourceId,null);assert.equal(r.sourceDuplicateGroups,1);assert.equal(r.targetDuplicateGroups,1);
});
test('strict original email preservation, source compatibility and reviewed mapping constraints',()=>{
 const input=inventories();input.target[0].email=input.source[0].email.toUpperCase();input.source[1].active=false;input.source[2].passwordFormatValid=false;input.source[3].passwordPresent=false;input.source[4].role='admin';
 const r=reconcileCollaborators(input);assert.equal(r.rows[0].status,'REVIEW_REQUIRED');assert.equal(r.rows[0].sourceEmail,input.source[0].email);for(const i of [1,2,3])assert.equal(r.rows[i].status,'REVIEW_REQUIRED');assert.equal(r.rows[4].status,'CONFLICT');
 assert.throws(()=>reconcileCollaborators({...input,scopeTargetIds:[1]}));assert.throws(()=>reconcileCollaborators({...input,reviewedPairs:[{sourceId:105,targetId:6}]}));
});
test('reviewed pairs remain proposals; conflicting or reused source IDs block mapping, no secrets accepted',()=>{
 const input=inventories();input.target[0].email=null;input.reviewedPairs=[{sourceId:100,targetId:1,reviewReference:'local-fixture-review'}];let r=reconcileCollaborators(input);assert.equal(r.rows[0].status,'REVIEWED_PAIR');assert.equal(r.eligibleForDataWrite,false);
 input.target[1].email=null;input.reviewedPairs.push({sourceId:100,targetId:2,reviewReference:'conflicting-review'});r=reconcileCollaborators(input);assert.equal(r.rows[0].status,'CONFLICT');assert.equal(r.rows[1].status,'CONFLICT');
 input.source[0].password_hash='forbidden';assert.throws(()=>reconcileCollaborators(input),/Aucun secret accepté/);
});

test('a reviewed blank-email target cannot steal an address belonging to an existing out-of-scope account',()=>{
 const input=inventories();input.target[0].email=null;input.target.push({id:99,email:input.source[0].email,role:'admin'});input.reviewedPairs=[{sourceId:100,targetId:1,reviewReference:'fixture'}];assert.equal(reconcileCollaborators(input).rows[0].status,'CONFLICT');
});
