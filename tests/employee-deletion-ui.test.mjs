import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur : bouton rouge inactifs, double confirmation et conservation de la fiche bloquée',{skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.json());const calls=[];
 let people=[{id:1,firstName:'Administrateur',lastName:'TEST',active:true,role:'admin',passwordConfigured:true},{id:2,firstName:'Importé',lastName:'INACTIF',active:false,role:'employee',passwordConfigured:false},{id:3,firstName:'Manuel',lastName:'INACTIF',active:false,role:'employee',passwordConfigured:false,previewManualRecord:true},{id:4,firstName:'Salarié',lastName:'ACTIF',active:true,role:'employee',passwordConfigured:false}];
 app.get('/api/me',(req,res)=>res.json({user:{id:1,name:'Admin local',role:'admin',rights:[],mustChange:false},csrf:'local',features:{employeeAccountsReadOnly:true}}));
 app.get('/api/users',(req,res)=>res.json(people));
 app.delete('/api/users/:id/permanent',(req,res)=>{calls.push({id:Number(req.params.id),body:req.body});if(req.params.id==='2')return res.status(409).json({error:'Suppression impossible : Planning associé. Conservez la fiche inactive.'});people=people.filter(p=>p.id!==Number(req.params.id));res.json({ok:true});});
 app.get('/fixture-state',(req,res)=>res.json({calls,people}));app.get('/api/integrations/google-health',(req,res)=>res.json({mail:{configured:false,connected:false}}));app.use('/api',(req,res)=>res.json([]));
 const index=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const driver=String.raw`<script type="module">
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const until=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 const row=id=>document.querySelector('tr[data-person-id="'+id+'"]');
 const button=id=>[...row(id).querySelectorAll('button')].find(b=>b.textContent==='Supprimer définitivement');
 const open=async id=>{button(id).click();await until(()=>document.querySelector('#employee-delete-confirmation'));};
 const type=value=>{const input=document.querySelector('#employee-delete-confirmation');input.value=value;input.dispatchEvent(new Event('input'));};
 try{
  await until(()=>!document.querySelector('#home').classList.contains('hidden'));document.querySelector('[data-universe="Collaborateurs"]').click();await until(()=>row(2));
  check(button(2)?.classList.contains('danger'),'Imported inactive missing red delete button');check(!button(1)&&!button(4),'Active or admin delete exposed');
  if(!location.search.includes('persist')){
   check(button(3)?.classList.contains('danger'),'Manual inactive missing delete button');await open(2);
   const dialog=document.querySelector('#employee-delete-title').closest('dialog'),submit=dialog.querySelector('button[type=submit]');
   check(dialog.textContent.includes('irréversible')&&dialog.textContent.includes('ne seront pas supprimés'),'Explicit preservation warning missing');check(submit.disabled,'Empty confirmation accepted');type('supprimer');check(submit.disabled,'Wrong case accepted');type('SUPPRIMER');check(!submit.disabled,'Exact confirmation rejected');
   [...dialog.querySelectorAll('button')].find(b=>b.textContent==='Annuler').click();check((await (await fetch('/fixture-state')).json()).calls.length===0,'Cancel sent deletion');
   await open(2);type('SUPPRIMER');document.querySelector('#employee-delete-confirmation').closest('form').requestSubmit();await until(()=>document.querySelector('#feedback').textContent.includes('Planning associé'));
   check(row(2)?.closest('.inactive-people'),'Blocked record removed');check(!button(2).disabled,'Blocked button not restored');
   await open(3);type('SUPPRIMER');document.querySelector('#employee-delete-confirmation').closest('form').requestSubmit();await until(()=>!row(3));
   location.replace('/?persist=1');
  }else{
   check(!row(3)&&row(2).closest('.inactive-people'),'Refresh restored deleted record or lost blocked one');const state=await (await fetch('/fixture-state')).json();check(state.calls.length===2,'Unexpected deletion calls');check(state.calls.every(c=>c.body.confirmation===c.id&&c.body.confirmationText==='SUPPRIMER'),'Server confirmations missing');document.body.dataset.result='passed';
  }
 }catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message;}
 </script>`;
 app.get('/',(req,res)=>res.type('html').send(index.replace('</body>',driver+'</body>')));app.use(express.static(new URL('../public',import.meta.url).pathname));
 const server=app.listen(0);t.after(()=>server.close());const profile=await mkdtemp(join(tmpdir(),'portail-deletion-chrome-'));t.after(()=>rm(profile,{recursive:true,force:true}));
 const child=spawn(chromium,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--disable-sync','--user-data-dir='+profile,'--remote-debugging-port=0'],{stdio:['ignore','ignore','pipe']});t.after(()=>child.kill());
 const debuggerUrl=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Chromium debugger did not start')),10000);child.stderr.on('data',chunk=>{log+=chunk;const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});child.on('error',reject);});
 const ws=new WebSocket(debuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});t.after(()=>ws.close());
 let sequence=0;const pending=new Map();ws.onmessage=e=>{const message=JSON.parse(e.data);const waiter=pending.get(message.id);if(waiter){pending.delete(message.id);message.error?waiter.reject(Error(message.error.message)):waiter.resolve(message.result);}};
 const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await command('Target.createTarget',{url:'http://127.0.0.1:'+server.address().port+'/'});
 const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
 let result;for(let attempt=0;attempt<5;attempt++){try{result=await command('Runtime.evaluate',{expression:`new Promise(resolve=>{const start=Date.now();const timer=setInterval(()=>{if(document.body?.dataset.result||Date.now()-start>10000){clearInterval(timer);resolve({result:document.body?.dataset.result,error:document.body?.dataset.error,location:location.href});}},50);})`,awaitPromise:true,returnByValue:true},sessionId);break;}catch(e){if(!/navigated|context|closed/i.test(e.message))throw e;await new Promise(resolve=>setTimeout(resolve,100));}}
 assert.equal(result.result?.value?.result,'passed',JSON.stringify(result.result?.value));
});
