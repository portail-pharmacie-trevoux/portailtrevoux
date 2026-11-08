import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {registerScalingoWwwRedirect,scalingoWwwOrigin} from '../scripts/scalingo-www-redirect.mjs';
import {isScalingoOrigin} from '../scripts/scalingo-origins-preview.mjs';
test('Scalingo apex-only permanent redirect: exact Host, raw path/query, no proxy trust, cookie or business calls',async t=>{
 const app=express();registerScalingoWwwRedirect(app);let downstream=0;
 app.use((req,res)=>{downstream++;res.status(req.path==='/api/me'?401:200).send('Protected application');});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const request=(host,path='/trevoux',method='GET',headers={})=>new Promise((resolve,reject)=>{const req=httpRequest(base,{path,method,headers:{host,...headers}},res=>{res.resume();resolve({status:res.statusCode,headers:{get:name=>res.headers[name.toLowerCase()]??null}});});req.on('error',reject);req.end();});
 for(const host of ['portailplus-officine.fr','PORTAILPLUS-OFFICINE.FR','portailplus-officine.fr:443','portailplus-officine.fr:80'])for(const path of ['/','/trevoux','/trevoux/','/trevoux?next=%2Ffoo%3Fa%3D1&x=2','/media/portail-plus-higgsfield-original.mp4','/api/me','//evil.invalid/trevoux?x=1']){
  const before=downstream,r=await request(host,path);assert.equal(r.status,308);assert.equal(r.headers.get('location'),scalingoWwwOrigin+path);assert.equal(new URL(r.headers.get('location')).origin,scalingoWwwOrigin);assert.equal(r.headers.get('set-cookie'),null);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(downstream,before);
 }
 for(const method of ['POST','PUT','DELETE','HEAD']){const r=await request('portailplus-officine.fr','/api/login?x=1',method);assert.equal(r.status,308);assert.equal(r.headers.get('location'),scalingoWwwOrigin+'/api/login?x=1');}
 for(const host of ['www.portailplus-officine.fr','portailplus-hds.osc-fr1.scalingo.io','evil.invalid','portailplus-officine.fr.evil.invalid','portailplus-officine.fr:444']){const r=await request(host,'/trevoux','GET',{'x-forwarded-host':'portailplus-officine.fr','x-forwarded-proto':'http'});assert.equal(r.status,200);assert.equal(r.headers.get('location'),null);}
 assert.equal((await request('www.portailplus-officine.fr','/api/me')).status,401);
 const r=await request('portailplus-officine.fr','/trevoux','GET',{'x-forwarded-host':'evil.invalid','x-forwarded-proto':'http'});assert.equal(r.headers.get('location'),scalingoWwwOrigin+'/trevoux');
 assert(isScalingoOrigin(scalingoWwwOrigin));assert(!isScalingoOrigin('https://evil.invalid'));
 const entry=readFileSync(new URL('../scripts/serve-scalingo-ui-preview.mjs',import.meta.url),'utf8');assert(entry.indexOf('registerScalingoWwwRedirect(gate)')<entry.indexOf('registerScalingoTrevouxEntry(gate,app)'));
 assert(!readFileSync(new URL('../server.mjs',import.meta.url),'utf8').includes('registerScalingoWwwRedirect'));
});
