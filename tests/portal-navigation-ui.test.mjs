import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const chromium='/usr/bin/chromium';
for(const [width,height]of [[1920,1080],[1024,768]])test('Navigation commune '+width+'x'+height,{skip:!existsSync(chromium)},async t=>{
 const app=express();app.use(express.static(new URL('../public',import.meta.url).pathname));
 app.get('/fixture',(req,res)=>res.type('html').send(String.raw`<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><script src="/portal-navigation.js" defer></script><script src="/portal-ux.js" defer></script></head><body><main id="root"><section id="detail"><button id="back">Retour aux univers</button><div class="panel"><header class="top"><h2>Univers fictif</h2><details class="admin-menu"><summary>Admin</summary></details></header><div id="content"></div></div></section></main><script type="module">
 import {renderEmployeeRecord} from '/employee-record.js';
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI timeout');};
 try{
  await until(()=>window.PortalNavigation&&window.PortalUX);
  const detail=document.querySelector('#detail'),content=document.querySelector('#content');let homeCalls=0,rootCalls=[],allowLeave=false,confirmations=0;
  window.confirm=()=>{confirmations++;return allowLeave;};
  const navigation=PortalNavigation.create({detail,content,homeButton:document.querySelector('#back'),onHome(){homeCalls++;content.replaceChildren();},onUniverse(name){rootCalls.push(name);navigation.setUniverse(name);content.replaceChildren(document.createElement('p'));}});
  const settle=()=>new Promise(r=>setTimeout(r,30));
  const expected=[['Collaborateurs','Retour à l’annuaire'],['Agenda','Retour à l’agenda'],['Actualités','Retour à la messagerie'],['Laboratoires','Retour aux laboratoires'],['Challenges','Retour aux challenges'],['Formations','Retour aux documents'],['Contacts utiles','Retour aux contacts'],['Ressources humaines','Retour aux ressources humaines'],['Emplois du temps','Retour aux emplois du temps'],["Outils d'aide au merchandising",'Retour au merchandising'],["Outils d'aide à la démarche qualité",'Retour à la démarche qualité'],["Outils d'aide aux commandes",'Retour aux commandes'],['Outils de calculs rapides','Retour aux outils de calcul'],['Fun','Retour à Fun'],['Passerelle groupement','Retour au groupement']];
  const parent=()=>document.querySelector('#portal-universe-back'),home=()=>document.querySelector('#back');
  for(const [universe,label]of expected){
    content.replaceChildren(document.createElement('p'));navigation.setUniverse(universe);await settle();check(parent().hidden,'Duplicate parent on root '+universe);
    const sub=document.createElement('section');sub.dataset.portalSubpage='true';content.replaceChildren(sub);await settle();check(!parent().hidden&&parent().getAttribute('aria-label')===label,'Wrong parent '+universe);
    parent().click();await settle();check(rootCalls.at(-1)===universe&&parent().hidden,'Parent is not universe root '+universe);
  }
  navigation.setUniverse('Procédures');check(!parent().hidden&&parent().getAttribute('aria-label')==='Retour à la démarche qualité','Procedures ancestry lost');parent().click();check(rootCalls.at(-1)==="Outils d'aide à la démarche qualité",'Procedures returned to browser history');
  navigation.setUniverse('Collaborateurs');const api=async()=>({person:{id:7,firstName:'Employé',lastName:'Fictif',job:'Préparateur',role:'employee',active:true,rights:[],editRights:[],permissionsConfigured:true},details:{},detailsRevision:0,previewRestrictions:{accountReadOnly:true,lifecycleAllowed:true}});
  await renderEmployeeRecord({container:content,api,person:{id:7},isAdmin:true,onClose(){throw Error('Legacy back executed');},onSaved(){},onPayroll(){},universes:[]});await settle();
  const legacy=[...content.querySelectorAll('button')].find(b=>b.textContent==='← Retour à l’annuaire');check(legacy&&getComputedStyle(legacy).display==='none','Legacy return remains visible');check(!parent().hidden,'Employee parent missing');
  check(document.querySelectorAll('.portal-navigation').length===1&&document.querySelectorAll('#back').length===1,'Navigation duplicated');
  const form=content.querySelector('form');check(form,'Employee form missing');const phone=content.querySelector('#employee-phone');phone.value='0612345678';phone.dispatchEvent(new Event('input',{bubbles:true}));await settle();check(PortalUX.hasUnsavedChanges(),'Dirty tracking not active');
  const previousRoot=rootCalls.length,previousHome=homeCalls;parent().click();home().click();check(rootCalls.length===previousRoot&&homeCalls===previousHome&&confirmations>=2,'Unsaved edits discarded without confirmation');
  allowLeave=true;parent().click();await settle();check(rootCalls.length===previousRoot+1,'Confirmed parent refused');check(!PortalUX.hasUnsavedChanges(),'Old dirty form retained');
  navigation.setUniverse('Procédures');home().click();check(homeCalls===previousHome+1,'First return does not go straight home from procedures');
  // Two nested quality levels must return to quality root, not the previous level.
  navigation.setUniverse("Outils d'aide à la démarche qualité");const nested=document.createElement('div'),intermediate=document.createElement('button');intermediate.textContent='← Retour';intermediate.onclick=()=>{throw Error('Intermediate callback executed');};nested.append(intermediate);content.replaceChildren(nested);await settle();parent().click();check(rootCalls.at(-1)==="Outils d'aide à la démarche qualité",'Nested quality returned to previous screen');
  const templates=await import('/schedule-templates.js');navigation.setUniverse('Emplois du temps');
  await templates.renderScheduleTemplates({container:content,api:async path=>path==='/api/schedule-templates'?[{id:42,name:'Modèle fictif',revision:1}]:path==='/api/schedule-posts'?[]:{id:42,name:'Modèle fictif',revision:1,entries:[],people:[]},isCurrent:()=>true,onBack(){throw Error('Legacy planning return executed');},editDay(){},labels:{},paintPost(){}});
  await settle();[...content.querySelectorAll('button')].find(b=>b.textContent==='Modifier cette semaine type').click();await until(()=>content.querySelector('h2'));await settle();
  check(!parent().hidden&&parent().getAttribute('aria-label')==='Retour aux emplois du temps','Nested template has no root return');
  const intermediateTemplate=[...content.querySelectorAll('button')].find(b=>b.textContent==='Toutes les semaines types');check(getComputedStyle(intermediateTemplate).display==='none','Intermediate template back duplicated');
  parent().click();check(rootCalls.at(-1)==='Emplois du temps','Template returns to intermediate directory');
  // Preserve modal closing and security wizard controls; neither changes guards.
  content.replaceChildren();const modal=document.createElement('dialog'),modalBack=document.createElement('button');modalBack.textContent='Retour au document';modal.append(modalBack);content.append(modal);await settle();check(parent().hidden&&!modalBack.classList.contains('portal-legacy-back'),'Closed modal became page navigation');
  const mfa=document.createElement('form');mfa.className='order-mfa-panel';const step=document.createElement('button');step.textContent='Retour au code Ente Auth';mfa.append(step);content.replaceChildren(mfa);navigation.setUniverse("Outils d'aide aux commandes");await settle();check(!step.classList.contains('portal-legacy-back')&&!parent().hidden,'Security-step return changed');
  // Final layout, independent of titles and Admin, in each real viewport size.
  const sub=document.createElement('section');sub.dataset.portalSubpage='true';sub.textContent='Données synthétiques uniquement';content.replaceChildren(sub);navigation.setUniverse('Collaborateurs');await settle();
  window.scrollTo({top:0,behavior:'instant'});const first=home().getBoundingClientRect(),second=parent().getBoundingClientRect(),bar=document.querySelector('.portal-navigation').getBoundingClientRect(),header=detail.querySelector('header').getBoundingClientRect();
  check(Math.abs(first.left-bar.left)<2&&second.left>first.right&&Math.abs(first.top-second.top)<2,'Return order or alignment wrong');check(first.height>=44&&Math.abs(first.height-second.height)<2,'Button heights differ');check(second.bottom<header.top,'Navigation overlaps title/Admin');check(getComputedStyle(home()).backgroundColor==='rgb(109, 66, 156)','Portal purple missing');check(document.documentElement.scrollWidth<=innerWidth,'Horizontal overflow');
  check(![...content.querySelectorAll('button')].some(b=>/^retour/i.test(b.textContent.trim())&&getComputedStyle(b).display!=='none'),'Duplicate return remains');
  document.body.dataset.result='passed';
 }catch(e){document.body.dataset.result='failed';document.body.dataset.error=e.message;}
 </script></body></html>`));
 const server=app.listen(0);t.after(()=>server.close());const profile=await mkdtemp(join(tmpdir(),'portail-employee-chrome-'));t.after(()=>rm(profile,{recursive:true,force:true}));
 const child=spawn(chromium,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--disable-sync','--user-data-dir='+profile,'--remote-debugging-port=0'],{stdio:['ignore','ignore','pipe']});t.after(()=>child.kill());
 const debuggerUrl=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Chromium debugger did not start')),10000);child.stderr.on('data',chunk=>{log+=chunk;const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});child.on('error',reject);});
 const ws=new WebSocket(debuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});t.after(()=>ws.close());
 let sequence=0;const pending=new Map();ws.onmessage=e=>{const message=JSON.parse(e.data);const waiter=pending.get(message.id);if(waiter){pending.delete(message.id);message.error?waiter.reject(Error(message.error.message)):waiter.resolve(message.result);}};
 const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await command('Target.createTarget',{url:'about:blank'});
 const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
 await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
 await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/fixture'},sessionId);
 const result=await command('Runtime.evaluate',{expression:`new Promise(resolve=>{const start=Date.now();const timer=setInterval(()=>{if(document.body?.dataset.result||Date.now()-start>10000){clearInterval(timer);resolve({result:document.body?.dataset.result,error:document.body?.dataset.error,location:location.href});}},50);})`,awaitPromise:true,returnByValue:true},sessionId);
 assert.equal(result.result?.value?.result,'passed',JSON.stringify(result.result?.value));
 if(process.env.PORTAIL_UI_SCREENSHOT_DIRECTORY){await mkdir(process.env.PORTAIL_UI_SCREENSHOT_DIRECTORY,{recursive:true});const shot=await command('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(join(process.env.PORTAIL_UI_SCREENSHOT_DIRECTORY,'navigation-'+width+'x'+height+'.png'),Buffer.from(shot.data,'base64'));}
});
