import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur référence : import des deux catégories, recherche, renommage et confirmation de retrait',{skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.static(new URL('../public',import.meta.url).pathname));
 app.get('/fixture',(req,res)=>res.type('html').send(String.raw`<!doctype html><html><body><main id="root"></main><script type="module">
 import {renderTrainingDocuments} from '/training-documents.js';
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI condition timed out');};
 try{
  const calls=[];let nextId=1,documents=[{id:100,category:'reference',title:'Existant protégé',file_name:'existing.pdf',file_type:'application/pdf'}];
  const protectedBefore=JSON.stringify(documents[0]);
  const api=async(path,method='GET',body)=>{
   calls.push({path,method,body});
   if(method==='GET')return documents.map(d=>({...d}));
   if(method==='POST'){const row={id:nextId++,category:body.category,title:body.fileName.replace(/\.(pdf|docx)$/i,''),file_name:body.fileName,file_type:'application/pdf'};documents.push(row);return {...row};}
   const id=Number(path.split('/').at(-1));
   if(method==='PUT'){const row=documents.find(d=>d.id===id);row.title=body.title;return {...row};}
   if(method==='DELETE'){documents=documents.filter(d=>d.id!==id);return {ok:true};}
   throw Error('Unexpected API');
  };
  const root=document.querySelector('#root');await renderTrainingDocuments({container:root,api,canEdit:true});
  const add=async(category,name)=>{const input=root.querySelector('#training-upload-'+category),transfer=new DataTransfer();transfer.items.add(new File(['%PDF-1.4\n%%EOF\n'],name,{type:'application/pdf'}));input.files=transfer.files;input.dispatchEvent(new Event('change'));await until(()=>root.querySelector('.status-line').textContent.includes(name+' : ajouté'));};
  await add('reference','BEXSERO 15 24 ans.pdf');await add('training','DEPART ETRANGER At honneur_CPAM-Ain (1).pdf');
  check(calls.filter(c=>c.method==='POST').map(c=>c.body.category).join(',')==='reference,training','Categories changed during import');
  const search=root.querySelector('#training-document-search'),rows=()=>[...root.querySelectorAll('.procedure-row')];
  search.value='étranger CPAM';search.dispatchEvent(new Event('input'));check(rows().length===1&&rows()[0].textContent.includes('DEPART ETRANGER'),'Accent/case/token search failed');
  check(rows()[0].querySelector('a[download]').href.endsWith('/2/file'),'Download link missing');check([...rows()[0].querySelectorAll('a')].some(a=>a.href.endsWith('/2/print')),'Print link missing');
  search.value='bexsero';search.dispatchEvent(new Event('input'));check(rows().length===0,'Search crossed categories');
  [...root.querySelectorAll('.training-category-button')].find(b=>b.textContent==='Prescriptions et documents comptoir').click();check(rows().length===1,'Reference search failed');
  [...rows()[0].querySelectorAll('button')].find(b=>b.textContent==='Renommer').click();const form=root.querySelector('.training-rename-form');form.querySelector('input').value='Vaccin Bexsero';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await until(()=>root.querySelector('.status-line').textContent==='Document renommé.');
  check(rows()[0].textContent.includes('Vaccin Bexsero'),'Renaming missing');
  window.confirm=()=>false;[...rows()[0].querySelectorAll('button')].find(b=>b.textContent==='Supprimer').click();check(!calls.some(c=>c.method==='DELETE'),'Cancelled confirmation deleted a document');
  window.confirm=()=>true;[...rows()[0].querySelectorAll('button')].find(b=>b.textContent==='Supprimer').click();await until(()=>root.querySelector('.status-line').textContent==='Document retiré.');check(rows().length===0,'Removed item remains searchable');
  check(JSON.stringify(documents.find(d=>d.id===100))===protectedBefore,'Protected document changed');
  await renderTrainingDocuments({container:root,api,canEdit:false});check(!root.querySelector('input[type=file]'),'Read-only user can upload');check(![...root.querySelectorAll('button')].some(b=>b.textContent==='Supprimer'),'Read-only user can delete');
  document.body.dataset.result='passed';
 }catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message;}
 </script></body></html>`));
 const server=app.listen(0);t.after(()=>server.close());const profile=await mkdtemp(join(tmpdir(),'portail-training-chrome-'));t.after(()=>rm(profile,{recursive:true,force:true}));
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
