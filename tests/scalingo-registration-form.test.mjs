import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {createApp} from '../server.mjs';
import {registerScalingoRegistrationForm,verifyScalingoRegistrationFormAsset,registrationFormSHA256} from '../scripts/scalingo-registration-form-preview.mjs';

test('PDF salarié Render inchangé : empreinte, quatre pages A4 lisibles et fichier complet',async()=>{
 const bytes=await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url));
 assert.deepEqual(await verifyScalingoRegistrationFormAsset(),{bytes:7164,sha256:registrationFormSHA256});
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'861595388186151d50d2c27011829402d55ea5ae03341995840a3c8482fb71a9');
 const pdf=await PDFDocument.load(bytes,{ignoreEncryption:false});assert.equal(pdf.getPageCount(),4);
 for(const page of pdf.getPages()){assert.ok(Math.abs(page.getWidth()-595.276)<1);assert.ok(Math.abs(page.getHeight()-841.89)<1);assert.ok(page.node.Contents());}
});
test('HTTP Scalingo : PDF en pièce jointe pour administrateur, autres méthodes/routes toujours bloquées',async t=>{
 let actor={id:1,role:'admin',active:true,must_change:false,csrf:'local'},queries=[];
 const db={query:async sql=>{queries.push(sql);assert.ok(sql.startsWith('SELECT s.id'),'Download must not write to database');return {rows:actor?[actor]:[]};}};
 const {app}=createApp(db,{origin:'https://portal.test',secret:'local-pdf-test-'.repeat(4)}),gate=express();
 registerScalingoRegistrationForm(gate,app);gate.use((req,res)=>res.status(403).json({error:'Fonction désactivée dans la prévisualisation.'}));
 const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port,path='/api/collaborateurs/registration-form',headers={cookie:'trevoux_session='+'a'.repeat(43)};
 assert.equal((await fetch(base+path)).status,401);
 actor.role='employee';actor.rights=['Collaborateurs'];actor.edit_rights=['Collaborateurs'];assert.equal((await fetch(base+path,{headers})).status,403);
 actor.role='admin';actor.must_change=true;assert.equal((await fetch(base+path,{headers})).status,403);actor.must_change=false;
 const source=await readFile(new URL('../assets/fiche-inscription-salarie.pdf',import.meta.url));
 for(let i=0;i<2;i++){
  const response=await fetch(base+path,{headers});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^application\/pdf/);assert.match(response.headers.get('content-disposition'),/attachment; filename="fiche-inscription-salarie.pdf"/);assert.equal(Number(response.headers.get('content-length')),source.length);assert.match(response.headers.get('cache-control'),/no-store/);
  const bytes=Buffer.from(await response.arrayBuffer());assert.deepEqual(bytes,source);assert.equal((await PDFDocument.load(bytes)).getPageCount(),4);
 }
 for(const [url,method]of [[path,'POST'],[path,'PUT'],[path,'DELETE'],[path,'HEAD'],[path+'/extra','GET'],['/api/collaborateurs/scan','POST'],['/assets/fiche-inscription-salarie.pdf','GET']])assert.equal((await fetch(base+url,{method,headers})).status,403);
 actor=null;assert.equal((await fetch(base+path,{headers})).status,401);assert.ok(queries.length>0);
});
