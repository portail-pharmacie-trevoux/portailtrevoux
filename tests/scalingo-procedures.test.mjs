import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import express from 'express';
import pg from 'pg';
import {createApp} from '../server.mjs';
import {token,digest} from '../security.mjs';
import {registerScalingoProcedures} from '../scripts/scalingo-procedures-preview.mjs';
import {scalingoUniverseBoundary} from '../scripts/scalingo-universal-rights.mjs';

const database=process.env.PORTAIL_PROCEDURES_TEST_DATABASE_URL;
const origin='https://portailplus-hds.osc-fr1.scalingo.io';
test('Scalingo/PostgreSQL : métadonnées persistantes, gestion administrateur et retrait réversible sans altérer les PDF',{skip:!database},async t=>{
 // Never accept a Scalingo or Render connection for these mutating fixtures.
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_procedures_test');assert.equal(url.search,'');
 const db=new pg.Pool({connectionString:database,max:3});t.after(()=>db.end());
 await db.query(`DROP TABLE IF EXISTS procedure_documents,sessions,users CASCADE;
 CREATE TABLE users(id integer PRIMARY KEY,name text,role text,active boolean,must_change boolean,rights jsonb,edit_rights jsonb,permissions_configured boolean);
 CREATE TABLE sessions(id text PRIMARY KEY,user_id integer REFERENCES users(id),csrf text,expires_at timestamptz);
 CREATE TABLE procedure_documents(id serial PRIMARY KEY,category text NOT NULL,title text NOT NULL,description text NOT NULL DEFAULT '',keywords text NOT NULL DEFAULT '',url text NOT NULL,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),file_name text,file_type text,file_content bytea,source_url text,source_imported_at timestamptz);`);
 const cookies={};
 for(const [id,role,edit,mustChange]of [[1,'admin',true,false],[2,'employee',false,false],[3,'employee',true,false],[4,'admin',true,true]]){
  await db.query('INSERT INTO users VALUES($1,$2,$3,true,$4,$5,$6,true)',[id,'Compte local '+id,role,mustChange,JSON.stringify(['Procédures']),JSON.stringify(edit?['Procédures']:[])]);
  const raw=token();cookies[id]='trevoux_session='+raw;
  await db.query("INSERT INTO sessions VALUES($1,$2,$3,now()+interval '1 hour')",[digest(raw),id,'csrf-'+id]);
 }
 const pdf=await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url));
 for(const id of [1,2])await db.query("INSERT INTO procedure_documents(id,category,title,description,keywords,url,file_name,file_type,file_content,source_url) VALUES($1,'Organisation',$2,'Description initiale','initial',$3,'fixture.pdf','application/pdf',$4,'https://drive.google.com/fixture')",[id,'Document local '+id,'/api/procedures/'+id+'/file',pdf]);
 const protectedRow=async()=>(await db.query('SELECT * FROM procedure_documents WHERE id=1')).rows[0];
 const protectedBefore=await protectedRow();
 const binary=async()=>(await db.query('SELECT file_name,file_type,file_content,url,source_url,created_at FROM procedure_documents WHERE id=2')).rows[0];
 const bytesBefore=await binary();
 function start(){
  const {app}=createApp(db,{origin,secret:'local-procedure-test-'.repeat(3),procedureAdminManagement:true});
  const gate=express();gate.use(express.json({limit:'64kb'}));gate.use(scalingoUniverseBoundary(db));
  registerScalingoProcedures(gate,app);
  // Same public listing allowance and default-deny ordering as preview entrypoint.
  gate.get('/api/procedures',(req,res,next)=>app(req,res,next));
  gate.use((req,res)=>res.status(403).json({error:`Fonction désactivée dans la prévisualisation (${req.method} ${req.path}).`}));
  gate.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
  const server=gate.listen(0,'127.0.0.1');t.after(()=>{server.closeAllConnections();server.close();});return server;
 }
 let server=start();await once(server,'listening');
 const request=(path,method='GET',body,user=1,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{origin,cookie:cookies[user]||'','x-csrf-token':'csrf-'+user,'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const metadata={title:'Titre modifié',category:'Qualité',keywords:'froid, contrôle',description:'À utiliser lors du contrôle mensuel.'};
 for(const [path,method,body]of [['/api/procedures/2','PUT',metadata],['/api/procedures/2','DELETE',{}],['/api/procedures/2/restore','POST',{}]]){
  assert.equal((await request(path,method,body,0)).status,401);
  for(const user of [2,3,4])assert.equal((await request(path,method,body,user)).status,403);
  assert.equal((await request(path,method,body,1,{'x-csrf-token':'invalid'})).status,403);
  assert.equal((await request(path,method,body,1,{origin:'https://wrong.invalid'})).status,403);
 }
 assert.equal((await request('/api/procedures/2','PUT',{...metadata,title:''})).status,400);
 assert.equal((await request('/api/procedures/2','PUT',{...metadata,description:'x'.repeat(1501)})).status,400);
 assert.equal((await request('/api/procedures/999','PUT',metadata)).status,404);
 const saved=await request('/api/procedures/2','PUT',{...metadata,url:'https://wrong.invalid/replace',fileData:'cannot replace bytes',fileName:'replaced.exe'});
 assert.equal(saved.status,200);const result=await saved.json();for(const key of Object.keys(metadata))assert.equal(result[key],metadata[key]);assert.equal(result.file_content,undefined);
 assert.deepEqual(await binary(),bytesBefore);
 const independent=new pg.Client({connectionString:database});await independent.connect();
 try{const persisted=(await independent.query('SELECT title,category,keywords,description FROM procedure_documents WHERE id=2')).rows[0];assert.deepEqual(persisted,metadata);}finally{await independent.end();}
 // Recreate the HTTP app: metadata must come from PostgreSQL, not an in-memory response.
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=start();await once(server,'listening');
 const refreshed=(await (await request('/api/procedures')).json()).find(d=>d.id===2);for(const key of Object.keys(metadata))assert.equal(refreshed[key],metadata[key]);
 const download=await request('/api/procedures/2/file','GET',undefined,2);assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/attachment/);assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
 assert.equal((await request('/api/procedures/2/file','GET',undefined,0)).status,401);
 await db.query("UPDATE users SET rights='[]',edit_rights='[]' WHERE id=2");assert.equal((await request('/api/procedures/2/file','GET',undefined,2)).status,403);
 assert.equal((await request('/api/procedures/2','DELETE',{})).status,200);
 assert.equal((await db.query('SELECT active FROM procedure_documents WHERE id=2')).rows[0].active,false);
 assert.equal((await request('/api/procedures/2/file')).status,404);
 assert.equal((await (await request('/api/procedures')).json()).some(d=>d.id===2),false);
 assert.equal((await request('/api/procedures/2','PUT',metadata)).status,404);
 assert.deepEqual(await binary(),bytesBefore);
 assert.equal((await request('/api/procedures/2/restore','POST',{})).status,200);
 assert.deepEqual(Buffer.from(await (await request('/api/procedures/2/file')).arrayBuffer()),pdf);
 for(const [path,method]of [['/api/procedures','POST'],['/api/procedures/2','PATCH'],['/api/procedures/2/purge','DELETE'],['/api/procedures/0','PUT'],['/api/procedures/2/file','PUT'],['/api/procedures/2/restore','PUT'],['/api/users/2','PUT'],['/api/users/2','DELETE']]){
  const response=await request(path,method,{});assert.equal(response.status,403,path);assert.match((await response.json()).error,/prévisualisation/);
 }
 assert.deepEqual(await protectedRow(),protectedBefore);
 assert.deepEqual(await binary(),bytesBefore);
});
