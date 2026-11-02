import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import {createApp} from '../server.mjs';
import {token,digest} from '../security.mjs';
import {errorTypes} from '../public/quality-error-types.js';
import {scalingoUniverseBoundary} from '../scripts/scalingo-universal-rights.mjs';
import {isScalingoQualityErrorRoute} from '../scripts/scalingo-quality-errors-preview.mjs';
import {ensureScalingoQualityFollowupSchema} from '../scripts/ensure-scalingo-quality-followup-schema.mjs';
const database=process.env.PORTAIL_FOLLOWUP_TEST_DATABASE_URL,universe="Outils d'aide à la démarche qualité",origin='https://portailplus-hds.osc-fr1.scalingo.io';
test('PostgreSQL : migration préservatrice, historique des précisions et règles exactes de main à travers le filtre Scalingo',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_followup_test');assert.equal(url.search,'');
 const db=new pg.Pool({connectionString:database,max:3});t.after(()=>db.end());
 await db.query(`DROP TABLE IF EXISTS quality_errors,sessions,users CASCADE;
 CREATE TABLE users(id integer PRIMARY KEY,name text,email text,job text,role text,active boolean,must_change boolean,rights jsonb,edit_rights jsonb,permissions_configured boolean);
 CREATE TABLE sessions(id text PRIMARY KEY,user_id integer REFERENCES users(id),csrf text,expires_at timestamptz);`);
 const schema=await readFile(new URL('../schema.sql',import.meta.url),'utf8');await db.query(schema.match(/CREATE TABLE IF NOT EXISTS quality_errors\([\s\S]*?\n\);/)[0]);
 await db.query(`ALTER TABLE quality_errors ADD COLUMN operator_notified_at timestamptz;
 ALTER TABLE quality_errors ADD COLUMN operator_notified_by integer;
 ALTER TABLE quality_errors ADD COLUMN operator_notified_name text;
 ALTER TABLE quality_errors ADD COLUMN status text NOT NULL DEFAULT 'declared';
 ALTER TABLE quality_errors ADD COLUMN status_history jsonb NOT NULL DEFAULT '[]';`);
 const cookies={};
 for(const [id,role,job,edit]of [[1,'admin','Gestionnaire',true],[2,'employee','Préparateur',true],[3,'employee','Pharmacienne',true],[4,'employee','Pharmacien',false]]){
  await db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,true,false,$6,$7,true)',[id,'Compte local '+id,'local-'+id+'@example.invalid',job,role,JSON.stringify([universe]),JSON.stringify(edit?[universe]:[])]);
  const raw=token();cookies[id]='trevoux_session='+raw;await db.query("INSERT INTO sessions VALUES($1,$2,$3,now()+interval '1 hour')",[digest(raw),id,'csrf-'+id]);
 }
 for(const [id,status,patient,doctor]of [[100,'closed',true,false],[101,'in_progress',false,true],[102,'in_progress',false,false]])await db.query("INSERT INTO quality_errors(id,identified_date,error_type,details,responsible_id,responsible_name,error_date,actions,severity,created_by,operator_name,revision,status,patient_notified_at,doctor_notified_at) VALUES($1,'2026-10-01',$2,'Détail existant sans patient',2,'Compte local 2','2026-10-01','Action existante conservée',2,2,'Compte local 2',7,$3,CASE WHEN $4::boolean THEN '2026-10-01T12:00:00Z'::timestamptz ELSE NULL END,CASE WHEN $5::boolean THEN '2026-10-01T12:00:00Z'::timestamptz ELSE NULL END)",[id,errorTypes[0],status,patient,doctor]);
 const protectedRows=async()=>(await db.query('SELECT id,details,actions,identified_date,error_date,responsible_id,responsible_name,patient_notified_at,doctor_notified_at,operator_notified_at FROM quality_errors WHERE id>=100 ORDER BY id')).rows;
 const before=await protectedRows();assert.equal((await ensureScalingoQualityFollowupSchema(db)).added.length,6);
 let migrated=(await db.query('SELECT * FROM quality_errors ORDER BY id')).rows;assert.equal(migrated[0].error_corrected,true);assert.equal(migrated[0].status,'closed');assert.equal(migrated[0].revision,7);assert.equal(migrated[2].status,'declared');assert.equal(migrated[2].revision,8);assert.equal(migrated[2].status_history.length,1);
 assert.deepEqual(await protectedRows(),before);assert.deepEqual(await ensureScalingoQualityFollowupSchema(db),{added:[]});assert.deepEqual((await db.query('SELECT * FROM quality_errors ORDER BY id')).rows,migrated);
 const {app}=createApp(db,{origin,secret:'local-test-only-'.repeat(3),dummyHash:'unused',googleId:'',googleSecret:'',googleEmail:'',mailEmail:''});
 const gate=express();gate.use(express.json({limit:'64kb'}));gate.use(scalingoUniverseBoundary(db));gate.use((req,res,next)=>isScalingoQualityErrorRoute(req)?next():res.status(403).json({error:'Route désactivée'}));gate.use(app);gate.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=gate.listen(0);t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port,root='/api/quality/errors';
 const send=(path,method='GET',body,id=2,extra={})=>fetch(base+path,{method,headers:{cookie:cookies[id],origin,'x-csrf-token':'csrf-'+id,'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 let response=await send(root);assert.equal(response.status,200);assert.equal((await response.json()).canUncheckFollowup,false);assert.equal((await (await send(root,'GET',undefined,3)).json()).canUncheckFollowup,true);assert.equal((await (await send(root,'GET',undefined,1)).json()).canUncheckFollowup,false);
 response=await send(root,'POST',{identifiedDate:'2026-10-01',errorDate:'2026-10-01',type:errorTypes[0],details:'Cas local',responsibleId:2,actions:'Action seule ne change pas le statut',severity:2});assert.equal(response.status,200,await response.clone().text());let row=await response.json();const id=row.id;assert.equal(row.status,'declared');
 const notify=async(target,checked,actor=2,revision=row.revision,extra={})=>send(root+'/'+id+'/notification','PUT',{target,checked,revision,job:'Pharmacien',operatorName:'Faux'},actor,extra);
 response=await notify('operator',true);assert.equal(response.status,200);row=await response.json();assert.equal(row.status,'declared');assert.equal(row.status_history.length,0);
 response=await notify('patient',true);row=await response.json();assert.equal(row.status,'in_progress');assert.equal(row.status_history.length,1);assert.equal(row.patient_notified_name,'Compte local 2');
 response=await notify('corrected',true);row=await response.json();assert.equal(row.status,'closed');assert.equal(row.error_corrected,true);assert.equal(row.corrected_by,2);
 let noteRevision=row.revision;
 response=await send(root+'/'+id+'/correction-note','PUT',{note:'  Première précision  ',revision:row.revision});assert.equal(response.status,200);row=await response.json();assert.equal(row.correction_note,'Première précision');assert.equal(row.correction_note_history[0].from,'');assert.equal(row.correction_note_history[0].by,'Compte local 2');
 response=await send(root+'/'+id+'/correction-note','PUT',{note:'Seconde précision',revision:row.revision});row=await response.json();assert.equal(row.correction_note_history.length,2);assert.equal(row.correction_note_history[1].from,'Première précision');
 assert.equal((await send(root+'/'+id+'/correction-note','PUT',{note:'Écrasement',revision:noteRevision})).status,409);
 assert.equal((await send(root+'/'+id+'/correction-note','PUT',{note:'x'.repeat(101),revision:row.revision})).status,400);
 assert.equal((await send(root+'/'+id+'/correction-note','PUT',{note:'Autre',revision:row.revision},2,{'x-csrf-token':'bad'})).status,403);
 assert.equal((await notify('corrected',false,2)).status,403);assert.equal((await notify('corrected',false,1)).status,403);assert.equal((await notify('corrected',false,4)).status,403);
 response=await notify('corrected',false,3);assert.equal(response.status,200);row=await response.json();assert.equal(row.status,'in_progress');assert.equal(row.correction_note,'Seconde précision');assert.equal(row.correction_note_history.length,2);
 assert.equal((await send(root+'/'+id+'/correction-note','PUT',{note:'Interdit',revision:row.revision})).status,409);
 for(let mask=0;mask<16;mask++){
  for(const [index,target]of ['operator','patient','doctor','corrected'].entries()){
   const previous=row.status,historyLength=row.status_history.length;
   response=await notify(target,!!(mask&(1<<index)),3);assert.equal(response.status,200,await response.clone().text());row=await response.json();assert.equal(row.status_history.length,historyLength+(previous!==row.status?1:0));
  }
  assert.equal(row.status,mask&8?'closed':mask&6?'in_progress':'declared');
 }
 assert.equal((await notify('patient',true,3,1)).status,409);assert.equal((await notify('patient',true,3,row.revision,{'x-csrf-token':'bad'})).status,403);
 for(const actor of [1,3])assert.equal((await send(root+'/'+id+'/status','PUT',{status:'declared',revision:row.revision},actor)).status,409);
 assert.equal((await send(root+'/'+id+'/notification','PUT',{target:'patient',checked:true,revision:row.revision},3,{origin:'https://other.invalid'})).status,403);
 assert.equal((await send(root,'GET',undefined,3,{cookie:''})).status,401);
 assert.deepEqual(await protectedRows(),before);assert.equal((await db.query('SELECT count(*)::int AS n FROM quality_errors')).rows[0].n,4);
});
