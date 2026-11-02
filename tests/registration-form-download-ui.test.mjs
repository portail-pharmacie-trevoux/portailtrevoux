import test from 'node:test';
import {createApp} from '../server.mjs';
import {registerScalingoRegistrationForm} from '../scripts/scalingo-registration-form-preview.mjs';
import {PDFDocument} from 'pdf-lib';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
test('Chrome : le véritable bouton de l’annuaire télécharge les quatre pages du PDF original',{skip:!existsSync(chromium)},async t=>{
 const app=express(),actor={id:1,role:'admin',active:true,must_change:false,csrf:'local'};
 const db={query:async sql=>{assert.ok(sql.startsWith('SELECT s.id'));return {rows:[actor]};}};
 const actual=createApp(db,{origin:'https://portal.test',secret:'local-chrome-pdf-'.repeat(3)}).app;
 app.get('/api/me',(req,res)=>res.json({user:{id:1,name:'Admin local',role:'admin',rights:[],mustChange:false},csrf:'local',features:{employeeAccountsReadOnly:true}}));
 app.get('/api/users',(req,res)=>res.json([]));app.get('/api/integrations/google-health',(req,res)=>res.json({mail:{configured:false,connected:false}}));
 registerScalingoRegistrationForm(app,actual);app.use('/api',(req,res)=>res.json([]));
 const index=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const driver=String.raw`<script type="module">
 const until=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 try{
  await until(()=>!document.querySelector('#home').classList.contains('hidden'));document.querySelector('[data-universe="Collaborateurs"]').click();
  await until(()=>document.querySelector('a[download="fiche-inscription-salarie.pdf"]'));
  const link=document.querySelector('a[download="fiche-inscription-salarie.pdf"]');if(new URL(link.href).pathname!=='/api/collaborateurs/registration-form')throw Error('Wrong download URL');link.closest('details').open=true;link.click();document.body.dataset.result='passed';
 }catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message;}
 </script>`;
 app.get('/',(req,res)=>{res.setHeader('Set-Cookie','trevoux_session='+'a'.repeat(43)+'; Path=/; HttpOnly; SameSite=Lax');res.type('html').send(index.replace('</body>',driver+'</body>'));});app.use(express.static(new URL('../public',import.meta.url).pathname));
 const server=app.listen(0);t.after(()=>server.close());const profile=await mkdtemp(join(tmpdir(),'portail-registration-chrome-'));t.after(()=>rm(profile,{recursive:true,force:true}));
 const child=spawn(chromium,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--disable-sync','--user-data-dir='+profile,'--remote-debugging-port=0'],{stdio:['ignore','ignore','pipe']});t.after(()=>child.kill());
 const debuggerUrl=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Chromium debugger did not start')),10000);child.stderr.on('data',chunk=>{log+=chunk;const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});child.on('error',reject);});
 const ws=new WebSocket(debuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});t.after(()=>ws.close());
 let sequence=0;const pending=new Map();ws.onmessage=e=>{const message=JSON.parse(e.data);const waiter=pending.get(message.id);if(waiter){pending.delete(message.id);message.error?waiter.reject(Error(message.error.message)):waiter.resolve(message.result);}};
 const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const downloads=await mkdtemp(join(tmpdir(),'portail-pdf-download-'));t.after(()=>rm(downloads,{recursive:true,force:true}));
 await command('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
 const {targetId}=await command('Target.createTarget',{url:'http://127.0.0.1:'+server.address().port+'/'});
 const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
 let result;for(let attempt=0;attempt<5;attempt++){try{result=await command('Runtime.evaluate',{expression:`new Promise(resolve=>{const start=Date.now();const timer=setInterval(()=>{if(document.body?.dataset.result||Date.now()-start>10000){clearInterval(timer);resolve({result:document.body?.dataset.result,error:document.body?.dataset.error,location:location.href});}},50);})`,awaitPromise:true,returnByValue:true},sessionId);break;}catch(e){if(!/navigated|context|closed/i.test(e.message))throw e;await new Promise(resolve=>setTimeout(resolve,100));}}
 assert.equal(result.result?.value?.result,'passed',JSON.stringify(result.result?.value));
 let bytes;for(let i=0;i<100;i++){try{bytes=await readFile(join(downloads,'fiche-inscription-salarie.pdf'));if(bytes.length===7164)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 assert.deepEqual(bytes,await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url)));assert.equal((await PDFDocument.load(bytes)).getPageCount(),4);
});
