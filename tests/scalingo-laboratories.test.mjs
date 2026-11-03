import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {laboratoryConditions} from '../public/laboratory-conditions.js';
import {token,digest} from '../security.mjs';
import {scalingoUniverseBoundary} from '../scripts/scalingo-universal-rights.mjs';
import {isScalingoLaboratoryUpload,registerScalingoLaboratories} from '../scripts/scalingo-laboratories-preview.mjs';
const database=process.env.PORTAIL_LABORATORY_TEST_DATABASE_URL,origin='https://portailplus-hds.osc-fr1.scalingo.io',root='/api/laboratories';
const deny=(req,res)=>res.status(403).json({error:'Fonction désactivée dans la prévisualisation'});
test('Scalingo Laboratoires : exceptions exactes uniquement, fichiers bruts et frontière des droits',async t=>{
 const gate=express();registerScalingoLaboratories(gate,(q,s)=>s.json({ok:true}));gate.use(deny);const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 for(const [method,path,status]of [['POST','/1/logo',200],['GET','/1/logo',200],['DELETE','/1/logo',200],['POST','/1/documents',200],['GET','/1/documents',200],['GET','/1/documents/2/file',200],['DELETE','/1/documents/2',200],['POST','/1/email',200],['PUT','/1/documents/2',200],['PUT','/1/documents/2/file',403],['PUT','/1/documents/0',403],['PUT','/1/logo',403],['POST','/1/documents/2/file',403],['GET','/1/email',403],['POST','/0/logo',403],['DELETE','/1',403],['POST','/1/invite',403],['POST','/1/documents/0',403]])assert.equal((await fetch('http://127.0.0.1:'+server.address().port+root+path,{method})).status,status,method+path);
 assert(isScalingoLaboratoryUpload({method:'POST',path:root+'/1/logo'}));assert(!isScalingoLaboratoryUpload({method:'POST',path:root+'/1/email'}));
 const source=await readFile(new URL('../scripts/serve-scalingo-ui-preview.mjs',import.meta.url),'utf8');assert.match(source,/isScalingoLaboratoryUpload\(req\).*next\(\):smallJson/);assert(source.indexOf('gate.use(scalingoUniverseBoundary(db))')<source.indexOf(' registerScalingoLaboratories(gate,app)'));
});

