import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createHash} from 'node:crypto';import {once} from 'node:events';import pg from 'pg';
import {readProcedureArchive,auditProcedureImport,applyProcedureImport} from '../scripts/migration/procedure-batch.mjs';
import {createApp} from '../server.mjs';import {token,digest} from '../security.mjs';
const connection=process.env.PORTAIL_PROCEDURE_FIXTURE_ADMIN_URL;
test('TLS synthetic procedure batch: ZIP hashes, no overwrite, atomic sequence/receipt rollback, idempotence and authenticated downloads',{skip:!connection,timeout:30000},async t=>{
 const u=new URL(connection);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55445');assert.equal(u.pathname,'/postgres');
 const ssl={ca:await readFile('/tmp/portail-migration-fixture-tls/server.crt','utf8'),rejectUnauthorized:true};const admin=new pg.Client({connectionString:connection,ssl});await admin.connect();await admin.query('DROP DATABASE IF EXISTS portailplus_procedures_fixture');await admin.query('CREATE DATABASE portailplus_procedures_fixture');await admin.end();
 const db=new pg.Pool({connectionString:'postgres://postgres@127.0.0.1:55445/portailplus_procedures_fixture',ssl,max:3});t.after(()=>db.end());await db.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
 const dir=await mkdtemp(join(tmpdir(),'procedure-synthetic-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const documents=[1,2,303].map(id=>{const bytes=Buffer.from('%PDF-1.4\nSynthetic fixture '+id+'\n%%EOF');return {id,category:'Catégorie synthétique',title:'Document fictif '+id,description:'Description exacte éè',keywords:'mot-clé',url:'/api/procedures/'+id+'/file',active:id!==2,created_at:'2026-11-08T12:34:56.123456Z',file_name:'document-'+id+'.pdf',file_type:'application/pdf',builtin_key:id===1?'fixture-unique':null,source_url:id===2?null:'https://docs.google.com/document/d/fixture-'+id+'/edit',source_imported_at:id===2?null:'2026-11-08T12:35:56.654321Z',archive_path:'files/'+id+'.pdf',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),file_base64:bytes.toString('base64')};});
 const input=join(dir,'input.json'),zip=join(dir,'fixture.zip');await writeFile(input,JSON.stringify(documents),{mode:0o600});await promisify(execFile)('python3',['-c',"import sys,json,zipfile,base64; d=json.load(open(sys.argv[1])); z=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED); [z.writestr(x['archive_path'],base64.b64decode(x.pop('file_base64'))) for x in d]; z.writestr('manifest.json',json.dumps({'status':'complete','documents':d})); z.close()",input,zip]);
 const bundle=await readProcedureArchive(zip);assert.equal(bundle.documents.length,3);
 const metadata='id,category,title,description,keywords,url,active,created_at,file_name,file_type,builtin_key,source_url,source_imported_at';
 const old=Buffer.from('%PDF-1.4\nUnrelated destination fixture\n%%EOF');await db.query("INSERT INTO procedure_documents(id,category,title,url,file_name,file_type,file_content) VALUES(1000,'Existing','Preserve this exact row','/api/procedures/1000/file','old.pdf','application/pdf',$1)",[old]);
 await db.query("INSERT INTO users(id,name,first_name,last_name,role,active,must_change,email,password_hash,job) VALUES(59,'Fixture Admin','Fixture','Admin','admin',true,false,'fixture-admin@example.invalid','DO_NOT_TOUCH_HASH','Fonction corrigée manuellement')");
 const protectedUser=JSON.stringify((await db.query('SELECT * FROM users')).rows),oldRow=JSON.stringify((await db.query('SELECT to_jsonb(p) AS r FROM procedure_documents p WHERE id=1000')).rows);
 const audit=()=>auditProcedureImport({db,bundle,expectedDatabase:'portailplus_procedures_fixture'}),apply=(approval,beforeCommit=async()=>{})=>applyProcedureImport({db,bundle,approval,beforeCommit,expectedDatabase:'portailplus_procedures_fixture'});
 const a=await audit();assert.equal(a.targetCount,1);assert.deepEqual(a.insert,[1,2,303]);assert.deepEqual(a.conflicts,[]);
 const approval={approved:true,authorizationReference:'SYNTHETIC ONLY',archiveSha256:bundle.archiveSha256,nativeBackupReference:'SYNTHETIC SNAPSHOT',restoreVerified:true,backupDurable:true,targetDigest:a.targetDigest};
 await t.test('Explicit approval/backup gates prevent writes',async()=>{await assert.rejects(apply({...approval,approved:false}),/NOT_AUTHORIZED/);await assert.rejects(apply({...approval,restoreVerified:false}),/NOT_AUTHORIZED/);assert.equal((await audit()).targetCount,1);});
 await t.test('Existing ID, unique builtin key and duplicate content require decisions',async()=>{
  await db.query("INSERT INTO procedure_documents(id,category,title,url) VALUES(1,'Conflict','Never overwrite','https://docs.google.com/document/d/other')");assert.equal((await audit()).conflicts[0].reason,'EXISTING_ID_DIFFERS');await assert.rejects(apply({...approval,targetDigest:(await audit()).targetDigest}),/CONFLICT/);await db.query('DELETE FROM procedure_documents WHERE id=1');
  await db.query("UPDATE procedure_documents SET builtin_key='fixture-unique' WHERE id=1000");assert.equal((await audit()).conflicts[0].reason,'BUILTIN_KEY_EXISTS');await db.query('UPDATE procedure_documents SET builtin_key=NULL WHERE id=1000');
  await db.query('UPDATE procedure_documents SET file_content=$1 WHERE id=1000',[bundle.documents[0].content]);assert.equal((await audit()).conflicts[0].reason,'SAME_BYTES_OTHER_ID_REQUIRES_REVIEW');await db.query('UPDATE procedure_documents SET file_content=$1 WHERE id=1000',[old]);
 });
 await t.test('A destination change after audit is refused',async()=>{await db.query("UPDATE procedure_documents SET title='Independent change' WHERE id=1000");await assert.rejects(apply(approval),/DESTINATION_CHANGED/);await db.query("UPDATE procedure_documents SET title='Preserve this exact row' WHERE id=1000");});
 const seq=async()=>(await db.query('SELECT last_value::text,is_called FROM procedure_documents_id_seq')).rows[0],sequenceBefore=await seq();
 await t.test('Failure after sequence restart rolls back bytes, metadata and sequence',async()=>{
  await assert.rejects(apply(approval,async()=>{throw Error('SYNTHETIC_RECEIPT_FAILURE');}),/SYNTHETIC_RECEIPT_FAILURE/);
  assert.equal((await audit()).targetCount,1);assert.deepEqual(await seq(),sequenceBefore);assert.equal(JSON.stringify((await db.query('SELECT to_jsonb(p) AS r FROM procedure_documents p WHERE id=1000')).rows),oldRow);
 });
 let receipt;
 await t.test('Complete import verifies every binary and preserves microsecond metadata',async()=>{
  const result=await apply(approval,async r=>{receipt=r;});assert.deepEqual(result.insertedIds,[1,2,303]);assert.equal(result.verifiedHashes,3);assert.equal(result.sequenceNext,'1001');assert(receipt);
  const row=(await db.query("SELECT created_at::text,source_imported_at::text,file_content,active FROM procedure_documents WHERE id=1")).rows[0];assert.match(row.created_at,/123456/);assert.match(row.source_imported_at,/654321/);assert(row.file_content.equals(bundle.documents[0].content));assert.equal((await db.query('SELECT active FROM procedure_documents WHERE id=2')).rows[0].active,false);
  assert.equal((await db.query('SELECT count(*)::int n FROM publications')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM team_messages')).rows[0].n,0);
 });
 await t.test('Same batch is idempotent and sequence remains above every existing ID',async()=>{const result=await apply(approval);assert.equal(result.alreadyImported,true);assert.deepEqual(result.insertedIds,[]);assert.equal((await audit()).targetCount,4);assert.equal((await db.query("SELECT nextval('procedure_documents_id_seq')::text AS n")).rows[0].n,'1001');});
 assert.equal(JSON.stringify((await db.query('SELECT * FROM users')).rows),protectedUser);assert.equal(JSON.stringify((await db.query('SELECT to_jsonb(p) AS r FROM procedure_documents p WHERE id=1000')).rows),oldRow);
 await t.test('Portail+ list/download preserves hashes, inactive status and authentication',async()=>{
  const raw=token();await db.query("INSERT INTO sessions(id,user_id,csrf,expires_at) VALUES($1,59,'fixture-csrf',now()+interval '1 hour')",[digest(raw)]);
  const {app}=createApp(db,{origin:'https://portal.example.invalid',secret:'synthetic-procedures-secret-'.repeat(3)}),server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port,cookie='trevoux_session='+raw;
  assert.equal((await fetch(base+'/api/procedures/303/file')).status,401);const response=await fetch(base+'/api/procedures/303/file',{headers:{cookie}});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/pdf/);assert.match(response.headers.get('content-disposition'),/document-303/);assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),bundle.documents[2].sha256);
  assert.equal((await fetch(base+'/api/procedures/2/file',{headers:{cookie}})).status,404);const list=await (await fetch(base+'/api/procedures',{headers:{cookie}})).json();assert(list.some(d=>d.id===303));assert(!list.some(d=>d.id===2));
 });
});
