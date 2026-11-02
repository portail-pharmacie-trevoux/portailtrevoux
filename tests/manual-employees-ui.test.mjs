import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur annuaire : ajout manuel Sans accès, persistance, confirmation de retrait et réactivation',{skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.json());const calls=[];
 const people=[{id:1,firstName:'Administrateur',lastName:'TEST',name:'Administrateur TEST',active:true,role:'admin',passwordConfigured:true,email:'admin-test@portailplus.invalid',rights:[],editRights:[]},{id:2,firstName:'Original',lastName:'PROTÉGÉ',name:'Original PROTÉGÉ',active:true,role:'employee',passwordConfigured:false,invitationEmail:'original@example.invalid',rights:[],editRights:[]}];
 app.get('/api/me',(req,res)=>res.json({user:{id:1,name:'Administrateur TEST',role:'admin',rights:[],mustChange:false},csrf:'local',features:{employeeAccountsReadOnly:true}}));
 app.get('/api/users',(req,res)=>res.json(people));
 app.post('/api/users',(req,res)=>{calls.push({method:'POST',body:req.body});const row={...req.body,id:3,name:req.body.firstName+' '+req.body.lastName,role:'employee',active:true,passwordConfigured:false,invitationSentAt:null,email:'',previewManualRecord:true};people.push(row);res.status(201).json(row);});
 app.delete('/api/users/:id',(req,res)=>{calls.push({method:'DELETE'});people.find(p=>p.id===Number(req.params.id)).active=false;res.json({ok:true});});
 app.post('/api/users/:id/restore',(req,res)=>{calls.push({method:'RESTORE'});const row=people.find(p=>p.id===Number(req.params.id));row.active=true;res.json(row);});
 app.get('/fixture-state',(req,res)=>res.json({calls,original:people[1]}));
 app.get('/api/integrations/google-health',(req,res)=>res.json({mail:{configured:false,connected:false}}));
 app.use('/api',(req,res)=>res.json([]));
 const index=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const driver=String.raw`<script type="module">
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const until=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 const row=()=>[...document.querySelectorAll('tr')].find(tr=>tr.textContent.includes('Fictif'));
 try{
  await until(()=>!document.querySelector('#home').classList.contains('hidden'));
  document.querySelector('[data-universe="Collaborateurs"]').click();
  await until(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Ajouter un collaborateur manuellement'));
  await until(()=>document.querySelector('tr[data-person-id="2"]'));
  const original=[...document.querySelectorAll('tr')].find(tr=>tr.textContent.includes('Original'));
  check(original&&!original.querySelector('button[aria-label^="Retirer"]'),'Imported record unavailable or removable: '+document.querySelector('#content').textContent.slice(0,500));
  check(original.querySelector('button[aria-label^="Envoyer demande"]').disabled,'Invitations enabled');
  if(!location.search.includes('persist')){
   [...document.querySelectorAll('button')].find(b=>b.textContent==='Ajouter un collaborateur manuellement').click();
   check(document.querySelector('#editor').open,'Manual form closed');check(document.querySelector('#email').disabled&&document.querySelector('#temporary-password').disabled,'Connection fields editable');
   document.querySelector('#first-name').value='Fictif';document.querySelector('#last-name').value='Local';document.querySelector('#phone').value='0612345678';document.querySelector('#job').value='Préparateur';
   const form=document.querySelector('#form');form.requestSubmit(form.querySelector('button[type=submit]'));
   await until(()=>row()&&!document.querySelector('#editor').open);check(row().querySelector('.access-state').textContent==='Sans accès','Wrong access badge');check(!row().closest('.inactive-people'),'New entry not active');
   row().querySelector('button[aria-label^="Retirer"]').click();check(document.querySelector('#removeDialog').open,'Confirmation missing');document.querySelector('#keep').click();
   check((await (await fetch('/fixture-state')).json()).calls.every(c=>c.method!=='DELETE'),'Cancelled withdrawal sent');
   row().querySelector('button[aria-label^="Retirer"]').click();document.querySelector('#confirmRemove').click();await until(()=>row()?.closest('.inactive-people'));
   check([...row().querySelectorAll('button')].some(b=>b.textContent==='Supprimer définitivement'),'Permanent deletion missing for inactive employee');
   [...row().querySelectorAll('button')].find(b=>b.textContent==='Réactiver').click();await until(()=>row()&&!row().closest('.inactive-people'));
   check(row().querySelector('.access-state').textContent==='Sans accès','Restoration enabled login');
   location.replace('/?persist=1');
  }else{
   await until(()=>row());check(!row().closest('.inactive-people')&&row().querySelector('.access-state').textContent==='Sans accès','Refresh lost state');
   const state=await (await fetch('/fixture-state')).json();check(state.calls.length===3,'Unexpected actions');const body=state.calls[0].body;check(!('email' in body)&&!('password' in body)&&!('administratorRights' in body),'Account fields submitted');check(state.original.active&&state.original.firstName==='Original','Imported record changed');
   document.body.dataset.result='passed';
  }
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
