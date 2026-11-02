import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import express from 'express';
import pg from 'pg';
import {createApp} from '../server.mjs';
import {token,digest} from '../security.mjs';
import {registerScalingoEmployeeRecords} from '../scripts/scalingo-employee-records-preview.mjs';
import {scalingoTestAdminAuth,rightsPreview} from '../scripts/scalingo-universal-rights.mjs';
const database=process.env.PORTAIL_MANUAL_TEST_DATABASE_URL,origin='https://portailplus-hds.osc-fr1.scalingo.io',secret='local-manual-test-only-'.repeat(3);
test('Scalingo/PostgreSQL : création Sans accès, retrait et réactivation ciblés, aucune mutation des 17 comptes existants',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_manual_test');assert.equal(url.search,'');
 const db=new pg.Pool({connectionString:database,max:3});t.after(()=>db.end());
 await db.query(`DROP TABLE IF EXISTS employee_details,sessions,users CASCADE;
 CREATE TABLE users(id serial PRIMARY KEY,name text,first_name text,last_name text,phone text,birthday date,job text,role text,active boolean,email text,password_hash text,must_change boolean,invitation_sent_at timestamptz,rights jsonb,edit_rights jsonb,permissions_configured boolean,directory_key text UNIQUE);
 CREATE TABLE sessions(id text PRIMARY KEY,user_id integer REFERENCES users(id),csrf text,expires_at timestamptz);`);
 const schema=await readFile(new URL('../schema.sql',import.meta.url),'utf8');await db.query(schema.match(/CREATE TABLE IF NOT EXISTS employee_details \([\s\S]*?\n\);/)[0]);
 for(let i=1;i<=17;i++)await db.query("INSERT INTO users(name,first_name,last_name,phone,job,role,active,email,password_hash,must_change,rights,edit_rights,permissions_configured) VALUES($1,'Local',$2,'0600000000','Préparateur',$3,true,$4,$5,false,'[\"Agenda\",\"Actualités\"]','[\"Actualités\"]',false)",['Compte local '+i,'Exemple '+i,i===1?'admin':'employee',i===1?'admin-test@portailplus.invalid':null,i===1?'local-test-hash':null]);
 const snapshot=async()=>(await db.query('SELECT * FROM users WHERE id<=17 ORDER BY id')).rows,protectedBefore=await snapshot();
 const cookies={};for(const id of [1,2]){const raw=token();cookies[id]='trevoux_session='+raw;await db.query("INSERT INTO sessions VALUES($1,$2,$3,now()+interval '1 hour')",[digest(raw),id,'csrf-'+id]);}
 let externalCalls=0;
 function start(){
  const {app}=createApp(db,{origin,secret,employeeAccountsReadOnly:true,mailFetch:async()=>{externalCalls++;throw Error('Mail prohibited');}}),gate=express();
  gate.use(express.json({limit:'64kb'}));registerScalingoEmployeeRecords({gate,db,adminAuth:scalingoTestAdminAuth(db),origin,secret});
  for(const path of ['/api/users','/api/me'])gate.get(path,(req,res,next)=>app(req,res,next));
  gate.use((req,res)=>res.status(403).json({error:`Fonction désactivée dans la prévisualisation (${req.method} ${req.path}).`}));gate.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
  const server=gate.listen(0,'127.0.0.1');t.after(()=>{server.closeAllConnections();server.close();});return server;
 }
 let server=start();await once(server,'listening');
 const request=(path,method='GET',body,user=1,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{origin,cookie:cookies[user]||'','x-csrf-token':'csrf-'+user,'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 assert.equal((await (await request('/api/me')).json()).features.employeeAccountsReadOnly,true);
 const body={firstName:'Fictif',lastName:'Test local',phone:'0612345678',birthday:'1990-02-03',job:'Préparateur',active:true,email:'',password:'',rights:[]};
 assert.equal((await request('/api/users','POST',body,0)).status,401);assert.equal((await request('/api/users','POST',body,2)).status,403);
 for(const extra of [{'x-csrf-token':'wrong'},{origin:'https://wrong.invalid'}])assert.equal((await request('/api/users','POST',body,1,extra)).status,403);
 for(const extra of [{email:'new-login@example.invalid'},{password:'long-local-password'},{administratorRights:true},{active:false}])assert.equal((await request('/api/users','POST',{...body,...extra})).status,403);
 for(const extra of [{role:'admin'},{password_hash:'forged'},{directory_key:'scalingo-manual:forged'},{firstName:''},{birthday:'2026-02-30'},{details:{unknown:'x'}},{rights:['Unknown']},{rights:['Collaborateurs'],editRights:['Collaborateurs']}])assert.equal((await request('/api/users','POST',{...body,...extra})).status,400);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n,17);
 const response=await request('/api/users','POST',{...body,details:{address:'Adresse fictive locale',workEmail:'contact@example.invalid'},detailsRevision:0});assert.equal(response.status,201,await response.clone().text());const created=await response.json();assert.equal(created.role,'employee');assert.equal(created.active,true);assert.equal(created.passwordConfigured,false);assert.equal(created.email,'');assert.equal(created.invitationSentAt,null);assert.equal(created.previewManualRecord,true);
 const account=async()=>(await db.query('SELECT * FROM users WHERE id=$1',[created.id])).rows[0];
 const fresh=await account();assert.equal(fresh.email,null);assert.equal(fresh.password_hash,null);assert.equal(fresh.must_change,true);assert.match(fresh.directory_key,/^scalingo-manual:/);
 const detail=(await db.query('SELECT payload FROM employee_details WHERE user_id=$1',[created.id])).rows[0];assert.equal(detail.payload.includes('Adresse fictive'),false);
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=start();await once(server,'listening');
 let list=await (await request('/api/users')).json();assert.equal(list.length,18);const listed=list.find(p=>p.id===created.id);assert.equal(listed.active,true);assert.equal(listed.passwordConfigured,false);assert.equal(listed.invitationSentAt,null);assert.equal(listed.invitationEmail,'contact@example.invalid');
 const independent=new pg.Client({connectionString:database});await independent.connect();try{assert.equal((await independent.query('SELECT name FROM users WHERE id=$1',[created.id])).rows[0].name,'Fictif Test local');}finally{await independent.end();}
 assert.equal(rightsPreview((await db.query('SELECT * FROM users')).rows).people.length,16,'Manual test entry must not break the imported-roster rights action');
 for(const [path,method]of [['/api/users/'+created.id,'DELETE'],['/api/users/'+created.id+'/restore','POST']]){
  assert.equal((await request(path,method,undefined,0)).status,401);assert.equal((await request(path,method,undefined,2)).status,403);
  for(const extra of [{'x-csrf-token':'bad'},{origin:'https://wrong.invalid'}])assert.equal((await request(path,method,undefined,1,extra)).status,403);
 }
 for(const id of [1,2])for(const [suffix,method]of [['','DELETE'],['/restore','POST']])assert.equal((await request('/api/users/'+id+suffix,method)).status,403);
 const localToken=token();await db.query("INSERT INTO sessions VALUES($1,$2,'local',now()+interval '1 hour')",[digest(localToken),created.id]);
 assert.equal((await request('/api/users/'+created.id,'DELETE')).status,200);assert.equal((await account()).active,false);assert.equal((await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id=$1',[created.id])).rows[0].n,0);
 list=await (await request('/api/users')).json();assert.equal(list.filter(p=>p.active).length,17);assert.equal(list.find(p=>p.id===created.id).active,false);
 assert.equal((await request('/api/users/'+created.id+'/restore','POST')).status,200);const restored=await account();assert.deepEqual(restored,fresh);
 list=await (await request('/api/users')).json();assert.equal(list.find(p=>p.id===created.id).passwordConfigured,false);assert.equal(list.filter(p=>p.active).length,18);
 await db.query('UPDATE users SET email=$2 WHERE id=$1',[created.id,'must-not-enable@example.invalid']);
 assert.equal((await request('/api/users/'+created.id+'/restore','POST')).status,409);await db.query('UPDATE users SET email=NULL WHERE id=$1',[created.id]);
 for(const [path,method]of [['/api/users/'+created.id+'/invitation','POST'],['/api/users/'+created.id+'/permanent','DELETE'],['/api/password','POST'],['/api/collaborateurs/import','POST']])assert.equal((await request(path,method,{})).status,403);
 assert.equal(externalCalls,0);assert.deepEqual(await snapshot(),protectedBefore);assert.deepEqual(await account(),fresh);
});
