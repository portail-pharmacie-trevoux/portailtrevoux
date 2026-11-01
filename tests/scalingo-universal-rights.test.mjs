import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createApp} from '../server.mjs';
import {token,canAccess,canModify} from '../security.mjs';
import {registerScalingoRights,scalingoTestAdminAuth,scalingoUniverseBoundary,rightsPreview,universalReads,universalEdits,validateRights,backupReady} from '../scripts/scalingo-universal-rights.mjs';
const origin='https://portailplus-hds.osc-fr1.scalingo.io';
const employee=id=>({id,name:'Collaborateur '+id,role:'employee',active:true,must_change:false,rights:['Actualités','Agenda'],edit_rights:['Actualités'],permissions_configured:false});
const configured={...employee(2),rights:universalReads,edit_rights:universalEdits,permissions_configured:true};
test('matrice universelle : 13 consultations, trois modifications, aucun droit administrateur ni proposition implicite',()=>{
 assert.equal(universalReads.length,13);
 for(const universe of universalReads)assert.equal(canAccess(configured,universe),true,universe);
 for(const universe of universalReads)assert.equal(canModify(configured,universe),universalEdits.includes(universe),universe);
 for(const u of ['Emplois du temps','Collaborateurs','Ressources humaines'])assert.equal(canModify({...configured,edit_rights:[...universalEdits,u]},u),false);
 assert.throws(()=>validateRights({rights:universalReads,editRights:['Emplois du temps']}));
 assert.throws(()=>validateRights({rights:[],editRights:['Fun']}));
 assert.throws(()=>validateRights({rights:universalReads,editRights:universalEdits,password:'forbidden'}));
 assert.throws(()=>validateRights({rights:['Proposer une opération'],editRights:[]}));
});
test('aperçu conservateur : droits spécifiques et référents préservés, empreinte sensible aux changements, effectif contrôlé',()=>{
 const rows=Array.from({length:16},(_,i)=>employee(i+1));rows[1]={...configured,edit_rights:['Fun','Laboratoires']};
 const result=rightsPreview(rows);assert.equal(result.people[0].status,'à appliquer');assert.equal(result.people[1].status,'droits spécifiques conservés');assert.deepEqual(result.people[1].proposed.editRights,['Fun','Laboratoires']);
 rows[0].rights.push('Fun');assert.notEqual(rightsPreview(rows).fingerprint,result.fingerprint);
 assert.throws(()=>rightsPreview(rows.slice(1)),e=>e.status===409);
 assert.equal(backupReady({}),false);assert.equal(backupReady({SCALINGO_RIGHTS_BACKUP_REFERENCE:'backup-id',SCALINGO_RIGHTS_BACKUP_VERIFIED_AT:new Date(Date.now()-25*3600000).toISOString()}),false);
});
test('API Scalingo : TEST admin actif uniquement, CSRF, origine, sauvegarde, validation, comptes protégés et confirmation concurrente',async t=>{
 let actor={id:99,email:'admin-test@portailplus.invalid',role:'admin',active:true,must_change:false,csrf:'csrf'};
 const rows=Array.from({length:16},(_,i)=>employee(i+1));rows[1]={...employee(2),permissions_configured:true,edit_rights:['Fun','Laboratoires']};
 const writes=[];const db={connect:async()=>({...db,release(){}}),query:async(sql,args=[])=>{
  if(sql.includes('JOIN users'))return {rows:actor?[actor]:[]};
  if(sql.startsWith('SELECT id,name'))return {rows};
  if(sql.startsWith('SELECT id,role'))return {rows:args[0]===99?[{id:99,role:'admin'}]:rows.filter(p=>p.id===args[0])};
  if(sql.startsWith('UPDATE users')){writes.push(args);const p=rows.find(p=>p.id===args[0]);p.rights=JSON.parse(args[1]);p.edit_rights=JSON.parse(args[2]);p.permissions_configured=true;return {rows:[],rowCount:1};}
  if(sql.startsWith('DELETE FROM sessions')){writes.push(['session',...args]);return {rows:[]};}
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};throw Error(sql);
 }};
 const env={},gate=express();gate.use(express.json());registerScalingoRights({gate,db,origin,env,adminAuth:scalingoTestAdminAuth(db)});gate.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=gate.listen(0);t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 const headers={cookie:'trevoux_session='+token(),origin,'x-csrf-token':'csrf','content-type':'application/json'};
 const send=(path,method='GET',body,extra={})=>fetch(base+path,{method,headers:{...headers,...extra},body:body?JSON.stringify(body):undefined});
 const body={rights:universalReads,editRights:universalEdits};
 assert.equal((await send('/api/staging-universal-rights','GET',null,{cookie:''})).status,401);
 actor.role='employee';assert.equal((await send('/api/users/1','PUT',body)).status,403);actor.role='admin';
 actor.must_change=true;assert.equal((await send('/api/users/1','PUT',body)).status,403);actor.must_change=false;
 actor.email='other-admin@example.test';assert.equal((await send('/api/users/1','PUT',body)).status,403);actor.email='admin-test@portailplus.invalid';
 assert.equal((await send('/api/users/1','PUT',body)).status,409);assert.equal(writes.length,0);
 Object.assign(env,{SCALINGO_RIGHTS_BACKUP_REFERENCE:'verified-test-backup',SCALINGO_RIGHTS_BACKUP_VERIFIED_AT:new Date().toISOString()});
 assert.equal((await send('/api/users/1','PUT',body,{'x-csrf-token':'bad'})).status,403);
 assert.equal((await send('/api/users/1','PUT',body,{origin:'https://other.invalid'})).status,403);
 assert.equal((await send('/api/users/99','PUT',body)).status,403);
 for(const extra of [{administratorRights:true},{password:'x'},{email:'x@example.test'},{details:{}}])assert.equal((await send('/api/users/1','PUT',{...body,...extra})).status,400);
 assert.equal(writes.length,0);
 const initial=await (await send('/api/staging-universal-rights')).json();assert.equal(initial.people.length,16);
 assert.equal((await send('/api/users/1','PUT',body)).status,200);assert.deepEqual(writes[1],['session',1]);
 const apply=fingerprint=>send('/api/staging-universal-rights','POST',{fingerprint,confirmation:'APPLIQUER LES DROITS UNIVERSELS'});
 assert.equal((await apply(initial.fingerprint)).status,409);
 const fresh=await (await send('/api/staging-universal-rights')).json();
 assert.equal((await send('/api/staging-universal-rights','POST',{fingerprint:fresh.fingerprint})).status,400);
 const applied=await apply(fresh.fingerprint);assert.equal(applied.status,200);assert.deepEqual(await applied.json(),{updated:14,preserved:[2]});
 assert.deepEqual(rows[1].edit_rights,['Fun','Laboratoires']);
 const repeat=await (await send('/api/staging-universal-rights')).json();assert.deepEqual(await (await apply(repeat.fingerprint)).json(),{updated:0,preserved:[2]});
});
test('vraies routes HTTP : collaborateur interdit de planning/fiches/laboratoires/merchandising ; Agenda, Communication et Fun permis',async t=>{
 let actor={...configured,csrf:'csrf'};let musicWrites=0;
 const db={query:async(sql,args=[])=>{
  if(sql.includes('JOIN users u ON u.id=s.user_id'))return {rows:[actor]};
  if(sql.startsWith('INSERT INTO calendar_tasks'))return {rows:[{id:1}]};
  if(sql.startsWith('INSERT INTO music_tracks')){musicWrites++;return {rows:[{id:1,title:args[1],artist:args[0]}]};}
  if(sql.startsWith('SELECT id,name FROM users'))return {rows:[]};
  if(sql.startsWith('INSERT INTO publications'))return {rows:[]};
  throw Error('Unexpected database operation: '+sql);
 }};
 const {app}=createApp(db,{origin,secret:'s'.repeat(40),dummyHash:'unused',mailEmail:'',googleId:'',googleSecret:'',googleEmail:''});
 const gate=express();gate.use(scalingoUniverseBoundary(db));gate.use(app);gate.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=gate.listen(0);t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 const headers={cookie:'trevoux_session='+token(),origin,'x-csrf-token':'csrf','content-type':'application/json'};
 const send=(path,body={},method='POST',extra={})=>fetch(base+path,{method,headers:{...headers,...extra},body:JSON.stringify(body)});
 for(const [path,method] of [['/api/users/3','PUT'],['/api/schedule/2026-11-02/day','PUT'],['/api/laboratories/1','PUT'],['/api/merchandising/promotions','POST']])assert.equal((await send(path,{},method)).status,403,path);
 assert.equal((await send('/api/music',{artist:'Artiste',title:'Titre'})).status,201);assert.equal(musicWrites,1);
 assert.equal((await send('/api/music',{artist:'Artiste',title:'Titre'},'POST',{'x-csrf-token':'bad'})).status,403);
 const task=await send('/api/calendar/tasks',{title:'Tâche',date:'2026-11-02',icon:'✅'});assert.equal(task.status,201,await task.text());
 // Recipients endpoint exercises the authenticated Communication API without email.
 const recipients=await fetch(base+'/api/news/recipients',{headers});assert.equal(recipients.status,200,await recipients.text());
 actor={...actor,rights:[],edit_rights:[]};assert.equal((await send('/api/music',{artist:'Artiste',title:'Titre'})).status,403);assert.equal((await send('/api/calendar/tasks',{title:'Tâche interdite',date:'2026-11-02',icon:'✅'})).status,403);
});
