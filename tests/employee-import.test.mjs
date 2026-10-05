import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {decrypt} from '../security.mjs';
import {validateEmployeeScan,cleanEmployeeExtraction} from '../employee-import.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
test('lecture : aucun champ inconnu, dates invalides signalées, données sensibles à vérifier',()=>{
 const result=cleanEmployeeExtraction({fields:[{key:'birthName',value:'TEST',uncertain:false},{key:'birthday',value:'2026-02-30',uncertain:false},{key:'iban',value:'FR76 1234 5678 9012 3456 7890 123',uncertain:false},{key:'nationality',value:'Française',uncertain:true}],notes:[]},fail);
 assert.equal(result.values.lastName,'TEST');assert.equal(result.values.birthday,undefined);assert.equal(result.values.iban,'FR7612345678901234567890123');assert.equal(result.warnings.length,3);
 assert.throws(()=>cleanEmployeeExtraction({fields:[{key:'password',value:'malicious',uncertain:false}],notes:[]},fail),e=>e.status===502);
 assert.throws(()=>cleanEmployeeExtraction({fields:[{key:'nationality',value:'a',uncertain:false},{key:'nationality',value:'b',uncertain:false}],notes:[]},fail));
});
test('fichiers : PDF accepté, faux JPEG et DOCX refusés',async()=>{
 const pdf=await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url));
 assert.equal(validateEmployeeScan({fileName:'fiche.pdf',fileData:pdf.toString('base64')},fail).fileType,'application/pdf');
 for(const fileName of ['fiche.jpg','fiche.docx','../fiche.pdf'])assert.throws(()=>validateEmployeeScan({fileName,fileData:pdf.toString('base64')},fail),e=>e.status===400);
});
test('analyse et configuration réservées à l’administrateur, clé chiffrée et aucun enregistrement automatique',async t=>{
 const secret='s'.repeat(32);let user={id:1,role:'admin',csrf:'test',must_change:false},setting=null,calls=0,lastRequest,providerStatus=200;
 const db={query:async(sql,args)=>{
  if(sql.startsWith('SELECT s.id'))return {rows:[user]};
  if(sql.startsWith('SELECT value'))return {rows:setting?[{value:setting}]:[]};
  if(sql.startsWith('INSERT INTO settings')){setting=args[1];return {rows:[]};}
  if(sql.startsWith('DELETE FROM settings')){setting=null;return {rows:[]};}
  throw Error('Unexpected write or query: '+sql);
 }};
 const fetchImpl=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');lastRequest=JSON.parse(options.body);return {ok:providerStatus===200,status:providerStatus,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({fields:[{key:'firstName',value:'Exemple',uncertain:false},{key:'lastName',value:'TEST',uncertain:false}],notes:[]})}]}]})};};
 const {app}=createApp(db,{origin:'https://portal.test',secret,employeeScanFetch:fetchImpl});const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const headers={cookie:'trevoux_session='+'a'.repeat(43),origin:'https://portal.test','x-csrf-token':'test','content-type':'application/json'};
 const request=(path,method='GET',body,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{...headers,...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const pdf=await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url)),body={fileName:'fiche.pdf',fileData:pdf.toString('base64')};
 assert.equal((await request('/api/collaborateurs/scan','POST',body,{cookie:''})).status,401);
 user.role='employee';assert.equal((await request('/api/collaborateurs/scan/status')).status,403);assert.equal((await request('/api/collaborateurs/scan','POST',body)).status,403);user.role='admin';
 assert.equal((await request('/api/collaborateurs/scan','POST',body)).status,503);assert.equal(calls,0);
 const key='sk-'+'a'.repeat(40);assert.equal((await request('/api/collaborateurs/scan/config','POST',{apiKey:key},{'x-csrf-token':''})).status,403);
 assert.equal((await request('/api/collaborateurs/scan/config','POST',{apiKey:key})).status,200);assert.equal(setting.includes(key),false);assert.equal(decrypt(setting,secret).key,key);
 const status=await (await request('/api/collaborateurs/scan/status')).json();assert.deepEqual(status,{configured:true,managedByEnvironment:false});
 const response=await request('/api/collaborateurs/scan','POST',body);assert.equal(response.status,200);assert.equal((await response.json()).values.firstName,'Exemple');assert.equal(calls,1);assert.equal(lastRequest.store,false);assert.equal(lastRequest.input[0].content[1].type,'input_file');assert.equal(lastRequest.text.format.strict,true);
 providerStatus=401;const error=await request('/api/collaborateurs/scan','POST',body);assert.equal(error.status,503);assert.equal((await error.text()).includes(key),false);
 assert.equal((await request('/api/collaborateurs/scan/config','DELETE')).status,200);assert.equal(setting,null);
});
