import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';
import {registerQualityErrors} from '../quality-errors.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
test('Correction note requires CSRF, is limited to 100 characters and updates only a corrected current revision',async t=>{
 const app=express();app.use(express.json());let row={id:1,error_corrected:true,revision:1,correction_note:''};
 const pass=(q,s,n)=>{q.auth={id:2,name:'Collaborateur',role:'employee'};n();};
 registerQualityErrors({app,db:{query:async(sql,a)=>{assert.match(sql,/AND error_corrected=TRUE/);if(a[0]!==1||a[2]!==row.revision||!row.error_corrected)return{rows:[]};row={...row,revision:row.revision+1,correction_note:a[1]};return{rows:[row]};}},auth:pass,ready:pass,csrf:(q,s,n)=>q.headers['x-csrf-token']==='ok'?n():n(fail(403,'CSRF')),viewUniverse:()=>pass,fail});
 app.use((e,q,s,n)=>s.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port+'/api/quality/errors/1/correction-note';
 const save=(note,revision,csrf='ok')=>fetch(base,{method:'PUT',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({note,revision})});
 assert.equal((await save('Corrigé',1,'bad')).status,403);assert.equal((await save('x'.repeat(101),1)).status,400);
 assert.equal((await save('  Correction effectuée  ',1)).status,200);assert.equal(row.correction_note,'Correction effectuée');assert.equal(row.revision,2);
 assert.equal((await save('Écrasement',1)).status,409);row.error_corrected=false;assert.equal((await save('Autre',2)).status,409);assert.equal(row.correction_note,'Correction effectuée');row.error_corrected=true;assert.equal((await save('',2)).status,200);assert.equal(row.correction_note,'');
});
