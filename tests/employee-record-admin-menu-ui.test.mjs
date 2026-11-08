import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
for(const [width,height]of [[1920,1080],[1024,768]])test('Menu Admin Collaborateur '+width+'x'+height,{skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.static(new URL('../public',import.meta.url).pathname));
 app.get('/fixture',(req,res)=>res.type('html').send(String.raw`<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><main id="root"></main><script type="module">
 import {renderEmployeeRecord} from '/employee-record.js';
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 try{
  const universes=['Agenda','Actualités','Fun','Collaborateurs','Ressources humaines','Laboratoires'];
  const person={id:7,firstName:'Collaborateur',lastName:'Fictif',job:'Préparateur',active:true,role:'employee',rights:['Agenda'],editRights:[],permissionsConfigured:true};
  let actorAdmin=true,saves=0,confirmAction=false,blocked=false,deleted=false;const calls=[];
  window.confirm=()=>confirmAction;
  const api=async(path,method='GET',body)=>{
    if(method==='GET')return {person:{...person},details:{jobOther:'Fonction personnalisée conservée'},detailsRevision:1,previewRestrictions:{accountReadOnly:true,profileReadOnly:person.role==='admin',lifecycleAllowed:person.role==='employee'}};
    calls.push({path,method,body});
    if(path.endsWith('/permanent')){if(blocked)throw Error('Suppression impossible : historique de planning conservé.');deleted=true;return {ok:true};}
    if(method==='DELETE')person.active=false;
    else if(path.endsWith('/restore'))person.active=true;
    else if(method==='PUT')Object.assign(person,{job:body.job,firstName:body.firstName,lastName:body.lastName});
    return {...person};
  };
  const root=document.querySelector('#root'),render=()=>renderEmployeeRecord({container:root,api,person,isAdmin:actorAdmin,onClose(){},onSaved(){saves++;},onPayroll(){},universes});
  const menu=()=>root.querySelector('.employee-record-admin'),summary=()=>menu().querySelector('summary');
  const action=text=>[...menu().querySelectorAll('button')].find(b=>b.textContent===text);
  const open=()=>{if(!menu().open)summary().click();};
  await render();check(summary().textContent==='Admin','Admin label missing');
  let h=root.querySelector('.employee-record-heading').getBoundingClientRect(),r=summary().getBoundingClientRect();check(Math.abs(r.right-h.right)<3,'Admin is not at right of header');check(r.top<=h.top+10,'Admin wrapped below header');
  check(!root.querySelector('.employee-record-tools button')?.textContent.includes('Droits'),'Dispersed rights action remains');
  check(!action('Supprimer le collaborateur'),'Active deletion offered');
  summary().click();check(menu().open,'Menu did not open');summary().click();check(!menu().open,'Menu did not close');
  open();summary().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));check(!menu().open,'Escape does not close menu');
  open();root.querySelector('.employee-record-tools button').click();check(!menu().open,'Click outside record menu does not close it');
  open();action('Gérer les droits').click();check(document.activeElement.id==='employee-permissions'&&!menu().open,'Rights configuration not reached');
  const count=calls.length;open();action('Désactiver le collaborateur').click();check(calls.length===count,'Cancelled disable wrote data');
  confirmAction=true;open();action('Désactiver le collaborateur').click();await until(()=>saves===1);check(!person.active,'Disable failed');
  await render();check(action('Réactiver le collaborateur')&&action('Supprimer le collaborateur'),'Inactive menu actions missing');
  open();action('Réactiver le collaborateur').click();await until(()=>saves===2);check(person.active,'Restore failed');
  person.active=false;await render();open();action('Supprimer le collaborateur').click();await until(()=>document.querySelector('dialog[open]'));
  check(document.querySelector('dialog').textContent.includes('Collaborateur Fictif'),'Deletion confirmation omits identity');
  [...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Annuler').click();await new Promise(r=>setTimeout(r,0));check(!deleted,'Cancellation deleted employee');
  blocked=true;open();action('Supprimer le collaborateur').click();await until(()=>document.querySelector('#employee-delete-confirmation'));
  const confirmDeletion=()=>{const input=document.querySelector('#employee-delete-confirmation');input.value='SUPPRIMER';input.dispatchEvent(new Event('input'));input.form.requestSubmit();};
  confirmDeletion();await until(()=>menu().textContent.includes('historique de planning'));check(!deleted&&menu().open,'Dependency error not visible or employee removed');
  blocked=false;open();action('Supprimer le collaborateur').click();await until(()=>document.querySelector('#employee-delete-confirmation'));confirmDeletion();await until(()=>deleted&&saves===3);
  actorAdmin=false;await render();check(!menu(),'Non-admin sees Admin menu');
  actorAdmin=true;person.role='admin';await render();check(menu()&&action('Gérer les droits'),'Admin profile rights missing');check(!action('Désactiver le collaborateur')&&!action('Supprimer le collaborateur'),'Protected admin actions exposed');
  person.role='employee';person.active=true;await render();const job=root.querySelector('#employee-job');check(root.querySelector('.employee-job-other').hidden,'Other field regression');job.value='Autres précisez';job.dispatchEvent(new Event('change'));check(root.querySelector('#employee-job-other').value==='Fonction personnalisée conservée','Saved custom function lost');
  root.querySelector('#employee-phone').value='0612345678';root.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));await until(()=>saves===4);check(calls.at(-1).body.phone==='0612345678'&&calls.at(-1).body.job==='Fonction personnalisée conservée','Other form fields changed');
  await render();document.activeElement?.blur();await new Promise(r=>setTimeout(r,500));window.scrollTo({top:0,behavior:'instant'});await new Promise(r=>setTimeout(r,50));open();
  h=root.querySelector('.employee-record-heading').getBoundingClientRect();r=summary().getBoundingClientRect();check(Math.abs(r.right-h.right)<3&&r.top<=h.top+10&&r.top>=0&&r.bottom<innerHeight,'Final menu position changed');
  const panel=menu().querySelector('.employee-record-admin-actions').getBoundingClientRect();check(panel.right<=innerWidth&&panel.left>=0,'Dropdown overflows viewport');check(document.documentElement.scrollWidth<=innerWidth,'Horizontal overflow');
  document.body.dataset.result='passed';
 }catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message;}
 </script></body></html>`));
 const server=app.listen(0);t.after(()=>server.close());const profile=await mkdtemp(join(tmpdir(),'portail-employee-chrome-'));t.after(()=>rm(profile,{recursive:true,force:true}));
 const child=spawn(chromium,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--disable-sync','--user-data-dir='+profile,'--remote-debugging-port=0'],{stdio:['ignore','ignore','pipe']});t.after(()=>child.kill());
 const debuggerUrl=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Chromium debugger did not start')),10000);child.stderr.on('data',chunk=>{log+=chunk;const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});child.on('error',reject);});
 const ws=new WebSocket(debuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});t.after(()=>ws.close());
 let sequence=0;const pending=new Map();ws.onmessage=e=>{const message=JSON.parse(e.data);const waiter=pending.get(message.id);if(waiter){pending.delete(message.id);message.error?waiter.reject(Error(message.error.message)):waiter.resolve(message.result);}};
 const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await command('Target.createTarget',{url:'about:blank'});
 const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
 await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/fixture'},sessionId);
 const result=await command('Runtime.evaluate',{expression:`new Promise(resolve=>{const start=Date.now();const timer=setInterval(()=>{if(document.body?.dataset.result||Date.now()-start>10000){clearInterval(timer);resolve({result:document.body?.dataset.result,error:document.body?.dataset.error,location:location.href});}},50);})`,awaitPromise:true,returnByValue:true},sessionId);
 assert.equal(result.result?.value?.result,'passed',JSON.stringify(result.result?.value));
 if(process.env.PORTAIL_UI_SCREENSHOT_DIRECTORY){await mkdir(process.env.PORTAIL_UI_SCREENSHOT_DIRECTORY,{recursive:true});const shot=await command('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(join(process.env.PORTAIL_UI_SCREENSHOT_DIRECTORY,'employee-admin-'+width+'x'+height+'.png'),Buffer.from(shot.data,'base64'));}
});
