import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur RH : import commun sans signataires, destinataire personnel chargé une seule fois et confirmation conservée',{skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.static(new URL('../public',import.meta.url).pathname));
 app.get('/fixture',(req,res)=>res.type('html').send(String.raw`<!doctype html><html><body><main id="root"></main><script type="module">
 import {renderHRDocuments} from '/hr-documents.js';
 const check=(ok,message)=>{if(!ok)throw Error(message);},pause=()=>new Promise(resolve=>setTimeout(resolve,40));
 try{
  const calls=[];let documents=[],confirmationCount=0;
  const api=async(path,method='GET',body)=>{
   calls.push({path,method,body});
   if(path==='/api/hr/documents')return documents;
   if(path==='/api/hr/signatures')return [];
   if(path==='/api/youtrust/status')throw Error('Signatures désactivées dans cet environnement');
   if(path==='/api/hr/signatories')return [{id:2,name:'Salarié local',email:'local@example.invalid'}];
   if(path==='/api/hr/documents/import'){documents=[{id:1,title:body.title,scope:body.scope,owner_id:body.ownerId,file_type:'application/pdf',created_at:'2026-11-02T12:00:00Z'}];return documents[0];}
   if(path==='/api/hr/documents/1'&&method==='DELETE'){documents=[];return {ok:true};}
   throw Error('Unexpected API '+method+' '+path);
  };
  const root=document.querySelector('#root');await renderHRDocuments({container:root,api,isAdmin:true});
  root.querySelector('#hr-import-action').click();await pause();
  check(!calls.some(c=>c.path==='/api/hr/signatories'),'Common import must not fetch recipients');
  root.querySelector('#hr-title').value='Document commun local';
  const file=root.querySelector('#hr-file'),transfer=new DataTransfer();transfer.items.add(new File(['%PDF-1.4\n%%EOF\n'],'common.pdf',{type:'application/pdf'}));file.files=transfer.files;
  const importForm=file.closest('form');importForm.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));await pause();
  const imported=calls.find(c=>c.path==='/api/hr/documents/import');check(imported&&imported.body.scope==='common'&&imported.body.ownerId===null,'Common import payload invalid');
  check(root.textContent.includes('Document importé.'),'Common import feedback missing');
  window.confirm=()=>{confirmationCount++;return false;};
  [...root.querySelectorAll('button')].find(b=>b.textContent==='Supprimer').click();await pause();
  check(confirmationCount===1&&!calls.some(c=>c.method==='DELETE'),'Cancelling confirmation must not delete');
  window.confirm=()=>{confirmationCount++;return true;};
  [...root.querySelectorAll('button')].find(b=>b.textContent==='Supprimer').click();await pause();
  check(calls.filter(c=>c.method==='DELETE').length===1,'Confirmed removal missing');
  root.querySelector('#hr-import-action').click();
  const scope=root.querySelector('select[aria-label="Accès au document RH"]');scope.value='personal';scope.dispatchEvent(new Event('change'));await pause();
  const owner=root.querySelector('select[aria-label="Salarié destinataire du document personnel"]');
  check(owner.required&&!owner.disabled&&owner.options.length===2,'Personal recipient missing');
  scope.value='common';scope.dispatchEvent(new Event('change'));scope.value='personal';scope.dispatchEvent(new Event('change'));await pause();
  check(calls.filter(c=>c.path==='/api/hr/signatories').length===1,'Recipient list fetched more than once');
  check(!calls.some(c=>c.method==='POST'&&c.path.includes('signatures')),'Must never send a signature request');
  document.body.dataset.result='passed';
 }catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message;}
 </script></body></html>`));
 const server=app.listen(0);t.after(()=>server.close());const profile=await mkdtemp(join(tmpdir(),'portail-hr-chrome-'));t.after(()=>rm(profile,{recursive:true,force:true}));
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
