import test from 'node:test';import assert from 'node:assert/strict';import {validateLaboratory,registerLaboratories} from '../laboratories.mjs';import {canAccess,canModify} from '../security.mjs';import express from 'express';
const fail=(status,message)=>Object.assign(Error(message),{status});
test('Laboratoires : validations, responsable conditionnel et adresses sûres',()=>{
 const base={name:' Labo ',orderMode:'pharmacie',responsibleId:2};assert.equal(validateLaboratory(base,fail).name,'Labo');assert.throws(()=>validateLaboratory({...base,responsibleId:null},fail));assert.equal(validateLaboratory({...base,orderMode:'groupement'},fail).responsibleId,null);assert.throws(()=>validateLaboratory({...base,commercialEmail:'invalid'},fail));assert.throws(()=>validateLaboratory({...base,labWebsite:'javascript:alert(1)'},fail));assert.throws(()=>validateLaboratory({...base,conditions:'x'.repeat(4001)},fail));
 const user={role:'employee',rights:[],permissions_configured:false};assert.ok(canAccess(user,'Laboratoires'));assert.ok(canModify(user,'Laboratoires'));assert.equal(canModify({...user,permissions_configured:true},'Laboratoires'),false);
});
test('Laboratoires : accès équipe, création et protection contre écrasement concurrent',async t=>{
 const app=express();app.use(express.json());let row=null,allowed=true;const pass=(req,res,next)=>{req.auth={id:1};next();},access=()=>((req,res,next)=>allowed?next():res.sendStatus(403));
 const db={query:async(sql,args)=>{if(sql.startsWith('SELECT id FROM users'))return {rows:args[0]===2?[{id:2}]:[]};if(sql.startsWith('INSERT INTO laboratories')){row={id:1,name:args[0],order_mode:args[1],responsible_id:args[2],details:JSON.parse(args[3]),revision:1};return {rows:[row]};}if(sql.startsWith('UPDATE laboratories')){if(args[6]!==row.revision)return {rows:[]};row={...row,name:args[1],order_mode:args[2],responsible_id:args[3],details:JSON.parse(args[4]),revision:row.revision+1};return {rows:[row]};}return {rows:row?[row]:[]};}};
 registerLaboratories({app,db,auth:pass,ready:pass,csrf:pass,viewUniverse:access,fail,publish:async()=>{}});app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/api/laboratories';const body={name:'Labo',orderMode:'pharmacie',responsibleId:2,commercialEmail:'representant@example.test'};
 let r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,201);assert.equal((await r.json()).commercialEmail,body.commercialEmail);
 r=await fetch(url+'/1',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,revision:1,orderMode:'groupement'})});assert.equal(r.status,200);assert.equal((await r.json()).responsibleId,null);
 r=await fetch(url+'/1',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,revision:1})});assert.equal(r.status,409);allowed=false;assert.equal((await fetch(url)).status,403);
});

test('Laboratoires : logos et catalogues protégés, validation et téléchargement',async t=>{
 const app=express();let allowed=true,logo=null,doc=null;const pass=(req,res,next)=>{req.auth={id:1};next();},access=()=>((req,res,next)=>allowed?next():res.sendStatus(403));
 app.use((req,res,next)=>req.method==='POST'?next():express.json()(req,res,next));
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT id FROM laboratories'))return {rows:[{id:1}]};
  if(sql.startsWith('UPDATE laboratories SET logo_content=$2')){logo={logo_content:args[1],logo_type:args[2]};return {rows:[{id:1}]};}
  if(sql.startsWith('SELECT logo_type'))return {rows:logo?[logo]:[]};
  if(sql.startsWith('INSERT INTO laboratory_documents')){doc={id:2,title:args[1],file_name:args[2],file_type:args[3],file_content:args[4]};return {rows:[doc]};}
  if(sql.startsWith('SELECT file_name'))return {rows:args[0]==='1'&&args[1]==='2'&&doc?[doc]:[]};
  if(sql.startsWith('SELECT id,title'))return {rows:doc?[{id:2,title:doc.title,file_name:doc.file_name}]:[]};throw Error(sql);
 }};
 registerLaboratories({app,db,auth:pass,ready:pass,csrf:pass,viewUniverse:access,fail,publish:async()=>{}});app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/api/laboratories/1';const post=(path,body)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';assert.equal((await post('/logo',{fileData:png,revision:1})).status,200);let r=await fetch(url+'/logo');assert.equal(r.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await r.arrayBuffer()),Buffer.from(png,'base64'));assert.equal((await post('/logo',{fileData:Buffer.from('<svg/>').toString('base64'),revision:1})).status,400);
 const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save());assert.equal((await post('/documents',{title:'Catalogue',fileName:'catalogue.pdf',fileData:bytes.toString('base64')})).status,201);r=await fetch(url+'/documents/2/file');assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);assert.match(r.headers.get('content-disposition'),/attachment/);assert.equal((await fetch(url+'/documents/3/file')).status,404);allowed=false;assert.equal((await fetch(url+'/logo')).status,403);assert.equal((await post('/documents',{title:'Catalogue'})).status,403);
});
