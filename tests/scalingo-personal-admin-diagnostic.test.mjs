import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registerScalingoPersonalAdminDiagnostic,diagnosticPath,diagnosticExpiry,diagnosticHomepage} from '../scripts/scalingo-personal-admin-diagnostic.mjs';
import {scalingoTestAdminAuth} from '../scripts/scalingo-universal-rights.mjs';
import {token} from '../security.mjs';
import {scalingoAllowedOrigins} from '../scripts/scalingo-origins-preview.mjs';
test('temporary diagnostic: exact test administrator, session, origin, CSRF, fixed read-only SQL and minimal output',async t=>{
 let actor={email:'admin-test@portailplus.invalid',role:'admin',active:true,must_change:false,csrf:'csrf'},result={exists:true,active:true,admin:true},broken=false;
 let targetQueries=0,releases=0;const statements=[];
 const db={query:async(sql)=>{assert(sql.startsWith('SELECT'));return {rows:actor?[actor]:[]};},connect:async()=>({query:async(sql,args)=>{statements.push(sql);if(sql.startsWith('SELECT')){targetQueries++;assert.deepEqual(args,['pharmaciedetrevoux@gmail.com']);assert(!/password|secret|token|mfa|SELECT \*/i.test(sql));assert(sql.endsWith('WHERE email=$1'));if(broken)throw Error('PRIVATE_DATABASE_DETAIL');return {rows:[{...result,password_hash:'MUST_NOT_LEAK'}]};}assert(['BEGIN READ ONLY','ROLLBACK'].includes(sql));return {rows:[]};},release(){releases++;}})};
 const env={};let now=diagnosticExpiry-1000;const app=express();app.use(express.json());registerScalingoPersonalAdminDiagnostic({gate:app,db,adminAuth:scalingoTestAdminAuth(db),env,now:()=>now});app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));app.use((req,res)=>res.sendStatus(404));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port,cookie='trevoux_session='+token();
 const request=(path=diagnosticPath,method='GET',headers={},body)=>fetch(base+path,{method,headers:{cookie,origin:scalingoAllowedOrigins[0],...headers},body});
 const post=(headers={},body='csrf=csrf',path='/api/staging-personal-admin-diagnostic')=>request(path,'POST',{'content-type':'application/x-www-form-urlencoded',...headers},body);
 assert.equal((await request(diagnosticPath,'GET',{cookie:''})).status,401);
 actor=null;assert.equal((await post()).status,403);
 actor={email:'admin-test@portailplus.invalid',role:'admin',active:true,must_change:false,csrf:'csrf'};
 for(const patch of [{role:'employee'},{email:'other-admin@example.invalid'},{active:false},{must_change:true}]){const original={...actor};Object.assign(actor,patch);assert.equal((await post()).status,403);actor=original;}
 for(const origin of ['null','http://portailplus-officine.fr','https://portailplus-officine.fr.evil.invalid','https://foreign.invalid',''])assert.equal((await post({origin})).status,403);
 assert.equal((await request(diagnosticPath,'GET',{'sec-fetch-site':'cross-site'})).status,403);
 assert.equal((await post({},'csrf=wrong')).status,403);assert.equal((await post({},'')).status,403);
 assert.equal((await post({},'csrf=csrf&email=someone@example.invalid')).status,403);
 assert.equal((await post({},'csrf=csrf','/api/staging-personal-admin-diagnostic?email=other')).status,403);
 assert.equal(targetQueries,0);
 const page=await request();assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'no-store');assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert(!/Compte existant|pharmaciedetrevoux@gmail.com/.test(await page.text()));assert.equal(targetQueries,0);
 for(const origin of scalingoAllowedOrigins){const r=await post({origin});assert.equal(r.status,200);const html=await r.text();assert.equal((html.match(/<dd>OUI<\/dd>/g)||[]).length,3);assert(!/MUST_NOT_LEAK|pharmaciedetrevoux|password_hash/.test(html));}
 result={exists:false,active:false,admin:false};let r=await post();assert.equal((await r.text()).match(/<dd>NON<\/dd>/g).length,3);
 result={exists:true,active:false,admin:false};r=await post();assert.match(await r.text(),/Compte actif<\/dt><dd>NON/);
 broken=true;r=await post();assert.equal(r.status,503);assert(!/PRIVATE_DATABASE_DETAIL/.test(await r.text()));assert.equal(releases,targetQueries);
 assert.equal(statements.filter(s=>s==='BEGIN READ ONLY').length,targetQueries);assert.equal(statements.filter(s=>s==='ROLLBACK').length,targetQueries);
 const before=targetQueries;env.SCALINGO_PERSONAL_ADMIN_DIAGNOSTIC_DISABLED='true';assert.equal((await post()).status,404);assert.equal((await request()).status,404);
 assert.equal(await (await request('/staging-personal-admin-diagnostic-ui.js')).text(),'');delete env.SCALINGO_PERSONAL_ADMIN_DIAGNOSTIC_DISABLED;
 now=diagnosticExpiry;assert.equal((await post()).status,404);assert.equal(targetQueries,before);
});
test('Scalingo-only integration and explicit UI action; no changes to production homepage',async()=>{
 const {readFileSync}=await import('node:fs');
 const homepage=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert(!homepage.includes('staging-personal-admin-diagnostic'));
 assert(diagnosticHomepage(homepage).includes('src="/staging-personal-admin-diagnostic-ui.js"'));
 const ui=readFileSync(new URL('../scripts/scalingo-personal-admin-diagnostic-ui.js',import.meta.url),'utf8');assert(ui.includes("user?.email!=='admin-test@portailplus.invalid'"));assert(!ui.includes('/api/staging-personal-admin-diagnostic'));
 const entry=readFileSync(new URL('../scripts/serve-scalingo-ui-preview.mjs',import.meta.url),'utf8');assert(entry.includes('registerScalingoPersonalAdminDiagnostic({gate,db,adminAuth:cleanupAuth,env})'));
});
test('homepage link appears only for test admin after login and disappears at logout',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');const script=readFileSync(new URL('../scripts/scalingo-personal-admin-diagnostic-ui.js',import.meta.url),'utf8');
 for(const user of [{email:'admin-test@portailplus.invalid',role:'admin',mustChange:false},{email:'other@example.invalid',role:'admin'},{email:'admin-test@portailplus.invalid',role:'employee'}]){
  let hidden=true,link,refresh;const home={classList:{contains:()=>hidden},append:value=>{link=value;}};
  const document={querySelector:s=>s==='#home'?home:link,createElement:()=>({remove(){link=undefined;}})};const requests=[];
  runInNewContext(script,{document,MutationObserver:class{constructor(fn){refresh=fn;}observe(){}},fetch:async path=>{requests.push(path);return {ok:true,json:async()=>({user})};}});
  assert.equal(link,undefined);assert.equal(requests.length,0);hidden=false;await refresh();
  if(user.role==='admin'&&user.email==='admin-test@portailplus.invalid'){assert.equal(link.href,diagnosticPath);assert.match(link.textContent,/Diagnostic temporaire/);}else assert.equal(link,undefined);
  assert.deepEqual(requests,['/api/me']);hidden=true;await refresh();assert.equal(link,undefined);
 }
});
