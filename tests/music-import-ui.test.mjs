import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur Fun : CSV Artist/Title, doublons, recherche, sélection, export, retrait et actualisation',{skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.json());let musicSequence=1;const rows=[{id:100,artist:'Existant',title:'Protégé',created_at:new Date().toISOString()}],calls=[];
 const {validateMusic}=await import('../music.mjs'),{musicCSV}=await import('../music-csv.mjs');
 app.get('/api/me',(q,s)=>s.json({user:{id:1,name:'Administrateur TEST local',role:'admin',rights:[],mustChange:false},csrf:'local'}));
 app.get('/api/music',(q,s)=>s.json(rows));
 app.post('/api/music/import',(q,s)=>{assert.equal(q.get('x-csrf-token'),'local');let added=0;for(const value of q.body.tracks){const track=validateMusic(value);if(rows.some(r=>validateMusic(r).trackKey===track.trackKey))continue;rows.push({...track,id:musicSequence++,created_at:new Date().toISOString()});added++;}calls.push({kind:'import',added,duplicates:q.body.tracks.length-added});s.json({added,duplicates:q.body.tracks.length-added});});
 app.post('/api/music/export.csv',(q,s)=>{calls.push({kind:'export',ids:q.body.ids});s.type('csv').send(musicCSV(rows.filter(r=>q.body.ids.includes(r.id))));});
 app.post('/api/music/delete-selected',(q,s)=>{calls.push({kind:'delete',ids:q.body.ids});const ids=rows.filter(r=>q.body.ids.includes(r.id)).map(r=>r.id);for(const id of ids)rows.splice(rows.findIndex(r=>r.id===id),1);s.json({ids});});
 app.get('/fixture-state',(q,s)=>s.json({rows,calls}));app.get('/api/integrations/google-health',(q,s)=>s.json({mail:{configured:false,connected:false}}));app.use('/api',(q,s)=>s.json([]));
 const index=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const driver=String.raw`<script type="module">
 const check=(ok,message)=>{if(!ok)throw Error(message);},until=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 const click=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text).click();
 try{
 await until(()=>!document.querySelector('#home').classList.contains('hidden'));document.querySelector('[data-universe="Fun"]').click();await until(()=>document.querySelector('#music-csv-import'));
 if(!location.search.includes('persist')){
  const csv='\uFEFF"Title","Artist"\r\n"Jóga","Björk"\r\n"Hello, ""live""","Adele"\r\n"JOGA","bjork"\r\n';
  for(let attempt=0;attempt<2;attempt++){const transfer=new DataTransfer();transfer.items.add(new File([csv],'local.csv',{type:'text/csv'}));const file=document.querySelector('#music-csv-import');file.files=transfer.files;file.dispatchEvent(new Event('change'));await until(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Importer dans le portail'&&!b.disabled));click('Importer dans le portail');await until(()=>document.querySelector('#content').textContent.includes(attempt?'0 morceaux importés, 3 doublons':'2 morceaux importés, 1 doublons'));}
  check(document.querySelectorAll('.music-row').length===3,'Duplicates or missing original');
  const search=document.querySelector('#music-search');search.value='bjork';search.dispatchEvent(new Event('input'));check(document.querySelectorAll('.music-row').length===1,'Accent-insensitive search broken');check(document.querySelector('.music-row').textContent.includes('Jóga'),'Artist/Title mapping wrong');click('Tout cocher');click('Exporter les titres sélectionnés en CSV');await until(()=>document.querySelector('.music-feedback').textContent.includes('exporté'));
  window.confirm=()=>false;click('Supprimer les titres sélectionnés');check(document.querySelectorAll('.music-row').length===1,'Cancellation deleted row');window.confirm=()=>true;click('Supprimer les titres sélectionnés');await until(()=>document.querySelectorAll('.music-row').length===0);search.value='';search.dispatchEvent(new Event('input'));check(document.querySelectorAll('.music-row').length===2,'Other rows deleted');
  const state=await(await fetch('/fixture-state')).json();check(state.calls.filter(c=>c.kind==='import').length===2,'Wrong import count');check(state.calls.filter(c=>c.kind==='export').length===1,'Export missing');check(state.calls.filter(c=>c.kind==='delete').length===1,'Cancel or repeated delete sent');check(state.rows.some(r=>r.id===100),'Existing song changed');check(state.rows.some(r=>r.title==='Hello, "live"'),'CSV quotation handling broken');location.replace('/?persist=1');
 }else{check(document.querySelectorAll('.music-row').length===2,'Refresh lost music state');check(document.querySelector('#content').textContent.includes('Protégé'),'Existing row lost after reload');document.body.dataset.result='passed';}
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
