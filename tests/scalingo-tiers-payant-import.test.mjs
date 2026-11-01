import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pg from 'pg';
import {createApp} from '../server.mjs';
import {token,digest} from '../security.mjs';
import {parseRejectionSheets,rejectionRate} from '../public/tiers-payant-model.js';
import {scalingoUniverseBoundary} from '../scripts/scalingo-universal-rights.mjs';
import {isScalingoTiersPayantImport,registerScalingoTiersPayantImport} from '../scripts/scalingo-tiers-payant-preview.mjs';
const universe="Outils d'aide à la démarche qualité",origin='https://portailplus-hds.osc-fr1.scalingo.io',path='/api/quality/tiers-payant/import';
// Aggregated synthetic test values only. Never load the user's workbook.
const records=Array.from({length:69},(_,i)=>({month:new Date(Date.UTC(2021,i,1)).toISOString().slice(0,7),invoices:[1000,1000,0,3][i%4],rejections:[20,21,0,1][i%4],amount:i%4===2?0:12.34+i}));
test('Scalingo TP : seule la route POST exacte de l’import est ouverte',()=>{
 assert.equal(isScalingoTiersPayantImport({method:'POST',path}),true);
 for(const [method,url]of [['GET',path],['PUT',path],['DELETE',path],['POST',path+'/extra'],['POST','/api/quality/tiers-payant/2026-09'],['PUT','/api/quality/tiers-payant/2026-09'],['POST','/api/quality/other/import']])assert.equal(isScalingoTiersPayantImport({method,path:url}),false);
 assert.ok(Buffer.byteLength(JSON.stringify({records}))<64*1024,'The 69-month JSON must fit the unchanged preview limit');
});
test('Source de 69 mois janvier 2021–septembre 2026 : pourcentages source ignorés et taux recalculés',()=>{
 const months=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
 const sheets=Array.from({length:6},(_,i)=>{const year=2021+i,rows=months.map((_,m)=>records.find(r=>r.month===year+'-'+String(m+1).padStart(2,'0')));return {rows:[['ANNÉE '+year,...months],['FACTURES',...rows.map(r=>r?.invoices??null)],['NBR REJETS',...rows.map(r=>r?.rejections??null)],['%',...rows.map(r=>r?'99%':null)],['MONTANT',...rows.map(r=>r?.amount??null)]]};});
 const parsed=parseRejectionSheets(sheets);assert.equal(parsed.records.length,69);assert.equal(parsed.records[0].month,'2021-01');assert.equal(parsed.records.at(-1).month,'2026-09');
 assert.equal(rejectionRate(parsed.records[0].invoices,parsed.records[0].rejections),2);
 assert.ok(Math.abs(rejectionRate(parsed.records[1].invoices,parsed.records[1].rejections)-2.1)<1e-12);
 assert.equal(rejectionRate(parsed.records[2].invoices,parsed.records[2].rejections),null);
 assert.ok(Math.abs(rejectionRate(parsed.records[3].invoices,parsed.records[3].rejections)-100/3)<1e-12);
 assert.equal(parsed.warnings.length,52);
});
const database=process.env.PORTAIL_TP_TEST_DATABASE_URL;
test('HTTP sans PostgreSQL : enregistrement effectif avant le filtre, autres routes bloquées et sécurité applicative conservée',async t=>{
 let actor={id:1,name:'Compte de test local',role:'admin',active:true,must_change:false,csrf:'csrf',rights:[universe],edit_rights:[universe],permissions_configured:true};
 const db={query:async(sql)=>{
  if(sql.includes('JOIN users u ON u.id=s.user_id'))return {rows:actor?[actor]:[]};
  if(sql.startsWith('SELECT DISTINCT u.id'))return {rows:[]};
  throw Error('Unexpected access in routing test');
 },connect:async()=>({query:async(sql,args=[])=>{
  if(['BEGIN','COMMIT','ROLLBACK','SELECT pg_advisory_xact_lock(783411)'].includes(sql))return {rows:[]};
  if(sql.startsWith('SELECT invoices')){const old=records.find(r=>r.month===args[0]);return {rows:old?[{invoices:old.invoices,rejections:old.rejections,amount_cents:String(Math.round(old.amount*100))}]:[]};}
  throw Error('Routing test must not write monthly data');
 },release(){}})};
 const {app}=createApp(db,{origin,secret:'local-only-secret-'.repeat(3),dummyHash:'unused',googleId:'',googleSecret:'',googleEmail:'',mailEmail:''});
 const gate=express();gate.use(express.json({limit:'64kb'}));gate.use(scalingoUniverseBoundary(db));
 registerScalingoTiersPayantImport(gate,app);
 gate.use((req,res)=>res.status(403).json({error:`Fonction désactivée dans la prévisualisation (${req.method} ${req.path}).`}));
 gate.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
 const server=gate.listen(0);t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 const headers={cookie:'trevoux_session='+token(),origin,'x-csrf-token':'csrf','content-type':'application/json'};
 const send=(url,body={records},method='POST',extra={})=>fetch(base+url,{method,headers:{...headers,...extra},body:JSON.stringify(body)});
 let response=await send(path);assert.equal(response.status,200,await response.clone().text());assert.deepEqual(await response.json(),{added:0,ignored:69});
 response=await send(path,{records:[]});assert.equal(response.status,400);assert.doesNotMatch((await response.json()).error,/Fonction désactivée/);
 assert.equal((await send(path,{records},'POST',{'x-csrf-token':'bad'})).status,403);
 assert.equal((await send(path,{records},'POST',{origin:'https://other.invalid'})).status,403);
 assert.equal((await send(path,{records},'POST',{cookie:''})).status,401);
 actor={...actor,role:'employee',edit_rights:[]};assert.equal((await send(path)).status,403);
 actor={...actor,role:'admin',edit_rights:[universe]};
 for(const url of [path+'/extra','/api/quality/tiers-payant/other','/api/quality/other/import']){
  response=await send(url);assert.equal(response.status,403);assert.match((await response.json()).error,/Fonction désactivée/);
 }
 response=await send(path,{records},'PUT');assert.equal(response.status,403);assert.match((await response.json()).error,/Fonction désactivée/);
});
test('PostgreSQL local + filtre Scalingo : 69 mois, autorisations, doublons, conflits atomiques et données conservées',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_tp_test');assert.equal(url.search,'');
 const db=new pg.Pool({connectionString:database,max:3});t.after(()=>db.end());
 await db.query(`DROP TABLE IF EXISTS sessions,quality_services,quality_tp_months,users CASCADE;
 CREATE TABLE users(id integer PRIMARY KEY,name text,email text,role text,active boolean,must_change boolean,rights jsonb,edit_rights jsonb,permissions_configured boolean);
 CREATE TABLE sessions(id text PRIMARY KEY,user_id integer REFERENCES users(id),csrf text,expires_at timestamptz);
 CREATE TABLE quality_services(service text,collaborator_id integer REFERENCES users(id));
 CREATE TABLE quality_tp_months(month text PRIMARY KEY,invoices integer NOT NULL CHECK(invoices>=0),rejections integer NOT NULL CHECK(rejections>=0 AND rejections<=invoices),amount_cents bigint NOT NULL CHECK(amount_cents>=0),revision integer NOT NULL DEFAULT 1,operator_name text NOT NULL,updated_by integer REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),corrective_actions text NOT NULL DEFAULT '');`);
 const cookies={};
 for(const [id,role,edit]of [[1,'admin',true],[2,'employee',false],[3,'employee',true],[4,'employee',true]]){
  await db.query('INSERT INTO users VALUES($1,$2,$3,$4,true,false,$5,$6,true)',[id,'Compte local '+id,'local-'+id+'@example.invalid',role,JSON.stringify([universe]),JSON.stringify(edit?[universe]:[])]);
  const raw=token();cookies[id]='trevoux_session='+raw;await db.query("INSERT INTO sessions VALUES($1,$2,$3,now()+interval '1 hour')",[digest(raw),id,'csrf-'+id]);
 }
 await db.query("INSERT INTO quality_services VALUES('Tiers payant',3)");
 const first=records[0];await db.query("INSERT INTO quality_tp_months VALUES($1,$2,$3,$4,7,'Opérateur conservé',1,'2026-01-01T00:00:00Z','Action existante à conserver')",[first.month,first.invoices,first.rejections,Math.round(first.amount*100)]);
 await db.query("INSERT INTO quality_tp_months VALUES('2020-12',42,1,1234,4,'Autre opérateur conservé',1,'2026-01-01T00:00:00Z','Autre action conservée')");
 const originals=(await db.query('SELECT * FROM quality_tp_months ORDER BY month')).rows;
 const {app}=createApp(db,{origin,secret:'local-only-secret-'.repeat(3),dummyHash:'unused',googleId:'',googleSecret:'',googleEmail:'',mailEmail:''});
 const gate=express();gate.use(express.json({limit:'64kb'}));gate.use(scalingoUniverseBoundary(db));
 registerScalingoTiersPayantImport(gate,app);
 gate.use((req,res,next)=>(req.method==='GET'&&req.path==='/api/quality/tiers-payant')?next():res.status(403).json({error:'Route désactivée'}));gate.use(app);gate.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=gate.listen(0);t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 const send=(body,id=1,extra={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',origin,cookie:cookies[id],'x-csrf-token':'csrf-'+id,...extra},body:JSON.stringify(body)});
 const count=async()=>(await db.query('SELECT count(*)::int AS n FROM quality_tp_months')).rows[0].n;
 assert.equal((await send({records},1,{cookie:''})).status,401);
 assert.equal((await send({records},1,{'x-csrf-token':'bad'})).status,403);
 assert.equal((await send({records},1,{origin:'https://other.invalid'})).status,403);
 assert.equal((await send({records},2)).status,403);assert.equal((await send({records},4)).status,403);
 await db.query('UPDATE users SET must_change=true WHERE id=1');assert.equal((await send({records})).status,403);await db.query('UPDATE users SET must_change=false WHERE id=1');
 await db.query("UPDATE users SET edit_rights='[]' WHERE id=3");assert.equal((await send({records},3)).status,403);await db.query('UPDATE users SET edit_rights=$1 WHERE id=3',[JSON.stringify([universe])]);
 assert.equal(await count(),2);
 let response=await send({records:records.map(r=>({...r,rate:999}))},3);assert.equal(response.status,200,await response.clone().text());assert.deepEqual(await response.json(),{added:68,ignored:1});
 response=await send({records});assert.equal(response.status,200);assert.deepEqual(await response.json(),{added:0,ignored:69});assert.equal(await count(),70);
 assert.deepEqual((await db.query("SELECT * FROM quality_tp_months WHERE month IN ('2020-12','2021-01') ORDER BY month")).rows,originals,'Identical months retain metadata, revision and actions');
 const snapshot=(await db.query('SELECT * FROM quality_tp_months ORDER BY month')).rows;
 for(const change of [{invoices:first.invoices+1},{rejections:first.rejections+1},{amount:first.amount+0.01}]){
  response=await send({records:[{month:'2020-11',invoices:10,rejections:1,amount:1},{...first,...change}]});assert.equal(response.status,409,await response.text());
  assert.deepEqual((await db.query('SELECT * FROM quality_tp_months ORDER BY month')).rows,snapshot,'A late conflict must roll back preceding insertions and preserve all rows');
 }
 response=await fetch(base+'/api/quality/tiers-payant?year=2021',{headers:{cookie:cookies[2]}});assert.equal(response.status,200);const read=await response.json();assert.equal(read.canEdit,false);assert.equal(read.rows.length,12);
 assert.equal(read.rows[0].rate,2);assert.equal(read.rows[0].status,'tolerable');assert.ok(Math.abs(read.rows[1].rate-2.1)<1e-12);assert.equal(read.rows[1].status,'problematic');assert.equal(read.rows[2].rate,null);assert.equal(read.rows[2].status,'unknown');assert.ok(Math.abs(read.rows[3].rate-100/3)<1e-12);
 assert.equal((await send({records:[first,first]})).status,400);assert.equal((await send({records:[{...first,invoices:-1}]})).status,400);
 const shared={records:[{month:'2020-01',invoices:100,rejections:2,amount:1.23}]};const responses=await Promise.all([send(shared),send(shared)]);for(const r of responses)assert.equal(r.status,200);const results=await Promise.all(responses.map(r=>r.json()));assert.deepEqual(results.map(r=>r.added).sort(),[0,1]);
 assert.deepEqual((await db.query("SELECT * FROM quality_tp_months WHERE month IN ('2020-12','2021-01') ORDER BY month")).rows,originals);
});
