import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {PDFDocument,StandardFonts} from 'pdf-lib';
import {validateTrainingFacts,extractTrainingFacts,registerTrainingAttestationImport} from '../training-attestation-import.mjs';
import {trainingOverview,parseTrainingAttestation} from '../quality-training.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
test('Training imports: completed dates, structured metadata survives renaming and validates quarter',()=>{
 assert.deepEqual(validateTrainingFacts({title:' Cours ',kind:'DPC',date:'2026-03-30'},fail,new Date('2026-10-25T10:00:00Z')),{title:'Cours',kind:'DPC',date:'2026-03-30'});
 for(const patch of [{date:'2026-02-30'},{date:'2099-01-01'},{kind:'Autre'},{title:''}])assert.throws(()=>validateTrainingFacts({title:'Cours',kind:'Classique',date:'2026-03-30',...patch},fail));
 const doc={owner_id:2,title:'Nom de fichier modifié',training_title:'Conseil',training_date:'2026-03-30',training_kind:'DPC'};assert.equal(parseTrainingAttestation(doc).date,'2026-03-30');assert.equal(trainingOverview([{id:2,name:'Alice'}],[doc],2026,'2026-10-25').people[0].quarters[0].status,'done');
});
test('Training extraction: local PDF text, completion date and classic/DPC recognition',async()=>{
 const pdf=await PDFDocument.create(),page=pdf.addPage(),font=await pdf.embedFont(StandardFonts.Helvetica);
 const lines=['ATTESTATION DPC','Beneficiaire : Alice','Intitule de formation : Conseil pharmaceutique','Date de fin de formation : 30/03/2026','Date de signature : 15/04/2026'];
 lines.forEach((line,i)=>page.drawText(line,{x:50,y:750-i*30,size:12,font}));const result=await extractTrainingFacts({fileType:'application/pdf',bytes:Buffer.from(await pdf.save())},'Alice');
 assert.equal(result.kind,'DPC');assert.equal(result.date,'2026-03-30');assert.equal(result.title,'Conseil pharmaceutique');assert.equal(result.name,'Alice');
 const photo=await extractTrainingFacts({fileType:'image/png',bytes:Buffer.from('photo')},'Alice');assert.equal(photo.date,'');assert.equal(photo.uncertain,true);
});
test('Training import API: own documents only, admin targeting, staged confirmation, duplicate protection and private HR storage',async t=>{
 const pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save()),fileData=bytes.toString('base64');let actor={id:2,role:'employee'},draft=null,document=null,queryCalls=0,allowed=true;
 const query=async(sql,a)=>{queryCalls++;
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('pg_advisory_xact_lock'))return{rows:[]};
  if(sql.startsWith('SELECT id,name FROM users'))return{rows:[{id:a[0],name:a[0]===2?'Alice':'Bob'}]};
  if(sql.startsWith('SELECT id FROM users'))return{rows:[{id:a[0]}]};
  if(sql.startsWith('SELECT id FROM hr_documents'))return{rows:document?[{id:document.id}]:[]};
  if(sql.startsWith('SELECT count'))return{rows:[{count:0}]};if(sql.startsWith('SELECT value'))return{rows:[]};if(sql.startsWith('INSERT INTO training_attestation_reads'))return{rows:[]};
  if(sql.startsWith('INSERT INTO training_attestation_imports')){draft={id:a[0],owner_id:a[1],added_by:a[2],file_name:a[3],file_type:a[4],file_content:a[5],file_hash:a[6]};return{rows:[]};}
  if(sql.startsWith('SELECT * FROM training_attestation_imports'))return{rows:draft&&draft.id===a[0]&&draft.added_by===a[1]?[draft]:[]};
  if(sql.startsWith('INSERT INTO hr_documents')){assert.match(sql,/'personal'/);document={id:10,ownerId:a[6],title:a[0],trainingTitle:a[7],date:a[8],kind:a[9]};return{rows:[{id:10}]};}
  if(sql.startsWith('DELETE FROM training_attestation_imports')){draft=null;return{rows:[]};}throw Error(sql);
 };
 const app=express();app.use((q,s,n)=>q.path.endsWith('/analyze')?n():express.json()(q,s,n));const pass=(q,s,n)=>n();registerTrainingAttestationImport({app,db:{query,connect:async()=>({query,release(){}})},auth:(q,s,n)=>{q.auth=actor;n();},ready:pass,csrf:(q,s,n)=>q.headers['x-csrf']==='ok'?n():n(fail(403,'CSRF')),viewUniverse:()=>((q,s,n)=>allowed?n():n(fail(403,'Accès'))),fail,secret:'secret'});
 app.use((e,q,s,n)=>s.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port+'/api/quality/training/imports';const send=(path,body,csrf='ok')=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-csrf':csrf},body:JSON.stringify(body)});
 const file={fileName:'attestation.pdf',fileData};assert.equal((await send('/analyze',{...file,ownerId:3})).status,403);assert.equal(queryCalls,0);assert.equal((await send('/analyze',file,'bad')).status,403);
 let r=await send('/analyze',file);assert.equal(r.status,201);const proposal=await r.json();assert.equal(proposal.ownerId,2);assert.equal(document,null);assert.ok(proposal.proposal.notes.length);
 const facts={title:'Conseil',date:'2026-03-30',kind:'DPC',identityConfirmed:true,ownerId:3};assert.equal((await send('/'+proposal.id+'/confirm',{...facts,identityConfirmed:false})).status,400);
 actor={id:3,role:'employee'};assert.equal((await send('/'+proposal.id+'/confirm',facts)).status,404);actor={id:2,role:'employee'};
 r=await send('/'+proposal.id+'/confirm',facts);assert.equal(r.status,201);assert.equal(document.ownerId,2);assert.equal(document.kind,'DPC');assert.equal(document.date,'2026-03-30');assert.match(document.title,/Attestation DPC — Conseil — 30\/03\/2026/);assert.equal(draft,null);
 assert.equal((await send('/analyze',file)).status,409);document=null;actor={id:1,role:'admin'};r=await send('/analyze',{...file,ownerId:3});assert.equal(r.status,201);assert.equal((await r.json()).ownerId,3);allowed=false;assert.equal((await send('/analyze',file)).status,403);
});