test('Scalingo/PostgreSQL Laboratoires : logos 2 Mo, documents 10 Mo, messagerie simulée et préservation',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_laboratory_test');assert.equal(url.search,'');
 const db=new pg.Pool({connectionString:database,max:3});t.after(()=>db.end());
 await db.query(`DROP TABLE IF EXISTS laboratory_documents,laboratory_emails,laboratories,settings,sessions,users CASCADE;
 CREATE TABLE users(id integer PRIMARY KEY,name text,first_name text,last_name text,role text,active boolean,must_change boolean,rights jsonb,edit_rights jsonb,permissions_configured boolean);
 CREATE TABLE sessions(id text PRIMARY KEY,user_id integer REFERENCES users(id),csrf text,expires_at timestamptz);
 CREATE TABLE settings(key text PRIMARY KEY,value text);`);
 const schema=await readFile(new URL('../schema.sql',import.meta.url),'utf8');
 for(const name of ['laboratories','laboratory_documents','laboratory_emails'])await db.query(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\n\\);'))?.[0]||schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+'\\([\\s\\S]*?\\n\\);'))[0]);
 await db.query('ALTER TABLE laboratories ADD COLUMN logo_content bytea,ADD COLUMN logo_type text,ADD COLUMN logo_version integer NOT NULL DEFAULT 0');
 const cookies={};async function session(id){const raw=token();cookies[id]='trevoux_session='+raw;await db.query("INSERT INTO sessions VALUES($1,$2,$3,now()+interval '1 hour')",[digest(raw),id,'csrf-'+id]);}
 for(const [id,role,read,edit,mustChange,active]of [[1,'admin',true,true,false,true],[2,'employee',true,false,false,true],[3,'employee',true,true,false,true],[4,'employee',false,false,false,true],[5,'admin',true,true,true,true],[6,'admin',true,true,false,false]]){await db.query('INSERT INTO users VALUES($1,$2,\'Local\',\'Test\',$3,$4,$5,$6,$7,true)',[id,'Compte local '+id,role,active,mustChange,JSON.stringify(read?['Laboratoires']:[]),JSON.stringify(edit?['Laboratoires']:[])]);await session(id);}
 await db.query(`INSERT INTO laboratories(id,name,order_mode,responsible_id,details) VALUES(1,'Local','pharmacie',3,'{"commercialEmail":"rep@example.invalid","labEmail":"lab@example.invalid","conditions":"Protégées","notes":"À conserver"}'),(2,'Autre laboratoire','groupement',NULL,'{"notes":"Protégées"}')`);
 const calendarYear=Number(new Intl.DateTimeFormat('en',{timeZone:'Europe/Paris',year:'numeric'}).format(new Date()));
 const currentHistory={year:calendarYear,conditions:'Conditions de l’année courante',franco:'150 €',validFrom:calendarYear+'-01-01',validUntil:calendarYear+'-12-31'},previousHistory={year:calendarYear-1,conditions:'Anciennes conditions',franco:'100 €',validFrom:(calendarYear-1)+'-01-01',validUntil:(calendarYear-1)+'-12-31'};
 await db.query("INSERT INTO laboratories(id,name,order_mode,details) VALUES(3,'Historique local','groupement',$1)",[JSON.stringify({conditionsYear:calendarYear-1,conditions:'Anciennes conditions',franco:'100 €',conditionsHistory:{[calendarYear]:currentHistory,[calendarYear-1]:previousHistory}})]);
 const protectedLab=async()=>(await db.query('SELECT * FROM laboratories WHERE id=2')).rows[0],protectedBefore=await protectedLab();
 const info=async()=>(await db.query('SELECT id,name,order_mode,responsible_id,details,created_at FROM laboratories WHERE id=1')).rows[0],before=await info();
 let connected=false;const sent=[];
 function start(){const {app}=createApp(db,{origin,secret:'local-laboratory-only-'.repeat(3),invitationMailer:{status:async()=>({connected,configured:connected,sender:'pharmacie.trevoux@gmail.com'}),sendText:async payload=>{sent.push(payload);return 'simulated-message';}}}),gate=express(),small=express.json({limit:'64kb'});gate.use((q,s,n)=>isScalingoLaboratoryUpload(q)?n():small(q,s,n));gate.use(scalingoUniverseBoundary(db));registerScalingoLaboratories(gate,app);gate.get(root,(q,s,n)=>app(q,s,n));gate.put(root+'/:id',(q,s,n)=>app(q,s,n));gate.use(deny);gate.use((e,q,s,n)=>s.status(e.status||500).json({error:e.message}));const server=gate.listen(0,'127.0.0.1');t.after(()=>{server.closeAllConnections();server.close();});return server;}
 let server=start();await once(server,'listening');const request=(path,method='GET',body,user=1,extra={})=>fetch('http://127.0.0.1:'+server.address().port+root+path,{method,headers:{origin,cookie:cookies[user]||'','x-csrf-token':'csrf-'+user,'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),logo={fileData:png.toString('base64'),revision:1};
 const pdf=await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url)),document={title:'Catalogue local',fileName:'local.pdf',fileData:pdf.toString('base64')};
 const email={contact:'commercial',requestId:'00000000-0000-4000-8000-000000000001',email:'rep@example.invalid',subject:'Test local',text:'Simulation uniquement'};
 for(const [path,method,body]of [['/1/logo','POST',logo],['/1/logo','DELETE',{revision:1}],['/1/documents','POST',document],['/1/documents/999','DELETE',{}],['/1/email','POST',email]]){for(const user of [0,6])assert.equal((await request(path,method,body,user)).status,401);for(const user of [2,4,5])assert.equal((await request(path,method,body,user)).status,403);assert.equal((await request(path,method,body,1,{'x-csrf-token':'bad'})).status,403);assert.equal((await request(path,method,body,1,{origin:'https://wrong.invalid'})).status,403);}
 for(const path of ['/1/logo','/1/documents'])for(const [user,extra,status]of [[0,{},401],[2,{},403],[1,{'x-csrf-token':'bad'},403],[1,{origin:'https://wrong.invalid'},403],[1,{},400]]){const response=await fetch('http://127.0.0.1:'+server.address().port+root+path,{method:'POST',headers:{origin,cookie:cookies[user]||'','x-csrf-token':'csrf-'+user,'content-type':'application/json',...extra},body:'{"broken":"'+'a'.repeat(100000)});assert.equal(response.status,status);}
 let revision=1;
 for(const [type,signature]of [['image/png',Buffer.from([137,80,78,71,13,10,26,10])],['image/jpeg',Buffer.from([255,216,255])],['image/webp',Buffer.from('RIFF0000WEBP')]])await t.test(type+' 2 Mo et remplacement',async()=>{const bytes=Buffer.alloc(2*1024*1024,32);signature.copy(bytes);const r=await request('/1/logo','POST',{fileData:bytes.toString('base64'),revision,name:'Ne pas écraser',details:{}},3);assert.equal(r.status,200);revision++;const file=await request('/1/logo','GET',undefined,2);assert.equal(file.status,200);assert.equal(file.headers.get('content-type'),type);assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);const list=await(await request('')).json();assert.equal(list.find(l=>l.id===1).logoVersion,revision-1);assert.deepEqual(await info(),before);});
 assert.equal((await request('/1/logo','POST',logo)).status,409);
 const hugeLogo=await request('/1/logo','POST',{fileData:'A'.repeat(3*1024*1024),revision});assert.equal(hugeLogo.status,413);assert.match((await hugeLogo.json()).error,/2 Mo/);
 for(const payload of [{fileData:'AAAA=',revision},{fileData:'abcd',revision},{fileData:png.toString('base64')},{fileData:png.toString('base64'),revision:'4'},{fileData:Buffer.alloc(2*1024*1024+1).toString('base64'),revision}])assert.equal((await request('/1/logo','POST',payload)).status,400);
 assert.equal((await request('/1/logo','POST',{fileData:png.toString('base64'),revision},3)).status,200);revision++;
 const added=[];for(const extension of ['pdf','docx'])await t.test(extension+' 10 Mo',async()=>{const bytes=extension==='docx'?docx(10*1024*1024):Buffer.alloc(10*1024*1024,32);if(extension==='pdf'){pdf.subarray(0,pdf.length-6).copy(bytes);bytes.write('%%EOF\n',bytes.length-6);}const r=await request('/1/documents','POST',{title:'Catalogue '+extension,fileName:'local.'+extension,fileData:bytes.toString('base64')},3);assert.equal(r.status,201,await r.clone().text());const row=await r.json();added.push(row.id);const download=await request('/1/documents/'+row.id+'/file','GET',undefined,2);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);assert.match(download.headers.get('content-disposition'),/attachment/);assert.equal((await request('/2/documents/'+row.id+'/file')).status,404);assert.equal((await request('/2/documents/'+row.id,'DELETE')).status,404);});
 // Rename only the displayed title; preserve the original name, bytes and laboratory.
 const doc=added[0],oldTitle='Catalogue pdf',newTitle='Tarifs et conditions été 2026';
 const fileState=async()=>(await db.query('SELECT id,laboratory_id,file_name,file_type,added_by,created_at,md5(file_content) AS fingerprint,octet_length(file_content) AS bytes FROM laboratory_documents WHERE id=$1',[doc])).rows[0],originalFile=await fileState();
 const rename={title:newTitle,previousTitle:oldTitle},route='/1/documents/'+doc;
 for(const user of [0,6])assert.equal((await request(route,'PUT',rename,user)).status,401);
 for(const user of [2,4,5])assert.equal((await request(route,'PUT',rename,user)).status,403);
 assert.equal((await request(route,'PUT',rename,1,{'x-csrf-token':'bad'})).status,403);assert.equal((await request(route,'PUT',rename,1,{origin:'https://wrong.invalid'})).status,403);
 for(const body of [{title:'',previousTitle:oldTitle},{title:' ',previousTitle:oldTitle},{title:'x'.repeat(201),previousTitle:oldTitle},{title:newTitle},{...rename,fileData:'replacement'}])assert.equal((await request(route,'PUT',body)).status,400);
 assert.equal((await request('/2/documents/'+doc,'PUT',rename)).status,404);
 const renamed=await request(route,'PUT',rename,3);assert.equal(renamed.status,200);assert.equal((await renamed.json()).title,newTitle);assert.deepEqual(await fileState(),originalFile);
 assert.equal((await request(route,'PUT',{title:'Stale write',previousTitle:oldTitle},3)).status,409);
 assert((await(await request('/1/documents','GET',undefined,3)).json()).every(d=>d.canRename===true));assert((await(await request('/1/documents','GET',undefined,2)).json()).every(d=>d.canRename===false));
 server.closeAllConnections();await new Promise(r=>server.close(r));server=start();await once(server,'listening');
 const refreshed=(await(await request('/1/documents','GET',undefined,2)).json()).find(d=>d.id===doc);assert.equal(refreshed.title,newTitle);assert.equal(refreshed.file_name,originalFile.file_name);
 const independent=new pg.Client({connectionString:database});await independent.connect();try{assert.equal((await independent.query('SELECT title FROM laboratory_documents WHERE id=$1',[doc])).rows[0].title,newTitle);}finally{await independent.end();}
 assert.deepEqual(await fileState(),originalFile);
 const large=Buffer.alloc(10*1024*1024+1,32);large.write('%PDF-');large.write('%%EOF',large.length-5);assert.equal((await request('/1/documents','POST',{...document,fileData:large.toString('base64')})).status,413);assert.equal((await request('/1/documents','POST',{...document,fileName:'bad.exe'})).status,400);
 assert.equal((await request('/1/email','POST',email,3)).status,409);assert.equal(sent.length,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM laboratory_emails')).rows[0].n,0);connected=true;
 assert.equal((await request('/1/email','POST',{...email,email:'other@example.invalid'},3)).status,409);assert.equal((await request('/1/email','POST',email,3)).status,200);assert.equal((await request('/1/email','POST',email,3)).status,200);assert.equal(sent.length,1);assert.equal(sent[0].email,'rep@example.invalid');assert.equal((await request('/1/email','POST',{...email,requestId:'00000000-0000-4000-8000-000000000002',contact:'laboratory',email:'lab@example.invalid'},3)).status,200);assert.equal(sent.length,2);
 server.closeAllConnections();await new Promise(r=>server.close(r));await db.query('DELETE FROM sessions WHERE user_id=3');await session(3);server=start();await once(server,'listening');const persisted=await request('/1/logo','GET',undefined,3);assert.deepEqual(Buffer.from(await persisted.arrayBuffer()),png);assert.equal((await(await request('/1/documents')).json()).length,2);
 assert.equal((await request('/1/documents/'+added[0],'DELETE',{},3)).status,200);assert.equal((await request('/1/documents/'+added[0]+'/file')).status,404);assert.equal((await(await request('/1/documents')).json()).length,1);assert.equal((await request('/1/documents/'+added[1]+'/file')).status,200);
 // Saving an older year's conditions must retain the current year and validity dates.
 const historicalSave={name:'Historique local',orderMode:'groupement',responsibleId:null,conditionsYear:calendarYear-1,conditions:'Correction de l’année antérieure',franco:'110 €',revision:1};
 const changed=await request('/3','PUT',historicalSave,3);assert.equal(changed.status,200);
 server.closeAllConnections();await new Promise(r=>server.close(r));server=start();await once(server,'listening');
 const historyAfter=(await(await request('')).json()).find(l=>l.id===3);assert.equal(historyAfter.conditionsYear,calendarYear-1);assert.deepEqual(historyAfter.conditionsHistory[calendarYear],currentHistory);assert.equal(historyAfter.conditionsHistory[calendarYear-1].validFrom,previousHistory.validFrom);assert.equal(historyAfter.conditionsHistory[calendarYear-1].validUntil,previousHistory.validUntil);assert.equal(laboratoryConditions(historyAfter,calendarYear+'-11-03T12:00:00Z').current.conditions,currentHistory.conditions);
 const persistedConditions=(await db.query('SELECT details FROM laboratories WHERE id=3')).rows[0].details;assert.deepEqual(persistedConditions.conditionsHistory[calendarYear],currentHistory);
 assert.deepEqual(await info(),before);assert.deepEqual(await protectedLab(),protectedBefore);
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
