import test from 'node:test';
import assert from 'node:assert/strict';
import { validDate,validWeek,validateDay,plannedMinutes,copySchedule } from '../schedule.mjs';
const entry={userId:1,day:'2026-10-05',kind:'travail',slots:[['08:30','12:30'],['14:00','19:00']]};
test('dates réelles et semaine du lundi',()=>{
  assert.equal(validWeek('2026-10-05'),'2026-10-05');assert.throws(()=>validWeek('2026-10-06'));
  assert.throws(()=>validDate('2026-02-30'));assert.throws(()=>validDate('2026-13-01'));
  assert.throws(()=>validateDay({...entry,day:'2026-10-12'},'2026-10-05'));
});
test('deux créneaux, durée et absence de chevauchement',()=>{
  assert.equal(plannedMinutes(validateDay(entry,'2026-10-05')),540);
  assert.throws(()=>validateDay({...entry,slots:[['12:30','08:30']]},'2026-10-05'));
  assert.throws(()=>validateDay({...entry,slots:[['08:30','12:30'],['12:00','19:00']]},'2026-10-05'));
  assert.throws(()=>validateDay({...entry,slots:[['08:30','24:00']]},'2026-10-05'));
  assert.throws(()=>validateDay({...entry,slots:[]},'2026-10-05'));
});
test('congés et repos hors total, formation avec durée',()=>{
  assert.equal(plannedMinutes(validateDay({...entry,kind:'conge',slots:[]},'2026-10-05')),0);
  assert.throws(()=>validateDay({...entry,kind:'absence'},'2026-10-05'));
  assert.equal(plannedMinutes(validateDay({...entry,kind:'formation'},'2026-10-05')),540);
});
test('copie conserve le jour de semaine, passe les changements d’heure et exclut les comptes supprimés',()=>{
  const copied=copySchedule({'1:2026-10-05':entry,'2:2026-10-06':{...entry,userId:2,day:'2026-10-06'}},'2026-10-05','2026-10-26',[1]);
  assert.deepEqual(Object.keys(copied),['1:2026-10-26']);assert.equal(copied['1:2026-10-26'].day,'2026-10-26');assert.deepEqual(copied['1:2026-10-26'].slots,entry.slots);
  assert.equal(entry.day,'2026-10-05');
});


test('Dix créneaux avec postes distincts, copie préservée et onzième refusé',()=>{const slots=Array.from({length:10},(_,i)=>[String(8+i).padStart(2,'0')+':00',String(8+i).padStart(2,'0')+':30']);const posts=slots.map((_,i)=>i+1),day={...entry,slots,postIds:posts};assert.equal(plannedMinutes(validateDay(day,'2026-10-05')),300);assert.deepEqual(copySchedule({a:day},'2026-10-05','2026-10-12',[1])['1:2026-10-12'].postIds,posts);assert.throws(()=>validateDay({...day,slots:[...slots,['19:00','19:30']],postIds:[...posts,11]},'2026-10-05'));assert.throws(()=>validateDay({...day,postIds:[1]},'2026-10-05'));assert.throws(()=>validateDay({...day,postIds:posts.map(()=>-1)},'2026-10-05'));});
