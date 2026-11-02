import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur fiches : données et droits transmis, permissions spécifiques conservées, accès et administrateur protégés',{skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.static(new URL('../public',import.meta.url).pathname));
 app.get('/fixture',(req,res)=>res.type('html').send(String.raw`<!doctype html><html><body><main id="root"></main><script type="module">
 import {renderEmployeeRecord} from '/employee-record.js';
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 try{
  const universes=['Agenda','Actualités','Fun','Collaborateurs','Ressources humaines','Laboratoires','Formations','Procédures',"Outils d'aide à la démarche qualité",'Emplois du temps'];
  let preview=true,administrator=false,saves=0,writes=[];
  const person={id:2,firstName:'Compte',lastName:'Local',phone:'0600000000',birthday:'1990-01-01',job:'Préparateur',active:true,email:'',role:'employee',rights:['Agenda','Actualités','Laboratoires'],editRights:['Laboratoires'],permissionsConfigured:false};
  let details={address:'Adresse locale initiale',personalEmail:'local@example.invalid'},revision=3;
  const api=async(path,method='GET',body)=>{
   if(method==='GET')return {person:{...person,role:administrator?'admin':'employee'},details:{...details},detailsRevision:revision,...(preview?{previewRestrictions:{accountReadOnly:true,profileReadOnly:administrator}}:{})};
   check(method==='PUT','Unexpected write');writes.push(body);Object.assign(person,Object.fromEntries(['firstName','lastName','phone','birthday','job'].map(k=>[k,body[k]])));details={...body.details};revision++;if(body.rights){person.rights=body.rights;person.editRights=body.editRights;person.permissionsConfigured=true;}return {...person};
  };
  const root=document.querySelector('#root'),render=()=>renderEmployeeRecord({container:root,api,person,onClose(){},onSaved(){saves++;},onPayroll(){},universes});
  await render();check(root.querySelector('#employee-email').disabled&&root.querySelector('#employee-password').disabled,'Connection controls editable');check(root.querySelector('#employee-administrator-rights').disabled,'Privilege escalation control enabled');
  check(root.querySelector('input[aria-label="Modifier Laboratoires"]').checked,'Existing specific permission disappeared');
  root.querySelector('#employee-phone').value='0612345678';root.querySelector('#employee-address').value='Adresse modifiée';
  root.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));await until(()=>saves===1);
  check(writes[0].details.address==='Adresse modifiée'&&writes[0].detailsRevision===3,'Private record stripped from payload');
  check(!('email' in writes[0])&&!('password' in writes[0])&&!('administratorRights' in writes[0]),'Account fields submitted');
  check(!('rights' in writes[0])&&!('editRights' in writes[0]),'Profile save unexpectedly changes permissions');
  await render();check(root.querySelector('#employee-address').value==='Adresse modifiée','Details lost on refresh');
  const edit=root.querySelector('input[aria-label="Modifier Formations"]');edit.checked=true;edit.dispatchEvent(new Event('change'));
  check(root.querySelector('input[aria-label="Consulter Formations"]').checked,'Edit must imply consultation');
  root.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));await until(()=>saves===2);
  check(writes[1].rights.includes('Formations')&&writes[1].editRights.includes('Formations'),'Universe rights not submitted');check(writes[1].editRights.includes('Laboratoires'),'Specific laboratory grant overwritten');
  administrator=true;await render();check(root.querySelector('button[type=submit]').disabled,'Protected admin can save');check([...root.querySelectorAll('input,select,textarea')].every(n=>n.disabled),'Protected admin fields editable');root.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));check(writes.length===2,'Admin profile write attempted');
  administrator=false;preview=false;await render();check(!root.querySelector('#employee-email').disabled,'Non-preview account form changed');root.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));await until(()=>saves===3);check('email' in writes[2]&&'password' in writes[2]&&'administratorRights' in writes[2],'Non-preview payload changed');
  document.body.dataset.result='passed';
 }catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message;}
 </script></body></html>`));
 const server=app.listen(0);t.after(()=>server.close());const profile=await mkdtemp(join(tmpdir(),'portail-employee-chrome-'));t.after(()=>rm(profile,{recursive:true,force:true}));
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
