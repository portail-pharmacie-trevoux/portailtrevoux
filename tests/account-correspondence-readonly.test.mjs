import test from 'node:test';import assert from 'node:assert/strict';
import {verifyAccountCorrespondence} from '../scripts/migration/grouped/diagnostics.mjs';
import {userMapping} from '../scripts/migration/grouped/model.mjs';
// Synthetic identities only; this tests the Render-ID-15 check without touching either real database.
const source={id:15,first_name:'Synthetic',last_name:'Second administrator',email:'second-admin@example.invalid',role:'admin',active:true,directory_key:'source-fixture-key'};
const target={...source,id:907,directory_key:'scalingo-manual:fixture-key'};
test('Source account 15 matches its new admin by unique complete identity and email, never by equal numeric ID',()=>{
 const inputSource=JSON.stringify(source),inputTarget=JSON.stringify(target);const collision={id:15,first_name:'Different',last_name:'Employee',role:'employee',email:'different@example.invalid'};const result=userMapping([source],[collision,target]);assert.equal(result.map.get(15),907);const verified=verifyAccountCorrespondence([source],[collision,target],15);assert.equal(verified.status,'VERIFIED_CORRESPONDENCE');assert.equal(verified.targetId,907);assert.equal(verified.emailMatches,true);assert.equal(verified.roleMatches,true);assert.equal(JSON.stringify(source),inputSource);assert.equal(JSON.stringify(target),inputTarget);
});
test('A different role, ambiguous identity or conflicting email prevents an automatic account match',()=>{
 for(const targets of [[{...target,role:'employee'}],[target,{...target,id:908}],[{...target,email:'other@example.invalid'},{id:909,first_name:'Wrong',last_name:'Identity',role:'admin',email:source.email}]])assert.equal(userMapping([source],targets).map.has(15),false);
});

test('Read-only confirmation reports missing account, different email and inactive target without changing an account',()=>{
 assert.equal(verifyAccountCorrespondence([source],[],15).status,'NO_TARGET_IDENTITY');assert.equal(verifyAccountCorrespondence([source],[{...target,email:'different@example.invalid'}],15).status,'EMAIL_DIFFERS_REVIEW_REQUIRED');assert.equal(verifyAccountCorrespondence([source],[{...target,active:false}],15).targetActive,false);
});
