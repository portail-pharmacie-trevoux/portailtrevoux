import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {auditProcedureImport,applyProcedureImport,validateProcedureBundle} from '../scripts/migration/procedure-batch.mjs';
const connection=process.env.PORTAIL_PROCEDURE_FIXTURE_ADMIN_URL;
test('55 synthetic procedures remapped around protected destination IDs, with atomic rollback and repeat verification',{skip:!connection,timeout:30000},async t=>{
 const url=new URL(connection);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55445');assert.equal(url.pathname,'/postgres');
 const ssl={ca:await readFile('/tmp/portail-migration-fixture-tls/server.crt','utf8'),rejectUnauthorized:true};
 const admin=new pg.Client({connectionString:connection,ssl});await admin.connect();await admin.query('DROP DATABASE IF EXISTS portailplus_remap_fixture');await admin.query('CREATE DATABASE portailplus_remap_fixture');await admin.end();
 const db=new pg.Pool({connectionString:'postgres://postgres@127.0.0.1:55445/portailplus_remap_fixture',ssl,max:3});t.after(()=>db.end());await db.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
 const documents=[...Array.from({length:54},(_,i)=>i+1),303].map(id=>{
  const content=Buffer.from('%PDF-1.4\nSynthetic remap '+id+'\n%%EOF');
  return {id,category:'Synthetic',title:'fixture '+id,description:"Exact éè ' \\ end",keywords:'fixture',url:'/api/procedures/'+id+'/file',active:id!==26,created_at:'2026-11-08T12:34:56.123456Z',file_name:'fixture-'+id+'.pdf',file_type:'application/pdf',builtin_key:id<=2?'fixture-key-'+id:null,source_url:id===303?null:'https://example.invalid/'+id,source_imported_at:id===303?null:'2026-11-08T13:01:02.654321Z',bytes:content.length,sha256:createHash('sha256').update(content).digest('hex'),content};
 });
 const bundle=validateProcedureBundle({archiveSha256:'a'.repeat(64),documents});
 for(const id of [1,2])await db.query("INSERT INTO procedure_documents(id,category,title,url,active,file_name,file_type,file_content) VALUES($1::int,'Keep','Original Scalingo fixture','/api/procedures/'||$1::int::text||'/file',false,'old.pdf','application/pdf',$2)",[id,Buffer.from('%PDF protected '+id)]);
 await db.query("INSERT INTO users(id,name,role,active,job) VALUES(59,'Synthetic protected admin','admin',true,'Manually corrected job')");
 const original=JSON.stringify((await db.query('SELECT to_jsonb(p) r FROM procedure_documents p ORDER BY id')).rows),users=JSON.stringify((await db.query('SELECT to_jsonb(u) r FROM users u')).rows);
 const options={db,bundle,allocation:'remap',expectedDatabase:'portailplus_remap_fixture'};
 const audit=()=>auditProcedureImport(options),apply=(approval,beforeCommit=async()=>{})=>applyProcedureImport({...options,approval,beforeCommit});
 const a=await audit(),approval={approved:true,allocation:'remap',authorizationReference:'SYNTHETIC ONLY',archiveSha256:bundle.archiveSha256,targetDigest:a.targetDigest,nativeBackupReference:'SYNTHETIC BACKUP',restoreVerified:false,restoreRiskAccepted:true,backupDurable:true};
 const seq=async()=>(await db.query('SELECT last_value::text,is_called FROM procedure_documents_id_seq')).rows[0];
 const initialSequence=await seq();
 await t.test('Plans 55 free IDs, preserving collisions 1/2 and original source ID 303',async()=>{
  assert.equal(a.conflicts.length,0);assert.deepEqual(a.insert,Array.from({length:55},(_,i)=>i+3));assert.deepEqual(a.mapping.at(-1),{sourceId:303,targetId:57,insert:true});assert.equal(a.dataWrites,0);
 });
 await t.test('Missing approval and unaccepted restoration risk block before changes',async()=>{
  await assert.rejects(apply({...approval,approved:false}),/NOT_AUTHORIZED/);await assert.rejects(apply({...approval,restoreRiskAccepted:false}),/NOT_AUTHORIZED/);await assert.rejects(apply({...approval,allocation:'preserve'}),/NOT_AUTHORIZED/);
 });
 await t.test('Builtin collisions and duplicate binary with differing metadata are refused',async()=>{
  await db.query("UPDATE procedure_documents SET builtin_key='fixture-key-1' WHERE id=1");assert.equal((await audit()).conflicts[0].reason,'BUILTIN_KEY_EXISTS');await db.query('UPDATE procedure_documents SET builtin_key=NULL WHERE id=1');
  await db.query('UPDATE procedure_documents SET file_content=$1 WHERE id=1',[documents[0].content]);assert.equal((await audit()).conflicts[0].reason,'SAME_BYTES_DIFFERENT_METADATA');await db.query('UPDATE procedure_documents SET file_content=$1 WHERE id=1',[Buffer.from('%PDF protected 1')]);
 });
 await t.test('A changed destination invalidates approval',async()=>{
  await db.query("UPDATE procedure_documents SET description='New content' WHERE id=1");await assert.rejects(apply(approval),/DESTINATION_CHANGED/);await db.query("UPDATE procedure_documents SET description='' WHERE id=1");assert.equal((await audit()).targetDigest,a.targetDigest);
 });
 await t.test('Failure halfway through INSERT rolls back the whole batch',async()=>{
  await db.query("ALTER TABLE procedure_documents ADD CONSTRAINT synthetic_failure CHECK(title<>'fixture 30')");await assert.rejects(apply(approval));await db.query('ALTER TABLE procedure_documents DROP CONSTRAINT synthetic_failure');assert.equal((await audit()).targetCount,2);assert.deepEqual(await seq(),initialSequence);
 });
 await t.test('Failure after sequence restart rolls back files, metadata and sequence',async()=>{
  await assert.rejects(apply(approval,async()=>{throw Error('SYNTHETIC_FAILURE_AFTER_SEQUENCE');}),/SYNTHETIC_FAILURE_AFTER_SEQUENCE/);assert.equal((await audit()).targetCount,2);assert.deepEqual(await seq(),initialSequence);assert.equal(JSON.stringify((await db.query('SELECT to_jsonb(p) r FROM procedure_documents p ORDER BY id')).rows),original);
 });
 await t.test('Commits exactly 55, verifies every hash and preserves all metadata except mapped id/url',async()=>{
  const result=await apply(approval);assert.equal(result.verifiedHashes,55);assert.equal(result.preservedCount,2);assert.equal(result.insertedIds.length,55);assert.equal(result.sequenceNext,'58');
  for(const source of documents){const id=result.mapping.find(m=>m.sourceId===source.id).targetId;const row=(await db.query('SELECT *,created_at::text AS precise_created,source_imported_at::text AS precise_imported FROM procedure_documents WHERE id=$1',[id])).rows[0];for(const k of ['category','title','description','keywords','active','file_name','file_type','builtin_key','source_url'])assert.equal(row[k],source[k],k);assert.equal(row.url,'/api/procedures/'+id+'/file');assert.equal(createHash('sha256').update(row.file_content).digest('hex'),source.sha256);assert.match(row.precise_created,/123456/);if(source.source_imported_at===null)assert.equal(row.precise_imported,null);else assert.match(row.precise_imported,/654321/);}
  assert.equal((await audit()).targetCount,57);assert.equal(JSON.stringify((await db.query('SELECT to_jsonb(p) r FROM procedure_documents p WHERE id IN(1,2) ORDER BY id')).rows),original);assert.equal(JSON.stringify((await db.query('SELECT to_jsonb(u) r FROM users u')).rows),users);
  assert.equal((await db.query('SELECT count(*)::int n FROM publications')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM team_messages')).rows[0].n,0);
 });
 await t.test('Rerun is idempotent and read-only verification finds all 55 mapped rows',async()=>{
  const result=await apply(approval);assert.equal(result.alreadyImported,true);assert.equal(result.dataWrites,0);assert.equal(result.verifiedHashes,55);const a=await audit();assert.equal(a.present.length,55);assert.equal(a.insert.length,0);assert.equal(a.conflicts.length,0);assert.deepEqual(a.mapping.map(m=>m.targetId),Array.from({length:55},(_,i)=>i+3));
 });
 await t.test('Changed imported metadata is detected rather than overwritten',async()=>{
  await db.query("UPDATE procedure_documents SET description='Intentional edit' WHERE id=3");assert.equal((await audit()).conflicts[0].reason,'BUILTIN_KEY_EXISTS');await assert.rejects(apply({...approval,targetDigest:(await audit()).targetDigest}),/CONFLICT/);assert.equal((await db.query('SELECT description FROM procedure_documents WHERE id=3')).rows[0].description,'Intentional edit');
 });
});
