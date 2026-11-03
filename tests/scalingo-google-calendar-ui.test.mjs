import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Calendar administration renders Scalingo status, connect button and readonly collaborator view',{skip:!existsSync(chromium)},async t=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const render=source.slice(source.indexOf('async function renderCalendar(){'),source.indexOf('setInterval(()=>{if(session',source.indexOf('async function renderCalendar(){')));
 const app=express();app.get('/fixture',(req,res)=>res.type('html').send(`<!doctype html><body><div id="content"></div><div id="feedback"></div><script>
 const q=s=>document.querySelector(s),node=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;},button=(text,action)=>{const e=node('button',text);e.onclick=action;return e;};
 let session={user:{role:'admin'}},currentUniverse='Agenda',configured=false,connects=0;
 const api=async(path,method)=>{if(path==='/api/calendar')return {name:'Agenda',events:[]};if(path==='/api/google/status')return {configured,connected:false,environment:'scalingo',callback:'https://portailplus-hds.osc-fr1.scalingo.io/auth/google/callback',configurationMessage:'Configurez Google Calendar sur Scalingo puis redémarrez les conteneurs web.'};if(path==='/api/google/connect'&&method==='POST'){connects++;return {url:'#oauth-started'};}throw Error('Unexpected API');};
 const runCalendarAction=async action=>action(),personalTaskForm=()=>node('div'),renderCalendarResults=()=>{};
 ${render}
 (async()=>{const check=(v,m)=>{if(!v)throw Error(m);};try{
 await renderCalendar();check(q('#content').textContent.includes('Scalingo')&&!q('#content').textContent.includes('Render'),'Wrong hosting hint');
 configured=true;await renderCalendar();const connect=[...document.querySelectorAll('button')].find(e=>e.textContent==='Connecter Google Calendar');check(connect,'Missing connect button');connect.click();await new Promise(r=>setTimeout(r,20));check(connects===1&&location.hash==='#oauth-started','OAuth did not start');
 await renderCalendar();check([...document.querySelectorAll('button')].some(e=>e.textContent==='Connecter Google Calendar'),'Button lost on reload');
 session.user.role='employee';await renderCalendar();check(!q('.calendar-tools'),'Collaborator sees admin controls');document.body.dataset.result='passed';
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
