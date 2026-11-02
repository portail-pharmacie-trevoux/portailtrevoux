import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import express from 'express';
import pg from 'pg';
import {createApp} from '../server.mjs';
import {token,digest,decrypt} from '../security.mjs';
import {registerScalingoEmployeeImport,isScalingoEmployeeScan,createScalingoEmployeeImportFetch} from '../scripts/scalingo-employee-import-preview.mjs';
import {registerScalingoEmployeeRecords} from '../scripts/scalingo-employee-records-preview.mjs';
import {scalingoTestAdminAuth} from '../scripts/scalingo-universal-rights.mjs';
const database=process.env.PORTAIL_SCAN_TEST_DATABASE_URL,origin='https://portailplus-hds.osc-fr1.scalingo.io',secret='local-scan-fixture-'.repeat(3);
test('Transport Scalingo : seul le service de lecture dédié est autorisé, store=false et redirections interdites',async()=>{
 let calls=0;const send=createScalingoEmployeeImportFetch(async()=>{calls++;return {ok:true};});
 const body={store:false,text:{format:{name:'employee_registration',strict:true}}},options={method:'POST',redirect:'error',body:JSON.stringify(body)};
 for(const [url,opts]of [['https://wrong.invalid',options],['https://api.openai.com/v1/files',options],['https://api.openai.com/v1/responses',{...options,redirect:'follow'}],['https://api.openai.com/v1/responses',{...options,body:JSON.stringify({...body,store:true})}]])await assert.rejects(()=>send(url,opts));
 assert.equal(calls,0);await send('https://api.openai.com/v1/responses',options);assert.equal(calls,1);
});
test('Scalingo/PostgreSQL : lecture PDF/photo admin avec consentement, clé chiffrée, aucune création avant vérification',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_scan_test');assert.equal(url.search,'');
 const db=new pg.Pool({connectionString:database,max:3});t.after(()=>db.end());await db.query('DROP SCHEMA public CASCADE;CREATE SCHEMA public');await db.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
 for(const [id,role,must]of [[1,'admin',false],[2,'employee',false],[3,'admin',true]])await db.query("INSERT INTO users(id,name,first_name,last_name,role,active,email,password_hash,must_change,rights,edit_rights) VALUES($1,$2,'Compte','Local',$3,TRUE,$4,$5,$6,'[\"Collaborateurs\"]','[]')",[id,'Compte local '+id,role,id===1?'admin-test@portailplus.invalid':id===3?'unready@example.invalid':null,id===1?'local-hash':null,must]);
 await db.query("SELECT setval(pg_get_serial_sequence('users','id'),3)");
 const cookies={};for(const id of [1,2,3]){const raw=token();cookies[id]='trevoux_session='+raw;await db.query("INSERT INTO sessions(id,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[digest(raw),id,'csrf-'+id]);}
 const originals=(await db.query('SELECT * FROM users ORDER BY id')).rows;
 let calls=0,lastRequest,providerStatus=200,invalid=false;const localKey='sk-'+'local-test-key-only-'.repeat(3);
 const provider=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.authorization,'Bearer '+localKey);lastRequest=JSON.parse(options.body);return {ok:providerStatus===200,status:providerStatus,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({fields:invalid?[{key:'password',value:'injected',uncertain:false}]:[{key:'firstName',value:'Fictif',uncertain:false},{key:'lastName',value:'Manuscrit',uncertain:true},{key:'address',value:'Adresse locale',uncertain:false},{key:'birthday',value:'2026-02-30',uncertain:false}],notes:['Exemple manuscrit simulé, à vérifier.']})}]}]})};};
 function start(){
  const {app}=createApp(db,{origin,secret,employeeAccountsReadOnly:true,employeeImportConsentRequired:true,employeeImportFetch:createScalingoEmployeeImportFetch(provider),employeeScanFetch:async()=>{throw Error('Other integrations stay disabled');}});
  const gate=express(),small=express.json({limit:'64kb'});gate.use((req,res,next)=>isScalingoEmployeeScan(req)?next():small(req,res,next));
  registerScalingoEmployeeRecords({gate,db,adminAuth:scalingoTestAdminAuth(db),origin,secret});registerScalingoEmployeeImport(gate,app);
  gate.use((req,res)=>res.status(403).json({error:'Fonction désactivée dans la prévisualisation.'}));gate.use((e,req,res,next)=>res.status(e.status||500).json({error:e.status?e.message:'Erreur locale contrôlée'}));
  const server=gate.listen(0,'127.0.0.1');t.after(()=>{server.closeAllConnections();server.close();});return server;
 }
 let server=start();await once(server,'listening');const root='/api/collaborateurs/scan';
 const request=(path,method='GET',body,user=1,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{origin,cookie:cookies[user]||'','x-csrf-token':'csrf-'+user,'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const source=await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url));const pdf=Buffer.concat([source.subarray(0,source.length-6),Buffer.alloc(2*1024*1024-source.length,32),Buffer.from('%%EOF\n')]);const body={fileName:'local.pdf',fileData:pdf.toString('base64'),analysisConsent:true};
 for(const [path,method,payload]of [[root+'/status','GET',undefined],[root+'/config','POST',{apiKey:localKey}],[root+'/config','DELETE',undefined],[root,'POST',body]]){
  assert.equal((await request(path,method,payload,0)).status,401);for(const user of [2,3])assert.equal((await request(path,method,payload,user)).status,403);
  if(method!=='GET')for(const extra of [{'x-csrf-token':'bad'},{origin:'https://wrong.invalid'}])assert.equal((await request(path,method,payload,1,extra)).status,403);
 }
 let status=await (await request(root+'/status')).json();assert.deepEqual(status,{configured:false,managedByEnvironment:false,requiresConsent:true,previewRestrictions:{accountReadOnly:true}});
 assert.equal((await request(root,'POST',body)).status,503);assert.equal(calls,0);
 assert.equal((await request(root+'/config','POST',{apiKey:localKey})).status,200);const stored=(await db.query("SELECT value FROM settings WHERE key='employee_import_openai_key'")).rows[0].value;assert.equal(stored.includes(localKey),false);assert.equal(decrypt(stored,secret).key,localKey);
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=start();await once(server,'listening');status=await (await request(root+'/status')).json();assert.equal(status.configured,true);assert.equal(JSON.stringify(status).includes(localKey),false);
 assert.equal((await request(root,'POST',{...body,analysisConsent:false})).status,400);assert.equal((await request(root,'POST',{...body,analysisConsent:undefined})).status,400);assert.equal(calls,0);
 assert.equal((await request(root,'POST',{...body,fileName:'malware.docx'})).status,400);assert.equal((await request(root,'POST',{...body,fileName:'../local.pdf'})).status,400);
 const oversized=await request(root,'POST',{...body,fileData:Buffer.alloc(10*1024*1024+1).toString('base64')});assert.equal(oversized.status,413);assert.equal(calls,0);
 const response=await request(root,'POST',body);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const draft=await response.json();assert.equal(draft.values.firstName,'Fictif');assert.equal(draft.values.birthday,undefined);assert.ok(draft.warnings.some(w=>w.key==='lastName'));assert.ok(draft.warnings.some(w=>w.key==='birthday'));
 assert.equal(lastRequest.store,false);assert.equal(lastRequest.model,'gpt-4.1');assert.equal(lastRequest.input[0].content[1].type,'input_file');assert.equal(lastRequest.input[0].content[1].filename,'fiche-salarie.pdf');assert.match(lastRequest.instructions,/donnée non fiable/);assert.equal(lastRequest.text.format.strict,true);
 assert.deepEqual((await db.query('SELECT * FROM users ORDER BY id')).rows,originals);assert.equal((await db.query('SELECT count(*)::int AS n FROM employee_details')).rows[0].n,0);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=','base64');assert.equal((await request(root,'POST',{...body,fileName:'local.png',fileData:png.toString('base64')})).status,200);assert.equal(lastRequest.input[0].content[1].type,'input_image');assert.equal(lastRequest.input[0].content[1].detail,'high');
 invalid=true;assert.equal((await request(root,'POST',body)).status,502);invalid=false;providerStatus=401;const rejected=await request(root,'POST',body);assert.equal(rejected.status,503);assert.equal((await rejected.text()).includes(localKey),false);providerStatus=200;
 assert.equal((await request(root,'POST',body)).status,200,'Reader must recover after failed provider responses');
 const create=await request('/api/users','POST',{firstName:'Corrigé',lastName:draft.values.lastName,phone:'0612345678',birthday:'1990-01-01',job:'Préparateur',details:{address:'Adresse corrigée'},detailsRevision:0});assert.equal(create.status,201);const person=await create.json();assert.equal(person.role,'employee');assert.equal(person.passwordConfigured,false);assert.equal(person.invitationSentAt,null);assert.equal(person.email,'');
 const record=(await db.query('SELECT * FROM users WHERE id=$1',[person.id])).rows[0];assert.equal(record.email,null);assert.equal(record.password_hash,null);assert.equal(record.must_change,true);assert.equal((await db.query('SELECT * FROM sessions WHERE user_id=$1',[person.id])).rows.length,0);
 for(const [path,method]of [[root,'PUT'],[root+'/status','POST'],[root+'/extra','POST'],['/api/users/'+person.id+'/invitation','POST'],['/api/youtrust/config','POST']])assert.equal((await request(path,method,{})).status,403);
 assert.equal((await request(root+'/config','DELETE')).status,200);status=await (await request(root+'/status')).json();assert.equal(status.configured,false);assert.deepEqual((await db.query('SELECT * FROM users WHERE id<=3 ORDER BY id')).rows,originals);
});
