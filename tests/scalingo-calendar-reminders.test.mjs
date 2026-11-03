import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import {createApp} from '../server.mjs';
import {scalingoUniverseBoundary} from '../scripts/scalingo-universal-rights.mjs';
import {registerScalingoCalendarReminders} from '../scripts/scalingo-calendar-reminders-preview.mjs';
const origin='https://portailplus-hds.osc-fr1.scalingo.io';
test('Scalingo reminders: exact route, persistent personal selection, idempotence and app protections; no Google calls',async t=>{
 const originalFetch=global.fetch;let external=0;
 global.fetch=async()=>{external++;throw Error('No external calls allowed');};t.after(()=>{global.fetch=originalFetch;});
 const reminders=new Set(),events=[{id:'event-1',title:'Local fixture',start:{date:'2026-11-04'},end:{date:'2026-11-05'}}];
 let actor={id:1,role:'admin',active:true,must_change:false,csrf:'valid'},calendar='calendar-a';
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT s.id')||sql.startsWith('SELECT u.* FROM sessions'))return {rows:actor?[actor]:[]};
  if(sql.startsWith('SELECT value FROM settings'))return {rows:args[0]==='calendar_id'?[{value:calendar}]:[]};
  if(sql.startsWith('SELECT events')||sql.startsWith('SELECT * FROM calendar_cache'))return {rows:[{events,synced_at:new Date()}]};
  if(sql.startsWith('SELECT event_id'))return {rows:[...reminders].map(JSON.parse).filter(r=>r[0]===args[0]&&r[1]===args[1]).map(r=>({event_id:r[2]}))};
  if(sql.startsWith('SELECT id,title,description'))return {rows:[]};
  if(sql.startsWith('INSERT INTO calendar_reminders')){reminders.add(JSON.stringify(args));return {rows:[]};}
  if(sql.startsWith('DELETE FROM calendar_reminders')){reminders.delete(JSON.stringify(args));return {rows:[]};}
  throw Error('Unexpected SQL '+sql);
 }};
 const start=async()=>{const {app}=createApp(db,{origin,secret:'reminder-test-only-'.repeat(3)}),gate=express();gate.use(express.json());gate.use(scalingoUniverseBoundary(db));registerScalingoCalendarReminders(gate,app);gate.get('/api/calendar',(q,s,n)=>app(q,s,n));gate.use((q,s)=>s.sendStatus(403));gate.use((e,q,s,n)=>s.status(e.status||500).json({error:e.message}));const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});return server;};
 let server=await start();
 const request=(path,method='GET',body,extra={})=>originalFetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{origin,cookie:'trevoux_session='+'a'.repeat(43),'x-csrf-token':'valid','content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const post=(enabled=true,extra={},eventId='event-1')=>request('/api/calendar/reminders','POST',{eventId,enabled,userId:99},extra);
 const read=async()=>(await(await request('/api/calendar')).json()).events[0].remind;
 assert.equal((await post()).status,200);assert.equal(await read(),true);
 await post();assert.equal(reminders.size,1);
 server.closeAllConnections();server.close();server=await start();assert.equal(await read(),true);
 actor.id=2;assert.equal(await read(),false);await post(false);assert.equal(reminders.size,1);actor.id=1;
 calendar='calendar-b';assert.equal(await read(),false);calendar='calendar-a';
 assert.equal((await post(false)).status,200);assert.equal(await read(),false);assert.equal(reminders.size,0);
 assert.equal((await post(true,{},'missing')).status,404);assert.equal((await post('true')).status,400);
 assert.equal((await post(true,{'x-csrf-token':'bad'})).status,403);assert.equal((await post(true,{origin:'https://wrong.invalid'})).status,403);
 actor.role='employee';actor.rights=[];actor.edit_rights=[];actor.permissions_configured=true;assert.equal((await post()).status,403);
 actor.rights=['Agenda'];actor.edit_rights=['Agenda'];assert.equal((await post()).status,200);await post(false);
 actor.must_change=true;assert.equal((await post()).status,403);actor=null;assert.equal((await post()).status,401);
 actor={id:1,role:'admin',active:true,must_change:false,csrf:'valid'};
 for(const [method,path] of [['POST','/api/calendar/reminders/extra'],['POST','/api/calendar/reminders/'],['PUT','/api/calendar/reminders'],['DELETE','/api/calendar/reminders'],['POST','/api/calendar/events'],['POST','/api/users']])assert.equal((await request(path,method,{})).status,403);
 assert.equal(external,0);assert.equal(reminders.size,0);
});
