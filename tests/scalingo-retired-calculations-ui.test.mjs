import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scalingoHomepage,registerScalingoRetiredCalculations} from '../scripts/scalingo-retired-calculations-preview.mjs';
import {universes} from '../security.mjs';
const chromium='/usr/bin/chromium';
test('Scalingo home: no calculation tile or gap at 4:3/16:9, stale preferences and direct UI blocked; other modules open',{skip:!existsSync(chromium)},async t=>{
 let actorRole='admin';const app=express();registerScalingoRetiredCalculations(app);
 app.get('/api/me',(q,s)=>s.json({user:{id:1,name:'TEST',role:actorRole,rights:universes,editRights:universes,permissionsConfigured:true,mustChange:false},csrf:'test'}));
 app.get('/api/quick-links',(q,s)=>s.json({links:[],revision:0,isAdmin:actorRole==='admin'}));
 app.get('/api/challenges/options',(q,s)=>s.json({laboratories:[],people:[],canEdit:false,mail:{connected:false}}));
 app.get('/api/calendar',(q,s)=>s.json({events:[],connected:true}));
 app.get('/api/integrations/google-health',(q,s)=>s.sendStatus(403));
 app.get('/api/whatsapp',(q,s)=>s.json({configured:false}));
 app.get('/api/{*rest}',(q,s)=>s.json([]));
 app.get('/',(q,s)=>s.type('html').send(scalingoHomepage()));app.use(express.static(new URL('../public',import.meta.url).pathname));
 const server=app.listen(0);t.after(()=>server.close());const profile=await mkdtemp(join(tmpdir(),'portail-followup-chrome-'));t.after(()=>rm(profile,{recursive:true,force:true}));
 const child=spawn(chromium,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--disable-sync','--user-data-dir='+profile,'--remote-debugging-port=0'],{stdio:['ignore','ignore','pipe']});t.after(()=>child.kill());
 const debuggerUrl=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Chromium debugger did not start')),10000);child.stderr.on('data',chunk=>{log+=chunk;const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});child.on('error',reject);});
 const ws=new WebSocket(debuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});t.after(()=>ws.close());
 let sequence=0;const pending=new Map();ws.onmessage=e=>{const message=JSON.parse(e.data);const waiter=pending.get(message.id);if(waiter){pending.delete(message.id);message.error?waiter.reject(Error(message.error.message)):waiter.resolve(message.result);}};
 const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});

 const {targetId}=await command('Target.createTarget',{url:'about:blank'});const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
 await command('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('portail-plus:tile-order:1',JSON.stringify({version:5,order:['Outils de calculs rapides','Challenges','Agenda'],hidden:[]}));`},sessionId);
 for(const role of ['admin','employee'])for(const [width,height] of [[1024,768],[1920,1080]]){
  actorRole=role;await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
  await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'},sessionId);
  const result=await command('Runtime.evaluate',{expression:`(async()=>{
   const wait=async f=>{for(let n=0;n<150;n++){if(f())return;await new Promise(r=>setTimeout(r,50));}throw Error('UI timeout');},check=(v,m)=>{if(!v)throw Error(m);};
   try{await wait(()=>document.querySelector('#home')&&!document.querySelector('#home').classList.contains('hidden'));
    check(!document.querySelector('[data-universe="Outils de calculs rapides"]'),'Retired tile present');
    await openUniverse('Outils de calculs rapides');check(document.querySelector('#detail').classList.contains('hidden'),'Direct UI access still opens');
    document.querySelector('#organize-tiles').click();document.querySelector('#tile-order-reset').click();check(!document.querySelector('#tile-order-list').textContent.includes('calcul'),'Retired navigation in preferences');document.querySelector('#tile-order-save').click();
    const tiles=[...document.querySelectorAll('.grid .tile')].filter(e=>e.getClientRects().length).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top||a.getBoundingClientRect().left-b.getBoundingClientRect().left),grid=document.querySelector('.grid'),style=getComputedStyle(grid),cols=style.gridTemplateColumns.split(' ').length,rect=grid.getBoundingClientRect(),gap=parseFloat(style.columnGap),cell=(rect.width-gap*(cols-1))/cols;
    check(tiles.length>8,'Other tiles missing');let previous=null;for(const tile of tiles){const r=tile.getBoundingClientRect();if(!previous||Math.abs(r.top-previous.top)>2){if(previous)check(Math.abs(previous.right-rect.right)<2,'Unfilled row');check(Math.abs(r.left-rect.left)<2,'Empty row start');}else check(Math.abs(r.left-previous.right-gap)<2,'Gap between tiles');check(r.right<=innerWidth,'Horizontal overflow');previous=r;}check(Math.abs(previous.right-rect.right)<2,'Unfilled final row');
    document.querySelector('[data-universe="Challenges"]').click();await wait(()=>document.querySelector('.challenge-root'));showHome();document.querySelector('[data-universe="Laboratoires"]').click();await wait(()=>document.querySelector('#content').textContent.includes('laboratoire')||document.querySelector('#content .lab-root'));showHome();
    return {passed:true,tiles:tiles.length,columns:cols};
   }catch(e){return {passed:false,error:e.message};}
  })()`,awaitPromise:true,returnByValue:true},sessionId);
  assert.equal(result.result?.value?.passed,true,JSON.stringify({role,width,height,...result.result?.value}));
 }
});
