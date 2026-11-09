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

import {accountCorrectionProposal,previousAttempt} from '../scripts/migration/grouped/diagnostics.mjs';
test('Private correction proposal exposes exact metadata differences without secrets or mutations',()=>{
 const mismatch={...target,id:60,email:'new@example.invalid',role:'employee',password_hash:'NEVER_EXPOSE',totp_secret:'NEVER_EXPOSE'};
 const before=JSON.stringify(mismatch),proposal=accountCorrectionProposal([source],[mismatch],15);
 assert.deepEqual(proposal.changes.map(x=>x.field),['email','role']);assert.equal(proposal.targetId,60);assert.equal(proposal.executionAllowed,false);assert.equal(proposal.source.email,source.email);assert.equal(proposal.target.email,mismatch.email);assert.equal(JSON.stringify(mismatch),before);assert(!JSON.stringify(proposal).includes('NEVER_EXPOSE'));
 assert.equal(accountCorrectionProposal([source],[mismatch,{...target,id:80,first_name:'Another'}],15).emailConflict,true);
 assert.equal(userMapping([source],[mismatch]).map.has(15),false);
 const approved={...mismatch,email:source.email,role:source.role};assert.equal(userMapping([source],[approved]).map.get(15),60);assert.equal(verifyAccountCorrespondence([source],[approved],15).status,'VERIFIED_CORRESPONDENCE');
 assert.equal(userMapping([source],[{...target,email:'new@example.invalid'}]).map.has(15),false);
});
test('Unidentified historical 14 stays blocked even with a coincidental full name match',()=>{
 const historical={...source,id:14};assert.equal(userMapping([historical],[target]).map.has(14),false);
 assert.equal(previousAttempt({ledger:null}).state,'NO_COMMIT_RECEIPT');assert.equal(previousAttempt({ledger:null}).rollbackProven,false);assert.equal(previousAttempt({ledger:null}).executionAllowed,false);
});
