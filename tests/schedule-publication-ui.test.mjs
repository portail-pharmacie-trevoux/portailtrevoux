import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur planning : publication, disparition du brouillon, nouvelle date et message après actualisation',{skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.json());let published=false,publishCalls=0;const week='2026-11-02',notices=[];
 app.get('/api/me',(q,s)=>s.json({user:{id:1,name:'Administrateur TEST local',role:'admin',rights:[],mustChange:false},csrf:'local'}));
 app.get('/api/schedule',(q,s)=>s.json({week,people:[{id:2,name:'Collaborateur TEST local',job:'Préparateur'}],entries:[],lockedDays:{},canEdit:true,revision:3,draftEntryCount:0,publishedAt:published?'2026-11-02T20:00:00Z':'2026-10-01T10:00:00Z',unpublishedChanges:!published}));
 app.post('/api/schedule/:week/publish',(q,s)=>{assert.equal(q.params.week,week);assert.equal(q.body.revision,3);assert.equal(q.get('x-csrf-token'),'local');publishCalls++;if(!published)notices.push({id:7,sender_id:null,sender:'Portail +',text:'Un nouvel emploi du temps est disponible pour la semaine du 02/11/2026 au 08/11/2026. Merci de consulter votre nouvel emploi du temps dans la rubrique Emplois du temps.',created_at:'2026-11-02T20:00:00Z',priority:'normal',planning_week:week,can_archive:false,seen:false,archived:false});published=true;s.json({ok:true});});
 app.get('/api/news',(q,s)=>s.json(notices));app.get('/api/news/sent',(q,s)=>s.json([]));app.get('/api/news/recipients',(q,s)=>s.json([{id:2,name:'Collaborateur TEST local'}]));
 app.get('/fixture-state',(q,s)=>s.json({published,publishCalls,notices}));
 app.get('/api/integrations/google-health',(q,s)=>s.json({mail:{configured:false,connected:false}}));
 app.use('/api',(q,s)=>s.json([]));
 const index=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const driver=String.raw`<script type="module">
 const check=(ok,message)=>{if(!ok)throw Error(message);},until=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout: '+document.querySelector('#content')?.textContent.slice(0,300));};
 try{
  await until(()=>!document.querySelector('#home').classList.contains('hidden'));document.querySelector('[data-universe="Emplois du temps"]').click();
  await until(()=>document.querySelector('.schedule-status'));
  const publish=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Republier le planning de l’équipe');
  if(!location.search.includes('persist')){
   check(document.querySelector('.schedule-status').textContent.includes('Brouillon modifié'),'Modified draft missing');check(!publish().disabled,'Publish disabled before change');publish().click();
   await until(()=>document.querySelector('.schedule-status.state-published'));check(!document.querySelector('.schedule-status').textContent.includes('Brouillon modifié'),'Modified status persisted');check(publish().disabled,'Publish must disable after success');
   check(document.querySelector('.schedule-publication-group').textContent.includes('02/11/2026'),'Publication date not updated');location.replace('/?persist=1');
  }else{
   await until(()=>document.querySelector('.schedule-status.state-published'));check(publish().disabled,'Refresh lost publication');
   document.querySelector('[data-universe="Actualités"]').click();await until(()=>document.querySelector('.news-message'));
   check(document.querySelector('.news-message').textContent.includes('02/11/2026 au 08/11/2026'),'Week absent from message');check(document.querySelector('.news-message').textContent.includes('Merci de consulter'),'Consultation invitation absent');
   check([...document.querySelectorAll('button')].some(b=>b.textContent.includes('planning')),'Planning link missing');const state=await(await fetch('/fixture-state')).json();check(state.publishCalls===1&&state.notices.length===1,'Unexpected duplicate publication');document.body.dataset.result='passed';
  }
 }catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message;}
 </script>`;
 app.get('/',(q,s)=>s.type('html').send(index.replace('</body>',driver+'</body>')));app.use(express.static(new URL('../public',import.meta.url).pathname));
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
