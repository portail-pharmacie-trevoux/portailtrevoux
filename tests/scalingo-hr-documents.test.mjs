import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import express from 'express';
import pg from 'pg';
import {createApp} from '../server.mjs';
import {token,digest} from '../security.mjs';
import {isScalingoHRImport,registerScalingoHRDocuments} from '../scripts/scalingo-hr-documents-preview.mjs';
import {scalingoUniverseBoundary} from '../scripts/scalingo-universal-rights.mjs';
const database=process.env.PORTAIL_HR_TEST_DATABASE_URL,origin='https://portailplus-hds.osc-fr1.scalingo.io';

test('Scalingo/PostgreSQL RH : import, persistance, confidentialité personnelle et aucun appel YouTrust',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_hr_test');assert.equal(url.search,'');
 const db=new pg.Pool({connectionString:database,max:3});t.after(()=>db.end());
 await db.query(`DROP TABLE IF EXISTS hr_signature_requests,hr_documents,publications,sessions,users CASCADE;
 CREATE TABLE users(id integer PRIMARY KEY,name text,email text,first_name text,last_name text,role text,active boolean,must_change boolean,rights jsonb,edit_rights jsonb,permissions_configured boolean);
 CREATE TABLE sessions(id text PRIMARY KEY,user_id integer REFERENCES users(id),csrf text,expires_at timestamptz);`);
 const schema=await readFile(new URL('../schema.sql',import.meta.url),'utf8');
 for(const name of ['publications','hr_documents','hr_signature_requests'])await db.query(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\n\\);'))[0]);
 await db.query("ALTER TABLE hr_documents ADD COLUMN scope text NOT NULL DEFAULT 'common' CHECK(scope IN ('common','personal'));ALTER TABLE hr_documents ADD COLUMN owner_id integer REFERENCES users(id)");
 const cookies={};
 for(const [id,role,active,mustChange,rights]of [[1,'admin',true,false,true],[2,'employee',true,false,true],[3,'employee',true,false,true],[4,'admin',true,true,true],[5,'employee',true,false,false],[6,'employee',false,false,true]]){
  await db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)',[id,'Compte local '+id,'local-'+id+'@example.invalid','Compte','Local '+id,role,active,mustChange,JSON.stringify(rights?['Ressources humaines']:[]),JSON.stringify(['Ressources humaines'])]);
  const raw=token();cookies[id]='trevoux_session='+raw;await db.query("INSERT INTO sessions VALUES($1,$2,$3,now()+interval '1 hour')",[digest(raw),id,'csrf-'+id]);
 }
 const source=await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url));
 await db.query("INSERT INTO hr_documents(id,title,file_name,file_type,file_content,file_hash,added_by,scope,owner_id) VALUES(100,'Document existant protégé','existing.pdf','application/pdf',$1,'protected',1,'personal',2)",[source]);
 const protectedRow=async()=>(await db.query('SELECT * FROM hr_documents WHERE id=100')).rows[0],protectedBefore=await protectedRow();
 let externalCalls=0;
 const noExternal=new Proxy({}, {get:()=>async()=>{externalCalls++;throw Error('YouTrust must not run');}});
 function start(){
  const {app}=createApp(db,{origin,secret:'local-hr-test-only-'.repeat(3),youtrustClient:noExternal});
  const gate=express(),small=express.json({limit:'64kb'});
  gate.use((req,res,next)=>isScalingoHRImport(req)?next():small(req,res,next));gate.use(scalingoUniverseBoundary(db));
  registerScalingoHRDocuments(gate,app);
  gate.use((req,res)=>res.status(403).json({error:`Fonction désactivée dans la prévisualisation (${req.method} ${req.path}).`}));
  gate.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
  const server=gate.listen(0,'127.0.0.1');t.after(()=>{server.closeAllConnections();server.close();});return server;
 }
 let server=start();await once(server,'listening');
 const request=(path,method='GET',body,user=1,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{origin,cookie:cookies[user]||'','x-csrf-token':'csrf-'+user,'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const pdf=Buffer.concat([source.subarray(0,source.length-6),Buffer.alloc(2*1024*1024-source.length,32),Buffer.from('%%EOF\n')]);
 const body={title:'Document commun local',scope:'common',fileName:'common.pdf',fileData:pdf.toString('base64')};
 for(const user of [0,6])assert.equal((await request('/api/hr/documents/import','POST',body,user)).status,401);
 for(const user of [2,3,4,5])assert.equal((await request('/api/hr/documents/import','POST',body,user)).status,403);
 assert.equal((await request('/api/hr/documents/import','POST',body,1,{'x-csrf-token':'invalid'})).status,403);
 assert.equal((await request('/api/hr/documents/import','POST',body,1,{origin:'https://wrong.invalid'})).status,403);
 assert.equal((await request('/api/hr/signatories','GET',undefined,0)).status,401);
 for(const user of [2,3,4,5,6])assert.equal((await request('/api/hr/signatories','GET',undefined,user)).status,user===6?401:403);
 const signatories=await request('/api/hr/signatories');assert.equal(signatories.status,200);const people=await signatories.json();assert.equal(people.some(p=>p.id===6),false);assert.ok(people.some(p=>p.id===2));
 const imported=await request('/api/hr/documents/import','POST',{...body,ownerId:3});assert.equal(imported.status,201);const common=await imported.json();assert.equal(common.scope,'common');assert.equal(common.owner_id,null);assert.equal(common.file_content,undefined);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM publications')).rows[0].n,1);
 const privateBody={...body,title:'Document personnel local',scope:'personal',ownerId:2,fileName:'personal.pdf',fileData:source.toString('base64')};
 for(const ownerId of [null,0,6,999])assert.equal((await request('/api/hr/documents/import','POST',{...privateBody,ownerId})).status,400);
 const privateResponse=await request('/api/hr/documents/import','POST',privateBody);assert.equal(privateResponse.status,201);const personal=await privateResponse.json();
 assert.equal((await db.query('SELECT count(*)::int AS n FROM publications')).rows[0].n,1,'No private title in publications');
 const list=async user=>{const response=await request('/api/hr/documents','GET',undefined,user);assert.equal(response.status,200);return response.json();};
 assert.equal((await list(1)).length,3);assert.equal((await list(2)).length,3);assert.deepEqual((await list(3)).map(d=>d.id),[common.id]);
 assert.equal((await request('/api/hr/documents','GET',undefined,5)).status,403);
 for(const user of [1,2,3])for(const suffix of ['/file','/file?view=1']){
  const response=await request('/api/hr/documents/'+common.id+suffix,'GET',undefined,user);assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),suffix.includes('?')?/inline/:/attachment/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdf);
 }
 for(const user of [1,2])for(const suffix of ['/file','/file?view=1']){const response=await request('/api/hr/documents/'+personal.id+suffix,'GET',undefined,user);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),source);}
 for(const suffix of ['/file','/file?view=1'])assert.equal((await request('/api/hr/documents/'+personal.id+suffix,'GET',undefined,3)).status,404);
 assert.equal((await request('/api/hr/documents/'+personal.id+'/file','GET',undefined,5)).status,403);
 assert.equal((await request('/api/hr/documents/'+personal.id+'/file','GET',undefined,0)).status,401);
 for(const method of ['PATCH','DELETE']){
  const payload=method==='PATCH'?{title:'Nom non autorisé'}:{};
  for(const user of [2,3,4,5])assert.equal((await request('/api/hr/documents/'+common.id,method,payload,user)).status,403);
  assert.equal((await request('/api/hr/documents/'+common.id,method,payload,0)).status,401);
  assert.equal((await request('/api/hr/documents/'+common.id,method,payload,1,{'x-csrf-token':'invalid'})).status,403);
  assert.equal((await request('/api/hr/documents/'+common.id,method,payload,1,{origin:'https://wrong.invalid'})).status,403);
 }
 assert.equal((await request('/api/hr/documents/'+common.id,'PATCH',{title:'Nom commun enregistré'})).status,200);
 assert.equal((await request('/api/hr/documents/'+personal.id,'PATCH',{title:'Nom personnel enregistré',scope:'common',ownerId:3})).status,200);
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=start();await once(server,'listening');
 assert.equal((await list(3))[0].title,'Nom commun enregistré');assert.equal((await list(3)).length,1);
 const independent=new pg.Client({connectionString:database});await independent.connect();
 try{const row=(await independent.query('SELECT title,scope,owner_id FROM hr_documents WHERE id=$1',[personal.id])).rows[0];assert.deepEqual(row,{title:'Nom personnel enregistré',scope:'personal',owner_id:2});}finally{await independent.end();}
 const beforeRejected=(await db.query('SELECT count(*)::int AS n FROM hr_documents')).rows[0].n;
 const oversized=await request('/api/hr/documents/import','POST',{...body,fileData:Buffer.alloc(10*1024*1024+1).toString('base64')});assert.equal(oversized.status,413);assert.match((await oversized.json()).error,/10 Mo/);
 assert.equal((await request('/api/hr/documents/import','POST',{...body,fileName:'script.exe'})).status,400);assert.equal((await db.query('SELECT count(*)::int AS n FROM hr_documents')).rows[0].n,beforeRejected);
 for(const id of [common.id,personal.id]){
  assert.equal((await request('/api/hr/documents/'+id,'DELETE',{})).status,200);
  const removed=(await db.query('SELECT active,removed_by,removed_at,file_content FROM hr_documents WHERE id=$1',[id])).rows[0];assert.equal(removed.active,false);assert.equal(removed.removed_by,1);assert.ok(removed.removed_at);assert.deepEqual(removed.file_content,id===common.id?pdf:source);
  assert.equal((await request('/api/hr/documents/'+id+'/file')).status,404);
 }
 assert.deepEqual((await list(3)),[]);assert.deepEqual((await list(2)).map(d=>d.id),[100]);
 assert.equal((await request('/api/hr/signatures')).status,200);
 const signature={requestKey:'10000000-0000-4000-8000-000000000001',recipients:[{id:2,email:'local-2@example.invalid'}]};
 for(const [path,method]of [['/api/hr/documents/100/signatures','POST'],['/api/hr/signatures/'+signature.requestKey+'/refresh','POST'],['/api/hr/signatures/'+signature.requestKey+'/file','GET'],['/api/youtrust/status','GET'],['/api/youtrust/config','POST'],['/api/youtrust/disconnect','POST'],['/api/hr/documents/100','PUT'],['/api/hr/documents/100/purge','DELETE'],['/api/hr/signatories','POST']]){
  const response=await request(path,method,method==='GET'?undefined:signature);assert.equal(response.status,403,path);assert.match((await response.json()).error,/prévisualisation/);
 }
 assert.equal(externalCalls,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM hr_signature_requests')).rows[0].n,0);
 assert.deepEqual(await protectedRow(),protectedBefore);
});
