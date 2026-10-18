import {validateProcedureFile} from './procedure-files.mjs';
export const maxMerchDocumentBytes=50*1024*1024;
export function validateMerchDocument(body,fail){
 if(!/\.(png|jpe?g)$/i.test(body?.fileName||''))return validateProcedureFile(body,fail,maxMerchDocumentBytes);
 const {fileName,fileData}=body;
 if(fileName.length>240||/[\x00-\x1f\x7f/\\]/.test(fileName)||typeof fileData!=='string'||!fileData||fileData.length>Math.ceil(maxMerchDocumentBytes/3)*4||fileData.length%4||! /^[A-Za-z0-9+/]+={0,2}$/.test(fileData))throw fail(400,'Choisissez un PDF, Word, PNG ou JPEG de 50 Mo maximum.');
 const bytes=Buffer.from(fileData,'base64'),png=/\.png$/i.test(fileName),valid=png?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!valid||!bytes.length||bytes.length>maxMerchDocumentBytes||bytes.toString('base64')!==fileData)throw fail(400,'Image invalide ou supérieure à 50 Mo.');
 return {fileName:fileName.trim(),fileType:png?'image/png':'image/jpeg',bytes};
}
export function registerMerchDocuments({app,db,auth,ready,csrf,viewUniverse,editUniverse,canModify,fail,uploadParser}){
 const universe="Outils d'aide au merchandising",read=[auth,ready,viewUniverse(universe)],write=[auth,ready,editUniverse(universe),csrf],columns='id,title,file_name,file_type,revision,created_at';
 const id=req=>{const n=Number(req.params.id);if(!Number.isSafeInteger(n)||n<1)throw fail(400,'Document invalide.');return n;};
 app.get('/api/merchandising/documents',...read,async(req,res)=>res.json({canEdit:canModify(req.auth,universe),documents:(await db.query('SELECT '+columns+' FROM merchandising_documents ORDER BY lower(title),id')).rows}));
 app.post('/api/merchandising/documents/import',...write,uploadParser,async(req,res)=>{const f=validateMerchDocument(req.body,fail),title=f.fileName.replace(/\.[^.]+$/,'').slice(0,200)||f.fileName;const row=(await db.query('INSERT INTO merchandising_documents(title,file_name,file_type,file_content,created_by) VALUES($1,$2,$3,$4,$5) RETURNING '+columns,[title,f.fileName,f.fileType,f.bytes,req.auth.id])).rows[0];res.status(201).json(row);});
 app.put('/api/merchandising/documents/:id',...write,async(req,res)=>{const b=req.body;if(typeof b.title!=='string'||!b.title.trim()||b.title.trim().length>200||!Number.isSafeInteger(b.revision))throw fail(400,'Indiquez un nom de 1 à 200 caractères.');const row=(await db.query('UPDATE merchandising_documents SET title=$1,revision=revision+1 WHERE id=$2 AND revision=$3 RETURNING '+columns,[b.title.trim(),id(req),b.revision])).rows[0];if(!row)throw fail(409,'Ce document a changé. Rechargez la page.');res.json(row);});
 app.get('/api/merchandising/documents/:id/file',...read,async(req,res)=>{const row=(await db.query('SELECT file_name,file_type,file_content FROM merchandising_documents WHERE id=$1',[id(req)])).rows[0];if(!row)throw fail(404,'Document introuvable.');res.set('Cache-Control','no-store');res.type(row.file_type).attachment(row.file_name).send(row.file_content);});
}
