import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {registerCalendarReminders} from '../calendar-reminders.mjs';

test('Rappels personnels : comptes séparés, lecture seule autorisée, retrait et protections',async t=>{
 const app=express();app.use(express.json());let userId=1,calendar='calendar-a',allowed=true;const reminders=new Set();
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT events'))return {rows:[{events:[{id:'event-1'}]}]};
  const key=args.join(':');
  if(sql.startsWith('INSERT INTO calendar_reminders'))reminders.add(key);
  else if(sql.startsWith('DELETE FROM calendar_reminders'))reminders.delete(key);
  else if(sql.startsWith('SELECT event_id'))return {rows:[...reminders].filter(k=>k.startsWith(args.join(':')+':')).map(k=>({event_id:k.split(':').at(-1)}))};
  return {rows:[]};
 }};
 const pass=(req,res,next)=>next(),auth=(req,res,next)=>{req.auth={id:userId};next();},fail=(status,message)=>Object.assign(Error(message),{status});
 const personal=registerCalendarReminders({app,db,auth,ready:pass,csrf:(req,res,next)=>req.headers['x-csrf-token']==='valid'?next():next(fail(403,'CSRF')),viewUniverse:()=>((req,res,next)=>allowed?next():next(fail(403,'Accès'))),fail,getSetting:async()=>calendar});
 app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());
 const url='http://127.0.0.1:'+server.address().port+'/api/calendar/reminders';
 const post=(body,csrf='valid')=>fetch(url,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});
 assert.equal((await post({eventId:'event-1',enabled:true,userId:2})).status,200);
 assert.equal((await personal(1,[{id:'event-1'}]))[0].remind,true);assert.equal((await personal(2,[{id:'event-1'}]))[0].remind,false);
 calendar='calendar-b';assert.equal((await personal(1,[{id:'event-1'}]))[0].remind,false);calendar='calendar-a';
 userId=2;assert.equal((await post({eventId:'event-1',enabled:false})).status,200);assert.equal((await personal(1,[{id:'event-1'}]))[0].remind,true);
 userId=1;assert.equal((await post({eventId:'event-1',enabled:false})).status,200);assert.equal((await personal(1,[{id:'event-1'}]))[0].remind,false);
 assert.equal((await post({eventId:'missing',enabled:true})).status,404);assert.equal((await post({eventId:'event-1',enabled:'true'})).status,400);
 assert.equal((await post({eventId:'event-1',enabled:true},'bad')).status,403);allowed=false;assert.equal((await post({eventId:'event-1',enabled:true})).status,403);
});

test('Tuile : rappel dès J-7, exclusion à J-8 et après la date, fuseau Paris et aucun doublon',async()=>{
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const prefix=source.slice(0,source.indexOf('function eventCard'));
 const home=source.slice(source.indexOf('function homeAgendaEvents'),source.indexOf('function renderHomeAgenda'));
 const context=vm.createContext({Intl,Date,Set});vm.runInContext(prefix+home,context);
 const day=(id,date,remind=true,title='Livraison')=>({id,title,remind,start:{date},end:{date:context.moveDay(date,1)}});
 const events=[day('seven','2026-10-14'),day('eight','2026-10-15'),day('past','2026-10-06'),day('unselected','2026-10-12',false),day('today','2026-10-07',true,'Formation'),day('rdv','2026-10-07',false,'RDV commercial'),{id:'paris-midnight',title:'Commande',remind:true,start:{dateTime:'2026-10-13T23:30:00Z'},end:{dateTime:'2026-10-14T00:00:00Z'}}];
 const ids=Array.from(context.homeAgendaEvents(events,'2026-10-07'),e=>e.id);
 assert.deepEqual(ids,['today','rdv','seven','paris-midnight']);assert.equal(ids.filter(id=>id==='today').length,1);
 // Traverser le changement d’heure conserve une fenêtre de sept jours calendaires.
 assert.equal(context.homeAgendaEvents([day('dst','2026-10-26')],'2026-10-19').length,1);
});
