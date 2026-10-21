import test from 'node:test';
import assert from 'node:assert/strict';
import {annualEvaluationPeriod,qualityAnnualReminders} from '../quality-reminders.mjs';
test('Annual evaluation uses Paris November 15 and catches up within November only',()=>{
 assert.equal(annualEvaluationPeriod(new Date('2026-11-14T22:59:59Z')),null);
 assert.equal(annualEvaluationPeriod(new Date('2026-11-14T23:00:00Z')),'2026-11');
 assert.equal(annualEvaluationPeriod(new Date('2027-11-20T12:00:00Z')),'2027-11');
 assert.equal(annualEvaluationPeriod(new Date('2026-12-01T12:00:00Z')),null);
});
test('One distinct personalized message per service for a shared active referent, atomic deduplication',async()=>{
 const calls=[];const db={query:async(sql,args)=>{calls.push({sql,args});return {rows:args?[]:[{id:1,service:'Chaîne du froid',collaborator_id:7},{id:2,service:'Merchandising',collaborator_id:7}]};}};
 await qualityAnnualReminders(db,new Date('2026-10-21T12:00:00Z'));assert.equal(calls.length,0);
 await qualityAnnualReminders(db,new Date('2026-11-15T08:00:00Z'));assert.equal(calls.length,3);
 for(const c of calls.slice(1)){assert.equal(c.args[1],7);assert.match(c.args[5],/rendez-vous d’une heure auprès de la secrétaire/);assert.ok(c.args[5].includes(c.args[4]));assert.match(c.sql,/ON CONFLICT DO NOTHING/);assert.match(c.sql,/u.active=TRUE/);assert.match(c.sql,/NOT EXISTS/);}
 assert.notEqual(calls[1].args[2],calls[2].args[2]);
});
