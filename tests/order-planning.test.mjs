import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {validateOrderPlan,registerOrderPlanning} from '../order-planning.mjs';
import {decrypt,canAccess,canModify} from '../security.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const base={lastName:'Exemple',firstName:'Patient',lastOrder:'2026-01-31',frequency:28,mode:'grossiste',treatment:'Traitement test',comments:'Note'};
test('Prochaine commande automatique : mois, année bissextile, changements et absence de valeurs',()=>{
 assert.equal(validateOrderPlan({...base,nextOrder:'2029-01-01'},fail).nextOrder,'2026-02-28');
 assert.equal(validateOrderPlan({...base,lastOrder:'2024-02-28',frequency:1},fail).nextOrder,'2024-02-29');
 assert.equal(validateOrderPlan({...base,lastOrder:'2026-12-31',frequency:1},fail).nextOrder,'2027-01-01');
 assert.equal(validateOrderPlan({...base,frequency:null,nextOrder:'2029-01-01'},fail).nextOrder,'');
 assert.throws(()=>validateOrderPlan({...base,frequency:2.5},fail));assert.throws(()=>validateOrderPlan({...base,mode:'autre'},fail));assert.throws(()=>validateOrderPlan({...base,lastOrder:'2026-02-30'},fail));
 assert.ok(canAccess({role:'employee',permissions_configured:false},"Outils d'aide aux commandes"));assert.ok(canModify({role:'employee',permissions_configured:false},"Outils d'aide aux commandes"));assert.equal(canAccess({role:'employee',permissions_configured:true,rights:[]},"Outils d'aide aux commandes"),false);
});
test('Tableau partagé : contenu chiffré, modification concurrente et droits',async t=>{
 const secret='test-secret-for-order-planning-32-characters';let row=null,allowed=true,editable=true;
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('INSERT INTO order_planning')){row={id:1,revision:1,content:args[0]};return {rows:[row]};}
  if(sql.startsWith('SELECT id,revision'))return {rows:row?[row]:[]};
  if(sql.startsWith('UPDATE order_planning')){if(args[3]!==row.revision)return {rows:[]};row={...row,revision:row.revision+1,content:args[1]};return {rows:[row]};}
  if(sql.startsWith('DELETE FROM order_planning')){if(!row||args[1]!==row.revision)return {rows:[]};row=null;return {rows:[{id:1}]};}
  throw Error(sql);
 }};
 const app=express();app.use(express.json());const auth=(req,res,next)=>{req.auth={id:1};next();},pass=(req,res,next)=>next();
 registerOrderPlanning({app,db,auth,ready:pass,csrf:(req,res,next)=>req.headers['x-csrf-token']==='valid'?next():next(fail(403,'CSRF')),viewUniverse:()=>((req,res,next)=>allowed?next():next(fail(403,'Accès'))),editUniverse:()=>((req,res,next)=>allowed&&editable?next():next(fail(403,'Modification'))),fail,secret});
 app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/api/order-planning';
 const write=(method,path,data)=>fetch(url+path,{method,headers:{'content-type':'application/json','x-csrf-token':'valid'},body:JSON.stringify(data)});
 let r=await write('POST','',base);assert.equal(r.status,201);assert.equal((await r.json()).nextOrder,'2026-02-28');assert.ok(!row.content.includes(base.treatment));assert.equal(decrypt(row.content,secret).treatment,base.treatment);
 r=await write('PUT','/1',{...base,frequency:30,revision:1,nextOrder:'2029-01-01'});assert.equal(r.status,200);assert.equal((await r.json()).nextOrder,'2026-03-02');
 assert.equal((await write('PUT','/1',{...base,revision:1})).status,409);assert.equal((await write('DELETE','/1',{revision:1})).status,409);
 editable=false;assert.equal((await fetch(url)).status,200);assert.equal((await write('POST','',base)).status,403);editable=true;allowed=false;assert.equal((await fetch(url)).status,403);allowed=true;
 assert.equal((await write('DELETE','/1',{revision:2})).status,200);
});
