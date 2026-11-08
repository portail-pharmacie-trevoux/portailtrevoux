import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {registerScalingoAccountInventory,inventoryPath,inventoryApiPath,inventoryExpiry,inventorySQL,inventoryMetadata,inventoryAnalysis,inventoryHomepage} from '../scripts/scalingo-account-inventory.mjs';
import {scalingoTestAdminAuth} from '../scripts/scalingo-universal-rights.mjs';
import {scalingoAllowedOrigins} from '../scripts/scalingo-origins-preview.mjs';
import {token,digest} from '../security.mjs';
test('inventory security: opt-in, exact authorized admin/session, origins/CSRF, database+TLS guard, readonly SQL and confidential minimal output',async t=>{
 const raw=token(),cookie='trevoux_session='+raw;
 let actor={id:1,email:'admin-test@portailplus.invalid',role:'admin',active:true,must_change:false,csrf:'fixture-csrf'},expired=false;
 const env={};let now=inventoryExpiry-1,metadataReads=0,releases=0,broken=false,identity={database:'portailplus_7495',tls:true};const statements=[];
 const dbRows=[{id:1,first_name:'Compte',last_name:'TEST',email:'admin-test@portailplus.invalid',role:'admin',active:true,password_present:true,permissions_configured:true,directory_key:null,password_hash:'FORBIDDEN_HASH_SENTINEL',secret:'FORBIDDEN_MFA_SENTINEL'},
 {id:2,first_name:'<img src=x onerror=alert(1)>',last_name:'Fictif',email:'fake@example.invalid',role:'employee',active:false,password_present:false,permissions_configured:false,directory_key:'scalingo-manual:fixture'}];
 const db={query:async(sql,args)=>{assert(sql.startsWith('SELECT u.id,u.email'));return {rows:args[0]===digest(raw)&&actor&&!expired?[actor]:[]};},connect:async()=>({query:async(sql)=>{statements.push(sql);if(sql.includes('current_database()'))return {rows:[identity]};if(sql===inventorySQL){metadataReads++;if(broken)throw Error('FORBIDDEN_DATABASE_DETAIL');return {rows:dbRows};}assert(['BEGIN READ ONLY',"SET LOCAL statement_timeout = '5s'",'ROLLBACK'].includes(sql));return {rows:[]};},release(){releases++;}})};
 const gate=express();gate.use(express.json({limit:'64kb'}));registerScalingoAccountInventory({gate,db,adminAuth:scalingoTestAdminAuth(db),env,now:()=>now});gate.use((e,req,res,next)=>res.status(e.status||500).json({error:e.status?e.message:'Unexpected failure'}));const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port;
 const request=(path=inventoryPath,method='GET',headers={},body)=>fetch(base+path,{method,headers:{origin:scalingoAllowedOrigins[0],cookie,...headers},body});
 const post=(headers={},body='csrf=fixture-csrf',path=inventoryApiPath)=>request(path,'POST',{'content-type':'application/x-www-form-urlencoded',...headers},body);
 assert.equal((await request()).status,404);assert.equal((await post()).status,404);assert.equal(await (await request('/staging-account-inventory-ui.js')).text(),'');assert.equal(metadataReads,0);
 env.SCALINGO_ACCOUNT_INVENTORY_ENABLED='true';
 for(const path of [inventoryPath,inventoryApiPath]){const r=path===inventoryPath?await request(path,'GET',{cookie:''}):await post({cookie:''});assert.equal(r.status,401);assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.match(r.headers.get('cache-control'),/no-store/);}
 assert.equal((await request(inventoryPath,'GET',{cookie:'trevoux_session='+token()})).status,403);
 for(const patch of [{role:'employee'},{email:'other-admin@example.invalid'},{email:'pharmaciedetrevoux@gmail.com'},{active:false},{must_change:true}]){const original={...actor};Object.assign(actor,patch);assert.equal((await request()).status,403);assert.equal((await post()).status,403);actor=original;}
 expired=true;assert.equal((await post()).status,403);expired=false;
 for(const origin of ['', 'null','http://portailplus-officine.fr','https://foreign.invalid','https://www.portailplus-officine.fr.evil.invalid'])assert.equal((await post({origin,'x-forwarded-host':'www.portailplus-officine.fr','x-forwarded-proto':'https'})).status,403);
 assert.equal((await post({},'csrf=wrong')).status,403);assert.equal((await post({},'csrf=fixture-csrf&email=someone@example.invalid')).status,403);assert.equal((await post({},'csrf=fixture-csrf',inventoryApiPath+'?email=other')).status,403);
 assert.equal((await request(inventoryPath,'GET',{'sec-fetch-site':'cross-site','sec-fetch-dest':'empty'})).status,403);
 const navHeaders={'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document'};
 const navigate=headers=>new Promise((resolve,reject)=>{const req=httpRequest(base+inventoryPath,{headers:{cookie,...navHeaders,...headers}},r=>{r.resume();resolve(r.statusCode);});req.on('error',reject);req.end();});
 assert.equal(await navigate({}),200);assert.equal(await navigate({cookie:''}),401);assert.equal(await navigate({origin:'https://foreign.invalid'}),403);
 const landing=await request(),html=await landing.text();assert.equal(landing.status,200);assert.match(html,/meta name="robots"/);assert(!html.includes('fake@example.invalid'));assert.equal(metadataReads,0);
 assert.equal(landing.headers.get('referrer-policy'),'same-origin');assert.equal(landing.headers.get('cross-origin-resource-policy'),'same-origin');assert.equal(landing.headers.get('access-control-allow-origin'),null);assert.match(landing.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 for(const origin of scalingoAllowedOrigins){const r=await post({origin});assert.equal(r.status,200);const html=await r.text();assert(html.includes('fake@example.invalid'));assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'));assert(!html.includes('<img'));assert(!/FORBIDDEN_|password_hash|pending_secret/.test(html));assert(!html.includes(raw));assert.match(html,/Métadonnées Render individuelles non fournies/);assert.match(html,/aucun rapprochement/i);}
 assert.equal(metadataReads,3);
 for(const state of [{database:'portailtrevoux_db',tls:true},{database:'portailplus_7495',tls:false}]){identity=state;const before=metadataReads;assert.equal((await post()).status,503);assert.equal(metadataReads,before);}identity={database:'portailplus_7495',tls:true};
 broken=true;const failed=await post();assert.equal(failed.status,503);assert(!/FORBIDDEN_/.test(await failed.text()));assert.equal(releases,6);assert.equal(statements.filter(s=>s==='BEGIN READ ONLY').length,6);assert.equal(statements.filter(s=>s==='ROLLBACK').length,6);assert(!statements.some(s=>/^(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)/.test(s)));
 const before=metadataReads;now=inventoryExpiry;assert.equal((await post()).status,404);assert.equal((await request()).status,404);assert.equal(await (await request('/staging-account-inventory-ui.js')).text(),'');assert.equal(metadataReads,before);
});
test('metadata serializer whitelist, provisional source analysis and duplicate detection do not imply validated mappings',()=>{
 const rows=inventoryMetadata([{id:2,first_name:'Nicolas',last_name:'Marchand',email:'pharmaciedetrevoux@gmail.com',role:'admin',active:true,password_present:true,permissions_configured:false,directory_key:'fixture',password_hash:'DO_NOT_EMIT'}, {id:3,first_name:'Nicolas',last_name:'MARCHAND',email:'PHARMACIEDETREVOUX@gmail.com',role:'admin'}]);
 assert(!JSON.stringify(rows).includes('DO_NOT_EMIT'));assert.deepEqual(Object.keys(rows[0]).sort(),['id','firstName','lastName','email','role','active','passwordPresent','permissionsConfigured','directoryKey'].sort());
 const a=inventoryAnalysis(rows);assert.equal(a.duplicateEmails.length,1);assert.equal(a.similarIdentities.length,1);assert.deepEqual(a.sourceCandidates[0].targetIds,[2]);assert.deepEqual(a.sourceCandidates[1].targetIds,[]);
 const empty=inventoryAnalysis(inventoryMetadata([{id:1},{id:2}]));assert.equal(empty.duplicateEmails.length,0);assert.equal(empty.similarIdentities.length,0);
});
test('Scalingo-only integration, opt-in navigation visible to test admin only, no automatic inventory request',async()=>{
 const original=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert(!original.includes('staging-account-inventory'));assert(inventoryHomepage(original).includes('src="/staging-account-inventory-ui.js"'));
 const entry=readFileSync(new URL('../scripts/serve-scalingo-ui-preview.mjs',import.meta.url),'utf8');assert(entry.includes('registerScalingoAccountInventory({gate,db,adminAuth:cleanupAuth,env})'));
 assert(!readFileSync(new URL('../server.mjs',import.meta.url),'utf8').includes('registerScalingoAccountInventory'));
 const script=readFileSync(new URL('../scripts/scalingo-account-inventory-ui.js',import.meta.url),'utf8');
 for(const user of [{email:'admin-test@portailplus.invalid',role:'admin'},{email:'other-admin@example.invalid',role:'admin'},{email:'admin-test@portailplus.invalid',role:'employee'},{email:'admin-test@portailplus.invalid',role:'admin',mustChange:true}]){
  let hidden=true,link,refresh;const home={classList:{contains:()=>hidden},append:value=>{link=value;}},requests=[];
  const document={querySelector:s=>s==='#home'?home:link,createElement:()=>({remove(){link=undefined;}})};
  runInNewContext(script,{document,MutationObserver:class{constructor(fn){refresh=fn;}observe(){}},fetch:async path=>{requests.push(path);return {ok:true,json:async()=>({user})};}});
  assert.equal(link,undefined);assert.equal(requests.length,0);hidden=false;await refresh();
  if(user.email==='admin-test@portailplus.invalid'&&user.role==='admin'&&!user.mustChange)assert.equal(link.href,inventoryPath);else assert.equal(link,undefined);
  assert.deepEqual(requests,['/api/me']);hidden=true;await refresh();assert.equal(link,undefined);
 }
});
