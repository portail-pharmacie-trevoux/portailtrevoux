import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Navigateur Laboratoires : renommage ciblé, droits, conditions en vigueur et passage d’année', {skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.static(new URL('../public',import.meta.url).pathname));
 app.get('/fixture',(req,res)=>res.type('html').send(`<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><main id="root"></main><script type="module">
 import {renderLaboratories} from '/laboratories.js';
 const check=(ok,message)=>{if(!ok)throw Error(message);},wait=async predicate=>{for(let n=0;n<150;n++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 try{
 const root=document.querySelector('#root');let clock=new Date('2026-11-03T12:00:00Z'),canRename=true,fail=false;const writes=[];
 const lab={id:1,name:'Laboratoire local',orderMode:'groupement',revision:1,conditionsYear:2025,conditions:'Conditions expirées 2025',franco:'100 €',conditionsHistory:{2025:{year:2025,conditions:'Conditions expirées 2025',franco:'100 €'},2026:{year:2026,conditions:'Conditions actuelles 2026',franco:'150 €',validFrom:'2026-01-01',validUntil:'2026-12-31'},2027:{year:2027,conditions:'Conditions futures 2027',franco:'200 €'}},notes:'Note conservée'},originalLab=JSON.stringify(lab);
 const docs=[{id:4,title:'Catalogue original',file_name:'fichier-original.pdf'},{id:5,title:'Autre document',file_name:'autre.docx'}];
 const api=async(path,method='GET',body)=>{
  if(method==='GET'&&path==='/api/laboratories')return [structuredClone(lab)];if(method==='GET'&&path==='/api/laboratories/responsibles')return [];
  if(method==='GET'&&path==='/api/laboratories/1/documents')return docs.map(d=>({...d,canRename}));
  check(method==='PUT'&&path==='/api/laboratories/1/documents/4','Only selected document title may change');check(Object.keys(body).sort().join(',')==='previousTitle,title','Unexpected file change payload');
  if(fail)throw Error('Ce document a été renommé. Actualisez la liste avant de réessayer.');check(body.previousTitle===docs[0].title,'Previous title required');writes.push(body);docs[0].title=body.title.trim();return {...docs[0],canRename};
 };
 const render=()=>renderLaboratories({container:root,api,now:()=>clock});const open=async()=>{root.querySelector('.lab-card').click();await wait(()=>root.querySelectorAll('.lab-doc-row').length===2);};const row=()=>[...root.querySelectorAll('.lab-doc-row')].find(r=>r.querySelector('small').textContent==='fichier-original.pdf');
 const value=label=>[...root.querySelectorAll('.lab-value')].find(b=>b.querySelector('h4').textContent===label).querySelector('p').textContent;
 await render();await open();check(root.querySelector('.lab-conditions-status').textContent.includes('01/01/2026 au 31/12/2026'),'Current validity wrong');check(value('Conditions commerciales')==='Conditions actuelles 2026'&&value('Franco : montant et conditions')==='150 €','History year must override last save');check(root.querySelector('.lab-conditions-history').textContent.includes('Conditions expirées 2025'),'Past conditions missing');check(!root.querySelector('.lab-conditions-history').textContent.includes('Conditions actuelles 2026'),'Current conditions duplicated in archive');
 row().querySelectorAll('button')[0].click();check(row().querySelector('input').value==='Catalogue original','Rename not prefilled');[...row().querySelectorAll('button')].find(b=>b.textContent==='Annuler').click();check(writes.length===0&&!row().querySelector('form'),'Cancel wrote data');
 row().querySelectorAll('button')[0].click();let editor=row().querySelector('form');editor.querySelector('input').value='Conditions <2026> & tarifs';fail=true;editor.dispatchEvent(new Event('submit',{cancelable:true}));await wait(()=>editor.textContent.includes('Ce document a été renommé'));check(!editor.querySelector('button[type=submit]').disabled&&writes.length===0,'Error must allow retry without changing document');
 fail=false;editor.dispatchEvent(new Event('submit',{cancelable:true}));await wait(()=>!row().querySelector('form'));check(row().querySelector('strong').textContent==='Conditions <2026> & tarifs','New title missing');check(row().innerHTML.includes('&lt;2026&gt;'),'Title interpreted as HTML');check(row().querySelector('a').href.endsWith('/api/laboratories/1/documents/4/file'),'Download URL changed');check(docs[1].title==='Autre document','Other document changed');
 await render();await open();check(row().querySelector('strong').textContent==='Conditions <2026> & tarifs','Reload lost rename');check(value('Conditions commerciales')==='Conditions actuelles 2026','Reload lost current year');
 clock=new Date('2026-12-31T22:59:59.999Z');await render();await open();check(value('Conditions commerciales')==='Conditions actuelles 2026','Conditions expired too early');
 clock=new Date('2026-12-31T23:00:00Z');await render();await open();check(value('Conditions commerciales')==='Conditions futures 2027','Paris new year not applied');check(root.querySelector('.lab-conditions-history').textContent.includes('Conditions actuelles 2026'),'Prior year missing after rollover');
 clock=new Date('2027-12-31T23:00:00Z');canRename=false;await render();await open();check(root.querySelector('.lab-conditions-status').textContent==='Aucune condition commerciale en vigueur','Missing no-current warning');check(value('Conditions commerciales')==='Non renseigné'&&value('Franco : montant et conditions')==='Non renseigné','Expired conditions presented as current');check(![...row().querySelectorAll('button')].some(b=>b.textContent==='Renommer'),'Read-only user sees rename');check(JSON.stringify(lab)===originalLab,'Display changed stored conditions or dates');check(writes.length===1,'Unexpected write count');
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
