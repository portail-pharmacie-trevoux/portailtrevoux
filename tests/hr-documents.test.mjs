import test from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';import {readFile} from 'node:fs/promises';import {createApp} from '../server.mjs';
const requestId='10000000-0000-4000-8000-000000000001';
test('RH : import administrateur, lecture équipe, suppression et envoi idempotent aux actifs, suivi privé',async t=>{
 let actor={id:1,name:'Admin',role:'admin',csrf:'test',must_change:false},stored=null,sendCount=0;const requests=new Map(),people=[{id:2,name:'Alice Exemple',first_name:'Alice',last_name:'Exemple',email:'alice@example.com'},{id:3,name:'Bob Exemple',first_name:'Bob',last_name:'Exemple',email:'bob@example.com'}];
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT s.id'))return {rows:[actor]};if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};if(sql.startsWith('INSERT INTO publications'))return {rows:[]};
  if(sql.startsWith('INSERT INTO hr_documents')){stored={id:1,title:args[0],file_name:args[1],file_type:args[2],file_content:args[3],file_hash:args[4],active:true,created_at:new Date().toISOString()};return {rows:[stored]};}
  if(sql.startsWith('SELECT id,title,file_name'))return {rows:stored?.active?[{id:1,title:stored.title,file_name:stored.file_name,file_type:stored.file_type,created_at:stored.created_at}]:[]};
  if(sql.startsWith('SELECT file_name,file_type,file_content')||sql.startsWith('SELECT * FROM hr_documents'))return {rows:stored?.active?[stored]:[]};
  if(sql.startsWith('UPDATE hr_documents')){if(!stored?.active)return {rows:[]};stored.active=false;return {rows:[{id:1}]};}
  if(sql.startsWith('SELECT id,name,email FROM users'))return {rows:people};if(sql.startsWith('SELECT id,name,email,first_name,last_name FROM users'))return {rows:people.filter(p=>args[0].includes(p.id))};
  if(sql.startsWith('SELECT id,document_id,status FROM hr_signature_requests'))return {rows:requests.has(args[0])?[requests.get(args[0])]:[]};
  if(sql.startsWith('SELECT id FROM hr_signature_requests'))return {rows:[]};
  if(sql.startsWith('INSERT INTO hr_signature_requests')){requests.set(args[0],{id:args[0],document_id:args[1],environment:args[4],recipients:JSON.parse(args[5]),status:'creating',title:stored.title});return {rows:[]};}
  if(sql.startsWith('UPDATE hr_signature_requests SET envelope_id')){const row=requests.get(args[0]);row.envelope_id=args[1];if(sql.includes('status=$3')){row.status=args[2];row.recipients=JSON.parse(args[3]);}else row.recipients=JSON.parse(args[2]);return {rows:[]};}
  if(sql.startsWith('SELECT r.*,d.title'))return {rows:[...requests.values()]};
  if(sql.startsWith('SELECT r.id,r.document_id')){assert.match(sql,/WHERE \(recipient.value->>'userId'\)::integer=\$1/);return {rows:[...requests.values()].flatMap(r=>r.recipients.filter(p=>p.userId===args[0]).map(p=>({id:r.id,title:r.title,status:p.status,envelope_status:r.status})))};}
  throw Error('Unexpected '+sql);
 }};
 const youtrustClient={context:async()=>({accountId:'youtrust',baseUri:'https://api.yousign.app/v3',environment:'production'}),send:async({signers,checkpoint})=>{sendCount++;await checkpoint({envelopeId:requestId,recipients:signers});return {envelopeId:requestId,status:'sent',recipients:signers};}};
 const {app}=createApp(db,{origin:'https://portal.test',secret:'s'.repeat(32),youtrustClient}),server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const headers={origin:'https://portal.test',cookie:'trevoux_session='+'a'.repeat(43),'x-csrf-token':'test','content-type':'application/json'},request=(path,method='GET',body,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{...headers,...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const pdf=await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url)),body={title:'Charte',fileName:'charte.pdf',fileData:pdf.toString('base64')};
 assert.equal((await request('/api/hr/documents/import','POST',body,{cookie:''})).status,401);assert.equal((await request('/api/hr/documents/import','POST',body,{'x-csrf-token':''})).status,403);
 actor.role='employee';actor.rights=[];actor.edit_rights=['Ressources humaines'];assert.equal((await request('/api/hr/documents/import','POST',body)).status,403);assert.equal((await request('/api/hr/documents/1','DELETE',{})).status,403);assert.equal((await request('/api/hr/signatories')).status,403);
 actor.role='admin';assert.equal((await request('/api/hr/documents/import','POST',body)).status,201);assert.deepEqual(stored.file_content,pdf);
 actor.role='employee';assert.equal((await request('/api/hr/documents')).status,200);const download=await request('/api/hr/documents/1/file?view=1');assert.match(download.headers.get('content-disposition'),/inline/);assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);assert.equal((await (await request('/api/hr/documents')).json())[0].file_content,undefined);
 const send={requestKey:requestId,recipients:[{id:2,email:'alice@example.com'},{id:3,email:'bob@example.com'}]};assert.equal((await request('/api/hr/documents/1/signatures','POST',send)).status,403);
 actor.role='admin';assert.equal((await request('/api/hr/documents/1/signatures','POST',{...send,recipients:[{id:99,email:'missing@example.com'}]})).status,409);
 assert.equal((await request('/api/hr/documents/1/signatures','POST',{...send,recipients:[{id:2,email:'old@example.com'}]})).status,409);
 assert.equal((await request('/api/hr/documents/1/signatures','POST',send)).status,201);assert.equal(sendCount,1);assert.equal((await (await request('/api/hr/documents/1/signatures','POST',send)).json()).existing,true);assert.equal(sendCount,1);
 const adminHistory=await (await request('/api/hr/signatures')).json();assert.equal(adminHistory[0].recipients.length,2);assert.equal(adminHistory[0].base_uri,undefined);
 actor.id=2;actor.role='employee';const own=await (await request('/api/hr/signatures')).json();assert.equal(own.length,1);assert.equal(own[0].recipients,undefined);assert.equal(own[0].email,undefined);
 actor.role='admin';assert.equal((await request('/api/hr/documents/1','DELETE',{})).status,200);assert.equal((await request('/api/hr/documents/1/file')).status,404);assert.equal(requests.size,1);assert.deepEqual(stored.file_content,pdf);
});
