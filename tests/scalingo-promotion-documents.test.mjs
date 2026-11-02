import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {token,digest} from '../security.mjs';
import {scalingoUniverseBoundary} from '../scripts/scalingo-universal-rights.mjs';
import {isScalingoPromotionDocumentImport,registerScalingoPromotionDocuments} from '../scripts/scalingo-promotion-documents-preview.mjs';
const origin='https://portailplus-hds.osc-fr1.scalingo.io',database=process.env.PORTAIL_PROMOTION_DOCS_TEST_DATABASE_URL;
const root='/api/merchandising/promotions';
const deny=(req,res)=>res.status(403).json({error:`Fonction désactivée dans la prévisualisation (${req.method} ${req.path}).`});
test('Passerelle : uniquement liste, import, fichier et suppression des documents promotionnels',async t=>{
 const gate=express();registerScalingoPromotionDocuments(gate,(req,res)=>res.json({delegated:true,raw:!req.body}));gate.use(deny);
 const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 for(const [path,method,status]of [[root+'/2/documents','GET',200],[root+'/2/documents','POST',200],[root+'/2/documents/3/file','GET',200],[root+'/2/documents/3','DELETE',200],[root+'/2/documents','DELETE',403],[root+'/2/documents/3','PUT',403],[root+'/2/documents/3/file','POST',403],[root+'/2/documents/3','GET',403],[root+'/0/documents','POST',403],[root+'/2/documents/0','DELETE',403],['/api/users','POST',403],['/api/merchandising/documents/import','POST',403]]){
  const response=await fetch('http://127.0.0.1:'+server.address().port+path,{method});assert.equal(response.status,status,method+' '+path);
 }
 const entry=await readFile(new URL('../scripts/serve-scalingo-ui-preview.mjs',import.meta.url),'utf8');
 assert.match(entry,/isScalingoPromotionDocumentImport\(req\).*next\(\):smallJson/);
 assert(entry.indexOf('gate.use(scalingoUniverseBoundary(db))')<entry.indexOf(' registerScalingoPromotionDocuments(gate,app)'));
});

