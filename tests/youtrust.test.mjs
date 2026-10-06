import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {createYoutrust} from '../youtrust.mjs';
import {signatureSheet} from '../signature-sheet.mjs';
import {decrypt} from '../security.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status}),secret='s'.repeat(32),ids=Array.from({length:9},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
function harness(fetchImpl){const values=new Map();return {values,client:createYoutrust({getSetting:async k=>values.get(k),setSetting:async(k,v)=>values.set(k,v),deleteSetting:async k=>values.delete(k),secret,fail,fetchImpl})};}
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
test('Youtrust : clé vérifiée avant stockage, chiffrement, secret absent du statut et séparation des environnements',async()=>{
 const calls=[],{client,values}=harness(async(url,options)=>{calls.push({url,options});return response({data:[]});});
 await assert.rejects(()=>client.context(),e=>e.status===409);
 await client.configure({apiKey:'secret-key-example',environment:'demo'});
 assert.match(calls[0].url,/^https:\/\/api-sandbox.yousign.app\/v3\//);assert.equal(calls[0].options.headers.Authorization,'Bearer secret-key-example');assert.equal(calls[0].options.redirect,'error');
 const stored=values.get('youtrust_config');assert.ok(!stored.includes('secret-key-example'));assert.equal(decrypt(stored,secret).apiKey,'secret-key-example');
 assert.equal((await client.status()).connected,true);assert.ok(!JSON.stringify(await client.status()).includes('secret-key-example'));
 await assert.rejects(()=>client.configure({apiKey:'',environment:'production'}),e=>e.status===400);
 await client.configure({apiKey:'',environment:'demo'});assert.equal((await client.context()).environment,'demo');
 await client.disconnect();assert.equal((await client.status()).configured,false);
});
test('Youtrust : clé refusée ne remplace pas la configuration',async()=>{
 const {client,values}=harness(async()=>new Response('',{status:401}));await assert.rejects(()=>client.configure({apiKey:'invalid-key',environment:'production'}),e=>e.status===409);assert.equal(values.size,0);
});
test('feuilles : pages du document conservées, champs distincts pour chaque salarié et PDF compatible API',async()=>{
 const original=await PDFDocument.create();original.addPage();const source=await original.save();
 const result=await signatureSheet({original:source,title:'Charte numérique',hash:'a'.repeat(64),signers:Array.from({length:6},()=>({name:'Élodie Exemple'}))});
 const output=await PDFDocument.load(result.bytes);assert.equal(output.getPageCount(),3);assert.equal(result.fields[0].page,2);assert.equal(result.fields[4].page,3);assert.equal(new Set(result.fields.map(f=>f.page+':'+f.y)).size,6);assert.match(result.bytes.subarray(0,8).toString(),/%PDF-1.7/);
});
test('Youtrust : document complet et signature obligatoire par salarié, checkpoint avant activation et OTP e-mail',async()=>{
 const calls=[],saved=[],original=await PDFDocument.create();original.addPage();let signer=0;
 const {client}=harness(async(url,options)=>{
  calls.push({url,options});if(url.includes('?limit'))return response({data:[]});
  if(url.endsWith('/signature_requests'))return response({id:ids[0],status:'draft'});
  if(url.endsWith('/documents')){const file=options.body.get('file');assert.equal(options.body.get('nature'),'signable_document');assert.equal((await PDFDocument.load(await file.arrayBuffer())).getPageCount(),2);return response({id:ids[1]});}
  if(url.endsWith('/signers'))return response({id:ids[2+signer++]});
  if(url.endsWith('/activate')){assert.equal(saved.at(-1).recipients.length,2);return response({id:ids[0],status:'ongoing'});}throw Error('Unexpected '+url);
 });
 await client.configure({apiKey:'test-key-secret',environment:'production'});
 const result=await client.send({document:{file_type:'application/pdf',file_content:Buffer.from(await original.save()),title:'Charte',file_hash:'a'.repeat(64)},signers:[{userId:2,name:'Alice Exemple',email:'alice@example.com'},{userId:3,name:'Bob Exemple',email:'bob@example.com'}],requestId:ids[8],context:await client.context(),checkpoint:async state=>saved.push(state)});
 assert.equal(result.status,'sent');assert.equal(result.recipients[1].recipientId,ids[3]);assert.equal(saved[0].envelopeId,ids[0]);
 const creation=JSON.parse(calls.find(c=>c.url.endsWith('/signature_requests')).options.body);assert.equal(creation.delivery_mode,'email');assert.equal(creation.external_id,ids[8]);assert.equal(creation.ordered_signers,false);
 const bodies=calls.filter(c=>c.url.endsWith('/signers')).map(c=>JSON.parse(c.options.body));assert.equal(bodies[0].info.locale,'fr');assert.equal(bodies[0].signature_authentication_mode,'otp_email');assert.equal(bodies[0].fields[0].document_id,ids[1]);assert.equal(bodies[0].fields[0].page,2);assert.notEqual(bodies[0].fields[0].y,bodies[1].fields[0].y);
});
test('Youtrust : réponse perdue après activation, suivi par identifiant et signatures individuelles',async()=>{
 const original=await PDFDocument.create();original.addPage();let activation=false;
 const {client}=harness(async(url)=>{
  if(url.includes('?limit'))return response({data:[]});if(url.endsWith('/signature_requests'))return response({id:ids[0]});if(url.endsWith('/documents'))return response({id:ids[1]});if(url.endsWith('/signers'))return response({id:ids[2]});if(url.endsWith('/activate')){activation=true;throw Error('network');}
  if(url.endsWith('/'+ids[0]))return response({id:ids[0],status:'done',signers:[{id:ids[2],status:'signed',signed_at:'2026-10-06T12:00:00Z'}]});throw Error(url);
 });await client.configure({apiKey:'test-key-secret',environment:'demo'});
 await assert.rejects(async()=>client.send({document:{file_type:'application/pdf',file_content:Buffer.from(await original.save()),title:'Charte',file_hash:'a'.repeat(64)},signers:[{name:'Alice Exemple',email:'alice@example.com'}],requestId:ids[8],context:{apiKey:'test-key-secret',environment:'demo'}}),e=>e.uncertain===true);assert.equal(activation,true);
 const state=await client.inspect({id:ids[8],envelope_id:ids[0],environment:'demo'});assert.equal(state.status,'completed');assert.equal(state.recipients[0].status,'completed');
 await assert.rejects(()=>client.inspect({environment:'production'}),e=>e.status===409);
});
test('Youtrust : Word converti en PDF avant ajout des signatures, aucun envoi avant préparation complète',async()=>{
 const converted=await PDFDocument.create();converted.addPage();let uploads=0,deleted=false,activated=false;
 const {client}=harness(async(url,options)=>{
  if(url.includes('?limit'))return response({data:[]});if(url.endsWith('/signature_requests'))return response({id:ids[0]});
  if(url.endsWith('/documents')){uploads++;const file=options.body.get('file');if(uploads===1){assert.equal(file.name,'charte.docx');return response({id:ids[1]});}assert.equal(deleted,true);assert.equal((await PDFDocument.load(await file.arrayBuffer())).getPageCount(),2);return response({id:ids[4]});}
  if(url.includes('/documents/download'))return new Response(await converted.save(),{headers:{'Content-Type':'application/pdf'}});
  if(url.endsWith('/documents/'+ids[1])){assert.equal(options.method,'DELETE');deleted=true;return new Response(null,{status:204});}
  if(url.endsWith('/signers')){const field=JSON.parse(options.body).fields[0];assert.equal(field.document_id,ids[4]);assert.equal(field.page,2);return response({id:ids[2]});}
  if(url.endsWith('/activate')){activated=true;return response({status:'ongoing'});}throw Error(url);
 });await client.configure({apiKey:'test-key-secret',environment:'demo'});
 await client.send({document:{file_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',file_name:'charte.docx',file_content:Buffer.from('fake-word-upload'),title:'Charte',file_hash:'a'.repeat(64)},signers:[{name:'Alice Exemple',email:'alice@example.com'}],requestId:ids[8],context:await client.context()});assert.equal(uploads,2);assert.equal(activated,true);
});
