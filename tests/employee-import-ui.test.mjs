import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur : scan avec consentement, révision corrigée avant création et aucun accès personnel',{skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.static(new URL('../public',import.meta.url).pathname));
 app.get('/fixture',(req,res)=>res.type('html').send(String.raw`<!doctype html><html><body><main id="root"></main><script type="module">
 import {renderEmployeeImport} from '/employee-import.js';import {renderEmployeeRecord} from '/employee-record.js';
 const check=(ok,message)=>{if(!ok)throw Error(message);};const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 let stage='initial';try{
  let configured=false,saves=0,reviewed=false;const calls=[],root=document.querySelector('#root');
  const existing={id:2,firstName:'Existant',lastName:'LOCAL',active:true,role:'employee',rights:['Agenda','Actualités','Laboratoires'],editRights:['Laboratoires'],permissionsConfigured:false};
  const api=async(path,method='GET',body)=>{
   calls.push({path,method,body});
   if(path.endsWith('/scan/status'))return {configured,managedByEnvironment:false,requiresConsent:true,previewRestrictions:{accountReadOnly:true}};
   if(path.endsWith('/scan/config')){configured=method==='POST';return {configured};}
   if(path==='/api/collaborateurs/scan')return {values:{firstName:'Lu',lastName:'MANUSCRIT',phone:'0612345678',job:'Préparateur',address:'Adresse lue'},warnings:[{key:'lastName',label:'Nom',message:'À vérifier sur le document original.'}],notes:['Lecture manuscrite simulée.']};
   if(path==='/api/users/2/details')return {person:existing,details:{town:'Ville existante'},detailsRevision:4,previewRestrictions:{accountReadOnly:true}};
   if(path==='/api/users'&&method==='POST'){check(!('email' in body)&&!('password' in body)&&!('administratorRights' in body),'Login fields submitted');return {id:3,role:'employee',active:true,passwordConfigured:false,email:'',...body};}
   throw Error('Unexpected API '+method+' '+path);
  };
  const review=async(person,draft)=>{reviewed=true;check(calls.filter(c=>c.path==='/api/users'&&c.method==='POST').length===saves,'Auto-created before review');await renderEmployeeRecord({container:root,api,person,draft,universes:['Agenda','Actualités','Collaborateurs','Laboratoires','Formations','Fun','Ressources humaines'],onClose(){URL.revokeObjectURL(draft.sourceUrl);},onSaved(){saves++;URL.revokeObjectURL(draft.sourceUrl);},onPayroll(){}});};
  const render=()=>renderEmployeeImport({container:root,api,people:[existing,{id:1,firstName:'Admin',lastName:'TEST',role:'admin'}],onReview:review});
  await render();check(!root.querySelector('.employee-scan-form button[type=submit]').disabled,'Configuration button missing');
  root.querySelector('#employee-scan-key').value='sk-local-test-only-not-a-real-key';root.querySelector('#employee-scan-key').closest('form').requestSubmit();await until(()=>configured);
  stage='analysis1';const file=root.querySelector('#employee-scan-file'),transfer=new DataTransfer();transfer.items.add(new File(['%PDF-1.4\n%%EOF\n'],'local.pdf',{type:'application/pdf'}));file.files=transfer.files;
  const form=file.closest('form');form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));check(!calls.some(c=>c.path==='/api/collaborateurs/scan'),'Scan sent without consent');
  form.querySelector('input[type=checkbox]').checked=true;form.requestSubmit();await until(()=>root.querySelector('#employee-record-form'));
  check(reviewed,'Review step missing');check(calls.find(c=>c.path==='/api/collaborateurs/scan').body.analysisConsent===true,'Consent not transmitted');
  check(root.querySelector('#employee-email').disabled&&root.querySelector('#employee-password').disabled&&root.querySelector('#employee-administrator-rights').disabled,'Account creation controls enabled');
  check(root.textContent.includes('À vérifier sur le document original.'),'Uncertainty warning missing');
  const record=root.querySelector('#employee-record-form');record.requestSubmit();check(saves===0,'Unconfirmed review saved');
  stage='save';root.querySelector('#employee-firstName').value='Corrigé';root.querySelector('#employee-address').value='Adresse validée';record.querySelector('input[type=checkbox][required]').checked=true;record.requestSubmit();await until(()=>saves===1);
  const created=calls.find(c=>c.path==='/api/users'&&c.method==='POST').body;check(created.firstName==='Corrigé'&&created.details.address==='Adresse validée','Corrections not used');
  stage='analysis2';await render();root.querySelector('#employee-scan-target').value='2';const next=root.querySelector('#employee-scan-file'),second=new DataTransfer();second.items.add(new File(['%PDF-1.4\n%%EOF\n'],'second.pdf',{type:'application/pdf'}));next.files=second.files;next.closest('form').querySelector('input[type=checkbox]').checked=true;next.closest('form').requestSubmit();await until(()=>root.querySelector('#employee-record-form'));
  check(root.querySelector('#employee-town').value==='Ville existante','Existing private field overwritten by missing scan value');check(root.querySelector('input[aria-label="Modifier Laboratoires"]').checked,'Existing specific rights lost');
  check(!calls.some(c=>c.path.includes('invitation')),'Invitation triggered');check(calls.filter(c=>c.path==='/api/users'&&c.method==='POST').length===1,'Unexpected creation');document.body.dataset.result='passed';
 }catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message+' stage='+stage;}
 </script></body></html>`));
 const server=app.listen(0);t.after(()=>server.close());const profile=await mkdtemp(join(tmpdir(),'portail-scan-chrome-'));t.after(()=>rm(profile,{recursive:true,force:true}));
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
