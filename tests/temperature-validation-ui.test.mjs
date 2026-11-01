import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur : choix V/X exclusifs, édition, actualisation et coche sans effacer le fond rouge', {skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.static(new URL('../public',import.meta.url).pathname));
 app.get('/fixture',(req,res)=>res.type('html').send(`<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><main id="root"></main><script type="module">
 import {renderTemperatures} from '/temperatures.js';
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
 try{
  const d=new Date();d.setUTCMonth(d.getUTCMonth()-1);const month=d.toISOString().slice(0,7),time=month+'-01 10:00:00';
  let comment={id:1,text:'Ancien commentaire',validation:null,revision:1,created_at:month+'-01T12:00:00Z',operator_name:'TEST'};
  let lastWrite;
  const sensor={id:'SENSOR',name:'Frigo',low_threshold:2,high_threshold:8,count:1,min:9,max:9,mean:9,above:1,below:0,excursionCount:1};
  const api=async(path,method='GET',body)=>{
   if(method==='PUT'){lastWrite={path,body};comment={...comment,text:body.text,validation:body.validation,revision:comment.revision+1};return {ok:true};}
   if(path.startsWith('/api/quality/temperatures?'))return {isAdmin:true,references:[],imports:[],sensors:[{...sensor,days:[{date:month+'-01',count:1,state:'alert',incomplete:true,validation:comment.validation}]}]};
   return {sensor,readings:[[time,9]],events:[{start:time,last:time,min:9,max:9,count:1,seconds:0,comments:[comment]}],gaps:[]};
  };
  const root=document.querySelector('#root');await renderTemperatures({container:root,api,onBack(){}});
  check(!root.querySelector('.temperature-validation'),'Legacy comment must not imply V');
  root.querySelector('.temperature-day').click();await pause();
  let form=root.querySelector('.temperature-comment form'),radios=[...form.querySelectorAll('input[type=radio]')];
  check(radios.length===2,'V and X choices missing');
  radios[0].click();check(radios[0].checked&&!radios[1].checked,'V must be exclusive');
  radios[1].click();check(!radios[0].checked&&radios[1].checked,'X must be exclusive');
  form.querySelector('textarea').value='Commentaire modifié';form.requestSubmit();await pause();
  check(lastWrite.path.endsWith('/comments/1')&&lastWrite.body.validation==='X'&&lastWrite.body.revision===1,'Edit request must retain comment identity and revision');
  check(root.textContent.includes('Commentaire modifié'),'Saved comment not refreshed');
  [...root.querySelectorAll('button')].find(b=>b.textContent==='Toutes les sondes').click();await pause();
  let day=root.querySelector('.temperature-day.alert'),badge=day.querySelector('.temperature-validation');
  check(badge?.textContent==='X','Red X missing in calendar');check(getComputedStyle(day).backgroundColor==='rgb(253, 226, 230)','Alert background must remain red');
  day.click();await pause();form=root.querySelector('.temperature-comment form');form.querySelector('input[value=V]').click();form.requestSubmit();await pause();
  [...root.querySelectorAll('button')].find(b=>b.textContent==='Toutes les sondes').click();await pause();
  day=root.querySelector('.temperature-day.alert');badge=day.querySelector('.temperature-validation');
  check(badge?.textContent==='V'&&badge.classList.contains('mastered'),'Green V missing after edit');check(getComputedStyle(day).backgroundColor==='rgb(253, 226, 230)','Validated day must still have red background');
  document.body.dataset.result='passed';
 }catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message;}
 </script></body></html>`));
 const server=app.listen(0);t.after(()=>server.close());const profile=await mkdtemp(join(tmpdir(),'portail-temperature-chrome-'));t.after(()=>rm(profile,{recursive:true,force:true}));
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
