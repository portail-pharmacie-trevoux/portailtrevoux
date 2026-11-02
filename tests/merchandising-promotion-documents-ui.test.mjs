import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur : corbeilles des documents, confirmation, annulation, échec, suppression ciblée et actualisation', {skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.static(new URL('../public',import.meta.url).pathname));
 app.get('/fixture',(req,res)=>res.type('html').send(`<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><main id="root"></main><script type="module">
 import {renderMerchandisingPromotions} from '/merchandising-promotions.js';
 const check=(ok,message)=>{if(!ok)throw Error(message);},pause=()=>new Promise(r=>setTimeout(r,20)),wait=async predicate=>{for(let n=0;n<150;n++){if(predicate())return;await pause();}throw Error('UI wait timeout');};
 try{
 const root=document.querySelector('#root'),promotion={id:2,title:'Promotion locale',laboratory_name:'Local',category:'TG',zone_id:24,created_by:1,revision:3};
 const before=JSON.stringify(promotion),writes=[];let canDelete=true,allow=false,fail=false,release;
 let documents=[{id:11,file_name:'Premier.pdf'},{id:12,file_name:'Deuxième.pdf'}];
 const api=async(path,method='GET')=>{
  if(method==='DELETE'){writes.push(path);check(path==='/api/merchandising/promotions/2/documents/11','Only selected document may be deleted');if(fail)throw Error('Refus de suppression');await new Promise(r=>release=r);documents=documents.filter(d=>d.id!==11);return {ok:true};}
  if(path==='/api/merchandising')return {zones:[{id:24,name:'TG11',x:50,y:50}]};
  if(path.startsWith('/api/merchandising/promotions?'))return {promotions:[promotion],events:[],canAssign:false,userId:1};
  if(path==='/api/merchandising/promotions/2/documents')return {documents:structuredClone(documents),canDelete};
  throw Error('Unexpected API '+path);
 };
 window.confirm=message=>{check(message==='Voulez-vous vraiment supprimer ce document ?','Exact confirmation text');return allow;};
 const render=()=>renderMerchandisingPromotions({container:root,api,isCurrent:()=>true,month:'2026-11',onMonthChange(){throw Error('Promotion reload unexpected');}});
 const open=async()=>{root.querySelector('button[aria-label="Documents de la promotion : importer ou télécharger"]').click();await wait(()=>document.querySelector('dialog .procedure-row'));};
 const trash=()=>document.querySelector('button[aria-label="Supprimer le document : Premier.pdf"]');
 await render();await open();check(document.querySelectorAll('dialog button.danger').length===2,'One trash per document');check(trash().querySelector('svg'),'Trash SVG missing');check(getComputedStyle(trash()).color==='rgb(163, 44, 50)','Trash must be red');
 trash().click();await pause();check(writes.length===0&&documents.length===2,'Cancel must leave documents unchanged');
 allow=true;fail=true;trash().click();await wait(()=>document.querySelector('dialog').textContent.includes('Refus de suppression'));check(!trash().disabled&&documents.length===2,'Failed deletion preserves document and enables retry');
 fail=false;trash().click();await wait(()=>release);check(trash().disabled,'Disable pending delete');trash().click();check(writes.length===2,'No duplicate submission');release();
 await wait(()=>!trash());check(document.querySelectorAll('dialog .procedure-row').length===1,'List must refresh immediately');check(document.querySelector('dialog').textContent.includes('Deuxième.pdf'),'Other document lost');check(document.querySelector('dialog').textContent.includes('Document supprimé.'),'Success feedback missing');check(JSON.stringify(promotion)===before,'Promotion or assignment changed');
 document.querySelector('dialog').close();await wait(()=>!document.querySelector('dialog'));await render();await open();check(!trash()&&document.querySelectorAll('dialog .procedure-row').length===1,'Deleted document must stay absent after reload');
 document.querySelector('dialog').close();await wait(()=>!document.querySelector('dialog'));canDelete=false;await render();await open();check(!document.querySelector('dialog button.danger'),'Read-only user must not see trash');check(document.querySelector('dialog a[download="Deuxième.pdf"]'),'Download remains available');
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
