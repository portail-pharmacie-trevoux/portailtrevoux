import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur : jours N−1 automatiques, dates interannuelles, ajustement et réouverture', {skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.static(new URL('../public',import.meta.url).pathname));
 app.get('/fixture',(req,res)=>res.type('html').send(`<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><main id="root"></main><script type="module">
 import {renderMerchandisingImpact} from '/merchandising-impact.js';
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 try{
 const root=document.querySelector('#root');let saved=null;
 const api=async(path,method='GET',body)=>{if(method==='PUT'){saved={zone_id:1,zone_name:'Test',offer:'Local',revision:1,updated_at:new Date().toISOString(),data:structuredClone(body)};return saved;}return path==='/api/merchandising'?{zones:[{id:1,name:'Test',months:{'2026-12':'Local'}}]}:{canEdit:true,evaluations:saved?[saved]:[],promotions:[]};};
 const render=()=>renderMerchandisingImpact({container:root,api,isCurrent:()=>true,month:'2026-12'});
 const click=text=>[...root.querySelectorAll('button')].find(b=>b.textContent===text).click();
 const input=(label,value)=>{const e=root.querySelector('input[aria-label="'+label+'"]');if(value!==undefined){e.value=value;e.dispatchEvent(new Event('input'));}return e;};
 await render();click('Évaluer une mise en avant');root.querySelector('select[aria-label="Mise en avant évaluée"]').value='1';
 const toggle=root.querySelector('input[type=checkbox][aria-label]');toggle.click();
 const ref=()=>input('Jours d’ouverture comparés · Période de référence');
 check(ref().value==='26','December 2025 default');
 input('Début · Mise en avant','2026-12-28');input('Fin · Mise en avant','2027-01-05');
 check(input('Début · Période de référence').value==='2025-12-28','Start shifted');check(input('Fin · Période de référence').value==='2026-01-05','End shifted');check(ref().value==='6','Cross-year Sunday and holiday count');
 ref().value='5';ref().dispatchEvent(new Event('input'));input('Nombre d’unités vendues · Période de référence','100');input('Nombre d’unités vendues · Mise en avant','200');check(ref().value==='5','Real opening override preserved by finance edits');
 root.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));
 for(let n=0;n<100&&!root.querySelector('.merch-impact-card');n++)await new Promise(r=>setTimeout(r,20));
 check(saved?.data.referenceDays===5,'Days saved');click('Modifier le bilan');check(ref().value==='5','Saved override retained on reopen');
 input('Fin · Mise en avant','2027-01-06');check(ref().value==='7','Date edit recalculates');
 root.querySelector('input[type=checkbox][aria-label]').click();input('Début · Période de référence','2025-12-01');input('Jours d’ouverture comparés · Période de référence','4');input('Fin · Mise en avant','2027-01-07');check(ref().value==='4'&&input('Début · Période de référence').value==='2025-12-01','Manual reference preserved');root.querySelector('input[type=checkbox][aria-label]').click();check(ref().value==='8','Reenabling N−1 calculates days');
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
