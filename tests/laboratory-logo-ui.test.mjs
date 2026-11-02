import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur Laboratoires : import et remplacement du logo, tuile, fiche et actualisation', {skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.static(new URL('../public',import.meta.url).pathname));
 app.get('/api/laboratories/1/logo',(q,s)=>s.type('png').send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')));
 app.get('/fixture',(req,res)=>res.type('html').send(`<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><main id="root"></main><script type="module">
 import {renderLaboratories} from '/laboratories.js';
 const check=(ok,message)=>{if(!ok)throw Error(message);},wait=async predicate=>{for(let n=0;n<150;n++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 try{
 const root=document.querySelector('#root'),png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 let lab={id:1,name:'Laboratoire local',orderMode:'groupement',responsibleId:null,revision:1,logoVersion:0,conditionsYear:2026,conditions:'À conserver',notes:'Note existante'};let logoWrites=0;const writes=[];
 const api=async(path,method='GET',body)=>{
  if(path==='/api/laboratories'&&method==='GET')return [structuredClone(lab)];
  if(path==='/api/laboratories/responsibles')return [];
  if(path==='/api/laboratories/1/documents')return [];
  if(path==='/api/laboratories/1'&&method==='PUT'){writes.push(path);lab={...lab,...body,revision:lab.revision+1};return structuredClone(lab);}
  if(path==='/api/laboratories/1/logo'&&method==='POST'){check(body.revision===lab.revision,'Logo must use latest revision');check(body.fileData===png,'Logo bytes changed');lab.logoVersion++;lab.revision++;logoWrites++;return {ok:true};}
  throw Error('Unexpected API '+path+' '+method);
 };
 const render=()=>renderLaboratories({container:root,api});const click=text=>[...root.querySelectorAll('button')].find(b=>b.textContent===text).click();
 const edit=()=>{root.querySelector('.lab-card').click();click('Modifier la fiche');};
 const upload=async()=>{const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],'local.png',{type:'image/png'}));root.querySelector('#lab-logo-file').files=transfer.files;root.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));await wait(()=>root.querySelector('.lab-card img'));await wait(()=>root.querySelector('.lab-card img')?.naturalWidth>0);};
 await render();check(!root.querySelector('.lab-card img'),'No initial logo');edit();await upload();check(logoWrites===1,'Logo import missing');check(root.querySelector('.lab-card img').src.endsWith('/logo?v=1'),'Tile logo version');
 root.querySelector('.lab-card').click();await wait(()=>root.querySelector('.lab-sheet img')?.naturalWidth>0);check(root.querySelector('.lab-sheet img').src.endsWith('/logo?v=1'),'Sheet logo version');check(root.textContent.includes('À conserver')&&root.textContent.includes('Note existante'),'Existing details preserved');
 click('Retour au répertoire');edit();await upload();check(logoWrites===2&&root.querySelector('.lab-card img').src.endsWith('/logo?v=2'),'Replacement must update version');
 await render();await wait(()=>root.querySelector('.lab-card img')?.naturalWidth>0);check(root.querySelector('.lab-card img').src.endsWith('/logo?v=2'),'Reload must retain replacement');check(lab.conditions==='À conserver'&&lab.notes==='Note existante','Other fields changed');check(writes.length===2,'Only expected record saves');
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
