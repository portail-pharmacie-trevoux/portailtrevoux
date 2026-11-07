import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {scalingoHomepage} from '../scripts/scalingo-retired-calculations-preview.mjs';
import {registerScalingoTrevouxEntry} from '../scripts/scalingo-trevoux-entry-preview.mjs';
import {scalingoLoginVideo} from '../scripts/scalingo-login-video-asset.mjs';
const chromium='/usr/bin/chromium';
test('Original local video: autoplay, muted, loop and uncropped 4:3/16:9 display on / and /trevoux, without CloudFront or business calls',{skip:!existsSync(chromium)||!existsSync(scalingoLoginVideo.file)},async t=>{
 const db={query:async()=>{throw Error('Business calls forbidden');}}, {app}=createApp(db,{origin:'http://localhost',secret:'local-video-test-'.repeat(3),homepageHTML:scalingoHomepage()}),gate=express();registerScalingoTrevouxEntry(gate,app);gate.use(app);
 const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port;
 const profile=await mkdtemp(join(tmpdir(),'portail-video-chrome-'));
 const child=spawn(chromium,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--disable-sync','--user-data-dir='+profile,'--remote-debugging-port=0'],{stdio:['ignore','ignore','pipe']});let ws;
 t.after(async()=>{ws?.close();if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill();await done;}await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const url=await new Promise((resolve,reject)=>{let log='';const timeout=setTimeout(()=>reject(Error('Chromium startup timeout')),15000);child.stderr.on('data',b=>{log+=b;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timeout);resolve(m[1]);}});child.on('error',reject);});
 ws=new WebSocket(url);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});let sequence=0;const pending=new Map(),requests=[],errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Network.requestWillBeSent')requests.push(m.params.request);else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);};
 const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await command('Target.createTarget',{url:'about:blank'}),{sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});await command('Network.enable',{},sessionId);await command('Runtime.enable',{},sessionId);await command('Page.bringToFront',{},sessionId);
 for(const [width,height] of [[1024,768],[1920,1080]])for(const path of ['/','/trevoux','/trevoux/']){
  requests.length=0;errors.length=0;await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);await command('Network.setCacheDisabled',{cacheDisabled:true},sessionId);await command('Page.navigate',{url:base+path},sessionId);
  const r=await command('Runtime.evaluate',{expression:`(async()=>{const wait=async f=>{for(let n=0;n<240;n++){if(f())return;await new Promise(r=>setTimeout(r,50));}throw Error('Video playback timeout');};try{
   await wait(()=>document.querySelector('#login-video')?.readyState>=3&&document.querySelector('#login-video').currentTime>0&&!document.querySelector('#login-video').paused&&document.querySelector('#login-form')?.onsubmit);
   const video=document.querySelector('#login-video'),panel=document.querySelector('.login-visual-panel').getBoundingClientRect(),rect=video.getBoundingClientRect(),initial=video.currentTime;await new Promise(r=>setTimeout(r,400));
   const progressing=video.currentTime>initial,localSource=new URL(video.currentSrc).pathname==='/media/portail-plus-higgsfield-original.mp4',contained=rect.width>0&&rect.height>0&&rect.left>=panel.left&&rect.right<=panel.right+1&&rect.left>=0&&rect.right<=innerWidth&&Math.abs(rect.width/rect.height-16/9)<0.02&&getComputedStyle(video).objectFit==='contain';
   video.currentTime=video.duration-0.15;await wait(()=>video.currentTime<1&&!video.paused);
   return {passed:progressing&&localSource&&contained&&video.autoplay&&video.muted&&video.loop&&video.playsInline,progressing,contained,localSource,loopRestarted:true,muted:video.muted,autoplay:video.autoplay,dimensions:[video.videoWidth,video.videoHeight],duration:video.duration};
  }catch(e){return {passed:false,error:e.message,videoError:document.querySelector('#login-video')?.error?.code,readyState:document.querySelector('#login-video')?.readyState};}})()`,awaitPromise:true,returnByValue:true},sessionId);
  assert.equal(r.result?.value?.passed,true,JSON.stringify({width,height,path,...r.result?.value}));assert.deepEqual(r.result.value.dimensions,[1280,720]);assert.equal(errors.length,0);assert(!requests.some(r=>r.method!=='GET'));assert(!requests.some(r=>r.url.includes('cloudfront.net')));
  if(path==='/trevoux'){const screenshot=await command('Page.captureScreenshot',{format:'png'},sessionId);await writeFile('/tmp/portail-video-'+width+'x'+height+'.png',Buffer.from(screenshot.data,'base64'));}
 }
});
