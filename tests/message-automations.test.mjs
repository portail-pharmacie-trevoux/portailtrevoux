import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';
import {automationDefaults,ensureMessageAutomations} from '../message-automation-defaults.mjs';
import {automationOccurrence,automationContext,validateAutomation,renderAutomationText,parisWall} from '../message-automation-model.mjs';
import {automationPayloads,runMessageAutomations} from '../message-automation-engine.mjs';
import {registerMessageAutomationAdmin} from '../message-automation-admin.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const config={frequency:'monthly',startDate:'2026-10-29',time:'08:00',monthEnd:false,text:'Rappel {mois}',priority:'normal',canArchive:true,audience:{mode:'users',userIds:[2],serviceIds:[]}};
test('Automations: nine current defaults, strict settings and templates',async()=>{
 const defaults=automationDefaults({temperature_reminder_start:'2026-11',order_reminder_start:'2026-10-20'});assert.equal(defaults.length,9);assert.equal(new Set(defaults.map(j=>j.kind)).size,9);
 for(const job of defaults)assert.doesNotThrow(()=>validateAutomation({...job,enabled:true},fail));
 for(const patch of [{frequency:'hourly'},{startDate:'2027-02-29'},{time:'25:00'},{text:'{secret}'},{audience:{mode:'users',userIds:[],serviceIds:[]}}])assert.throws(()=>validateAutomation({name:'Test',enabled:true,config:{...config,...patch}},fail));
 let inserts=0;await ensureMessageAutomations({query:async(sql)=>{if(sql.startsWith('SELECT'))return{rows:[]};assert.match(sql,/ON CONFLICT\(id\) DO NOTHING/);inserts++;return{rows:[]};}});assert.equal(inserts,9);
 assert.match(renderAutomationText('{service} : {mois_precedent}',automationContext('2027-01-01',{service:'RH'})),/RH : décembre 2026/);
});
test('Automations: real recurrence, Paris DST, February and quarterly month ends',()=>{
 assert.equal(automationOccurrence(config,new Date('2026-10-29T06:59:00Z')),null);
 assert.equal(automationOccurrence(config,new Date('2026-10-29T07:00:00Z')).date,'2026-10-29');
 assert.equal(automationOccurrence(config,new Date('2027-02-28T07:00:00Z')).date,'2027-02-28');
 assert.equal(automationOccurrence({...config,startDate:'2026-01-31'},new Date('2026-03-01T08:00:00Z')).date,'2026-02-28');
 const training=automationDefaults().find(j=>j.kind==='training').config;
 assert.equal(automationOccurrence(training,new Date('2026-10-25T12:00:00Z'),true).date,'2026-11-30');
 assert.equal(automationOccurrence(training,new Date('2027-03-01T12:00:00Z')).date,'2027-02-28');
 assert.equal(automationOccurrence({...config,frequency:'weekly',startDate:'2026-10-20'},new Date('2026-10-26T08:00:00Z'),true).date,'2026-10-27');
 assert.equal(automationOccurrence({...config,frequency:'once'},new Date('2026-11-01T08:00:00Z'),true),null);
 assert.equal(automationOccurrence(config,new Date('2026-10-29T06:00:00Z'),true,['2026-10-29']).date,'2026-11-29');
 assert.equal(parisWall(new Date('2026-10-25T01:30:00Z')).slice(11,16),'02:30');
});
const fixtureDB=(people,services=[],extra=()=>[])=>({query:async(sql,args)=>{if(sql.startsWith('SELECT id,name,job'))return{rows:people};if(sql.startsWith('SELECT id,service,collaborator_id'))return{rows:services};return{rows:extra(sql,args)};}});
test('Automations: live service routing, selected people, annual per-service messages',async()=>{
 const people=[{id:2,name:'Alice'},{id:3,name:'Bob'}],services=[{id:10,service:'Emplois du temps & RH',collaborator_id:2},{id:11,service:'Chaîne du froid',collaborator_id:3},{id:12,service:'Autre service',collaborator_id:2}];
 const job=automationDefaults().find(j=>j.kind==='rh'),db=fixtureDB(people,services);
 assert.deepEqual((await automationPayloads(db,job,'2026-10-29','secret'))[0].recipients,[2]);
 services[0].collaborator_id=3;assert.deepEqual((await automationPayloads(db,job,'2026-11-29','secret'))[0].recipients,[3]);
 const annual=automationDefaults().find(j=>j.kind==='annual');assert.equal((await automationPayloads(db,annual,'2026-11-15','secret')).length,3);
 annual.config.audience={mode:'services',serviceIds:[10],userIds:[]};const p=await automationPayloads(db,annual,'2026-11-15','secret');assert.equal(p.length,1);assert.deepEqual(p[0].recipients,[3]);assert.match(p[0].text,/Emplois du temps & RH/);
 const custom={kind:'custom',config};assert.deepEqual((await automationPayloads(db,custom,'2026-11-29','secret'))[0].recipients,[2]);
});
test('Automations: training and challenges preserve recipient-specific conditions',async()=>{
 const people=[{id:2,name:'Alice',job:'Pharmacienne'},{id:3,name:'Bob',job:'Préparateur'},{id:4,name:'Other',job:'Secrétaire'}];
 const db=fixtureDB(people,[],sql=>sql.includes('FROM hr_documents')?[{owner_id:2,title:'Attestation de formation — Cours — 01/10/2026'}]:sql.includes('FROM team_challenges')?[{id:1,title:'Challenge',participants:[{id:2}],target:10,metric:'units',laboratory:'Labo'}]:[]);
 const training=automationDefaults().find(j=>j.kind==='training'),messages=await automationPayloads(db,training,'2026-11-30','secret',new Date('2026-11-30T08:00:00Z'));assert.deepEqual(messages[0].recipients,[3]);
 const challenges=await automationPayloads(db,automationDefaults().find(j=>j.kind==='challenges'),'2026-11-01','secret');assert.equal(challenges.length,1);assert.deepEqual(challenges[0].recipients,[2]);assert.ok(!('participants' in challenges[0].challengeDigest[0]));
});
test('Automations: transactional execution, no duplicate, failed deliveries roll back, no retroactive activation',async()=>{
 const job={id:'custom-test',kind:'custom',enabled:true,config,activation_at:'2026-10-25T10:00:00Z'},runs=new Map();let inserted=0,failDelivery=false,rolledBack=0;
 const query=async(sql,a)=>{
  if(sql==='BEGIN'||sql==='COMMIT')return{rows:[]};if(sql==='ROLLBACK'){rolledBack++;inserted=0;return{rows:[]};}
  if(sql.startsWith('SELECT id FROM message_automations'))return{rows:[{id:job.id}]};if(sql.startsWith('SELECT * FROM message_automations'))return{rows:[job]};if(sql.startsWith('SELECT status'))return{rows:runs.has(a[1])?[{status:runs.get(a[1])}]:[]};
  if(sql.startsWith('SELECT id,name,job'))return{rows:[{id:2,name:'Alice'}]};if(sql.startsWith('SELECT id,service'))return{rows:[]};
  if(sql.startsWith('INSERT INTO team_messages')){inserted++;assert.equal(a[3],'custom');return{rows:[{id:9}]};}
  if(sql.startsWith('INSERT INTO team_message_recipients')){if(failDelivery)throw Error('delivery failure');return{rows:[{user_id:2}]};}
  if(sql.includes('INSERT INTO message_automation_runs')){runs.set(a[1],sql.includes("VALUES($1,$2::date,'failed'")?'failed':a[2]);return{rows:[]};}throw Error(sql);
 };
 const db={query,connect:async()=>({query,release(){}})};
 await runMessageAutomations(db,'secret',new Date('2026-10-25T12:00:00Z'));assert.equal(inserted,0);
 await runMessageAutomations(db,'secret',new Date('2026-10-29T08:00:00Z'));await runMessageAutomations(db,'secret',new Date('2026-10-29T08:15:00Z'));assert.equal(inserted,1);assert.equal(runs.get('2026-10-29'),'sent');
 failDelivery=true;await runMessageAutomations(db,'secret',new Date('2026-11-29T08:00:00Z'));assert.equal(rolledBack,1);assert.equal(runs.get('2026-11-29'),'failed');
 failDelivery=false;await runMessageAutomations(db,'secret',new Date('2026-11-29T08:15:00Z'));assert.equal(runs.get('2026-11-29'),'sent');
 job.activation_at='2026-12-30T10:00:00Z';await runMessageAutomations(db,'secret',new Date('2026-12-30T12:00:00Z'));assert.ok(!runs.has('2026-12-29'));
});
test('Automations admin: real API rejects collaborators and CSRF, revision conflicts and safe preview',async t=>{
 const app=express();app.use(express.json());let role='employee',writes=0;
 const pass=(q,s,n)=>n(),db={connect:async()=>({release(){},query:async(sql)=>{if(sql.startsWith('SELECT *'))return{rows:[{revision:3}]};if(sql.startsWith('UPDATE'))writes++;return{rows:[]};}})};
 registerMessageAutomationAdmin({app,db,auth:(q,s,n)=>{q.auth={id:1,role};n();},ready:pass,admin:(q,s,n)=>role==='admin'?n():n(fail(403,'Admin')),csrf:(q,s,n)=>q.headers['x-csrf']==='ok'?n():n(fail(403,'CSRF')),fail});
 app.use((e,q,s,n)=>s.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/api/news/automations';
 const body={name:'Test',enabled:true,config,revision:2},request=(path,method='POST',csrf='ok')=>fetch(url+path,{method,headers:{'content-type':'application/json','x-csrf':csrf},body:JSON.stringify(body)});
 assert.equal((await request('')).status,403);assert.equal((await fetch(url)).status,403);role='admin';assert.equal((await request('','POST','bad')).status,403);
 assert.equal((await request('/builtin-rh','PUT')).status,409);assert.equal(writes,0);const preview=await request('/preview');assert.equal(preview.status,200);assert.match((await preview.json()).text,/octobre 2026/);
});
