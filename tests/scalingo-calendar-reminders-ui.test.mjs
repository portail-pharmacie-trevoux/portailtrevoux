import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Browser: synchronized event reminder persists on reload and appears in seven-day Agenda tile',{skip:!existsSync(chromium)},async t=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const prefix=source.slice(0,source.indexOf('function renderCalendarResults'));
 const home=source.slice(source.indexOf('function homeAgendaEvents'));
 const app=express();app.get('/fixture',(req,res)=>res.type('html').send(`<!doctype html><body><div id="events"></div><div class="grid"><button data-universe="Agenda"></button></div><script>
 ${prefix}
 ${home}
 const q=s=>document.querySelector(s),node=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;},session={user:{id:1}},tileAllowed=()=>true;
 const check=(ok,message)=>{if(!ok)throw Error(message);},wait=async predicate=>{for(let n=0;n<150;n++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 let stored=false,calls=0;const event={id:'synced-event',title:'Commande TEST locale',start:{date:moveDay(parisDay(),3)},end:{date:moveDay(parisDay(),4)}};
 const api=async(path,method,body)=>{check(path==='/api/calendar/reminders'&&method==='POST','Unexpected external or local route');check(body.eventId===event.id&&typeof body.enabled==='boolean','Invalid reminder payload');stored=body.enabled;calls++;return {eventId:event.id,remind:stored};};
 const refreshHomeExtras=()=>renderHomeAgenda({events:[{...event,remind:stored}],connected:true});
 const reload=()=>{q('#events').replaceChildren(eventCard({...event,remind:stored}));refreshHomeExtras();};
 (async()=>{try{
 reload();check(!q('input[type=checkbox]').checked,'Initially selected');q('input[type=checkbox]').click();await wait(()=>!q('input[type=checkbox]').disabled);check(stored,'Reminder not saved');check(q('.agenda-reminders').textContent.includes('Rappels · 7 prochains jours')&&q('.agenda-reminders').textContent.includes(event.title),'Reminder absent from tile');
 reload();check(q('input[type=checkbox]').checked&&q('.agenda-reminders').textContent.includes(event.title),'Reload lost reminder');q('input[type=checkbox]').click();await wait(()=>!q('input[type=checkbox]').disabled);reload();check(!q('input[type=checkbox]').checked&&!q('.agenda-reminders').textContent.includes(event.title),'Removal not persistent');check(calls===2,'Unexpected request count');document.body.dataset.result='passed';
 }catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message;}})();
 </script>`));
 const server=app.listen(0);t.after(()=>server.close());const profile=await mkdtemp(join(tmpdir(),'portail-followup-chrome-'));t.after(()=>rm(profile,{recursive:true,force:true}));
 const child=spawn(chromium,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--disable-sync','--user-data-dir='+profile,'--remote-debugging-port=0'],{stdio:['ignore','ignore','pipe']});t.after(()=>child.kill());
 const debuggerUrl=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Chromium debugger did not start')),10000);child.stderr.on('data',chunk=>{log+=chunk;const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});child.on('error',reject);});
 const ws=new WebSocket(debuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});t.after(()=>ws.close());
 let sequence=0;const pending=new Map();ws.onmessage=e=>{const message=JSON.parse(e.data);const waiter=pending.get(message.id);if(waiter){pending.delete(message.id);message.error?waiter.reject(Error(message.error.message)):waiter.resolve(message.result);}};
 const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await command('Target.createTarget',{url:'http://127.0.0.1:'+server.address().port+'/fixture'});
 const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
 const result=await command('Runtime.evaluate',{expression:`new Promise(resolve=>{const start=Date.now();const timer=setInterval(()=>{if(document.body?.dataset.result||Date.now()-start>10000){clearInterval(timer);resolve({result:document.body?.dataset.result,error:document.body?.dataset.error,location:location.href});}},50);})`,awaitPromise:true,returnByValue:true},sessionId);
 assert.equal(result.result?.value?.result,'passed',JSON.stringify(result.result?.value));
});
