import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {validateOrderPlan,registerOrderPlanning} from '../order-planning.mjs';
import {decrypt,canAccess,canModify} from '../security.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const base={lastName:'Exemple',firstName:'Patient',frequency:28,mode:'grossiste',treatment:'Traitement test',comments:'Note'};
test('Prochaine commande : dernière délivrance, mois, année bissextile et absence de délivrance',()=>{
 assert.equal(validateOrderPlan({...base,nextOrder:'2029-01-01'},fail,{date:'2026-01-31'}).nextOrder,'2026-02-28');
 assert.equal(validateOrderPlan({...base,frequency:1},fail,{date:'2024-02-28'}).nextOrder,'2024-02-29');
 assert.equal(validateOrderPlan({...base,frequency:1},fail,{date:'2026-12-31'}).nextOrder,'2027-01-01');
 assert.equal(validateOrderPlan({...base,delivery:{date:'2026-01-31'},lastOrder:'2026-01-31',nextOrder:'2029-01-01'},fail).nextOrder,'2029-01-01');
 assert.equal(validateOrderPlan({...base,frequency:null},fail,{date:'2026-01-31'}).nextOrder,'');
 assert.throws(()=>validateOrderPlan({...base,frequency:2.5},fail));assert.throws(()=>validateOrderPlan({...base,mode:'autre'},fail));assert.throws(()=>validateOrderPlan(base,fail,{date:'2026-02-30'}));
 assert.ok(canAccess({role:'employee',permissions_configured:false},"Outils d'aide aux commandes"));assert.ok(canModify({role:'employee',permissions_configured:false},"Outils d'aide aux commandes"));assert.equal(canAccess({role:'employee',permissions_configured:true,rights:[]},"Outils d'aide aux commandes"),false);
});
test('Tableau : chiffrement, validation passée/délivrée distincte, auteur fiable, annulation et concurrence',async t=>{
 const secret='test-secret-for-order-planning-32-characters';let row=null,allowed=true,editable=true;
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('INSERT INTO order_planning')){row={id:1,revision:1,content:args[0]};return {rows:[row]};}
  if(sql.startsWith('SELECT id,revision'))return {rows:row?[row]:[]};
  if(sql.startsWith('UPDATE order_planning')){if(args[3]!==row.revision)return {rows:[]};row={...row,revision:row.revision+1,content:args[1]};return {rows:[row]};}
  if(sql.startsWith('DELETE FROM order_planning')){if(!row||args[1]!==row.revision)return {rows:[]};row=null;return {rows:[{id:1}]};}
  throw Error(sql);
 }};
 const app=express();app.use(express.json());const auth=(req,res,next)=>{req.auth={id:1,first_name:'Nicolas',last_name:'Marchand'};next();},pass=(req,res,next)=>next();
 registerOrderPlanning({app,db,auth,ready:pass,csrf:(req,res,next)=>req.headers['x-csrf-token']==='valid'?next():next(fail(403,'CSRF')),viewUniverse:()=>((req,res,next)=>allowed?next():next(fail(403,'Accès'))),editUniverse:()=>((req,res,next)=>allowed&&editable?next():next(fail(403,'Modification'))),fail,secret,now:()=>new Date('2026-10-07T22:30:00Z')});
 app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/api/order-planning';
 const write=(method,path,data)=>fetch(url+path,{method,headers:{'content-type':'application/json','x-csrf-token':'valid'},body:JSON.stringify(data)});
 let r=await write('POST','',base);assert.equal(r.status,201);assert.equal((await r.json()).nextOrder,'');assert.ok(!row.content.includes(base.treatment));assert.equal(decrypt(row.content,secret).treatment,base.treatment);
 r=await write('PUT','/1',{...base,frequency:30,revision:1});assert.equal(r.status,200);assert.equal((await r.json()).nextOrder,'');
 assert.equal((await write('PUT','/1',{...base,revision:1})).status,409);
 r=await write('POST','/1/confirmation',{enabled:true,revision:2,initials:'XX',userId:999});assert.equal(r.status,200);let result=await r.json();assert.equal(result.confirmation.date,'2026-10-08');assert.equal(result.confirmation.initials,'NM');assert.equal(result.confirmation.userId,1);assert.equal(result.nextOrder,'');
 r=await write('PUT','/1',{...result,comments:'Updated',confirmation:{initials:'XX'}});assert.equal(r.status,200);result=await r.json();assert.equal(result.confirmation.initials,'NM');
 r=await write('POST','/1/delivery',{enabled:true,revision:4,date:'2030-01-01',initials:'XX',userId:999});assert.equal(r.status,200);result=await r.json();assert.equal(result.delivery.date,'2026-10-08');assert.equal(result.delivery.initials,'NM');assert.equal(result.nextOrder,'2026-11-07');
 r=await write('PUT','/1',{...result,frequency:28,delivery:{date:'2030-01-01',initials:'XX'}});assert.equal(r.status,200);result=await r.json();assert.equal(result.delivery.date,'2026-10-08');assert.equal(result.nextOrder,'2026-11-05');
 assert.equal((await write('POST','/1/delivery',{enabled:false,revision:5})).status,409);
 r=await write('POST','/1/delivery',{enabled:false,revision:6});assert.equal(r.status,200);result=await r.json();assert.equal(result.delivery,undefined);assert.equal(result.nextOrder,'');assert.equal(result.confirmation.initials,'NM');
 r=await write('POST','/1/confirmation',{enabled:false,revision:7});assert.equal(r.status,200);assert.equal((await r.json()).confirmation,undefined);
 editable=false;const excel=await fetch(url+'/export.xlsx');assert.equal(excel.status,200);assert.match(excel.headers.get('content-type'),/spreadsheetml/);assert.equal(Buffer.from(await excel.arrayBuffer()).readUInt32LE(),0x04034b50);assert.equal((await fetch(url)).status,200);assert.equal((await write('POST','/1/delivery',{enabled:true,revision:8})).status,403);editable=true;allowed=false;assert.equal((await fetch(url+'/export.xlsx')).status,403);assert.equal((await fetch(url)).status,403);allowed=true;
 r=await write('PUT','/1',{...base,revision:8,nextOrder:'2026-10-14'});result=await r.json();assert.equal(result.nextOrder,'2026-10-14');r=await write('PUT','/1',{...base,frequency:42,revision:9,nextOrder:'2026-10-14'});result=await r.json();assert.equal(result.frequency,42);assert.equal(result.nextOrder,'2026-10-14');r=await write('POST','/1/suspension',{enabled:true,revision:10});assert.equal(r.status,200);assert.equal((await r.json()).suspended,true);assert.equal((await write('POST','/1/suspension',{enabled:false,revision:10})).status,409);r=await write('POST','/1/suspension',{enabled:false,revision:11});assert.equal((await r.json()).suspended,false);assert.equal((await write('DELETE','/1',{revision:12})).status,200);
});
