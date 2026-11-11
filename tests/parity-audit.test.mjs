import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import express from 'express';
import {branchAppRoutes,probeRows,samplePath,fixtureConfig} from '../scripts/audit/parity-harness.mjs';
import {preparedParityRoutes,matchesPreparedParity,registerPreparedLocalParity,deferPreparedParityBody} from '../scripts/scalingo-parity-prepared.mjs';
import {createApp} from '../server.mjs';
const routes=branchAppRoutes(),key=r=>r.method+' '+r.path;
test('Route evidence inventories every declared branch endpoint and labels data as unverified',async()=>{
 const report=JSON.parse(await readFile(new URL('../docs/parity/2026-11-11/route-inventory.json',import.meta.url)));const keys=new Set(report.routes.map(key));assert.equal(keys.size,report.routes.length);for(const route of routes)assert(keys.has(key(route)));assert(report.routes.every(r=>r.dataStatus==='NOT_READ_NOT_VERIFIED'&&r.businessTested===false));assert(report.counts.main>200);assert(report.counts.absent>0);
});
test('Actual composed gate reproduces critical planning, orders, attachment and invitation-route distinctions',async()=>{
 const cases=[['POST','/api/leave-requests/:id/review',false],['POST','/api/schedule/:week/apply-template',false],['POST','/api/order-planning',false],['GET','/api/news/:id/attachment',false],['POST','/api/schedule/:week/publish',true],['POST','/api/calendar/reminders',true],['GET','/api/order-mfa/status',true],['POST','/api/users/:id/invitation',true]];
 const result=await probeRows(cases.map(([method,path])=>({method,path})));for(let i=0;i<cases.length;i++)assert.equal(result.rows[i].delegated,cases[i][2],cases[i].join(' '));
});
test('Google disabled configuration closes sync and callback while keeping status delegated to authentication',async()=>{
 const result=await probeRows([{method:'POST',path:'/api/google/sync'},{method:'GET',path:'/auth/google/callback'},{method:'GET',path:'/api/google/status'}],{googleEnabled:false});assert.equal(result.rows[0].status,403);assert.equal(result.rows[1].status,403);assert.equal(result.rows[2].delegated,true);
});
test('Prepared fixes are inactive, not wired into startup and require the existing security boundary',async()=>{
 assert.equal(matchesPreparedParity({method:'POST',path:'/api/order-planning'}),false);assert.throws(()=>registerPreparedLocalParity(express(),()=>{},{enabled:true,groups:['orders']}),/SECURITY_BOUNDARY_REQUIRED/);
 const entry=await readFile(new URL('../scripts/serve-scalingo-ui-preview.mjs',import.meta.url),'utf8');assert(!entry.includes('scalingo-parity-prepared'));const executor=await readFile(new URL('../scripts/migration/grouped/secure-executor.mjs',import.meta.url),'utf8');assert.match(executor,/REAL_EXECUTION_ENABLED=false/);assert.match(executor,/REAL_EXECUTION_RELEASE_LOCKED/);
});
test('Every prepared route exists in the application and methods and identifiers stay narrowly bounded',()=>{
 const declared=new Set(routes.map(key));for(const [group,rows]of Object.entries(preparedParityRoutes))for(const [method,path]of rows){assert(declared.has(method+' '+path),method+' '+path);assert(matchesPreparedParity({method,path:samplePath(path)},{enabled:true,groups:[group]}));}
 for(const path of ['/api/order-planning/7/anything','/api/order-planning/-1','/api/staging-demo-cleanup','/api/users/7/invitation','/api/mail/connect','/api/promoflash/prices/7','/api/challenges/7/reports/7/send'])assert.equal(matchesPreparedParity({method:'POST',path},{enabled:true,groups:Object.keys(preparedParityRoutes)}),false,path);
 for(const path of ['/api/hr/signatures/7/file','/api/collaborateurs/celebrations'])assert.equal(matchesPreparedParity({method:'GET',path},{enabled:true,groups:Object.keys(preparedParityRoutes)}),false);
 assert.equal(matchesPreparedParity({method:'DELETE',path:'/api/news/7'},{enabled:true,groups:['communication']}),false);assert.throws(()=>matchesPreparedParity({method:'GET',path:'/'},{enabled:true,groups:['all']}),/UNKNOWN_PARITY_GROUP/);
});
test('Raw message upload deferral is scoped and never globally bypasses JSON parsers',()=>{
 assert.equal(deferPreparedParityBody({method:'POST',path:'/api/news'},{enabled:true,groups:['communication']}),true);assert.equal(deferPreparedParityBody({method:'POST',path:'/api/news'},{enabled:true,groups:['orders']}),false);assert.equal(deferPreparedParityBody({method:'POST',path:'/api/users'}),false);
});
test('Prepared routes retain app authentication, CSRF, origins and the order MFA guard with synthetic sessions',async()=>{
 const origin=fixtureConfig().origin;let authenticated=false;
 const user={id:59,role:'admin',active:true,must_change:false,csrf:'synthetic-csrf',session_id:'synthetic-session',order_mfa_at:null};
 const db={query:async sql=>{if(/FROM sessions.*JOIN users/.test(sql))return {rows:authenticated?[user]:[]};if(/FROM order_mfa/.test(sql))return {rows:[]};return {rows:[]};}};
 const app=createApp(db,fixtureConfig()).app,gate=express();registerPreparedLocalParity(gate,app,{enabled:true,groups:['orders','planning','communication'],db});gate.use((req,res)=>res.status(403).json({blocked:true}));gate.use((e,req,res,next)=>res.status(e.status||500).json({code:e.code,error:e.message}));
 const server=gate.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const path of ['/api/order-planning','/api/leave-requests','/api/news'])assert.equal((await fetch(base+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'})).status,401,path);
  authenticated=true;const headers={origin,cookie:'trevoux_session='+'a'.repeat(43),'content-type':'application/json'};
  assert.equal((await fetch(base+'/api/news',{method:'POST',headers,body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/news',{method:'POST',headers:{...headers,origin:'https://foreign.invalid','x-csrf-token':'synthetic-csrf'},body:'{}'})).status,403);
  const mfa=await fetch(base+'/api/order-planning',{method:'POST',headers:{...headers,'x-csrf-token':'synthetic-csrf'},body:'{}'});assert.equal(mfa.status,403);assert.equal((await mfa.json()).code,'MFA_REQUIRED');
 }finally{await new Promise(r=>server.close(r));}
});

test('DDL audit projection excludes procedural business migrations and DML despite embedded semicolons',async()=>{
 const {structuralProjection}=await import('../scripts/audit/schema-projection.mjs');
 const result=structuralProjection("-- structural\nCREATE TABLE fixture(id int, note text DEFAULT 'a;b'); DO $business$ BEGIN DELETE FROM fixture; RAISE NOTICE 'x;y'; END $business$; UPDATE fixture SET id=2; CREATE INDEX fixture_id ON fixture(id);");
 assert.equal(result.structuralStatements,2);assert.deepEqual(result.omitted.map(x=>x.kind),['DO','UPDATE']);assert(!result.sql.includes('DELETE FROM'));assert.throws(()=>structuralProjection('DO $unfinished$ BEGIN'),/UNTERMINATED/);
});
test('Historical OAuth callback plus host-only cookies requires canonical-domain reconciliation before renewal',async()=>{
 const db={query:async sql=>({rows:sql.startsWith('SELECT s.id')?[{id:59,role:'admin',active:true,must_change:false,csrf:'fixture-csrf',session_id:'fixture-session'}]:[]})};
 const config={...fixtureConfig(),allowedOrigins:['https://www.portailplus-officine.fr'],googleId:'fixture-client',googleSecret:'fixture-google-secret',googleEmail:'fixture@example.invalid'};
 const {app}=createApp(db,config);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/google/connect',{method:'POST',headers:{host:'www.portailplus-officine.fr',origin:'https://www.portailplus-officine.fr',cookie:'trevoux_session='+'a'.repeat(43),'x-csrf-token':'fixture-csrf','content-type':'application/json'},body:'{}'});assert.equal(r.status,200);const callback=new URL((await r.json()).url).searchParams.get('redirect_uri');assert.equal(new URL(callback).origin,fixtureConfig().origin);assert.notEqual(new URL(callback).origin,'https://www.portailplus-officine.fr');const source=await readFile(new URL('../server.mjs',import.meta.url),'utf8');const options=source.match(/const cookieOptions=\{([^}]+)\}/)?.[1];assert(options);assert(!/\bdomain\s*:/.test(options));}finally{await new Promise(r=>server.close(r));}
});

test('The prepared reminder candidate is documented as unapplied and its pre-existing failure remains visible',async()=>{
 const proof=JSON.parse(await readFile(new URL('../docs/parity/2026-11-11/feature-regression-proof.json',import.meta.url)));assert.equal(proof.original.fail,1);assert.equal(proof.main.fail,0);assert.equal(proof.candidate.fail,0);assert.equal(proof.appliedToRuntimeBranch,false);assert.equal(proof.appliedToRealDatabase,false);
});
