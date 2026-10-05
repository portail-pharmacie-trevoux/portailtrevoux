import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {validateProcedureFile,maxProcedureFileBytes} from '../procedure-files.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});

function wordZip(){
 const entries=['[Content_Types].xml','word/document.xml'],local=[],central=[];let offset=0;
 for(const name of entries){const n=Buffer.from(name),data=Buffer.from('<xml/>'),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(n.length,26);const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50);ch.writeUInt32LE(data.length,20);ch.writeUInt32LE(data.length,24);ch.writeUInt16LE(n.length,28);ch.writeUInt32LE(offset,42);const item=Buffer.concat([h,n,data]);local.push(item);central.push(ch,n);offset+=item.length;}
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
test('PDF et DOCX : formats, contenu, base64 et limite de taille contrôlés',async()=>{
 const pdf=await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url));
 assert.deepEqual(validateProcedureFile({fileName:'fiche.PDF',fileData:pdf.toString('base64')},fail).bytes,pdf);
 assert.match(validateProcedureFile({fileName:'test.docx',fileData:wordZip().toString('base64')},fail).fileType,/wordprocessingml/);
 for(const [fileName,bytes] of [['test.exe',pdf],['test.pdf',wordZip()],['test.docx',pdf],['../test.pdf',pdf],['test.docx',wordZip().subarray(0,50)]])assert.throws(()=>validateProcedureFile({fileName,fileData:bytes.toString('base64')},fail),e=>e.status===400);
 assert.throws(()=>validateProcedureFile({fileName:'test.pdf',fileData:pdf.toString('base64')+'!'},fail),e=>e.status===400);
 assert.throws(()=>validateProcedureFile({fileName:'test.pdf',fileData:Buffer.alloc(maxProcedureFileBytes+1).toString('base64')},fail),e=>e.status===413);
});

test('import protégé, stockage intégral, téléchargement, modification et retrait réversible',async t=>{
 let user={id:1,role:'admin',csrf:'test',active:true,must_change:false},stored=null;
 const metadata=()=>{const {file_content,active,...rest}=stored;return rest;};
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT s.id'))return {rows:[user]};
  if(sql.startsWith('INSERT INTO publications'))return {rows:[]};
  if(sql.startsWith('WITH next_id')){stored={id:1,category:args[0],title:args[1],description:args[2],keywords:args[3],url:'/api/procedures/1/file',file_name:args[4],file_type:args[5],file_content:args[6],active:true};return {rows:[metadata()]};}
  if(sql.startsWith('SELECT file_name,file_type,file_content'))return {rows:stored?.active?[stored]:[]};
  if(sql.startsWith('SELECT url,file_name'))return {rows:stored?.active?[stored]:[]};
  if(sql.startsWith('UPDATE procedure_documents SET category')){[stored.category,stored.title,stored.description,stored.keywords,stored.url]=args;return {rows:[metadata()]};}
  if(sql.startsWith('UPDATE procedure_documents SET active=')){stored.active=sql.includes('SET active=TRUE');return {rows:[{id:1}]};}
  if(sql.includes('FROM procedure_documents'))return {rows:stored?.active?[metadata()]:[]};
  throw Error('Unexpected query: '+sql);
 }};
 const {app}=createApp(db,{origin:'https://portal.test',secret:'x'.repeat(32)}),server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port;
 const headers={origin:'https://portal.test',cookie:'trevoux_session='+'a'.repeat(43),'x-csrf-token':'test','content-type':'application/json'};
 const request=(path,method='GET',body,extra={})=>fetch(base+path,{method,headers:{...headers,...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const pdf=await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url));
 const body={fileName:'fiche.pdf',fileData:pdf.toString('base64'),title:'Fiche',category:'Organisation'};
 assert.equal((await request('/api/procedures/import','POST',body,{cookie:''})).status,401);
 assert.equal((await request('/api/procedures/import','POST',body,{'x-csrf-token':''})).status,403);
 user={...user,role:'employee',permissions_configured:true,rights:['Procédures'],edit_rights:[]};
 assert.equal((await request('/api/procedures/import','POST',body)).status,403);
 assert.equal((await request('/api/collaborateurs/registration-form')).status,403);
 user.role='admin';
 const imported=await request('/api/procedures/import','POST',body);assert.equal(imported.status,201);assert.equal((await imported.json()).file_content,undefined);assert.deepEqual(stored.file_content,pdf);
 const download=await request('/api/procedures/1/file');assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/attachment/);assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
 assert.equal((await (await request('/api/procedures')).json())[0].file_content,undefined);
 assert.equal((await request('/api/procedures/1','PUT',{title:'Modifié',category:'Qualité',url:'https://other.test'})).status,200);assert.equal(stored.url,'/api/procedures/1/file');
 user.role='employee';user.rights=[];assert.equal((await request('/api/procedures/1/file')).status,403);user.role='admin';
 assert.equal((await request('/api/procedures/1','DELETE')).status,200);assert.equal((await request('/api/procedures/1/file')).status,404);
 assert.equal((await request('/api/procedures/1/restore','POST',{})).status,200);assert.equal((await request('/api/procedures/1/file')).status,200);
 const word=wordZip();const wordImport=await request('/api/procedures/import','POST',{...body,fileName:'procedure.docx',fileData:word.toString('base64')});assert.equal(wordImport.status,201);assert.deepEqual(Buffer.from(await (await request('/api/procedures/1/file')).arrayBuffer()),word);
 const largePdf=Buffer.concat([pdf.subarray(0,pdf.length-6),Buffer.alloc(20000,32),Buffer.from('%%EOF\n')]);assert.equal((await request('/api/procedures/import','POST',{...body,fileData:largePdf.toString('base64')})).status,201);
 const form=await request('/api/collaborateurs/registration-form');assert.equal(form.status,200);assert.deepEqual(Buffer.from(await form.arrayBuffer()),pdf);
});
