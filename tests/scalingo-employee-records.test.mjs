import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import express from 'express';
import pg from 'pg';
import {createApp} from '../server.mjs';
import {token,digest,encrypt} from '../security.mjs';
import {registerScalingoEmployeeRecords} from '../scripts/scalingo-employee-records-preview.mjs';
import {scalingoTestAdminAuth,registerScalingoRights} from '../scripts/scalingo-universal-rights.mjs';
const database=process.env.PORTAIL_EMPLOYEE_TEST_DATABASE_URL,origin='https://portailplus-hds.osc-fr1.scalingo.io',secret='local-private-record-test-'.repeat(3);
test('Scalingo/PostgreSQL : 16 fiches hors liste de démonstration, droits persistants, données chiffrées et accès inchangés',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_employee_test');assert.equal(url.search,'');
 const db=new pg.Pool({connectionString:database,max:3});t.after(()=>db.end());
 await db.query(`DROP TABLE IF EXISTS employee_details,sessions,users CASCADE;
 CREATE TABLE users(id integer PRIMARY KEY,name text,first_name text,last_name text,phone text,birthday date,job text,role text,active boolean,email text,password_hash text,must_change boolean,invitation_sent_at timestamptz,rights jsonb,edit_rights jsonb,permissions_configured boolean);
 CREATE TABLE sessions(id text PRIMARY KEY,user_id integer REFERENCES users(id),csrf text,expires_at timestamptz);`);
 const schema=await readFile(new URL('../schema.sql',import.meta.url),'utf8');await db.query(schema.match(/CREATE TABLE IF NOT EXISTS employee_details \([\s\S]*?\n\);/)[0]);
 for(let id=1;id<=18;id++){
  const admin=id===1||id===18;
  await db.query("INSERT INTO users VALUES($1,$2,'Local',$3,'0600000000','1990-01-01','Préparateur',$4,true,$5,$6,$7,NULL,$8,$9,false)",[id,'Local '+id,'Compte '+id,admin?'admin':'employee',id===1?'admin-test@portailplus.invalid':id===18?'other-admin@example.invalid':null,admin?'local-hash-sentinel':null,id!==1&&id!==18&&id!==3,JSON.stringify(['Agenda','Actualités','Fun','Laboratoires']),JSON.stringify(['Laboratoires'])]);
 }
 await db.query('INSERT INTO employee_details(user_id,payload,revision,updated_by) VALUES(2,$1,3,1)',[encrypt({address:'Adresse locale initiale',personalEmail:'private@example.invalid',legacyPreserved:'Legacy local value'},secret)]);
 const cookies={};for(const id of [1,2,3,18]){const raw=token();cookies[id]='trevoux_session='+raw;await db.query("INSERT INTO sessions VALUES($1,$2,$3,now()+interval '1 hour')",[digest(raw),id,'csrf-'+id]);}
 const accountState=async()=>(await db.query('SELECT id,role,active,email,password_hash,must_change,invitation_sent_at FROM users ORDER BY id')).rows,accountsBefore=await accountState();
 const protectedState=async()=>(await db.query('SELECT * FROM users WHERE id<>2 ORDER BY id')).rows,protectedBefore=await protectedState();
 let externalCalls=0;const env={};
 function start(){
  const gate=express();gate.use(express.json({limit:'64kb'}));const adminAuth=scalingoTestAdminAuth(db);
  registerScalingoEmployeeRecords({gate,db,adminAuth,origin,secret});registerScalingoRights({gate,db,adminAuth,origin,env});
  const {app}=createApp(db,{origin,secret,mailFetch:async()=>{externalCalls++;throw Error('Mail forbidden');}});
  gate.get('/api/users',(req,res,next)=>app(req,res,next));
  gate.use((req,res)=>res.status(403).json({error:`Fonction désactivée dans la prévisualisation (${req.method} ${req.path}).`}));
  gate.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
  const server=gate.listen(0,'127.0.0.1');t.after(()=>{server.closeAllConnections();server.close();});return server;
 }
 let server=start();await once(server,'listening');
 const request=(path,method='GET',body,user=1,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{origin,cookie:cookies[user]||'','x-csrf-token':'csrf-'+user,'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 for(let id=1;id<=17;id++){const r=await request('/api/users/'+id+'/details');assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);const record=await r.json();assert.equal(record.person.id,id);assert.equal(record.person.password_hash,undefined);assert.equal(record.previewRestrictions.accountReadOnly,true);assert.equal(record.previewRestrictions.profileReadOnly,id===1);}
 const first=await (await request('/api/users/2/details')).json();assert.equal(first.details.address,'Adresse locale initiale');assert.equal(first.detailsRevision,3);
 const body={firstName:'Prénom local',lastName:'Nom local',phone:'0612345678',birthday:'1992-05-12',job:'Préparatrice',active:true,details:{address:'Adresse privée modifiée'},detailsRevision:3};
 for(const [path,method,payload]of [['/api/users/2/details','GET',undefined],['/api/users/2','PUT',body]]){
  assert.equal((await request(path,method,payload,0)).status,401);
  for(const user of [2,3,18])assert.equal((await request(path,method,payload,user)).status,403);
 }
 for(const extra of [{'x-csrf-token':'bad'},{origin:'https://wrong.invalid'}])assert.equal((await request('/api/users/2','PUT',body,1,extra)).status,403);
 const denied=(extra,status=403)=>request('/api/users/2','PUT',{...body,...extra}).then(r=>assert.equal(r.status,status));
 for(const extra of [{password:'long-local-password'},{administratorRights:true},{email:'new-login@example.invalid'},{active:false}])await denied(extra);
 for(const extra of [{role:'admin'},{password_hash:'forged'},{details:{unexpected:'value'}},{firstName:''},{rights:['Formations'],editRights:['Collaborateurs']},{rights:['Formations'],editRights:['Procédures']}])await denied(extra,400);
 assert.equal((await request('/api/users/1','PUT',body)).status,403);
 assert.equal((await request('/api/users/999/details')).status,404);assert.equal((await request('/api/users/999','PUT',body)).status,404);
 assert.equal((await request('/api/users/2','PUT',{...body,detailsRevision:2})).status,409);
 assert.deepEqual(await accountState(),accountsBefore);assert.equal((await (await request('/api/users/2/details')).json()).detailsRevision,3);
 const updated=await request('/api/users/2','PUT',body);assert.equal(updated.status,200);const returned=await updated.json();assert.equal(returned.firstName,'Prénom local');assert.equal(returned.passwordConfigured,false);
 let record=await (await request('/api/users/2/details')).json();assert.equal(record.details.address,'Adresse privée modifiée');assert.equal(record.details.personalEmail,'private@example.invalid');assert.equal(record.details.legacyPreserved,'Legacy local value');assert.equal(record.detailsRevision,4);assert.deepEqual(record.person.editRights,['Laboratoires']);assert.equal(record.person.permissionsConfigured,false,'A profile-only save must preserve specific/unconfigured rights');
 const encrypted=(await db.query('SELECT payload FROM employee_details WHERE user_id=2')).rows[0].payload;assert.equal(encrypted.includes('Adresse privée'),false);
 assert.equal((await request('/api/users/2','PUT',body)).status,409);
 const permissions={rights:['Agenda','Actualités','Fun','Laboratoires','Formations'],editRights:['Agenda','Actualités','Fun','Laboratoires']};
 assert.equal((await request('/api/users/2','PUT',{...body,detailsRevision:4,...permissions})).status,200);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id=2')).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id=1')).rows[0].n,1);
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=start();await once(server,'listening');
 record=await (await request('/api/users/2/details')).json();assert.equal(record.person.firstName,'Prénom local');assert.equal(record.details.address,'Adresse privée modifiée');assert.deepEqual([...record.person.rights].sort(),[...permissions.rights].sort());assert.deepEqual([...record.person.editRights].sort(),[...permissions.editRights].sort());assert.equal(record.person.permissionsConfigured,true);
 const independent=new pg.Client({connectionString:database});await independent.connect();try{const row=(await independent.query('SELECT first_name,rights,edit_rights FROM users WHERE id=2')).rows[0];assert.equal(row.first_name,'Prénom local');assert.deepEqual([...row.edit_rights].sort(),[...permissions.editRights].sort());}finally{await independent.end();}
 assert.equal((await request('/api/users/2','PUT',permissions)).status,409,'Legacy permission-only backup gate retained');
 for(const [path,method]of [['/api/users/2/invitation','POST'],['/api/users/2/restore','POST'],['/api/users/2','DELETE'],['/api/password','POST'],['/api/collaborateurs/import','POST'],['/api/invitations/accept','POST']]){const response=await request(path,method,{});assert.equal(response.status,403,path);assert.match((await response.json()).error,/prévisualisation/);}
 assert.equal((await request('/api/users','POST',{})).status,400);
 assert.equal(externalCalls,0);assert.deepEqual(await accountState(),accountsBefore);assert.deepEqual(await protectedState(),protectedBefore);
});
