import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import {createApp} from '../server.mjs';
import {scalingoHomepage,registerScalingoRetiredCalculations} from '../scripts/scalingo-retired-calculations-preview.mjs';
import {registerScalingoTrevouxEntry} from '../scripts/scalingo-trevoux-entry-preview.mjs';
test('Trévoux login alias preserves homepage, absolute resources, HTTP security, API boundaries and zero business writes',async t=>{
 const sql=[];const db={query:async query=>{sql.push(query);if(query==='SELECT 1')return {rows:[{ok:1}]};return {rows:[]};}};
 const {app}=createApp(db,{origin:'https://portailplus-hds.osc-fr1.scalingo.io',secret:'local-test-key-'.repeat(3),homepageHTML:scalingoHomepage()});
 const gate=express();registerScalingoTrevouxEntry(gate,app);registerScalingoRetiredCalculations(gate);
 gate.use((req,res,next)=>req.path.startsWith('/api/')&&req.path!=='/api/me'?res.sendStatus(403):next());gate.use(app);
 const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 const root=await fetch(base+'/'),home=await root.text();
 const headers=['content-type','cache-control','content-security-policy','strict-transport-security','x-content-type-options','referrer-policy','permissions-policy'];
 for(const path of ['/trevoux','/trevoux/','/trevoux?test=1']){
  const r=await fetch(base+path);assert.equal(r.status,200);assert.equal(await r.text(),home);for(const name of headers)assert.equal(r.headers.get(name),root.headers.get(name),name);
  const head=await fetch(base+path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-security-policy'),root.headers.get('content-security-policy'));
  const resources=[...home.matchAll(/(?:src|href)="(\/[^\"]+)"/g)].map(m=>new URL(m[1],base+path));assert(resources.every(u=>!u.pathname.startsWith('/trevoux/')));
 }
 for(const path of ['/app.js','/styles.css','/portal-ux.js','/branding/portail-plus-violet-v2.png','/pharmacy-home-logo.svg','/confidentialite.html','/conditions-utilisation.html'])assert.equal((await fetch(base+path)).status,200,path);
 assert.equal((await fetch(base+'/api/me')).status,401);assert.equal((await fetch(base+'/api/news',{method:'POST',body:'{}',headers:{'content-type':'application/json'}})).status,403);
 for(const path of ['/trevoux/api/me','/trevoux/app.js','/trevoux/unknown','/trevoux-other']){const r=await fetch(base+path);assert.equal(r.status,404);assert(!/login-form/.test(await r.text()));}
 assert.equal((await fetch(base+'/trevoux',{method:'POST',headers:{origin:'https://wrong.invalid'}})).status,403);
 assert.equal((await fetch(base+'/promoflash.js')).status,403);
 assert(sql.every(q=>q.startsWith('SELECT')));assert.equal(sql.length,0);
});
