import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Challenges browser: admin confirmation, cancel, errors, selected month and unaffected results',{skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.static(new URL('../public',import.meta.url).pathname));
 app.get('/fixture',(req,res)=>res.type('html').send(`<!doctype html><body><main id="root"></main><script type="module">
 import {renderChallenges} from '/challenges.js';
 const check=(ok,message)=>{if(!ok)throw Error(message);},wait=async predicate=>{for(let n=0;n<150;n++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 try{
 const root=document.querySelector('#root');let canDelete=true,deletes=0,reject=false;
 const base={month:'2026-09',laboratoryId:1,laboratoryName:'Labo fictif',metric:'units',target:10,gainPerUnit:1,modalities:'Fictif',participants:[{id:1,name:'Personne TEST'}],results:{global:12,participants:[{id:1,value:12}],notes:[]},revision:2};
 let challenges=[{...structuredClone(base),id:1,title:'Challenge <TEST> à supprimer'},{...structuredClone(base),id:2,title:'Challenge TEST conservé'}];const other=JSON.stringify(challenges[1]);
 const api=async(path,method='GET',body)=>{
  if(path==='/api/challenges/options')return {canEdit:true,canDelete,people:[],laboratories:[],mail:{connected:false}};
  if(method==='GET'){check(path==='/api/challenges?month=2026-09','Selected month changed');return structuredClone(challenges);}
  check(path==='/api/challenges/1'&&method==='DELETE'&&body.revision===2,'Unexpected delete');deletes++;if(reject)throw Error('Le challenge a changé. Actualisez-le avant de supprimer.');challenges=challenges.filter(c=>c.id!==1);return {ok:true,id:1};
 };
 const render=()=>renderChallenges({container:root,api,isCurrent:()=>true,month:'2026-09'}),remove=()=>[...root.querySelector('.challenge-card').querySelectorAll('button')].find(b=>b.textContent==='Supprimer'),dialogButton=text=>[...document.querySelector('dialog').querySelectorAll('button')].find(b=>b.textContent===text);
 await render();check(remove(),'Admin delete absent');remove().click();check(document.querySelector('dialog').textContent.includes('Challenge <TEST> à supprimer'),'Wrong confirmation title');dialogButton('Annuler').click();await wait(()=>!document.querySelector('dialog'));check(deletes===0&&challenges.length===2,'Cancel deleted data');
 remove().click();reject=true;dialogButton('Confirmer la suppression').click();await wait(()=>document.querySelector('dialog .error').textContent.includes('Le challenge a changé'));check(challenges.length===2&&!dialogButton('Confirmer la suppression').disabled,'Error not recoverable');dialogButton('Annuler').click();await wait(()=>!document.querySelector('dialog'));
 remove().click();reject=false;dialogButton('Confirmer la suppression').click();await wait(()=>root.querySelectorAll('.challenge-card').length===1);check(root.querySelector('input[type=month]').value==='2026-09','Month lost');check(root.querySelector('.challenge-message').textContent.includes('supprimé'),'Missing success status');check(JSON.stringify(challenges[0])===other,'Other result changed');
 await render();check(root.querySelectorAll('.challenge-card').length===1&&root.querySelector('h3').textContent==='Challenge TEST conservé','Reload lost deletion');
 canDelete=false;await render();check(![...root.querySelectorAll('button')].some(b=>b.textContent==='Supprimer'),'Nonadmin delete exposed');check([...root.querySelectorAll('button')].some(b=>b.textContent==='Modifier'),'Existing edit action lost');check(deletes===2,'Unexpected delete count');document.body.dataset.result='passed';
 }catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message;}
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
