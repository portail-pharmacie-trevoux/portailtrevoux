import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Scalingo personal administrator UI: email/admin fields enabled and invitation preview never sends mail',{skip:!existsSync(chromium),timeout:20000},async t=>{
 const app=express();app.use(express.json());const calls=[];
 const people=[{id:1,firstName:'Administrateur',lastName:'TEST',name:'Administrateur TEST',active:true,role:'admin',passwordConfigured:true,email:'admin-test@portailplus.invalid',rights:[],editRights:[]},{id:2,firstName:'Original',lastName:'PROTÉGÉ',name:'Original PROTÉGÉ',active:true,role:'employee',passwordConfigured:false,invitationEmail:'original@example.invalid',rights:[],editRights:[]}];
 app.get('/api/me',(req,res)=>res.json({user:{id:59,email:'personal-admin@example.invalid',name:'Synthetic personal admin',role:'admin',rights:[],mustChange:false},csrf:'local',features:{employeeAccountsReadOnly:true,scalingoAccountCreation:true,scalingoAccountManagement:true,invitationPreview:true,invitationSendingEnabled:false}}));
 app.get('/api/users',(req,res)=>res.json(people));
 app.post('/api/users',(req,res)=>{
  if(req.body.email!=='fictional-admin@example.invalid'||req.body.password!=='Fictitious-UI-only-password'||req.body.administratorRights!==true)return res.status(400).json({error:'Fixture request invalid'});
  calls.push({method:'POST',administratorRights:req.body.administratorRights,email:req.body.email,passwordSupplied:typeof req.body.password==='string'});
  const row={firstName:req.body.firstName,lastName:req.body.lastName,id:3,name:'Fictif Local',role:'admin',active:true,passwordConfigured:false,temporaryPasswordRequired:true,email:req.body.email,invitationEmail:req.body.email,rights:[],editRights:[]};people.push(row);res.status(201).json(row);
 });
 app.post('/api/users/:id/invitation-preview',(req,res)=>{calls.push({method:'PREVIEW'});res.json({eligible:true,email:'fictional-admin@example.invalid',tokenCreated:false,emailSent:false,authorizationRequired:true});});
 app.post('/api/users/:id/invitation',(req,res)=>{calls.push({method:'SEND'});res.status(500).json({error:'No real mail allowed'});});
 app.delete('/api/users/:id',(req,res)=>{calls.push({method:'DELETE'});people.find(p=>p.id===Number(req.params.id)).active=false;res.json({ok:true});});
 app.post('/api/users/:id/restore',(req,res)=>{calls.push({method:'RESTORE'});const row=people.find(p=>p.id===Number(req.params.id));row.active=true;res.json(row);});
 app.get('/fixture-state',(req,res)=>res.json({calls,original:people[1]}));
 app.get('/api/integrations/google-health',(req,res)=>res.json({mail:{configured:false,connected:false}}));
 app.use('/api',(req,res)=>res.json([]));
 const index=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const driver=String.raw`<script type="module">
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const until=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 const row=()=>document.querySelector('tr[data-person-id="3"]');
 try{
  window.confirm=()=>true;
  await until(()=>!document.querySelector('#home').classList.contains('hidden'));
  document.querySelector('[data-universe="Collaborateurs"]').click();
  await until(()=>document.querySelector('tr[data-person-id="2"]'));
  openEditor(2);check(!document.querySelector('#email').disabled&&!document.querySelector('#temporary-password').disabled,'Existing account fields still locked');check(document.querySelector('#scalingo-new-administrator'),'Administrator grant missing');document.querySelector('#cancel').click();
  await new Promise(r=>setTimeout(r,50));
  [...document.querySelectorAll('button')].find(b=>b.textContent==='Ajouter un collaborateur manuellement').click();
  check(!document.querySelector('#email').disabled&&!document.querySelector('#temporary-password').disabled,'Creation fields disabled');
  check(!document.querySelector('#scalingo-new-administrator').checked,'Admin selected by default');check(document.querySelector('#account-options').open,'Account options closed');
  document.querySelector('#first-name').value='Fictif';document.querySelector('#last-name').value='Local';document.querySelector('#email').value='fictional-admin@example.invalid';document.querySelector('#temporary-password').value='Fictitious-UI-only-password';document.querySelector('#scalingo-new-administrator').checked=true;
  const form=document.querySelector('#form');form.requestSubmit(form.querySelector('button[type=submit]'));await until(()=>row()&&!document.querySelector('#editor').open);
  check(document.querySelector('#temporary-password').value==='','Temporary password retained');check(row().querySelector('.access-state').textContent==='Mot de passe provisoire','Wrong access state');
  await reloadPeople();check(row().querySelector('.access-state').textContent==='Mot de passe provisoire','State lost after reload');
  const preview=row().querySelector('.person-invitation button');check(!preview.disabled&&preview.textContent.includes('Prévisualiser'),'Preview unavailable');preview.click();await until(()=>row().querySelector('.invitation-status').textContent.includes('Aucun e-mail envoyé'));
  const state=await (await fetch('/fixture-state')).json();check(state.calls.filter(c=>c.method==='PREVIEW').length===1&&!state.calls.some(c=>c.method==='SEND'),'Real invitation requested');check(state.calls.length===2&&state.calls[0].administratorRights&&state.calls[0].passwordSupplied,'Wrong creation request');check(!('password' in state.calls[0]),'Fixture retained plain password');check(state.original.active&&state.original.firstName==='Original','Existing person modified');
  [...document.querySelectorAll('button')].find(b=>b.textContent==='Ajouter un collaborateur manuellement').click();check(!document.querySelector('#scalingo-new-administrator').checked,'Role checkbox not reset');document.querySelector('#cancel').click();document.body.dataset.result='passed';
 }catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message;}
 </script>`;
 app.get('/',(req,res)=>res.type('html').send(index.replace('</body>',driver+'</body>')));
 app.use(express.static(new URL('../public',import.meta.url).pathname));
 const server=app.listen(0);t.after(()=>server.close());const profile=await mkdtemp(join(tmpdir(),'portail-manual-chrome-'));t.after(()=>rm(profile,{recursive:true,force:true}));
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
