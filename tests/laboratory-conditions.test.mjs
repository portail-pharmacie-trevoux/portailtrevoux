import test from 'node:test';
import assert from 'node:assert/strict';
import {laboratoryConditions} from '../public/laboratory-conditions.js';
import {conditionsWithHistory} from '../laboratories.mjs';
const data={conditionsYear:2025,conditions:'Dernière saisie : 2025',franco:'100 €',conditionsHistory:{2025:{year:2025,conditions:'Ancien enregistrement 2025',franco:'90 €'},2026:{year:2026,conditions:'Conditions en vigueur 2026',franco:'150 €',validFrom:'2026-01-01',validUntil:'2026-12-31'},2027:{year:2027,conditions:'Conditions futures 2027',franco:'200 €'}}};
test('Conditions : sélectionner l’année en vigueur même si la dernière saisie est antérieure, sans mutation',()=>{
 const before=structuredClone(data);const result=laboratoryConditions(data,'2026-11-03T12:00:00Z');assert.equal(result.current.year,2026);assert.equal(result.current.conditions,'Conditions en vigueur 2026');assert.equal(result.current.franco,'150 €');assert.deepEqual(result.history.map(p=>p.year),[2027,2025]);assert.equal(result.history.find(p=>p.year===2025).conditions,data.conditions);assert.deepEqual(data,before);
});
test('Conditions : changement d’année à minuit Europe/Paris et absence de période valide',()=>{
 assert.equal(laboratoryConditions(data,'2026-12-31T22:59:59.999Z').current.year,2026);
 assert.equal(laboratoryConditions(data,'2026-12-31T23:00:00.000Z').current.year,2027);
 assert.equal(laboratoryConditions(data,'2027-12-31T23:00:00.000Z').current,null);
 assert.equal(laboratoryConditions(data,'2024-12-31T23:00:00Z').current.year,2025);
});
test('Conditions : ne pas rendre applicables les années expirées, futures ou inconnues',()=>{
 for(const value of [{conditionsYear:2025,conditions:'Expirées'},{conditionsYear:2027,conditions:'Futures'},{conditions:'Non datées'},{conditionsYear:2026,conditions:'  ',franco:''}])assert.equal(laboratoryConditions(value,'2026-06-01T12:00:00Z').current,null);
 assert.equal(laboratoryConditions({conditionsHistory:{2026:{conditions:'Historique ancien format'}}},'2026-06-01T12:00:00Z').current.year,2026);
 assert.equal(laboratoryConditions({conditionsYear:2026,franco:'150 €'},'2026-06-01T12:00:00Z').current.franco,'150 €');
});
test('Conditions : préserver les dates et métadonnées historiques lors d’une nouvelle saisie',()=>{
 const previous={conditionsYear:2026,conditions:'Version 2026',franco:'150 €',conditionsHistory:{2026:{year:2026,conditions:'Version 2026',franco:'150 €',validFrom:'2026-01-01',validUntil:'2026-12-31'}}};
 const result=conditionsWithHistory({conditionsYear:2025,conditions:'Correction de 2025',franco:'100 €'},previous);
 assert.deepEqual(result.conditionsHistory[2026],previous.conditionsHistory[2026]);assert.equal(laboratoryConditions(result,'2026-11-03T12:00:00Z').current.conditions,'Version 2026');
});
