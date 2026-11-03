import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import express from 'express';
import pg from 'pg';
import {createApp} from '../server.mjs';
import {digest} from '../security.mjs';
import {scalingoUniverseBoundary} from '../scripts/scalingo-universal-rights.mjs';
import {registerScalingoChallengeDeletionGateway} from '../scripts/scalingo-challenge-deletion-preview.mjs';
const origin='https://portailplus-hds.osc-fr1.scalingo.io',database=process.env.PORTAIL_CHALLENGE_DELETE_TEST_DATABASE_URL;
test('Scalingo challenge deletion gateway opens only exact numeric DELETE',async t=>{
 const gate=express();registerScalingoChallengeDeletionGateway(gate,(q,s)=>s.sendStatus(204));gate.use((q,s)=>s.sendStatus(403));const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 for(const [method,path,expected] of [['DELETE','/api/challenges/1',204],['DELETE','/api/challenges/0',403],['DELETE','/api/challenges/1/',403],['DELETE','/api/challenges/1/reports',403],['DELETE','/api/users/1',403],['POST','/api/challenges/1',403]])assert.equal((await fetch('http://127.0.0.1:'+server.address().port+path,{method})).status,expected);
});
test('PostgreSQL: admin-only deletion cascades own reports/reminders, preserves other results; create/edit/assign and optimistic conflict',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_challenge_delete_test');
 const db=new pg.Pool({connectionString:database});t.after(()=>db.end());
 await db.query(`DROP TABLE IF EXISTS challenge_monthly_reminders,challenge_reports,team_challenges,sessions,users,laboratories,settings CASCADE;
 CREATE TABLE users(id integer PRIMARY KEY,name text,first_name text,last_name text,role text,active boolean,must_change boolean,rights jsonb,edit_rights jsonb,permissions_configured boolean);
 CREATE TABLE sessions(id text PRIMARY KEY,user_id integer REFERENCES users(id),csrf text,expires_at timestamptz);
 CREATE TABLE laboratories(id integer PRIMARY KEY,name text,details jsonb DEFAULT '{}',logo_version integer DEFAULT 0);
 CREATE TABLE settings(key text PRIMARY KEY,value text);
 INSERT INTO users VALUES(1,'Admin TEST','Admin','TEST','admin',true,false,'[]','[]',true),(2,'Collaborateur TEST','Collaborateur','TEST','employee',true,false,'["Challenges"]','["Challenges"]',true);
 INSERT INTO laboratories(id,name) VALUES(1,'Laboratoire fictif');`);
 const schema=await readFile(new URL('../schema.sql',import.meta.url),'utf8');
 for(const table of ['team_challenges','challenge_reports','challenge_monthly_reminders']){const start=schema.indexOf('CREATE TABLE IF NOT EXISTS '+table+'('),end=schema.indexOf('\n);',start)+4;assert(start>=0);await db.query(schema.slice(start,end));}
 await db.query('ALTER TABLE team_challenges ADD COLUMN gain_per_unit numeric DEFAULT 0');
 for(const id of [1,2])await db.query("INSERT INTO sessions VALUES($1,$2,'csrf',now()+interval '1 hour')",[digest(String(id).repeat(43)),id]);
 const start=async(enabled=true)=>{const {app}=createApp(db,{origin,secret:'test-only-'.repeat(4),scalingoChallengeDeletion:enabled,invitationMailer:{status:async()=>({connected:false})}}),gate=express();gate.use(express.json());gate.use(scalingoUniverseBoundary(db));registerScalingoChallengeDeletionGateway(gate,app);gate.use(app);gate.use((e,q,s,n)=>s.status(e.status||500).json({error:e.message}));const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});return server;};
 let server=await start();
 const req=(path,method='GET',body,user=1,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{origin,cookie:user?'trevoux_session='+String(user).repeat(43):'','x-csrf-token':'csrf','content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const payload={month:'2026-10',title:'Challenge fictif',laboratoryId:1,modalities:'TEST',metric:'units',target:10,gainPerUnit:1,participants:[{id:1}]};
 const created=await req('/api/challenges','POST',payload);assert.equal(created.status,201);let chosen=await created.json();
 const other=await(await req('/api/challenges','POST',{...payload,title:'Autre challenge TEST'})).json();
 const edited=await req('/api/challenges/'+chosen.id,'PUT',{...payload,title:'Challenge fictif modifié',participants:[{id:1},{id:2}],revision:chosen.revision});assert.equal(edited.status,200);chosen=await edited.json();assert.equal(chosen.participants.length,2);
 for(const c of [chosen,other]){
  const report=(await db.query("INSERT INTO challenge_reports(challenge_id,file_name,file_content,analysis,challenge_revision) VALUES($1,'bilan-TEST.pdf',$2,'{}',$3) RETURNING id",[c.id,Buffer.from('%PDF TEST'),c.revision])).rows[0];
  await db.query('UPDATE team_challenges SET results=$2,report_id=$3 WHERE id=$1',[c.id,{global:12,participants:[{id:1,value:12}],notes:['Fictif']},report.id]);
  await db.query("INSERT INTO challenge_monthly_reminders(challenge_id,month,user_id) VALUES($1,'2026-10',1)",[c.id]);
 }
 const snapshot=async()=>({other:(await db.query('SELECT * FROM team_challenges WHERE id=$1',[other.id])).rows,reports:(await db.query('SELECT * FROM challenge_reports WHERE challenge_id=$1',[other.id])).rows,reminders:(await db.query('SELECT * FROM challenge_monthly_reminders WHERE challenge_id=$1',[other.id])).rows,labs:(await db.query('SELECT * FROM laboratories')).rows,users:(await db.query('SELECT * FROM users ORDER BY id')).rows}),before=await snapshot();
 assert.equal((await(await req('/api/challenges/options')).json()).canDelete,true);assert.equal((await(await req('/api/challenges/options','GET',undefined,2)).json()).canDelete,false);
 for(const [user,extra,status] of [[0,{},401],[2,{},403],[1,{'x-csrf-token':'wrong'},403],[1,{origin:'https://wrong.invalid'},403]])assert.equal((await req('/api/challenges/'+chosen.id,'DELETE',{revision:chosen.revision},user,extra)).status,status);
 assert.equal((await req('/api/challenges/'+chosen.id,'DELETE',{revision:chosen.revision-1})).status,409);
 assert.equal((await req('/api/challenges/'+chosen.id,'DELETE',{})).status,400);
 assert.equal((await req('/api/challenges/'+chosen.id,'DELETE',{revision:chosen.revision})).status,200);
 assert.equal((await db.query('SELECT * FROM challenge_reports WHERE challenge_id=$1',[chosen.id])).rows.length,0);assert.equal((await db.query('SELECT * FROM challenge_monthly_reminders WHERE challenge_id=$1',[chosen.id])).rows.length,0);
 server.closeAllConnections();server.close();server=await start();
 const list=await(await req('/api/challenges?month=2026-10')).json();assert.deepEqual(list.map(c=>c.id),[other.id]);assert.equal(list[0].results.global,12);assert.deepEqual(await snapshot(),before);
 assert.equal((await req('/api/challenges/'+chosen.id,'DELETE',{revision:chosen.revision})).status,404);
 server.closeAllConnections();server.close();server=await start(false);assert.equal((await(await req('/api/challenges/options')).json()).canDelete,undefined);assert.equal((await req('/api/challenges/'+other.id,'DELETE',{revision:other.revision})).status,404);assert.deepEqual(await snapshot(),before);
});
