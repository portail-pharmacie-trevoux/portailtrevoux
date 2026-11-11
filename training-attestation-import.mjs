import express from 'express';
import {createHash,randomUUID} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {validateEmployeeScan} from './employee-import.mjs';
import {readTrainingPDF,parseTrainingText} from './training-pdf-text.mjs';
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/[^a-z]+/).filter(Boolean).sort().join(' ');
export function validateTrainingFacts(body,fail,now=new Date()){
 const title=typeof body?.title==='string'?body.title.trim():'',kind=body?.kind,date=body?.date,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 if(!title||title.length>150||!['Classique','DPC'].includes(kind)||!/^20\d{2}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||date>today)throw fail(400,'Vérifiez l’intitulé (150 caractères maximum), le type et la date de fin de formation, qui ne doit pas être future.');
 return {title,kind,date};
}
export async function extractTrainingFacts(file,ownerName=''){
 if(file.fileType!=='application/pdf')return {name:'',title:'',date:'',kind:'',uncertain:true,notes:['Photo ou scan : renseignez les informations visibles sur votre attestation.']};
 return parseTrainingText(await readTrainingPDF(file.bytes),ownerName);
}
export function registerTrainingAttestationImport({app,db,auth,ready,csrf,viewUniverse,fail}){
 const guard=[auth,ready,viewUniverse("Outils d'aide à la démarche qualité"),csrf],busy=new Set();
 app.post('/api/quality/training/imports/analyze',...guard,express.json({limit:'15mb'}),async(req,res)=>{
  if(busy.has(req.auth.id))throw fail(429,'Une attestation est déjà en cours de lecture.');
  const file=validateEmployeeScan(req.body,fail),ownerId=req.auth.role==='admin'?Number(req.body.ownerId??req.auth.id):req.auth.id;
  if(req.auth.role!=='admin'&&req.body.ownerId!==undefined&&Number(req.body.ownerId)!==req.auth.id)throw fail(403,'Vous pouvez importer uniquement vos propres attestations.');
  busy.add(req.auth.id);try{
  const owner=(await db.query('SELECT id,name FROM users WHERE id=$1 AND active=TRUE',[ownerId])).rows[0];if(!owner)throw fail(400,'Choisissez un collaborateur actif.');
  const hash=createHash('sha256').update(file.bytes).digest('hex');
  if((await db.query("SELECT id FROM hr_documents WHERE active=TRUE AND scope='personal' AND owner_id=$1 AND file_hash=$2",[ownerId,hash])).rows.length)throw fail(409,'Cette attestation est déjà enregistrée dans les documents personnels.');
  if(file.fileType==='application/pdf'){try{const pdf=await PDFDocument.load(file.bytes);if(pdf.getPageCount()>20)throw Error();}catch{throw fail(400,'Choisissez un PDF lisible, non protégé, de 20 pages maximum.');}}
  if(Number((await db.query("SELECT count(*) AS count FROM training_attestation_reads WHERE user_id=$1 AND requested_at>now()-interval '1 hour'",[req.auth.id])).rows[0].count)>=20)throw fail(429,'Limite de 20 lectures par heure atteinte. Réessayez plus tard.');
   let proposal={name:'',title:'',date:'',kind:'',uncertain:true,notes:[]};
   await db.query('INSERT INTO training_attestation_reads(user_id) VALUES($1)',[req.auth.id]);
   try{proposal=await extractTrainingFacts(file,owner.name);}catch{proposal.notes.push('Lecture locale indisponible : renseignez les informations à partir du document.');}
   if(proposal.isAttestation===false)throw fail(400,'Ce document ne semble pas être une attestation de formation réalisée. Vérifiez le fichier sélectionné.');
   if(!proposal.name||normalize(proposal.name)!==normalize(owner.name))proposal.notes.push('Vérifiez que le bénéficiaire du document est bien '+owner.name+'.');
   const id=randomUUID();await db.query('INSERT INTO training_attestation_imports(id,owner_id,added_by,file_name,file_type,file_content,file_hash,proposal) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[id,ownerId,req.auth.id,file.fileName,file.fileType,file.bytes,hash,JSON.stringify(proposal)]);
   res.status(201).json({id,ownerId,ownerName:owner.name,fileName:file.fileName,proposal});
  }finally{busy.delete(req.auth.id);}
 });
 app.post('/api/quality/training/imports/:id/confirm',...guard,async(req,res)=>{
  if(!/^[a-f0-9-]{36}$/i.test(req.params.id))throw fail(400,'Import invalide.');
  const facts=validateTrainingFacts(req.body,fail);if(req.body.identityConfirmed!==true)throw fail(400,'Confirmez le bénéficiaire et les informations de l’attestation.');
  const client=await db.connect();try{
   await client.query('BEGIN');const draft=(await client.query('SELECT * FROM training_attestation_imports WHERE id=$1 AND added_by=$2 AND expires_at>now() FOR UPDATE',[req.params.id,req.auth.id])).rows[0];
   if(!draft)throw fail(404,'Cet import est indisponible ou a expiré. Sélectionnez à nouveau le document.');
   if(req.auth.role!=='admin'&&draft.owner_id!==req.auth.id)throw fail(403,'Vous pouvez importer uniquement vos propres attestations.');
   if(!(await client.query('SELECT id FROM users WHERE id=$1 AND active=TRUE FOR SHARE',[draft.owner_id])).rows.length)throw fail(409,'Le collaborateur n’est plus actif.');
   await client.query('SELECT pg_advisory_xact_lock(78451026,$1::int)',[draft.owner_id]);
   const existing=(await client.query("SELECT id FROM hr_documents WHERE active=TRUE AND scope='personal' AND owner_id=$1 AND file_hash=$2",[draft.owner_id,draft.file_hash])).rows[0];
   let id=existing?.id;if(!id){const title='Attestation '+(facts.kind==='DPC'?'DPC':'de formation')+' — '+facts.title+' — '+facts.date.split('-').reverse().join('/');
    id=(await client.query("INSERT INTO hr_documents(title,file_name,file_type,file_content,file_hash,added_by,scope,owner_id,training_title,training_date,training_kind,training_verified_by,training_verified_at) VALUES($1,$2,$3,$4,$5,$6,'personal',$7,$8,$9::date,$10,$6,now()) RETURNING id",[title,draft.file_name,draft.file_type,draft.file_content,draft.file_hash,req.auth.id,draft.owner_id,facts.title,facts.date,facts.kind])).rows[0].id;
   }
   await client.query('DELETE FROM training_attestation_imports WHERE id=$1',[req.params.id]);await client.query('COMMIT');res.status(existing?200:201).json({id,date:facts.date,ownerId:draft.owner_id,alreadyExists:!!existing});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 });
}
