import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import express from 'express';
import pg from 'pg';
import {createApp} from '../server.mjs';
import {token,digest} from '../security.mjs';
import {isScalingoTrainingImport,registerScalingoTrainingDocuments} from '../scripts/scalingo-training-documents-preview.mjs';
import {ensureScalingoTrainingDocumentsSchema} from '../scripts/ensure-scalingo-training-documents-schema.mjs';
import {scalingoUniverseBoundary} from '../scripts/scalingo-universal-rights.mjs';
const database=process.env.PORTAIL_TRAINING_TEST_DATABASE_URL,origin='https://portailplus-hds.osc-fr1.scalingo.io';
function docx(size){
 const names=['[Content_Types].xml','_rels/.rels','word/document.xml'];
 const contents=['<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Local</w:t></w:r></w:p></w:body></w:document>'];
 const overhead=22+names.reduce((n,name,i)=>n+76+2*Buffer.byteLength(name)+Buffer.byteLength(contents[i]),0);
 contents[2]=contents[2].replace('Local','Local'+' '.repeat(size-overhead));
 const crc=bytes=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};
 let offset=0;const local=[],central=[];
 names.forEach((name,i)=>{const n=Buffer.from(name),data=Buffer.from(contents[i]),h=Buffer.alloc(30),c=Buffer.alloc(46),checksum=crc(data);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt32LE(checksum,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,6);c.writeUInt32LE(checksum,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);const chunk=Buffer.concat([h,n,data]);local.push(chunk);central.push(c,n);offset+=chunk.length;});
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(names.length,8);end.writeUInt16LE(names.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
test('Scalingo/PostgreSQL référence : 10 Mo PDF/DOCX dans les deux catégories, persistance, permissions et retrait préservateur',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_training_test');assert.equal(url.search,'');
 const db=new pg.Pool({connectionString:database,max:3});t.after(()=>db.end());
 await db.query(`DROP TABLE IF EXISTS training_documents,publications,sessions,users CASCADE;
 CREATE TABLE users(id integer PRIMARY KEY,name text,role text,active boolean,must_change boolean,rights jsonb,edit_rights jsonb,permissions_configured boolean);
 CREATE TABLE sessions(id text PRIMARY KEY,user_id integer REFERENCES users(id),csrf text,expires_at timestamptz);`);
 const schema=await readFile(new URL('../schema.sql',import.meta.url),'utf8');
 await db.query(schema.match(/CREATE TABLE IF NOT EXISTS training_documents\([\s\S]*?\n\);/)[0]);
 await db.query(schema.match(/CREATE TABLE IF NOT EXISTS publications \([\s\S]*?\n\);/)[0]);
 const cookies={};
 for(const [id,role,rights,edit,mustChange]of [[1,'admin',true,true,false],[2,'employee',true,false,false],[3,'employee',true,true,false],[4,'employee',false,false,false],[5,'admin',true,true,true]]){
  await db.query('INSERT INTO users VALUES($1,$2,$3,true,$4,$5,$6,true)',[id,'Compte local '+id,role,mustChange,JSON.stringify(rights?['Formations']:[]),JSON.stringify(edit?['Formations']:[])]);
  const raw=token();cookies[id]='trevoux_session='+raw;await db.query("INSERT INTO sessions VALUES($1,$2,$3,now()+interval '1 hour')",[digest(raw),id,'csrf-'+id]);
 }
 const source=await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url));
 await db.query("INSERT INTO training_documents(id,category,title,file_name,file_type,file_content,created_by) VALUES(100,'reference','Document existant protégé','existing.pdf','application/pdf',$1,1)",[source]);
 const protectedRow=async()=>(await db.query('SELECT id,category,title,file_name,file_type,file_content,created_by,created_at FROM training_documents WHERE id=100')).rows[0],protectedBefore=await protectedRow();
 assert.deepEqual(await ensureScalingoTrainingDocumentsSchema(db),{added:['removed_at','removed_by']});
 assert.deepEqual(await protectedRow(),protectedBefore);
 assert.deepEqual(await ensureScalingoTrainingDocumentsSchema(db),{added:[]});
 assert.equal((await db.query('SELECT removed_at,removed_by FROM training_documents WHERE id=100')).rows[0].removed_at,null);
 function start(){
  const {app}=createApp(db,{origin,secret:'local-training-only-'.repeat(3)}),gate=express(),small=express.json({limit:'64kb'});
  gate.use((req,res,next)=>isScalingoTrainingImport(req)?next():small(req,res,next));gate.use(scalingoUniverseBoundary(db));registerScalingoTrainingDocuments(gate,app);
  gate.use((req,res)=>res.status(403).json({error:`Fonction désactivée dans la prévisualisation (${req.method} ${req.path}).`}));
  gate.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
  const server=gate.listen(0,'127.0.0.1');t.after(()=>{server.closeAllConnections();server.close();});return server;
 }
 let server=start();await once(server,'listening');
 const request=(path,method='GET',body,user=1,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{origin,cookie:cookies[user]||'','x-csrf-token':'csrf-'+user,'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const root='/api/training/documents',body={category:'reference',fileName:'BEXSERO 15 24 ans.pdf',fileData:source.toString('base64')};
 for(const [path,method,payload]of [[root+'/import','POST',body],[root+'/100','PUT',{title:'Interdit'}],[root+'/100','DELETE',{}]]){
  assert.equal((await request(path,method,payload,0)).status,401);
  for(const user of [2,4,5])assert.equal((await request(path,method,payload,user)).status,403);
  assert.equal((await request(path,method,payload,1,{'x-csrf-token':'wrong'})).status,403);
  assert.equal((await request(path,method,payload,1,{origin:'https://wrong.invalid'})).status,403);
 }
 assert.equal((await request(root,'GET',undefined,4)).status,403);
 const added=[];
 for(const category of ['reference','training'])for(const [extension,sizeMiB]of [['pdf',2],['pdf',10],['docx',10]])await t.test(`${category} : ${extension} ${sizeMiB} Mo`,async()=>{
  const bytes=extension==='pdf'?Buffer.concat([source.subarray(0,source.length-6),Buffer.alloc(sizeMiB*1024*1024-source.length,32),Buffer.from('%%EOF\n')]):docx(sizeMiB*1024*1024);assert.equal(bytes.length,sizeMiB*1024*1024);
  const fileName=extension==='docx'?'Formation été.docx':category==='reference'?'BEXSERO 15 24 ans.pdf':'DEPART ETRANGER At honneur_CPAM-Ain (1).pdf';
  const response=await request(root+'/import','POST',{category,fileName,fileData:bytes.toString('base64')});assert.equal(response.status,201);const row=await response.json();assert.equal(row.category,category);assert.equal(row.file_content,undefined);added.push(row.id);
  const download=await request(root+'/'+row.id+'/file','GET',undefined,2);assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/attachment/);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
  const print=await request(root+'/'+row.id+'/print','GET',undefined,2);assert.equal(print.status,extension==='pdf'?200:400);
  if(extension==='pdf'){const inline=await request(root+'/'+row.id+'/file?inline=1','GET',undefined,2);assert.equal(inline.headers.get('content-disposition'),'inline');assert.deepEqual(Buffer.from(await inline.arrayBuffer()),bytes);}
 });
 const collaborator=await request(root+'/import','POST',body,3);assert.equal(collaborator.status,201);const editable=(await collaborator.json()).id;
 assert.equal((await request(root+'/'+editable,'PUT',{title:'Renommé après import'},3)).status,200);
 assert.equal((await request(root+'/'+editable,'PUT',{title:''},3)).status,400);
 const count=(await db.query('SELECT count(*)::int AS n FROM training_documents')).rows[0].n;
 for(const payload of [{...body,category:'wrong'},{...body,fileName:'x.exe'},{...body,fileName:'../x.pdf'}])assert.equal((await request(root+'/import','POST',payload)).status,400);
 const oversized=await request(root+'/import','POST',{...body,fileData:Buffer.alloc(10*1024*1024+1).toString('base64')});assert.equal(oversized.status,413);assert.match((await oversized.json()).error,/10 Mo/);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM training_documents')).rows[0].n,count);
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=start();await once(server,'listening');
 const list=await (await request(root,'GET',undefined,2)).json();assert.equal(list.length,8);assert.equal(list.find(d=>d.id===editable).title,'Renommé après import');assert.equal(list.some(d=>'file_content' in d),false);
 const independent=new pg.Client({connectionString:database});await independent.connect();try{assert.equal((await independent.query('SELECT title FROM training_documents WHERE id=$1',[editable])).rows[0].title,'Renommé après import');}finally{await independent.end();}
 const bytesBefore=(await db.query('SELECT file_content FROM training_documents WHERE id=$1',[editable])).rows[0].file_content;
 assert.equal((await request(root+'/'+editable,'DELETE',undefined,3)).status,200);
 const removed=(await db.query('SELECT removed_at,removed_by,file_content FROM training_documents WHERE id=$1',[editable])).rows[0];assert.ok(removed.removed_at);assert.equal(removed.removed_by,3);assert.deepEqual(removed.file_content,bytesBefore);
 for(const suffix of ['/file','/print'])assert.equal((await request(root+'/'+editable+suffix)).status,404);
 assert.equal((await request(root+'/'+editable,'PUT',{title:'Réactivation interdite'})).status,404);
 assert.equal((await request(root+'/'+editable,'DELETE')).status,404);
 assert.equal((await (await request(root)).json()).some(d=>d.id===editable),false);
 for(const [path,method]of [[root,'POST'],[root+'/100','PATCH'],[root+'/100/purge','DELETE'],[root+'/100/restore','POST'],['/api/users/2','PUT'],[root+'/0','DELETE']]){const response=await request(path,method,{});assert.equal(response.status,403,path);assert.match((await response.json()).error,/prévisualisation/);}
 assert.equal((await request(root+'/100/file','GET',undefined,4)).status,403);assert.equal((await request(root+'/100/file','GET',undefined,0)).status,401);
 assert.deepEqual(await protectedRow(),protectedBefore);
});
