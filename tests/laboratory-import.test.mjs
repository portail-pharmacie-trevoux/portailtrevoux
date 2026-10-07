import test from 'node:test';
import assert from 'node:assert/strict';
import {importLaboratories,parseLaboratoryImport} from '../laboratory-import.mjs';
const batch=JSON.stringify({batchId:'test-batch',laboratories:[{name:'Example',orderMode:'pharmacie',responsibleId:null,conditions:'New conditions',franco:'100 euros',sourceUrl:'https://docs.google.com/document/d/example/edit'}]});
test('A repeated batch leaves existing records untouched',async()=>{
 const calls=[];const client={query:async(sql)=>{calls.push(sql);return {rows:[]};},release(){}};
 await importLaboratories({connect:async()=>client},batch);
 assert.ok(calls.includes('COMMIT'));assert.ok(!calls.some(s=>s.startsWith('UPDATE laboratories')||s.startsWith('INSERT INTO laboratories')));
});
test('An existing laboratory keeps its commercial conditions and gains only missing fields',async()=>{
 let merged;
 const client={query:async(sql,params)=>{
  if(sql.startsWith('INSERT INTO settings'))return {rows:[{key:'test'}]};
  if(sql.startsWith('SELECT id,details'))return {rows:[{id:1,details:{conditions:'Manual conditions',commercialName:'Existing contact'}}]};
  if(sql.startsWith('UPDATE laboratories'))merged=JSON.parse(params[1]);
  return {rows:[]};
 },release(){}};
 await importLaboratories({connect:async()=>client},batch);
 assert.equal(merged.conditions,'Manual conditions');assert.equal(merged.commercialName,'Existing contact');assert.equal(merged.franco,'100 euros');assert.match(merged.notes,/docs.google.com/);
});
test('Private imports reject external source hosts and duplicate names',()=>{
 const input=JSON.parse(batch);input.laboratories[0].sourceUrl='https://example.com/document/d/example/edit';assert.throws(()=>parseLaboratoryImport(JSON.stringify(input)));
 const duplicate=JSON.parse(batch);duplicate.laboratories.push({...duplicate.laboratories[0],name:'EXAMPLE'});assert.throws(()=>parseLaboratoryImport(JSON.stringify(duplicate)));
});
