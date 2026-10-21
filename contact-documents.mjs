import {createHash} from 'node:crypto';
import {validateProcedureFile} from './procedure-files.mjs';
export function registerContactDocuments({app,db,auth,ready,admin,csrf,viewUniverse,fail,uploadParser}){
 const read=[auth,ready,viewUniverse('Contacts utiles')],write=[...read,admin,csrf];
 const id=req=>{const n=Number(req.params.id);if(!Number.isSafeInteger(n)||n<1)throw fail(400,'Contact invalide.');return n;};
 const visible=async req=>{const contact=(await db.query('SELECT id,name,active FROM useful_contacts WHERE id=$1 AND (active=TRUE OR $2)',[id(req),req.auth.role==='admin'])).rows[0];if(!contact)throw fail(404,'Contact introuvable.');return contact;};
 app.get('/api/contacts/:id/documents',...read,async(req,res)=>{await visible(req);res.json((await db.query('SELECT id,title,file_name,file_type,octet_length(file_content) AS file_size,created_at FROM useful_contact_documents WHERE contact_id=$1 ORDER BY created_at DESC,id DESC',[id(req)])).rows);});
 app.post('/api/contacts/:id/documents',...write,uploadParser,async(req,res)=>{
  const contact=await visible(req);if(!contact.active)throw fail(409,'Restaurez ce contact avant d’ajouter un document.');const file=validateProcedureFile(req.body,fail);const title=(req.body.title??file.fileName);if(typeof title!=='string'||!title.trim()||title.trim().length>200)throw fail(400,'Renseignez un titre de 200 caractères maximum.');
  const row=(await db.query(`INSERT INTO useful_contact_documents(contact_id,title,file_name,file_type,file_content,sha256,created_by)
   SELECT id,$2,$3,$4,$5,$6,$7 FROM useful_contacts WHERE id=$1 AND active=TRUE
   ON CONFLICT(contact_id,sha256) DO NOTHING RETURNING id,title,file_name,file_type,octet_length(file_content) AS file_size,created_at`,[contact.id,title.trim(),file.fileName,file.fileType,file.bytes,createHash('sha256').update(file.bytes).digest('hex'),req.auth.id])).rows[0];if(!row)throw fail(409,'Ce fichier est déjà joint à ce contact, ou le contact vient d’être supprimé.');res.status(201).json(row);
 });
 app.get('/api/contacts/:id/documents/:documentId/file',...read,async(req,res)=>{
  await visible(req);const documentId=Number(req.params.documentId);if(!Number.isSafeInteger(documentId)||documentId<1)throw fail(400,'Document invalide.');const row=(await db.query('SELECT file_name,file_type,file_content FROM useful_contact_documents WHERE id=$1 AND contact_id=$2',[documentId,id(req)])).rows[0];if(!row)throw fail(404,'Document introuvable.');res.type(row.file_type).attachment(row.file_name).send(row.file_content);
 });
 app.delete('/api/contacts/:id/documents/:documentId',...write,async(req,res)=>{
  await visible(req);const documentId=Number(req.params.documentId);if(!Number.isSafeInteger(documentId)||documentId<1)throw fail(400,'Document invalide.');const row=(await db.query('DELETE FROM useful_contact_documents WHERE id=$1 AND contact_id=$2 RETURNING id',[documentId,id(req)])).rows[0];if(!row)throw fail(404,'Document introuvable.');res.json({ok:true});
 });
}
