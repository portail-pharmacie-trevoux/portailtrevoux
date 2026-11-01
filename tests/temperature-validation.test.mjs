import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedExcursions,dailyValidations} from '../temperature-analysis.mjs';
const readings=[['2026-09-30 21:50:00',9],['2026-09-30 22:00:00',9],['2026-09-30 22:10:00',5],['2026-09-30 22:20:00',10],['2026-09-30 22:30:00',5]];
const comment=(id,time,validation,text='Commentaire')=>({id,happened_at:time,validation,text,created_at:'2026-10-01T12:00:00Z'});
test('Validation quotidienne : toutes les validations V requises, X prioritaire, anciens commentaires sans coche',()=>{
 const a=comment(1,readings[0][0],'V'),b=comment(2,readings[3][0],'V');
 const status=comments=>dailyValidations(readings,reviewedExcursions(readings,comments));
 assert.equal(status([]).get('2026-10-01'),null);
 assert.equal(status([a]).get('2026-10-01'),null);
 assert.equal(status([a,b]).get('2026-10-01'),'V');
 assert.equal(status([a,{...b,validation:'X'}]).get('2026-10-01'),'X');
 assert.equal(status([{...a,validation:null},{...b,validation:'X'}]).get('2026-10-01'),'X');
 assert.equal(status([a,{...b,text:' '}]).get('2026-10-01'),null);
 assert.equal(status([{...a,validation:null},b]).get('2026-09-30'),null);
 assert.equal(status([a,b]).has('2026-10-02'),false);
});
test('Un épisode traversant minuit et le mois conserve sa validation, sa dernière modification prévaut sans supprimer les commentaires',()=>{
 const old=comment(1,readings[0][0],'X'),newer=comment(2,readings[0][0],'V');
 const events=reviewedExcursions(readings,[old,newer]);assert.equal(events[0].comments.length,2);assert.equal(events[0].validation,'V');
 let days=dailyValidations(readings,events);assert.equal(days.get('2026-09-30'),'V');assert.equal(days.get('2026-10-01'),null);
 const edited=reviewedExcursions(readings,[{...old,updated_at:'2026-10-02T12:00:00Z'},newer]);
 days=dailyValidations(readings,edited);assert.equal(days.get('2026-09-30'),'X');assert.equal(days.get('2026-10-01'),'X');
 assert.deepEqual(readings[0],['2026-09-30 21:50:00',9]);
});
