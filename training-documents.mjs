import {validateProcedureFile} from './procedure-files.mjs';
export function registerTrainingDocuments({app,db,auth,ready,csrf,viewUniverse,editUniverse,fail,publish,uploadParser}){
 const read=[auth,ready,viewUniverse('Formations')],write=[auth,ready,editUniverse('Formations'),csrf];
 const columns='id,category,title,file_name,file_type,created_at';
 const id=req=>{const n=Number(req.params.id);if(!Number.isSafeInteger(n)||n<1)throw fail(400,'Document invalide.');return n;};
 app.get('/api/training/documents',...read,async(req,res)=>res.json((await db.query('SELECT '+columns+' FROM training_documents ORDER BY lower(title),id')).rows));
 app.post('/api/training/documents/import',...write,uploadParser,async(req,res)=>{if(!['reference','training'].includes(req.body?.category))throw fail(400,'Catégorie invalide.');const file=validateProcedureFile(req.body,fail),title=file.fileName.replace(/\.(pdf|docx)$/i,'');const row=(await db.query('INSERT INTO training_documents(category,title,file_name,file_type,file_content,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING '+columns,[req.body.category,title,file.fileName,file.fileType,file.bytes,req.auth.id])).rows[0];await publish('Formations','Document ajouté : '+title);res.status(201).json(row);});
 app.get('/api/training/documents/:id/file',...read,async(req,res)=>{const row=(await db.query('SELECT file_name,file_type,file_content FROM training_documents WHERE id=$1',[id(req)])).rows[0];if(!row)throw fail(404,'Document introuvable.');res.type(row.file_type).attachment(row.file_name).send(row.file_content);});
}
