import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import express from 'express';
import pg from 'pg';
import {zip} from '../order-export.mjs';
import {token,digest} from '../security.mjs';
import {createApp} from '../server.mjs';
import {ensureScalingoTemperatureSchema} from '../scripts/ensure-scalingo-temperature-schema.mjs';
import {scalingoUniverseBoundary} from '../scripts/scalingo-universal-rights.mjs';
import {registerScalingoTemperaturePreview,isTemperatureImport,isScalingoTemperatureRoute} from '../scripts/scalingo-temperature-preview.mjs';
const origin='https://portailplus-hds.osc-fr1.scalingo.io',path='/api/quality/temperatures/import';
function workbook(rows){return zip({
 'xl/workbook.xml':'<workbook><sheets><sheet name="FRIGO_TEST" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':'<worksheet><sheetData>'+[['Time','Temperature'],...rows].map((r,i)=>'<row>'+r.map((v,j)=>`<c r="${j?'B':'A'}${i+1}" t="inlineStr"><is><t>${v}</t></is></c>`).join('')+'</row>').join('')+'</sheetData></worksheet>',
 'docProps/padding.bin':randomBytes(70000)
});}
function preview(db){
 const {app}=createApp(db,{origin,secret:'test-only-secret-'.repeat(3),dummyHash:'unused',googleId:'',googleSecret:'',googleEmail:'',mailEmail:''});
 const gate=express();registerScalingoTemperaturePreview(gate,{db,origin});
 const small=express.json({limit:'64kb'});gate.use((req,res,next)=>isTemperatureImport(req)?next():small(req,res,next));
 gate.use(scalingoUniverseBoundary(db));
 gate.use((req,res,next)=>(isScalingoTemperatureRoute(req)||(req.method==='GET'&&req.path==='/api/quality/temperatures'))?next():res.status(403).json({error:'Route désactivée dans la prévisualisation.'}));
 gate.use(app);gate.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));return gate;
}
test('Filtre température : seules les routes exactes import et consultation de sonde sont ouvertes',()=>{
 for(const [method,url] of [['POST',path],['GET','/api/quality/temperatures/FRIGO_TEST'],['POST','/api/quality/temperatures/FRIGO_TEST/comments'],['PUT','/api/quality/temperatures/FRIGO_TEST/comments/1']])assert.equal(isScalingoTemperatureRoute({method,path:url}),true);
 for(const [method,url] of [['DELETE',path],['POST',path+'/other'],['PUT','/api/quality/temperatures/FRIGO_TEST']])assert.equal(isScalingoTemperatureRoute({method,path:url}),false);
});
test('Import Scalingo : administrateur, session, origine et CSRF vérifiés avant le parseur volumineux ; erreurs JSON explicites',async t=>{
 let actor={id:1,email:'synthetic-personal-admin@example.invalid',role:'admin',active:true,must_change:false,csrf:'csrf'};
 const db={query:async()=>({rows:actor?[actor]:[]})},gate=express();registerScalingoTemperaturePreview(gate,{db,origin});gate.post(path,(req,res)=>res.json({accepted:true}));gate.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=gate.listen(0);t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+path;
 const headers={cookie:'trevoux_session='+token(),origin,'x-csrf-token':'csrf','content-type':'application/json'};
 const send=(body,extra={})=>fetch(url,{method:'POST',headers:{...headers,...extra},body});
 const large=JSON.stringify({padding:'a'.repeat(70000)});
 assert.equal((await send(large,{cookie:''})).status,401);
 actor.role='employee';assert.equal((await send(large)).status,403);actor.role='admin';
 actor.must_change=true;assert.equal((await send(large)).status,403);actor.must_change=false;
 actor.active=false;assert.equal((await send(large)).status,403);actor.active=true;
 assert.equal((await send(large,{origin:'https://other.invalid'})).status,403);
 assert.equal((await send(large,{'x-csrf-token':'bad'})).status,403);
 assert.equal((await send(large,{'content-type':'text/plain'})).status,415);
 assert.equal((await send('{')).status,400);
 assert.equal((await send(large)).status,200);
 const oversized=await send(JSON.stringify({fileData:'a'.repeat(22*1024*1024)}));assert.equal(oversized.status,413);assert.match((await oversized.json()).error,/15 Mo/);
 actor=null;assert.equal((await send(large)).status,403);
});

