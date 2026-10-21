import test from 'node:test';import assert from 'node:assert/strict';import {createApp} from '../server.mjs';
test('Contact attachments enforce auth, universe rights, admin/CSRF, scoped downloads and bounded deduplicated uploads',async t=>{
 let role='admin',allowed=true,duplicate=false,writes=0;const pdf=Buffer.from('%PDF-1.4\n'+'x'.repeat(20000)+'\n%%EOF'),document={id:5,title:'Contrat',file_name:'contrat.pdf',file_type:'application/pdf',file_size:pdf.length,created_at:'2026-10-21T12:00:00Z'};
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT s.id'))return{rows:[{id:1,role,active:true,csrf:'csrf',permissions_configured:true,rights:allowed?['Contacts utiles']:[]}]};
  if(sql.startsWith('SELECT id,name,active'))return{rows:args[0]===2?[{id:2,name:'Maintenance',active:true}]:[]};
  if(sql.startsWith('INSERT INTO useful_contact_documents')){assert.ok(args[4].equals(pdf));assert.match(args[5],/^[a-f0-9]{64}$/);writes++;return{rows:duplicate?[]:[document]};}
  if(sql.startsWith('SELECT file_name,file_type,file_content'))return{rows:args[0]===5&&args[1]===2?[{...document,file_content:pdf}]:[]};
  if(sql.startsWith('SELECT id,title,file_name'))return{rows:[document]};
  if(sql.startsWith('DELETE FROM useful_contact_documents')){assert.deepEqual(args,[5,2]);return{rows:[{id:5}]};}
  throw Error('Unexpected SQL '+sql);
 }};
 const {app}=createApp(db,{secret:'s'.repeat(32),origin:'http://portal.test'}),server=app.listen(0);t.after(()=>server.close());const root='http://127.0.0.1:'+server.address().port,headers={cookie:'trevoux_session='+'a'.repeat(43),origin:'http://portal.test','x-csrf-token':'csrf','content-type':'application/json'},body={title:'Contrat',fileName:'contrat.pdf',fileData:pdf.toString('base64')},post=(h=headers,b=body)=>fetch(root+'/api/contacts/2/documents',{method:'POST',headers:h,body:JSON.stringify(b)});
 assert.equal((await post({...headers,cookie:''})).status,401);role='employee';assert.equal((await post()).status,403);role='admin';assert.equal((await post({...headers,'x-csrf-token':'wrong'})).status,403);assert.equal(writes,0);
 assert.equal((await post()).status,201);duplicate=true;assert.equal((await post()).status,409);assert.equal((await post(headers,{...body,fileName:'fake.exe'})).status,400);
 role='employee';const response=await fetch(root+'/api/contacts/2/documents/5/file',{headers});assert.equal(response.status,200);assert.ok(Buffer.from(await response.arrayBuffer()).equals(pdf));assert.match(response.headers.get('content-disposition'),/attachment/);assert.equal((await fetch(root+'/api/contacts/2/documents/6/file',{headers})).status,404);allowed=false;assert.equal((await fetch(root+'/api/contacts/2/documents',{headers})).status,403);allowed=true;assert.equal((await fetch(root+'/api/contacts/2/documents/5',{method:'DELETE',headers})).status,403);role='admin';assert.equal((await fetch(root+'/api/contacts/2/documents/5',{method:'DELETE',headers})).status,200);
});
