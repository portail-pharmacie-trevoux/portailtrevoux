import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProcedureImport,importProcedureDocuments} from '../procedure-import.mjs';
const doc={category:'Qualité',title:'Document',url:'https://docs.google.com/document/d/example/edit'};
const raw=documents=>JSON.stringify({batchId:'test-1',documents});
test('validates the complete batch before contacting the database',async()=>{
  for(const input of ['{',raw([{...doc,url:'https://example.com/document/d/example'}]),raw([{...doc,title:''}]),raw([{...doc,keywords:'x'.repeat(501)}]),raw([doc,{...doc,url:'https://drive.google.com/file/d/example/view'}])]) {
    await assert.rejects(importProcedureDocuments({connect(){assert.fail('must not connect');}},input));
  }
  assert.equal(parseProcedureImport(raw([doc])).documents[0].driveId,'example');
});
test('no configured import leaves the database untouched',async()=>{
  assert.deepEqual(await importProcedureDocuments({connect(){assert.fail();}},undefined),{added:0,skipped:true});
});
test('a completed batch is not replayed after restart',async()=>{
  const queries=[];let released=false;
  const db={async connect(){return {async query(sql){queries.push(sql);return {rows:[]};},release(){released=true;}};}};
  assert.deepEqual(await importProcedureDocuments(db,raw([doc])),{added:0,skipped:true});
  assert.equal(queries.at(-1),'COMMIT');
  assert.ok(!queries.some(sql=>sql.includes('INSERT INTO procedure_documents')));
  assert.equal(released,true);
});
test('an insertion failure rolls back the marker and the documents',async()=>{
  const queries=[];let released=false;
  const db={async connect(){return {async query(sql){queries.push(sql);if(sql.includes('INSERT INTO settings'))return {rows:[{key:'x'}]};if(sql.includes('INSERT INTO procedure_documents'))throw new Error('database unavailable');return {rows:[]};},release(){released=true;}};}};
  await assert.rejects(importProcedureDocuments(db,raw([doc])),/database unavailable/);
  assert.equal(queries.at(-1),'ROLLBACK');
  assert.equal(released,true);
});
test('existing documents are skipped, new documents generate one publication',async()=>{
  let inserts=0;const publications=[];
  const db={async connect(){return {async query(sql,params){if(sql.includes('INSERT INTO settings'))return {rows:[{key:'x'}]};if(sql.includes('INSERT INTO procedure_documents'))return {rows:inserts++===0?[]:[{id:1}]};if(sql.includes('INSERT INTO publications'))publications.push(params);return {rows:[]};},release(){}};}};
  assert.deepEqual(await importProcedureDocuments(db,raw([doc,{...doc,url:'https://drive.google.com/file/d/second/view'}])),{added:1,skipped:false});
  assert.equal(publications.length,1);
  assert.equal(publications[0][1],'1 documents importés depuis Google Drive');
});
