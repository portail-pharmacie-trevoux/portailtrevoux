import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur : statuts automatiques, saisie et historique des précisions sans perte des actions', {skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.static(new URL('../public',import.meta.url).pathname));
 app.get('/fixture',(req,res)=>res.type('html').send(`<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><main id="root"></main><script type="module">
 import {renderQualityErrors} from '/quality-errors.js';
 const check=(ok,message)=>{if(!ok)throw Error(message);},pause=()=>new Promise(resolve=>setTimeout(resolve,50));
 try{
  let row={id:1,identified_date:'2026-10-01',error_date:'2026-10-01',created_at:'2026-10-01T12:00:00Z',operator_name:'Compte local',responsible_name:'Compte local',responsible_id:2,error_type:'Erreur de dosage',details:'Détail local',actions:'Actions conservées',severity:2,status:'declared',revision:1,status_history:[],error_corrected:false,correction_note:'',correction_note_history:[]};
  const api=async(path,method='GET',body)=>{
   if(method==='GET')return {errors:[row],people:[{id:2,name:'Compte local',active:true}],isAdmin:true,canUncheckFollowup:true,today:'2026-11-01',operatorName:'Compte local'};
   if(path.endsWith('/notification')){const old=row.status,field={operator:'operator_notified',patient:'patient_notified',doctor:'doctor_notified',corrected:'corrected'}[body.target];row[field+'_at']=body.checked?'2026-11-01T12:00:00Z':null;if(body.target==='corrected')row.error_corrected=body.checked;row.status=row.error_corrected?'closed':row.patient_notified_at||row.doctor_notified_at?'in_progress':'declared';if(old!==row.status)row.status_history.push({from:old,to:row.status,by:'Compte local',at:'2026-11-01T12:00:00Z'});}
   else if(path.endsWith('/correction-note')){row.correction_note_history.push({from:row.correction_note,to:body.note,by:'Compte local',at:'2026-11-01T12:00:00Z'});row.correction_note=body.note;}
   else throw Error('Unexpected write '+path);
   row.revision++;return {...row};
  };
  const root=document.querySelector('#root');await renderQualityErrors({container:root,api,onBack(){}});
  check(root.querySelector('.quality-state-ring.declared'),'Initial state missing');
  root.querySelectorAll('input[type=checkbox]')[1].click();await pause();check(root.querySelector('.quality-state-ring.in_progress'),'Patient checkbox must advance state');
  root.querySelectorAll('input[type=checkbox]')[3].click();await pause();check(root.querySelector('.quality-state-ring.closed'),'Corrected checkbox must close');
  let note=root.querySelector('.quality-correction-note input');check(note&&note.maxLength===100,'Correction note missing');
  note.value='Première précision';note.dispatchEvent(new Event('input'));root.querySelector('.quality-correction-note button').click();await pause();
  check(root.textContent.includes('Historique des précisions')&&root.textContent.includes('Première précision'),'Saved note history missing');
  note=root.querySelector('.quality-correction-note input');note.value='Seconde précision';note.dispatchEvent(new Event('input'));root.querySelector('.quality-correction-note button').click();await pause();
  check(root.textContent.includes('Première précision → Seconde précision'),'Old note must remain visible');
  root.querySelectorAll('input[type=checkbox]')[3].click();await pause();check(root.querySelector('.quality-state-ring.in_progress'),'Unchecking correction must reopen');check(root.textContent.includes('Seconde précision'),'History lost after reopening');check(root.textContent.includes('Actions conservées'),'Corrective actions lost');
  check(!root.querySelector('select[aria-label^="État de traitement"]'),'Manual status controls must be absent');
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
