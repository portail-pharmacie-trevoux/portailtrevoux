import test from 'node:test';import assert from 'node:assert/strict';import {hrAttestationPeriod,hrAttestationReminders,hrAttestationText} from '../hr-attestation-reminders.mjs';
test('RH attestation dates: 29 monthly, Paris 08h, February last day and no old catch-up',()=>{
 assert.equal(hrAttestationPeriod(new Date('2026-10-28T12:00:00Z')),null);
 assert.equal(hrAttestationPeriod(new Date('2026-10-29T06:59:00Z')),null);
 assert.equal(hrAttestationPeriod(new Date('2026-10-29T07:00:00Z')),'2026-10');
 assert.equal(hrAttestationPeriod(new Date('2026-10-31T12:00:00Z')),'2026-10');
 assert.equal(hrAttestationPeriod(new Date('2026-11-01T12:00:00Z')),null);
 assert.equal(hrAttestationPeriod(new Date('2027-02-28T07:00:00Z')),'2027-02');
 assert.equal(hrAttestationPeriod(new Date('2028-02-28T07:00:00Z')),null);
 assert.equal(hrAttestationPeriod(new Date('2028-02-29T07:00:00Z')),'2028-02');
 assert.equal(hrAttestationPeriod(new Date('2026-09-29T12:00:00Z')),null);
});
test('RH attestation: active service referent only, atomic duplicate claim and classic/DPC text',async()=>{
 let calls=0;const db={query:async(sql,args)=>{calls++;assert.match(sql,/JOIN users u ON u.id=s.collaborator_id/);assert.match(sql,/u.active=TRUE/);assert.match(sql,/ON CONFLICT DO NOTHING RETURNING user_id/);assert.match(sql,/WHERE EXISTS\(SELECT 1 FROM due\)/);assert.ok(args[1].includes('emploisdutempsrh'));assert.equal(args[0],'2026-10');}};
 await hrAttestationReminders(db,new Date('2026-10-25T12:00:00Z'));assert.equal(calls,0);
 await hrAttestationReminders(db,new Date('2026-10-29T12:00:00Z'));assert.equal(calls,1);
 assert.ok(hrAttestationText.length<=500);assert.match(hrAttestationText,/classiques et DPC/);assert.match(hrAttestationText,/doublons/);
});
