import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createApp} from '../server.mjs';
import {token} from '../security.mjs';
import {errorTypes} from '../public/quality-error-types.js';
import {scalingoUniverseBoundary} from '../scripts/scalingo-universal-rights.mjs';
import {isScalingoQualityErrorRoute} from '../scripts/scalingo-quality-errors-preview.mjs';
const universe="Outils d'aide à la démarche qualité",origin='https://portailplus-hds.osc-fr1.scalingo.io';
test('Scalingo : seules les méthodes et routes exactes du registre et du suivi lié sont ouvertes',()=>{
 const allowed={GET:['/api/quality/errors','/api/quality/errors/export.xlsx','/api/quality/prescriber-calls'],POST:['/api/quality/errors','/api/quality/prescriber-calls'],PUT:['/api/quality/errors/1','/api/quality/errors/1/status','/api/quality/errors/1/notification','/api/quality/prescriber-calls/2'],DELETE:['/api/quality/errors/1']};
 for(const [method,paths]of Object.entries(allowed))for(const path of paths)assert.equal(isScalingoQualityErrorRoute({method,path}),true,method+' '+path);
 for(const [method,path]of [['PATCH','/api/quality/errors/1'],['POST','/api/quality/errors/1'],['POST','/api/quality/errors/import'],['GET','/api/quality/errors/1'],['DELETE','/api/quality/prescriber-calls/1'],['PUT','/api/quality/errors/0'],['PUT','/api/quality/errors/1/email'],['POST','/api/quality/errors/1/notification'],['POST','/api/quality/errors/extra'],['POST','/api/quality/other']])assert.equal(isScalingoQualityErrorRoute({method,path}),false,method+' '+path);
});
test('HTTP Scalingo : création, lecture, modification, notifications, état, export et appels sans contourner les permissions',async t=>{
 let actor={id:1,name:'Administrateur local',email:'admin-test@portailplus.invalid',role:'admin',active:true,must_change:false,csrf:'csrf',rights:[universe],edit_rights:[universe],permissions_configured:true};
 const original={id:900,details:'Cas technique de test préexistant',revision:1,status:'declared',identified_date:'2026-10-01',error_date:'2026-10-01'};
 const errors=[structuredClone(original)],calls=[];let writes=0,expired=false;
 // Synthetic records only. No connection to Scalingo, Render or real patient data.
 const db={query:async(sql,args=[])=>{
  if(sql.includes('JOIN users u ON u.id=s.user_id'))return {rows:actor?.active&&!expired?[{...actor}]:[]};
  if(sql.startsWith('SELECT e.*'))return {rows:errors.map(e=>({...e,can_edit:args[0]}))};
  if(sql.startsWith('SELECT id,name,active FROM users'))return {rows:[{id:2,name:'Collaborateur local',active:true}]};
  if(sql.startsWith('SELECT * FROM quality_errors ORDER BY'))return {rows:errors};
  if(sql.startsWith('SELECT * FROM quality_prescriber_calls ORDER BY'))return {rows:calls};
  if(sql.startsWith('SELECT id FROM quality_errors'))return {rows:errors.filter(e=>e.id===args[0]&&e.doctor_notified_at)};
  if(sql.startsWith('INSERT INTO quality_errors')){
   writes++;const row={id:1,identified_date:args[0],error_type:args[1],details:args[2],responsible_id:args[3],error_date:args[4],actions:args[5],severity:args[6],created_by:args[7],operator_name:args[8],responsible_name:'Collaborateur local',revision:1,status:'declared',status_history:[],created_at:'2026-10-01T12:00:00Z'};errors.push(row);return {rows:[row]};
  }
  if(sql.startsWith('UPDATE quality_errors e SET')){
   const row=errors.find(e=>e.id===args[7]&&e.revision===args[8]);if(!row)return {rows:[]};writes++;Object.assign(row,{details:args[2],actions:args[5],severity:args[6],revision:row.revision+1});return {rows:[row]};
  }
  if(sql.startsWith('UPDATE quality_errors SET status=')){
   const row=errors.find(e=>e.id===args[0]&&e.revision===args[2]&&e.status!==args[1]);if(!row)return {rows:[]};writes++;row.status_history.push({from:row.status,to:args[1],by:args[3]});row.status=args[1];row.revision++;return {rows:[row]};
  }
  if(sql.startsWith('UPDATE quality_errors SET')){
   const row=errors.find(e=>e.id===args[0]&&e.revision===args[4]);if(!row)return {rows:[]};const field=sql.match(/SET (\w+)_at=/)[1];writes++;Object.assign(row,{[field+'_at']:args[1]?'2026-10-01T12:00:00Z':null,[field+'_by']:args[1]?args[2]:null,[field+'_name']:args[1]?args[3]:null});row.revision++;return {rows:[row]};
  }
  if(sql.startsWith('INSERT INTO quality_prescriber_calls')){
   if(calls.some(c=>c.request_id===args[0]))return {rows:[]};writes++;const row={id:1,request_id:args[0],error_id:args[1],call_date:args[2],prescriber:args[3],reason:args[4],outcome:args[5],created_by:args[6],operator_name:args[7],follow_up:args[8],follow_up_date:args[9],revision:1};calls.push(row);return {rows:[row]};
  }
  if(sql.startsWith('UPDATE quality_prescriber_calls')){
   const row=calls.find(c=>c.id===args[0]&&c.revision===args[6]&&(c.created_by===args[7]||args[8]));if(!row)return {rows:[]};writes++;Object.assign(row,{outcome:args[1],follow_up:args[2],follow_up_date:args[3],follow_up_done_at:args[4]?'2026-10-01T12:00:00Z':null,revision:row.revision+1});return {rows:[row]};
  }
  if(sql.startsWith('DELETE FROM quality_errors')){
   const index=errors.findIndex(e=>e.id===args[0]&&e.revision===args[1]);if(index<0)return {rows:[]};writes++;return {rows:errors.splice(index,1)};
  }
  throw Error('Unexpected query in local test');
 }};
 const {app}=createApp(db,{origin,secret:'local-test-secret-'.repeat(3),dummyHash:'unused',googleId:'',googleSecret:'',googleEmail:'',mailEmail:'',mailFetch:async()=>{throw Error('No external calls allowed');}});
 const gate=express();gate.use(express.json({limit:'64kb'}));gate.use(scalingoUniverseBoundary(db));
 gate.use((req,res,next)=>isScalingoQualityErrorRoute(req)?next():res.status(403).json({error:'Route désactivée'}));gate.use(app);gate.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=gate.listen(0);t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port,root='/api/quality/errors';
 const headers={cookie:'trevoux_session='+token(),origin,'x-csrf-token':'csrf','content-type':'application/json'};
 const send=(path,method='GET',body,extra={})=>fetch(base+path,{method,headers:{...headers,...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const body={identifiedDate:'2026-10-01',errorDate:'2026-10-01',type:errorTypes[0],details:'Écart de dosage — scénario local sans patient',responsibleId:2,actions:'Vérification technique',severity:2};
 for(const path of [root,root+'/export.xlsx','/api/quality/prescriber-calls'])assert.equal((await send(path,'GET',undefined,{cookie:''})).status,401);
 expired=true;assert.equal((await send(root)).status,401);expired=false;
 actor.must_change=true;assert.equal((await send(root,'POST',body)).status,403);actor.must_change=false;
 assert.equal((await send(root,'POST',body,{'x-csrf-token':'bad'})).status,403);
 assert.equal((await send(root,'POST',body,{origin:'https://other.invalid'})).status,403);
 assert.equal((await send(root,'POST',{...body,severity:0})).status,400);assert.equal(writes,0);
 const admin={...actor};actor={...actor,id:3,name:'Lecteur local',role:'employee',edit_rights:[]};
 let response=await send(root);assert.equal(response.status,200);assert.equal((await response.json()).errors[0].can_edit,false);
 assert.equal((await send(root,'POST',body)).status,403);assert.equal((await send(root+'/900/notification','PUT',{target:'patient',checked:true,revision:1})).status,403);assert.equal(writes,0);
 actor={...actor,edit_rights:[universe]};
 response=await send(root,'POST',{...body,createdBy:999,operatorName:'Forged'});assert.equal(response.status,200,await response.clone().text());let row=await response.json();assert.equal(row.created_by,3);assert.equal(row.operator_name,'Lecteur local');
 for(const [method,path,b]of [['PUT',root+'/1',{...body,revision:1}],['DELETE',root+'/1',{revision:1}],['PUT',root+'/1/status',{status:'closed',revision:1}]])assert.equal((await send(path,method,b)).status,403);
 actor=admin;response=await send(root+'/1','PUT',{...body,details:'Correction technique',revision:1});assert.equal(response.status,200);assert.equal((await response.json()).revision,2);
 assert.equal((await send(root+'/1','PUT',{...body,revision:1})).status,409);
 response=await send(root+'/1/notification','PUT',{target:'doctor',checked:true,revision:2});assert.equal(response.status,200);row=await response.json();assert.equal(row.doctor_notified_by,1);
 assert.equal((await send(root+'/1/notification','PUT',{target:'patient',checked:true,revision:2})).status,409);
 response=await send(root+'/1/status','PUT',{status:'in_progress',revision:3});assert.equal(response.status,200);assert.equal((await response.json()).status_history[0].by,admin.name);
 const callBody={requestId:'00000000-0000-4000-8000-000000000001',errorId:1,callDate:'2026-10-01',prescriber:'Prescripteur de test',reason:'Vérification technique sans identité patient',outcome:'Contrôle local',followUp:'Vérifier',followUpDate:'2026-11-01'};
 response=await send('/api/quality/prescriber-calls','POST',callBody);assert.equal(response.status,201);
 assert.equal((await send('/api/quality/prescriber-calls','POST',callBody)).status,409);
 const follow={outcome:'Vérifié',followUp:'Vérifier',followUpDate:'2026-11-01',followUpDone:true,revision:1};
 actor={...admin,id:4,role:'employee'};assert.equal((await send('/api/quality/prescriber-calls/1','PUT',follow)).status,409);
 actor=admin;response=await send('/api/quality/prescriber-calls/1','PUT',follow);assert.equal(response.status,200);assert.equal((await response.json()).revision,2);
 response=await send('/api/quality/prescriber-calls');assert.equal(response.status,200);assert.equal((await response.json()).calls[0].follow_up_done_at,'2026-10-01T12:00:00Z');
 response=await send(root+'/export.xlsx');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('content-type'),/spreadsheetml/);assert.equal(Buffer.from(await response.arrayBuffer()).readUInt32LE(0),0x04034b50);
 assert.equal((await send(root+'/1','DELETE',{revision:4},{'x-csrf-token':'bad'})).status,403);
 assert.equal((await send(root+'/1','DELETE',{revision:1})).status,409);assert.equal((await send(root+'/1','DELETE',{revision:4})).status,200);
 assert.deepEqual(errors,[original],'Unrelated existing records must remain intact');
});