test('Scalingo/PostgreSQL : import 10 Mo, association, relecture, téléchargement, suppression et sécurité',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_promotion_docs_test');assert.equal(url.search,'');
 const db=new pg.Pool({connectionString:database,max:3});t.after(()=>db.end());
 await db.query(`DROP TABLE IF EXISTS merchandising_promotion_documents,merchandising_promotions,quality_services,sessions,users CASCADE;
 CREATE TABLE users(id integer PRIMARY KEY,name text,role text,active boolean,must_change boolean,rights jsonb,edit_rights jsonb,permissions_configured boolean);
 CREATE TABLE sessions(id text PRIMARY KEY,user_id integer REFERENCES users(id),csrf text,expires_at timestamptz);
 CREATE TABLE merchandising_promotions(id integer PRIMARY KEY,zone_id integer,title text);
 CREATE TABLE quality_services(collaborator_id integer REFERENCES users(id),service text);
 INSERT INTO merchandising_promotions VALUES(1,24,'Local TG11'),(2,1,'Autre promotion locale'),(3,NULL,'Non affectée');`);
 const schema=await readFile(new URL('../scripts/scalingo-merchandising-v12-schema.sql',import.meta.url),'utf8');await db.query(schema.match(/CREATE TABLE IF NOT EXISTS merchandising_promotion_documents\([\s\S]*?\n\);/)[0]);
 const universe="Outils d'aide au merchandising",cookies={};
 for(const [id,role,read,edit,mustChange,active]of [[1,'admin',true,true,false,true],[2,'employee',true,false,false,true],[3,'employee',true,true,false,true],[4,'employee',false,false,false,true],[5,'admin',true,true,true,true],[6,'admin',true,true,false,false],[7,'employee',true,true,false,true]]){
  await db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,$6,$7,true)',[id,'Compte local '+id,role,active,mustChange,JSON.stringify(read?[universe]:[]),JSON.stringify(edit?[universe]:[])]);
  const raw=token();cookies[id]='trevoux_session='+raw;await db.query("INSERT INTO sessions VALUES($1,$2,$3,now()+interval '1 hour')",[digest(raw),id,'csrf-'+id]);
 }
 await db.query("INSERT INTO quality_services VALUES(7,'Merchandising')");
 const pdf=await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url));
 await db.query("INSERT INTO merchandising_promotion_documents(id,promotion_id,file_name,file_type,file_content,created_by,created_name) VALUES(100,2,'protected.pdf','application/pdf',$1,1,'Compte local')",[pdf]);
 const protectedRow=async()=>(await db.query('SELECT * FROM merchandising_promotion_documents WHERE id=100')).rows[0],before=await protectedRow();
 function start(){
  const {app}=createApp(db,{origin,secret:'local-promotion-docs-only-'.repeat(3)}),gate=express(),small=express.json({limit:'64kb'});
  gate.use((req,res,next)=>isScalingoPromotionDocumentImport(req)?next():small(req,res,next));gate.use(scalingoUniverseBoundary(db));registerScalingoPromotionDocuments(gate,app);gate.use(deny);gate.use((e,q,s,n)=>s.status(e.status||500).json({error:e.message}));
  const server=gate.listen(0,'127.0.0.1');t.after(()=>{server.closeAllConnections();server.close();});return server;
 }
 let server=start();await once(server,'listening');
 const request=(path,method='GET',body,user=1,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{origin,cookie:cookies[user]||'','x-csrf-token':'csrf-'+user,'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const body={fileName:'local.pdf',fileData:pdf.toString('base64')},endpoint=root+'/1/documents';
 for(const [path,method,payload]of [[endpoint,'POST',body],[root+'/2/documents/100','DELETE',undefined]]){
  for(const user of [0,6])assert.equal((await request(path,method,payload,user)).status,401);
  for(const user of [2,4,5])assert.equal((await request(path,method,payload,user)).status,403);
  assert.equal((await request(path,method,payload,1,{'x-csrf-token':'bad'})).status,403);
  assert.equal((await request(path,method,payload,1,{origin:'https://wrong.invalid'})).status,403);
 }
 // Invalid large JSON must fail authentication / CSRF before any upload parser.
 for(const [user,extra,status]of [[0,{},401],[2,{},403],[1,{'x-csrf-token':'bad'},403],[1,{origin:'https://wrong.invalid'},403],[1,{},400]]){
  const response=await fetch('http://127.0.0.1:'+server.address().port+endpoint,{method:'POST',headers:{origin,cookie:cookies[user]||'','x-csrf-token':'csrf-'+user,'content-type':'application/json',...extra},body:'{"broken":"'+'a'.repeat(100000)});assert.equal(response.status,status);
 }
 const added=[];
 for(const extension of ['pdf','docx','png','jpg','jpeg'])await t.test(extension+' 10 Mo',async()=>{
  let bytes;
  if(extension==='docx')bytes=docx(10*1024*1024);
  else {bytes=Buffer.alloc(10*1024*1024,32);if(extension==='pdf'){pdf.subarray(0,pdf.length-6).copy(bytes);bytes.write('%%EOF\n',bytes.length-6);}else Buffer.from(extension==='png'?[137,80,78,71,13,10,26,10]:[255,216,255]).copy(bytes);}
  const response=await request(endpoint,'POST',{fileName:'local.'+extension,fileData:bytes.toString('base64')},3);assert.equal(response.status,201,await response.clone().text());const row=await response.json();added.push(row.id);assert.equal(row.file_content,undefined);
  const stored=(await db.query('SELECT promotion_id,file_content FROM merchandising_promotion_documents WHERE id=$1',[row.id])).rows[0];assert.equal(stored.promotion_id,1);assert.deepEqual(stored.file_content,bytes);
  const file=await request(endpoint+'/'+row.id+'/file','GET',undefined,2);assert.equal(file.status,200);assert.match(file.headers.get('content-disposition'),/attachment/);assert.equal(file.headers.get('cache-control'),'no-store');assert.equal(file.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);
  assert.equal((await request(root+'/2/documents/'+row.id+'/file')).status,404);assert.equal((await request(root+'/2/documents/'+row.id,'DELETE')).status,404);
 });
 assert.equal((await request(root+'/3/documents','POST',body)).status,404);
 for(const payload of [{...body,fileName:'../local.pdf'},{...body,fileName:'x.svg'},{...body,fileData:'invalid!'},{...body,fileName:'x.png'},{...body,fileName:'x.docx'}])assert.equal((await request(endpoint,'POST',payload)).status,400);
 const oversized=Buffer.alloc(10*1024*1024+1,32);oversized.write('%PDF-');oversized.write('%%EOF',oversized.length-5);
 assert.equal((await request(endpoint,'POST',{...body,fileData:oversized.toString('base64')})).status,413);
 for(const extension of ['png','jpg']){Buffer.from(extension==='png'?[137,80,78,71,13,10,26,10]:[255,216,255]).copy(oversized);const response=await request(endpoint,'POST',{fileName:'too-large.'+extension,fileData:oversized.toString('base64')});assert([400,413].includes(response.status));assert.match((await response.json()).error,/10 Mo/);}
 const huge=await request(endpoint,'POST',{...body,fileData:'A'.repeat(15*1024*1024)});assert.equal(huge.status,413);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM merchandising_promotion_documents')).rows[0].n,6);
 server.closeAllConnections();await new Promise(r=>server.close(r));server=start();await once(server,'listening');
 const list=await(await request(endpoint,'GET',undefined,2)).json();assert.deepEqual(list.documents.map(d=>Number(d.id)).sort((a,b)=>a-b),added.map(Number).sort((a,b)=>a-b));assert.equal(list.canDelete,false);
 const independent=new pg.Client({connectionString:database});await independent.connect();try{assert.equal((await independent.query('SELECT count(*)::int AS n FROM merchandising_promotion_documents WHERE promotion_id=1')).rows[0].n,5);}finally{await independent.end();}
 for(const user of [0,4,5,6])assert.equal((await request(endpoint+'/'+added[0]+'/file','GET',undefined,user)).status,[0,6].includes(user)?401:403);
 assert.equal((await request(endpoint+'/'+added[0],'DELETE',undefined,3)).status,403);
 assert.equal((await request(endpoint+'/'+added[0],'DELETE',undefined,7)).status,200);
 assert.equal((await request(endpoint+'/'+added[0]+'/file')).status,404);
 assert.equal((await(await request(endpoint)).json()).documents.some(d=>d.id===added[0]),false);
 assert.equal((await request(endpoint+'/'+added[1],'DELETE')).status,200);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM merchandising_promotion_documents WHERE id=$1',[added[1]])).rows[0].n,0);
 assert.deepEqual(await protectedRow(),before);
});

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
