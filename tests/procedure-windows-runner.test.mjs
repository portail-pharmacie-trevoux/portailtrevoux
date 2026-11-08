import test from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../scripts/migration/windows-procedures/runner.mjs';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';
const connection=process.env.PORTAIL_PROCEDURE_FIXTURE_ADMIN_URL;
test('Windows one-off runner: guards, private payload, audit/apply/verify and unchanged initial documents',{skip:!connection,timeout:30000},async t=>{
 const u=new URL(connection);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55445');assert.equal(u.pathname,'/postgres');
 const ssl={ca:await readFile('/tmp/portail-migration-fixture-tls/server.crt','utf8'),rejectUnauthorized:true};
 const admin=new pg.Client({connectionString:connection,ssl});await admin.connect();
 // Deliberately same DB name as the destination guard, ONLY inside the guarded localhost fixture.
 await admin.query('DROP DATABASE IF EXISTS portailplus_7495');await admin.query('CREATE DATABASE portailplus_7495');await admin.end();
 const fixtureUrl='postgres://postgres@127.0.0.1:55445/portailplus_7495';
 const db=new pg.Pool({connectionString:fixtureUrl,ssl});t.after(()=>db.end());await db.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
 for(const id of [1,2])await db.query("INSERT INTO procedure_documents(id,category,title,url,active,file_content) VALUES($1,'fixture','protected','fixture',false,$2)",[id,Buffer.from('synthetic existing '+id)]);
 const dir=await mkdtemp(join(tmpdir(),'windows-runner-synthetic-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const ids=[...Array.from({length:54},(_,i)=>i+1),303],total=7930504,base=Math.floor(total/55),extra=total%55;
 const docs=ids.map((id,i)=>{
  const content=Buffer.alloc(base+(i<extra?1:0),32);content.write('%PDF-1.4\nSynthetic '+id);content.write('%%EOF',content.length-5);
  return {id,category:'Synthetic',title:'SYNTHETIC '+id,description:'fixture',keywords:'test',url:'/api/procedures/'+id+'/file',active:id!==26,created_at:'2026-11-08T00:00:00.123456Z',file_name:'fixture-'+id+'.pdf',file_type:'application/pdf',builtin_key:null,source_url:null,source_imported_at:null,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex'),file_base64:content.toString('base64')};
 });
 const payload=JSON.stringify({archiveSha256:'6dfe4d44359976eee044b98bbe20929ceee4f0791e41eb7072f2e6af668c1e8a',documents:docs}),payloadPath=join(dir,'payload.json');await writeFile(payloadPath,payload);
 const env={SCALINGO_APP_NAME:'portailplus-hds',SCALINGO_POSTGRESQL_URL:fixtureUrl},events=[];
 let poolCalls=0;
 class FixturePool extends pg.Pool{constructor(config){poolCalls++;assert.equal(config.connectionString,fixtureUrl);assert.equal(config.ssl.rejectUnauthorized,true);super({...config,ssl});}}
 const options={payloadPath,expectedPayloadHash:createHash('sha256').update(payload).digest('hex'),env,Pool:FixturePool};
 const log=console.log;console.log=line=>events.push(JSON.parse(line));t.after(()=>{console.log=log;});
 await t.test('Wrong payload, wrong app, wrong database and absent approval cannot connect',async()=>{
  await assert.rejects(run({...options,mode:'audit',expectedPayloadHash:'0'.repeat(64)}),/PAYLOAD_HASH_MISMATCH/);
  await assert.rejects(run({...options,mode:'audit',env:{...env,SCALINGO_APP_NAME:'other'}}),/WRONG_APPLICATION/);
  await assert.rejects(run({...options,mode:'audit',env:{...env,SCALINGO_POSTGRESQL_URL:'postgres://postgres@127.0.0.1:55445/other'}}),/WRONG_DATABASE/);
  const approvalPath=join(dir,'not-approved.json');await writeFile(approvalPath,'{"approved":false}');await assert.rejects(run({...options,mode:'apply',approvalPath}),/EXPLICIT_APPROVAL_REQUIRED/);assert.equal(poolCalls,0);
 });
 let initial;
 await t.test('Audit returns safe mapping and fingerprints, no contents, no writes',async()=>{
  await run({...options,mode:'audit'});initial=events.at(-1);assert.equal(initial.event,'audit');assert.equal(initial.insert.length,55);assert.equal(initial.targetCount,2);assert.equal(initial.dataWrites,0);assert(!JSON.stringify(initial).includes('file_base64'));assert(!JSON.stringify(initial).includes('SYNTHETIC'));assert.equal((await db.query('SELECT count(*)::int n FROM procedure_documents')).rows[0].n,2);
 });
 const baselinePath=join(dir,'audit.json');
 await t.test('Apply then independent verify reports 55 hashes and preserves 1/2',async()=>{
  await writeFile(baselinePath,JSON.stringify(initial));const approvalPath=join(dir,'approval.json');await writeFile(approvalPath,JSON.stringify({approved:true,allocation:'remap',authorizationReference:'SYNTHETIC ONLY',archiveSha256:initial.archiveSha256,targetDigest:initial.targetDigest,nativeBackupReference:'SYNTHETIC BACKUP',restoreRiskAccepted:true,backupDurable:true}));
  await run({...options,mode:'apply',approvalPath});assert.equal(events.at(-1).event,'committed');assert.equal(events.at(-1).verifiedHashes,55);
  await run({...options,mode:'verify',baselinePath});assert.equal(events.at(-1).event,'verified');assert.equal(events.at(-1).targetCount,57);assert.equal(events.at(-1).verifiedHashes,55);assert.deepEqual(events.at(-1).preservedTestIds,[1,2]);
 });
 await t.test('Independent verification detects a change to an initially protected document',async()=>{
  await db.query("UPDATE procedure_documents SET description='Changed protected fixture' WHERE id=1");await assert.rejects(run({...options,mode:'verify',baselinePath}),/EXISTING_DOCUMENT_CHANGED/);
 });
});
