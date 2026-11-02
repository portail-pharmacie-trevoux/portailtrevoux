import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import express from 'express';
import pg from 'pg';
import {createApp} from '../server.mjs';
import {token,digest,encrypt} from '../security.mjs';
import {registerScalingoEmployeeRecords} from '../scripts/scalingo-employee-records-preview.mjs';
import {scalingoTestAdminAuth} from '../scripts/scalingo-universal-rights.mjs';
import {ensureScalingoEmployeeDeletionAudit} from '../scripts/scalingo-employee-deletion.mjs';
const database=process.env.PORTAIL_DELETION_TEST_DATABASE_URL,origin='https://portailplus-hds.osc-fr1.scalingo.io',secret='local-deletion-fixture-'.repeat(3);
test('Scalingo/PostgreSQL : suppression inactive, dépendances FK/JSON conservées, double confirmation et audit minimal',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_deletion_test');assert.equal(url.search,'');
 const db=new pg.Pool({connectionString:database,max:4});t.after(()=>db.end());
 await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
 await db.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
 for(const [id,role,active]of [[1,'admin',true],[2,'employee',false],[3,'employee',true],[4,'employee',false]])await db.query('INSERT INTO users(id,name,first_name,last_name,role,active,email,password_hash,must_change) VALUES($1,$2,$3,$4,$5,$6,$7,$8,FALSE)',[id,'Fixture locale '+id,'Fixture','Locale '+id,role,active,id===1?'admin-test@portailplus.invalid':id===2?'reference@example.invalid':null,id===1?'test-hash':null]);
 await db.query('INSERT INTO employee_details(user_id,payload,updated_by) VALUES(4,$1,1)',[encrypt({address:'Donnée privée à effacer'},secret)]);
 const cookies={};for(const id of [1,3,4]){const raw=token();cookies[id]='trevoux_session='+raw;await db.query("INSERT INTO sessions(id,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[digest(raw),id,'csrf-'+id]);}
 const original=async()=>(await db.query('SELECT * FROM users ORDER BY id')).rows,usersBefore=await original();
 await ensureScalingoEmployeeDeletionAudit(db);await ensureScalingoEmployeeDeletionAudit(db);assert.deepEqual(await original(),usersBefore);
 const auditCount=async()=>(await db.query('SELECT count(*)::int AS n FROM scalingo_employee_deletion_audit')).rows[0].n;
 function start(){
  const {app}=createApp(db,{origin,secret,employeeAccountsReadOnly:true}),gate=express();gate.use(express.json({limit:'64kb'}));
  registerScalingoEmployeeRecords({gate,db,adminAuth:scalingoTestAdminAuth(db),origin,secret});gate.get('/api/users',(req,res,next)=>app(req,res,next));
  gate.use((req,res)=>res.status(403).json({error:'Fonction désactivée dans la prévisualisation.'}));gate.use((e,req,res,next)=>res.status(e.status||500).json({error:e.status?e.message:'Erreur locale contrôlée'}));
  const server=gate.listen(0,'127.0.0.1');t.after(()=>{server.closeAllConnections();server.close();});return server;
 }
 let server=start();await once(server,'listening');
 const send=(id,body={confirmation:id,confirmationText:'SUPPRIMER'},user=1,extra={})=>fetch('http://127.0.0.1:'+server.address().port+'/api/users/'+id+'/permanent',{method:'DELETE',headers:{origin,cookie:cookies[user]||'','x-csrf-token':'csrf-'+user,'content-type':'application/json',...extra},body:JSON.stringify(body)});
 assert.equal((await send(4,undefined,0)).status,401);assert.equal((await send(4,undefined,3)).status,403);
 for(const extra of [{'x-csrf-token':'bad'},{origin:'https://wrong.invalid'}])assert.equal((await send(4,undefined,1,extra)).status,403);
 for(const body of [{},{confirmation:4},{confirmation:2,confirmationText:'SUPPRIMER'},{confirmation:4,confirmationText:'supprimer'},{confirmation:4,confirmationText:'SUPPRIMER',name:'must not store'}])assert.equal((await send(4,body)).status,400);
 assert.equal((await send(1)).status,403,'The only/last TEST administrator is protected');
 assert.equal((await send(3)).status,409,'Active employee protected');assert.equal((await send(999)).status,404);
 assert.deepEqual(await original(),usersBefore);assert.equal(await auditCount(),0);
 await db.query("INSERT INTO users(id,name,role,active,email) VALUES(5,'Autre admin local','admin',FALSE,'other-admin@example.invalid')");assert.equal((await send(5)).status,403);
 await db.query(`CREATE TABLE future_cascade_history(id serial PRIMARY KEY,user_id integer REFERENCES users(id) ON DELETE CASCADE,value text);
 CREATE TABLE future_null_history(id serial PRIMARY KEY,author integer REFERENCES users(id) ON DELETE SET NULL,value text);
 CREATE TABLE future_email_history(id serial PRIMARY KEY,subject text REFERENCES users(email) ON DELETE CASCADE);
 CREATE TABLE future_unconstrained(user_id integer,value text);
 CREATE TABLE schedule_history_fixture(id serial PRIMARY KEY,snapshot jsonb);`);
 const blocked=async label=>{const r=await send(2);assert.equal(r.status,409,await r.clone().text());assert.match((await r.json()).error,label);assert.equal(await auditCount(),0);assert.ok((await db.query('SELECT id FROM users WHERE id=2')).rows[0]);};
 for(const [name,column,value]of [['future_cascade_history','user_id',2],['future_null_history','author',2],['future_email_history','subject','reference@example.invalid'],['future_unconstrained','user_id',2]])await t.test('Dépendance découverte automatiquement : '+name,async()=>{
  await db.query(`INSERT INTO ${name}(${column}) VALUES($1)`,[value]);const before=(await db.query('SELECT * FROM '+name)).rows;await blocked(/données|associées/);assert.deepEqual((await db.query('SELECT * FROM '+name)).rows,before);await db.query('DELETE FROM '+name);
 });
 await t.test('RH : document personnel conservé octet pour octet',async()=>{
  await db.query("INSERT INTO hr_documents(title,file_name,file_type,file_content,file_hash,scope,owner_id,added_by) VALUES('Document local','local.pdf','application/pdf',$1,'local','personal',2,1)",[Buffer.from('private-local-bytes')]);const before=(await db.query('SELECT * FROM hr_documents')).rows;await blocked(/Ressources humaines/);assert.deepEqual((await db.query('SELECT * FROM hr_documents')).rows,before);await db.query('DELETE FROM hr_documents');
 });
 for(const column of ['draft','published'])await t.test('Planning : '+column+' préservé',async()=>{
  await db.query(`INSERT INTO schedule_weeks(week,${column}) VALUES('2026-11-02',$1::jsonb)`,[JSON.stringify({'2:2026-11-02':{userId:2,day:'2026-11-02',kind:'travail'}})]);const before=(await db.query('SELECT * FROM schedule_weeks')).rows;await blocked(/Planning/);assert.deepEqual((await db.query('SELECT * FROM schedule_weeks')).rows,before);await db.query('DELETE FROM schedule_weeks');
 });
 await t.test('Historique de planning et semaine type',async()=>{
  await db.query('INSERT INTO schedule_history_fixture(snapshot) VALUES($1)',[JSON.stringify({before:{entries:[{userId:'2'}]}})]);await blocked(/Planning/);await db.query('DELETE FROM schedule_history_fixture');
  await db.query("INSERT INTO schedule_templates(name,content) VALUES('Locale',$1)",[JSON.stringify({entry:{userId:2,weekday:0}})]);const before=(await db.query('SELECT * FROM schedule_templates')).rows;await blocked(/Planning/);assert.deepEqual((await db.query('SELECT * FROM schedule_templates')).rows,before);await db.query('DELETE FROM schedule_templates');
 });
 const lab=(await db.query("INSERT INTO laboratories(name,order_mode) VALUES('Local','pharmacie') RETURNING id")).rows[0].id;
 for(const column of ['participants','results'])await t.test('Challenges : '+column,async()=>{
  const row=(await db.query("INSERT INTO team_challenges(month,title,laboratory_id,metric,target,participants,results) VALUES('2026-11','Local',$1,'units',1,$2,$3) RETURNING id",[lab,JSON.stringify(column==='participants'?[{id:2,name:'Local'}]:[{id:3,name:'Autre local'}]),column==='results'?JSON.stringify({participants:[{id:2,value:5}]}):null])).rows[0];const before=(await db.query('SELECT * FROM team_challenges')).rows;await blocked(/Challenges/);assert.deepEqual((await db.query('SELECT * FROM team_challenges')).rows,before);await db.query('DELETE FROM team_challenges WHERE id=$1',[row.id]);
 });
 await t.test('Challenges : anciens formats tableaux et clés numériques',async()=>{
  const row=(await db.query("INSERT INTO team_challenges(month,title,laboratory_id,metric,target,participants,results) VALUES('2026-11','Ancien local',$1,'units',1,'[2]',NULL) RETURNING id",[lab])).rows[0];await blocked(/Challenges/);
  await db.query("UPDATE team_challenges SET participants='[{\"id\":3}]',results='{\"2\":{\"value\":17}}' WHERE id=$1",[row.id]);await blocked(/Challenges/);await db.query('DELETE FROM team_challenges WHERE id=$1',[row.id]);
 });
 await t.test('RH : destinataire de signature JSON sans appel externe',async()=>{
  const doc=(await db.query("INSERT INTO hr_documents(title,file_name,file_type,file_content,file_hash,added_by) VALUES('Local','local.pdf','application/pdf',$1,'local',1) RETURNING id",[Buffer.from('local')])).rows[0];
  await db.query("INSERT INTO hr_signature_requests(id,document_id,account_id,base_uri,environment,recipients,created_by) VALUES('10000000-0000-4000-8000-000000000001',$1,'local','https://local.invalid','demo',$2,1)",[doc.id,JSON.stringify([{userId:2,name:'Destinataire local'}])]);const before=(await db.query('SELECT * FROM hr_signature_requests')).rows;await blocked(/Ressources humaines/);assert.deepEqual((await db.query('SELECT * FROM hr_signature_requests')).rows,before);await db.query('DELETE FROM hr_signature_requests');await db.query('DELETE FROM hr_documents');
 });
 await t.test('Concurrence : opération liée en cours, refus sans suppression',async()=>{
  const other=await db.connect();try{await other.query('BEGIN');await other.query('INSERT INTO future_cascade_history(user_id) VALUES(4)');const response=await send(4);assert.equal(response.status,409);assert.equal(await auditCount(),0);assert.ok((await db.query('SELECT id FROM users WHERE id=4')).rows[0]);}finally{await other.query('ROLLBACK');other.release();}
 });
 await t.test('Échec tardif : audit et données confidentielles reviennent en arrière',async()=>{
  await db.query("CREATE FUNCTION fail_local_deletion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id=4 THEN RAISE EXCEPTION 'local fixture'; END IF;RETURN OLD;END $$;CREATE TRIGGER fail_local_deletion BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION fail_local_deletion()");
  assert.equal((await send(4)).status,500);assert.equal(await auditCount(),0);assert.ok((await db.query('SELECT * FROM employee_details WHERE user_id=4')).rows[0]);assert.equal((await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id=4')).rows[0].n,1);await db.query('DROP TRIGGER fail_local_deletion ON users;DROP FUNCTION fail_local_deletion()');
 });
 const deleted=await send(4);assert.equal(deleted.status,200,await deleted.clone().text());assert.equal((await db.query('SELECT id FROM users WHERE id=4')).rows.length,0);assert.equal((await db.query('SELECT * FROM employee_details WHERE user_id=4')).rows.length,0);assert.equal((await db.query('SELECT * FROM sessions WHERE user_id=4')).rows.length,0);
 const audit=(await db.query('SELECT * FROM scalingo_employee_deletion_audit')).rows;assert.equal(audit.length,1);assert.equal(audit[0].deleted_user_id,4);assert.equal(audit[0].deleted_by,1);assert.equal(audit[0].action,'employee_deleted');assert.deepEqual(Object.keys(audit[0]).sort(),['id','deleted_user_id','deleted_by','deleted_at','action','checks_version'].sort());assert.equal(JSON.stringify(audit).includes('Fixture'),false);
 assert.equal((await send(4)).status,404);assert.equal(await auditCount(),1);
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=start();await once(server,'listening');
 const headers={cookie:cookies[1]};const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/users/4/details',{headers})).status,404);assert.equal((await (await fetch(base+'/api/users',{headers})).json()).some(p=>p.id===4),false);
 const independent=new pg.Client({connectionString:database});await independent.connect();try{assert.equal((await independent.query('SELECT id FROM users WHERE id=4')).rows.length,0);assert.equal((await independent.query('SELECT count(*)::int AS n FROM scalingo_employee_deletion_audit')).rows[0].n,1);}finally{await independent.end();}
 assert.deepEqual((await original()).filter(p=>p.id<4),usersBefore.filter(p=>p.id<4));
});
