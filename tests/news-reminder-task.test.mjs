import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {registerCalendarTasks} from '../calendar-tasks.mjs';import {reminderTaskPreset} from '../public/news-reminder-presets.js';
test('Reminder action covers all nine reminder families, excludes staff messages and planning publications',()=>{
 const texts=['Chaîne du froid : pensez','Tiers payant : pensez','Merchandising : rappel du 20 du mois','📋 Évaluation annuelle des pratiques — RH','Formation — trimestre 4 / 2026','📚 Attestations de formation — rappel RH'];
 for(const text of texts)assert.ok(reminderTaskPreset({sender_id:null,text}));
 for(const metadata of [{order_digest:{}},{challenge_digest:[{}]},{merchandising_month:'2026-11'}])assert.ok(reminderTaskPreset({sender_id:null,text:'',...metadata}));
 assert.equal(reminderTaskPreset({sender_id:2,text:texts[0]}),null);
 assert.equal(reminderTaskPreset({sender_id:null,text:'Votre emploi du temps a été mis à jour',planning_week:'2026-10-26'}),null);
});
test('Reminder to personal agenda: recipient isolation, expiry and idempotence with no overwrite',async t=>{
 const app=express();app.use(express.json());let message={sender_id:null,text:'Tiers payant : pensez'},existing=false,insertArgs;
 const db={query:async(sql,args)=>{
 if(sql.startsWith('SELECT m.*')){assert.match(sql,/r.user_id=\$2/);assert.match(sql,/r.archived OR/);return {rows:message?[message]:[]};}
 assert.match(sql,/ON CONFLICT\(user_id,source_message_id\)/);assert.match(sql,/DO UPDATE SET source_message_id=EXCLUDED.source_message_id/);assert.match(sql,/r.user_id=\$1/);insertArgs=args;return {rows:[{id:5,already_exists:existing}]};
 }};
 const pass=(req,res,next)=>next();registerCalendarTasks({app,db,auth:(req,res,next)=>{req.auth={id:7};next();},ready:pass,csrf:pass,viewUniverse:()=>pass,fail:(status,message)=>Object.assign(Error(message),{status})});
 app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());
 const body={title:'Suivi TP',date:'2026-11-03',icon:'📝',description:'Notes',sourceMessageId:12,userId:99};
 const send=()=>fetch('http://127.0.0.1:'+server.address().port+'/api/calendar/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 let res=await send();assert.equal(res.status,201);assert.equal(insertArgs[0],7);assert.equal(insertArgs[5],12);
 existing=true;res=await send();assert.equal(res.status,200);assert.equal((await res.json()).alreadyExists,true);
 message=null;assert.equal((await send()).status,404);message={sender_id:2,text:'Tiers payant : pensez'};assert.equal((await send()).status,404);
});
