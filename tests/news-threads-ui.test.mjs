import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur Messagerie : fil chronologique, auteurs, dates, suivi et actualisation', {skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.static(new URL('../public',import.meta.url).pathname));
 app.get('/fixture',(req,res)=>res.type('html').send(`<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><main id="root"></main><script type="module">
 import {renderNews} from '/news.js';
 const check=(ok,message)=>{if(!ok)throw Error(message);},wait=async predicate=>{for(let n=0;n<150;n++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 try{
 const root=document.querySelector('#root'),sent={id:2,thread_id:2,sender_id:2,sender:'Auteur local',text:'Message initial local',created_at:'2026-11-02T10:00:00Z',can_archive:true,recipients:[{id:3,name:'Destinataire local',seen:true,seenAt:'2026-11-02T11:00:00Z'}]},reply={id:3,thread_id:2,sender_id:3,sender:'Répondant local',text:'Réponse locale',created_at:'2026-11-02T12:00:00Z',reply_to_id:2,is_reply:true,seen:false,archived:false,can_archive:true};
 let calls=0,writes=0;const api=async(path,method='GET')=>{if(method!=='GET'){writes++;throw Error('Thread display must not write');}if(path==='/api/news/recipients')return [{id:3,name:'Destinataire local'}];if(path==='/api/news')return [structuredClone(reply)];if(path==='/api/news/sent')return [structuredClone(sent)];if(path==='/api/news/threads/2'){calls++;const {recipients,...rootMessage}=sent;return {messages:[{...rootMessage,outgoing:true},{...reply,outgoing:false}],truncated:false};}throw Error('Unexpected API '+path);};
 const render=()=>renderNews({container:root,api});const expand=async()=>{root.querySelector('.news-thread-toggle').click();await wait(()=>root.querySelector('.news-thread-toggle')?.getAttribute('aria-expanded')==='true');};
 const verify=()=>{const cards=[...root.querySelectorAll('.news-thread-content .news-message')];check(cards.length===2,'Both messages must be displayed');check(cards[0].querySelector('.news-message-text').textContent==='Message initial local','Root must precede reply');check(cards[1].querySelector('.news-message-text').textContent==='Réponse locale','Reply must follow root');check(cards[1].textContent.includes('Répondant local'),'Author lost');check(cards[1].querySelector('time').dateTime===reply.created_at,'Date lost');check(cards[0].textContent.includes('Destinataire local · Vu'),'Read tracking lost');check([...cards[1].querySelectorAll('input[type=checkbox]')].every(i=>!i.checked),'Recipient flags changed');};
 await render();await expand();verify();root.querySelector('.news-thread-toggle').click();check(root.querySelector('.news-thread-toggle').getAttribute('aria-expanded')==='false','Collapse failed');await expand();verify();check(calls===1,'Cache should serve repeated expansion');await render();await expand();verify();check(calls===2,'Reload should refetch thread');check(writes===0,'Display must not change read or archive state');
   document.body.dataset.result='passed';
 }catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message;}
 </script></body></html>`));
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
