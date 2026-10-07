import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {PDFDocument} from 'pdf-lib';import {registerHRDocuments} from '../hr-documents.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
test('Documents personnels : liste et fichier privés, import contrôlé, aucune publication, signature réservée au propriétaire',async t=>{
 let actor={id:1,role:'admin'},doc=null,publications=0;const db={query:async(sql,args=[])=>{
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};
  if(sql.startsWith('SELECT id FROM users'))return {rows:args[0]===2?[{id:2}]:[]};
  if(sql.startsWith('INSERT INTO hr_documents')){doc={id:1,title:args[0],file_name:args[1],file_type:args[2],file_content:args[3],scope:args[6],owner_id:args[7],active:true};return {rows:[doc]};}
  if(sql.startsWith('SELECT id,title')){assert.match(sql,/scope='common' OR owner_id=\$2/);return {rows:doc&&(args[0]||doc.scope==='common'||doc.owner_id===args[1])?[doc]:[]};}
  if(sql.startsWith('SELECT file_name')||sql.startsWith('SELECT * FROM hr_documents'))return {rows:doc?[doc]:[]};throw Error(sql);
 }};
 const app=express();app.use(express.json({limit:'1mb'}));const pass=(req,res,next)=>{req.auth=actor;next();},admin=(req,res,next)=>actor.role==='admin'?next():next(fail(403,'Admin'));
 registerHRDocuments({app,db,auth:pass,ready:pass,admin,csrf:pass,viewUniverse:()=>pass,fail,secret:'test',publish:async()=>publications++,uploadParser:pass,youtrust:{context:async()=>({})}});app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port;
 const request=(path,body)=>fetch(url+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});const pdf=await PDFDocument.create();pdf.addPage();const body={title:'Contrat personnel',fileName:'contrat.pdf',fileData:Buffer.from(await pdf.save()).toString('base64'),scope:'personal',ownerId:2};assert.equal((await request('/api/hr/documents/import',{...body,ownerId:99})).status,400);assert.equal((await request('/api/hr/documents/import',body)).status,201);assert.equal(publications,0);
 actor={id:3,role:'employee'};assert.deepEqual(await (await request('/api/hr/documents')).json(),[]);assert.equal((await request('/api/hr/documents/1/file')).status,404);assert.equal((await request('/api/hr/documents/import',body)).status,403);
 actor={id:2,role:'employee'};assert.equal((await (await request('/api/hr/documents')).json()).length,1);assert.equal((await request('/api/hr/documents/1/file?view=1')).status,200);
 actor={id:1,role:'admin'};assert.equal((await request('/api/hr/documents/1/file')).status,200);assert.equal((await request('/api/hr/documents/1/signatures',{requestKey:'10000000-0000-4000-8000-000000000001',recipients:[{id:3,email:'other@example.org'}]})).status,403);
});
