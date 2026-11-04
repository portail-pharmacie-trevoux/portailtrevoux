import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import express from 'express';
import {createApp} from '../server.mjs';
import {scalingoHomepage,registerScalingoRetiredCalculations,retiredCalculationUniverse} from '../scripts/scalingo-retired-calculations-preview.mjs';
test('Scalingo removes only calculation tile; source HTML and PromoFlash remain intact',async()=>{
 const source=await readFile(new URL('../public/index.html',import.meta.url),'utf8'),home=scalingoHomepage();
 const names=s=>[...s.matchAll(/data-universe="([^"]+)"/g)].map(m=>m[1]);
 assert(names(source).includes(retiredCalculationUniverse));assert.deepEqual(names(home),names(source).filter(n=>n!==retiredCalculationUniverse));assert(!home.includes('data-universe="'+retiredCalculationUniverse+'"'));
 assert.match(await readFile(new URL('../public/promoflash.js',import.meta.url),'utf8'),/renderPromoFlash/);
});
test('Scalingo direct access blocked; normal homepage and stored employee rights preserved',async t=>{
 const rights=[retiredCalculationUniverse,'Fun','Challenges'],actor={id:1,name:'TEST',role:'employee',rights,edit_rights:['Fun'],active:true,must_change:false,csrf:'test'};let writes=0;
 const db={query:async sql=>{if(!sql.startsWith('SELECT'))writes++;return {rows:sql.startsWith('SELECT s.id')?[actor]:[]};}};
 for(const staging of [false,true]){
  const {app}=createApp(db,{origin:'http://portal.test',secret:'test-only-'.repeat(4),...(staging?{homepageHTML:scalingoHomepage()}:{})}),gate=express();if(staging)registerScalingoRetiredCalculations(gate);gate.use(app);
  const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
  for(const path of ['/','/index.html']){const r=await fetch(base+path);assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/default-src 'self'/);assert.equal((await r.text()).includes('data-universe="'+retiredCalculationUniverse+'"'),!staging);}
  const session=await(await fetch(base+'/api/me',{headers:{cookie:'trevoux_session='+'a'.repeat(43)}})).json();assert.deepEqual(session.user.rights,rights);assert.deepEqual(session.user.editRights,['Fun']);
  assert.equal((await fetch(base+'/promoflash.js')).status,staging?403:200);
  if(staging)for(const path of ['/api/promoflash/product/123','/api/promoflash/image/123','/api/promoflash/prices/123','/promoflash','/api/universes/'+encodeURIComponent(retiredCalculationUniverse),'/API/PROMOFLASH/product/123','/x/%2e%2e%2fpromoflash.js'])for(const method of ['GET','POST'])assert.equal((await fetch(base+path,{method})).status,403,path);
 }
 assert.equal(writes,0);
});
