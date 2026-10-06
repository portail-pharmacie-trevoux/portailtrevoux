import {createHash} from 'node:crypto';
import {validateProcedureFile} from './procedure-files.mjs';
import {invitationAddress} from './invitations.mjs';
import {uuidValid} from './youtrust.mjs';
const emailValid=value=>typeof value==='string'&&value.length<=254&&/^[^\s<>"\r\n]+@[^\s<>"\r\n]+\.[^\s<>"\r\n]+$/.test(value);
export function registerHRDocuments({app,db,auth,ready,admin,csrf,viewUniverse,fail,secret,publish,uploadParser,youtrust}){
 const access=viewUniverse('Ressources humaines'),guard=[auth,ready,admin,csrf];
 const documentId=value=>{const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Document invalide.');return id;};
 async function transaction(work){const client=db.connect?await db.connect():db;try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release?.();}}

 async function recipients(client=db){
  const people=(await client.query('SELECT id,name,email FROM users WHERE active=TRUE ORDER BY last_name,first_name,id')).rows;
  return Promise.all(people.map(async person=>({...person,email:await invitationAddress(client,person,secret)})));
 }
 app.get('/api/hr/documents',auth,ready,access,async(req,res)=>res.json((await db.query('SELECT id,title,file_name,file_type,created_at FROM hr_documents WHERE active=TRUE ORDER BY created_at DESC,id DESC')).rows));
 app.post('/api/hr/documents/import',...guard,uploadParser,async(req,res)=>{
  const file=validateProcedureFile(req.body,fail),title=req.body?.title;
  if(typeof title!=='string'||!title.trim()||title.trim().length>200)throw fail(400,'Renseignez un titre de 200 caractères maximum.');
  const {rows}=await db.query('INSERT INTO hr_documents(title,file_name,file_type,file_content,file_hash,added_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,title,file_name,file_type,created_at',[title.trim(),file.fileName,file.fileType,file.bytes,createHash('sha256').update(file.bytes).digest('hex'),req.auth.id]);
  await publish('Ressources humaines','Document importé : '+title.trim());res.status(201).json(rows[0]);
 });
 app.get('/api/hr/documents/:id/file',auth,ready,access,async(req,res)=>{
  const row=(await db.query('SELECT file_name,file_type,file_content FROM hr_documents WHERE id=$1 AND active=TRUE',[documentId(req.params.id)])).rows[0];
  if(!row)throw fail(404,'Document introuvable.');res.type(row.file_type);
  if(row.file_type==='application/pdf'&&req.query.view==='1')res.set('Content-Disposition',"inline; filename*=UTF-8''"+encodeURIComponent(row.file_name));else res.attachment(row.file_name);
  if(row.file_type==='application/pdf'&&req.query.view==='1')res.set('Content-Security-Policy',"default-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
  res.send(row.file_content);
 });
 app.patch('/api/hr/documents/:id',...guard,async(req,res)=>{
  const title=req.body?.title;if(typeof title!=='string'||!title.trim()||title.trim().length>200)throw fail(400,'Renseignez un nom de 200 caractères maximum.');
  const {rows}=await db.query('UPDATE hr_documents SET title=$2 WHERE id=$1 AND active=TRUE RETURNING id,title,file_name,file_type,created_at',[documentId(req.params.id),title.trim()]);
  if(!rows[0])throw fail(404,'Document introuvable.');res.json(rows[0]);
 });
 app.delete('/api/hr/documents/:id',...guard,async(req,res)=>{
  const {rows}=await db.query('UPDATE hr_documents SET active=FALSE,removed_at=now(),removed_by=$2 WHERE id=$1 AND active=TRUE RETURNING id',[documentId(req.params.id),req.auth.id]);
  if(!rows[0])throw fail(404,'Document introuvable.');res.json({ok:true});
 });
 app.get('/api/hr/signatories',auth,ready,admin,async(req,res)=>res.json(await recipients()));
 app.get('/api/hr/signatures',auth,ready,access,async(req,res)=>{
  if(req.auth.role==='admin'){
   const requests=(await db.query(`SELECT r.*,d.title FROM hr_signature_requests r JOIN hr_documents d ON d.id=r.document_id ORDER BY r.created_at DESC LIMIT 100`)).rows;
   // Only harmless request metadata leaves the server; never credentials or document bytes.
   res.json(requests.map(r=>({id:r.id,document_id:r.document_id,title:r.title,status:r.status,environment:r.environment,created_at:r.created_at,last_checked_at:r.last_checked_at,recipients:r.recipients,error:r.error||''})));return;
  }
  const {rows}=await db.query(`SELECT r.id,r.document_id,d.title,r.created_at,r.environment,r.status AS envelope_status,recipient.value->>'status' AS status
   FROM hr_signature_requests r JOIN hr_documents d ON d.id=r.document_id
   CROSS JOIN LATERAL jsonb_array_elements(r.recipients) recipient(value)
   WHERE (recipient.value->>'userId')::integer=$1 ORDER BY r.created_at DESC LIMIT 100`,[req.auth.id]);
  res.json(rows);
 });
 app.post('/api/hr/documents/:id/signatures',...guard,async(req,res)=>{
  const id=documentId(req.params.id),body=req.body;
  if(!uuidValid(body?.requestKey)||!Array.isArray(body?.recipients)||!body.recipients.length||body.recipients.length>100||body.recipients.some(p=>!Number.isSafeInteger(p?.id)||p.id<1||!emailValid(p.email)))throw fail(400,'Sélectionnez de 1 à 100 collaborateurs actifs avec une adresse e-mail valide.');
  const ids=body.recipients.map(p=>p.id);if(new Set(ids).size!==ids.length)throw fail(400,'Un collaborateur ne peut être sélectionné qu’une fois.');
  // Claim the request before calling Youtrust so an interrupted response cannot trigger a second send.
  const context=await youtrust.context();
  const claim=await transaction(async client=>{
   const document=(await client.query('SELECT * FROM hr_documents WHERE id=$1 AND active=TRUE FOR UPDATE',[id])).rows[0];if(!document)throw fail(404,'Document introuvable.');
   const existing=(await client.query('SELECT id,document_id,status FROM hr_signature_requests WHERE id=$1',[body.requestKey])).rows[0];
   if(existing){if(existing.document_id!==id)throw fail(409,'Cette demande appartient à un autre document.');return {existing};}
   const targets=(await client.query('SELECT id,name,email,first_name,last_name FROM users WHERE id=ANY($1::int[]) AND active=TRUE ORDER BY id FOR SHARE',[ids])).rows;
   if(targets.length!==ids.length)throw fail(409,'Un signataire n’est plus actif. Actualisez la liste.');
   const signers=[];for(const person of targets){const email=(await invitationAddress(client,person,secret)).trim().toLowerCase(),expected=body.recipients.find(p=>p.id===person.id).email.trim().toLowerCase();if(!emailValid(email)||email!==expected)throw fail(409,'L’adresse e-mail d’un signataire a changé. Actualisez la liste.');signers.push({userId:person.id,name:person.name,firstName:person.first_name,lastName:person.last_name,email,recipientId:String(signers.length+1),status:'created'});}
   const pending=(await client.query(`SELECT id FROM hr_signature_requests WHERE document_id=$1 AND status IN ('creating','sent','delivered','created','paused','uncertain')
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(recipients) recipient WHERE (recipient->>'userId')::int=ANY($2::int[]) AND recipient->>'status'<>'completed') LIMIT 1`,[id,ids])).rows[0];
   if(pending)throw fail(409,'Une demande de signature est déjà en cours pour un signataire sélectionné. Consultez le suivi avant un nouvel envoi.');
   await client.query(`INSERT INTO hr_signature_requests(id,document_id,account_id,base_uri,environment,recipients,created_by,status) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'creating')`,[body.requestKey,id,context.accountId,context.baseUri,context.environment,JSON.stringify(signers),req.auth.id]);
   return {document,signers};
  });
  if(claim.existing)return res.json({ok:true,id:claim.existing.id,status:claim.existing.status,existing:true});
  let sent;
  try{sent=await youtrust.send({document:claim.document,signers:claim.signers,requestId:body.requestKey,context,checkpoint:async state=>{
    const people=claim.signers.map(person=>state.recipients?.find(p=>p.userId===person.userId)||person);
    await db.query('UPDATE hr_signature_requests SET envelope_id=$2,recipients=$3::jsonb,updated_at=now() WHERE id=$1',[body.requestKey,state.envelopeId,JSON.stringify(people)]);
   }});}
  catch(e){const status=e.uncertain?'uncertain':'error';await db.query('UPDATE hr_signature_requests SET status=$2,error=$3,updated_at=now() WHERE id=$1',[body.requestKey,status,e.message]);throw e;}
  try{await db.query("UPDATE hr_signature_requests SET envelope_id=$2,status=$3,recipients=$4::jsonb,error='',updated_at=now() WHERE id=$1",[body.requestKey,sent.envelopeId,sent.status,JSON.stringify((sent.recipients||claim.signers).map(p=>({...p,status:'sent'})))]);}
  catch{throw fail(502,'Youtrust a accepté la demande, mais le suivi doit être actualisé. Ne renvoyez pas le document : utilisez « Actualiser le suivi ».');}
  res.status(201).json({ok:true,id:body.requestKey,status:sent.status,sent:claim.signers.length,environment:context.environment});
 });
 app.post('/api/hr/signatures/:id/refresh',...guard,async(req,res)=>{
  if(!uuidValid(req.params.id))throw fail(400,'Demande invalide.');
  // Convert abandoned sends to an explicit state that must be reconciled with Youtrust.
  await db.query("UPDATE hr_signature_requests SET status='uncertain',updated_at=now() WHERE id=$1 AND status='creating' AND updated_at<now()-interval '2 minutes'",[req.params.id]);
  const record=(await db.query('SELECT * FROM hr_signature_requests WHERE id=$1',[req.params.id])).rows[0];if(!record)throw fail(404,'Demande introuvable.');
  if(record.status==='creating')throw fail(409,'L’envoi est encore en cours. Patientez avant d’actualiser.');
  if(record.status==='error'&&!record.envelope_id)throw fail(409,'Cette demande a été refusée par Youtrust. Vous pouvez créer une nouvelle demande.');
  const allowed=(await db.query("UPDATE hr_signature_requests SET last_checked_at=now() WHERE id=$1 AND (last_checked_at IS NULL OR last_checked_at<now()-interval '15 minutes') RETURNING id",[record.id])).rows[0];
  if(!allowed)return res.json({ok:true,cached:true});
  let result;try{result=await youtrust.inspect(record);}catch(e){await db.query('UPDATE hr_signature_requests SET last_checked_at=NULL WHERE id=$1',[record.id]);throw e;}const validStatuses=['created','sent','delivered','completed','declined','voided','paused','expired'];
  if(!validStatuses.includes(result.status))throw fail(502,'Statut Youtrust non reconnu. Consultez la demande dans Youtrust.');
  const signers=record.recipients.map(p=>{const fresh=result.recipients.find(r=>r.recipientId===p.recipientId);return fresh?{...p,status:fresh.status,signedAt:fresh.signedAt}:p;});
  await db.query("UPDATE hr_signature_requests SET envelope_id=$2,status=$3,recipients=$4::jsonb,error='',updated_at=now() WHERE id=$1",[record.id,result.envelopeId,result.status,JSON.stringify(signers)]);res.json({ok:true});
 });
 app.get('/api/hr/signatures/:id/file',auth,ready,admin,async(req,res)=>{
  if(!uuidValid(req.params.id))throw fail(400,'Demande invalide.');const record=(await db.query('SELECT * FROM hr_signature_requests WHERE id=$1',[req.params.id])).rows[0];if(!record)throw fail(404,'Demande introuvable.');
  const bytes=await youtrust.signedFile(record);res.type('application/pdf').attachment('document-signe-'+record.id+'.pdf').send(bytes);
 });
 app.get('/api/youtrust/status',auth,ready,admin,async(req,res)=>res.json(await youtrust.status()));
 app.post('/api/youtrust/config',...guard,async(req,res)=>res.json(await youtrust.configure(req.body)));
 app.post('/api/youtrust/disconnect',...guard,async(req,res)=>res.json(await youtrust.disconnect()));
}