const database=process.env.PORTAIL_TEMPERATURE_TEST_DATABASE_URL;
test('PostgreSQL local : vrai XLSX >64 Ko, doublons, conservation, rollback après 5000 insertions et imports concurrents', {skip:!database},async t=>{
 // Never allow this destructive test fixture against Scalingo or Render.
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_temperature_test');
 const db=new pg.Pool({connectionString:database,max:3});t.after(()=>db.end());
 await db.query(`
  DROP TABLE IF EXISTS sessions,temperature_comments,temperature_readings,temperature_imports,temperature_sensors,users CASCADE;
  CREATE TABLE users(id integer PRIMARY KEY,name text,email text,role text,active boolean,must_change boolean,rights jsonb,edit_rights jsonb,permissions_configured boolean);
  CREATE TABLE sessions(id text PRIMARY KEY,user_id integer REFERENCES users(id),csrf text,expires_at timestamptz);
  CREATE TABLE temperature_sensors(id text PRIMARY KEY,name text NOT NULL,low_threshold double precision DEFAULT 2,high_threshold double precision DEFAULT 8,revision integer DEFAULT 1);
  CREATE TABLE temperature_readings(sensor_id text REFERENCES temperature_sensors(id),recorded_at timestamptz,value double precision NOT NULL,PRIMARY KEY(sensor_id,recorded_at));
  CREATE TABLE temperature_comments(id bigserial PRIMARY KEY,sensor_id text REFERENCES temperature_sensors(id),happened_at timestamptz,text text,operator_name text,created_by integer,created_at timestamptz DEFAULT now());
  CREATE TABLE temperature_imports(id bigserial PRIMARY KEY,file_name text,operator_name text,imported_by integer,added integer,ignored integer,first_reading timestamptz,last_reading timestamptz,imported_at timestamptz DEFAULT now());
  INSERT INTO users VALUES(1,'TEST','admin-test@portailplus.invalid','admin',true,false,'[]','[]',true);
  INSERT INTO temperature_sensors VALUES('FRIGO_TEST','Nom existant',3,7,4),('AUTRE','Autre sonde',2,8,2);
  INSERT INTO temperature_readings VALUES('AUTRE','2026-09-01T00:00:00Z',6);
  INSERT INTO temperature_comments(sensor_id,happened_at,text) VALUES('AUTRE','2026-09-01T00:00:00Z','Commentaire conservé');
 `);
 await db.query('CREATE TABLE IF NOT EXISTS quality_services(service text,collaborator_id integer,collaborator_name text)');
 const raw=token();await db.query("INSERT INTO sessions VALUES($1,1,'csrf',now()+interval '1 hour')",[digest(raw)]);
 const gate=preview(db),server=gate.listen(0);t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 const headers={cookie:'trevoux_session='+raw,origin,'x-csrf-token':'csrf','content-type':'application/json'};
 const send=body=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
 const oldReadings=(await db.query('SELECT * FROM temperature_readings ORDER BY sensor_id,recorded_at')).rows;
 const oldComments=(await db.query('SELECT id,sensor_id,happened_at,text,operator_name,created_by,created_at FROM temperature_comments ORDER BY id')).rows;
 const broken=await fetch(base+'/api/quality/temperatures?month=2026-10',{headers});assert.equal(broken.status,500,'Reproduce the missing V/X-column regression');
 assert.deepEqual(await ensureScalingoTemperatureSchema(db),{added:['validation','revision','updated_at','history']});
 assert.deepEqual(await ensureScalingoTemperatureSchema(db),{added:[]});
 const restored=await fetch(base+'/api/quality/temperatures?month=2026-10',{headers});assert.equal(restored.status,200,await restored.clone().text());
 assert.deepEqual((await db.query('SELECT * FROM temperature_readings ORDER BY sensor_id,recorded_at')).rows,oldReadings);
 assert.deepEqual((await db.query('SELECT id,sensor_id,happened_at,text,operator_name,created_by,created_at FROM temperature_comments ORDER BY id')).rows,oldComments);
 assert.equal((await db.query('SELECT validation FROM temperature_comments')).rows[0].validation,null);

 const readings=start=>Array.from({length:6001},(_,i)=>[new Date(Date.parse(start)+i*60000).toISOString().slice(0,19).replace('T',' '),'5.0 °C']);
 const body={fileName:'releves.xlsx',fileData:workbook(readings('2026-09-10T00:00:00Z')).toString('base64')};assert.ok(JSON.stringify(body).length>64*1024);
 let response=await send(body);assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).added,6001);
 response=await send(body);const again=await response.json();assert.equal(response.status,200);assert.equal(again.added,0);assert.equal(again.ignored,6001);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM temperature_readings')).rows[0].n,6002);
 assert.deepEqual((await db.query("SELECT name,low_threshold,high_threshold,revision FROM temperature_sensors WHERE id='FRIGO_TEST'")).rows[0],{name:'Nom existant',low_threshold:3,high_threshold:7,revision:4});
 assert.equal((await db.query('SELECT text FROM temperature_comments')).rows[0].text,'Commentaire conservé');
 const before=(await db.query('SELECT count(*)::int AS n FROM temperature_imports')).rows[0].n;
 const conflict=readings('2026-09-01T00:00:00Z');conflict.push(['2026-09-10 00:00:00','6.0 °C']);
 response=await send({fileName:'conflict.xlsx',fileData:workbook(conflict).toString('base64')});assert.equal(response.status,409,await response.text());
 assert.equal((await db.query('SELECT count(*)::int AS n FROM temperature_readings')).rows[0].n,6002,'First 5000 new rows must roll back');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM temperature_imports')).rows[0].n,before,'Failed import leaves no history entry');
 // A late SQL failure must also roll back rows, rather than leaving an import
 // partly persisted while the browser receives a server error.
 await db.query("CREATE OR REPLACE FUNCTION public.reject_temperature_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Simulated history failure'; END $$; CREATE TRIGGER reject_history BEFORE INSERT ON temperature_imports FOR EACH ROW EXECUTE FUNCTION public.reject_temperature_history()");
 response=await send({fileName:'failure.xlsx',fileData:workbook([['2026-09-06 00:00:00','5.0 °C']]).toString('base64')});assert.equal(response.status,500);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM temperature_readings')).rows[0].n,6002);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM temperature_imports')).rows[0].n,before);
 await db.query('DROP TRIGGER reject_history ON temperature_imports; DROP FUNCTION public.reject_temperature_history()');
 const concurrent={fileName:'concurrent.xlsx',fileData:workbook(readings('2026-09-20T00:00:00Z')).toString('base64')};
 const results=await Promise.all([send(concurrent),send(concurrent)]);for(const r of results)assert.equal(r.status,200,await r.clone().text());
 const counts=await Promise.all(results.map(r=>r.json()));assert.deepEqual(counts.map(r=>r.added).sort((a,b)=>a-b),[0,6001]);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM temperature_readings')).rows[0].n,12003);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM temperature_readings WHERE sensor_id='AUTRE' AND value=6")).rows[0].n,1);
 const detail=await fetch(base+'/api/quality/temperatures/FRIGO_TEST?month=2026-09',{headers});assert.equal(detail.status,200,await detail.clone().text());assert.equal((await detail.json()).readings.length,12002);
 // Validation flows use the real app and preview security boundary against PostgreSQL.
 await db.query("INSERT INTO temperature_sensors(id,name) VALUES('VALIDATION_TEST','Validation'); INSERT INTO temperature_readings VALUES ('VALIDATION_TEST','2026-09-30T21:50:00Z',9),('VALIDATION_TEST','2026-09-30T22:00:00Z',9),('VALIDATION_TEST','2026-09-30T22:10:00Z',5),('VALIDATION_TEST','2026-09-30T22:20:00Z',10),('VALIDATION_TEST','2026-09-30T22:30:00Z',5)");
 await db.query("INSERT INTO temperature_comments(sensor_id,happened_at,text,operator_name,created_by) VALUES('VALIDATION_TEST','2026-09-30T21:50:00Z','Commentaire historique','TEST',1)");
 const commentsPath='/api/quality/temperatures/VALIDATION_TEST/comments';
 const writeComment=(method,suffix,body,extra={})=>fetch(base+commentsPath+suffix,{method,headers:{...headers,...extra},body:JSON.stringify(body)});
 const calendar=async month=>{const r=await fetch(base+'/api/quality/temperatures?month='+month,{headers});assert.equal(r.status,200,await r.clone().text());return (await r.json()).sensors.find(s=>s.id==='VALIDATION_TEST');};
 let september=await calendar('2026-09'),october=await calendar('2026-10');
 assert.equal(september.days[29].state,'alert');assert.equal(september.days[29].validation,null);assert.equal(october.days[0].validation,null);
 const legacy=(await db.query("SELECT id,revision FROM temperature_comments WHERE sensor_id='VALIDATION_TEST'")).rows[0];
 assert.equal((await writeComment('PUT','/'+legacy.id,{text:'Maîtrisé',validation:'V',revision:legacy.revision},{'x-csrf-token':'bad'})).status,403);
 response=await writeComment('PUT','/'+legacy.id,{text:'Maîtrisé',validation:'V',revision:legacy.revision});assert.equal(response.status,200,await response.clone().text());
 assert.equal((await writeComment('PUT','/'+legacy.id,{text:'Conflit',validation:'X',revision:legacy.revision})).status,409);
 assert.equal((await writeComment('POST','',{time:'2026-09-30 22:20:00',text:'',validation:'V'})).status,400);
 assert.equal((await writeComment('POST','',{time:'2026-09-30 22:20:00',text:'Texte',validation:'invalid'})).status,400);
 september=await calendar('2026-09');october=await calendar('2026-10');
 assert.equal(september.days[29].validation,'V');assert.equal(september.days[29].state,'alert');assert.equal(october.days[0].validation,null,'Second episode remains unvalidated');
 response=await writeComment('POST','',{time:'2026-09-30 22:20:00',text:'Problème identifié',validation:'X'});assert.equal(response.status,200,await response.text());
 october=await calendar('2026-10');assert.equal(october.days[0].validation,'X');assert.equal(october.days[0].state,'alert');
 const second=(await db.query("SELECT id,revision FROM temperature_comments WHERE sensor_id='VALIDATION_TEST' ORDER BY id DESC LIMIT 1")).rows[0];
 response=await writeComment('PUT','/'+second.id,{text:'Résolu',validation:'V',revision:second.revision});assert.equal(response.status,200);
 october=await calendar('2026-10');assert.equal(october.days[0].validation,'V');assert.equal(october.days[0].state,'alert');
 const stored=(await db.query('SELECT history FROM temperature_comments WHERE id=$1',[legacy.id])).rows[0];assert.equal(stored.history[0].text,'Commentaire historique');assert.equal(stored.history[0].validation,null);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM temperature_readings')).rows[0].n,12008,'Validation never changes imported readings');
 await db.query("UPDATE users SET role='employee' WHERE id=1");
 assert.equal((await writeComment('PUT','/'+second.id,{text:'Interdit',validation:'X',revision:2})).status,403);
 await db.query("UPDATE users SET role='admin' WHERE id=1");

});
