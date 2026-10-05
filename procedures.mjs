import { validateProcedureFile } from './procedure-files.mjs';

export function registerProcedures({app,db,auth,ready,csrf,viewUniverse,editUniverse,fail,publish,uploadParser}){
 const fields={category:100,title:200,description:1500,keywords:500,url:1000};
 const columns='id,category,title,description,keywords,url,created_at,file_name,file_type';
 function validate(body,storedUrl=null){
  const d={};
  for(const [k,max] of Object.entries(fields)){
   const v=k==='url'&&storedUrl!==null?storedUrl:body?.[k]??'';
   if(typeof v!=='string'||v.length>max)throw fail(400,'Champ invalide : '+k);
   d[k]=v.trim();
  }
  if(!d.title||!d.category||!d.url)throw fail(400,'Le titre, l’application et le lien sont obligatoires.');
  if(storedUrl===null){
   try{const u=new URL(d.url);if(u.protocol!=='https:'||!['drive.google.com','docs.google.com'].includes(u.hostname)||u.username||u.password)throw Error();}
   catch{throw fail(400,'Utilisez un lien HTTPS Google Drive ou Google Docs.');}
  }
  return d;
 }
 const guard=[auth,ready,editUniverse('Procédures'),csrf];
 app.get('/api/procedures',auth,ready,viewUniverse('Procédures'),async(req,res)=>res.json((await db.query('SELECT '+columns+' FROM procedure_documents WHERE active=TRUE ORDER BY lower(category),lower(title),id')).rows));
 app.post('/api/procedures/import',...guard,uploadParser,async(req,res)=>{
  const file=validateProcedureFile(req.body,fail);
  const d=validate(req.body,'uploaded');
  const row=(await db.query(`WITH next_id AS (SELECT nextval(pg_get_serial_sequence('procedure_documents','id')) AS id)
   INSERT INTO procedure_documents(id,category,title,description,keywords,url,file_name,file_type,file_content)
   SELECT id,$1,$2,$3,$4,'/api/procedures/'||id||'/file',$5,$6,$7 FROM next_id
   RETURNING ${columns}`,[d.category,d.title,d.description,d.keywords,file.fileName,file.fileType,file.bytes])).rows[0];
  await publish('Procédures','Document importé : '+d.title);
  res.status(201).json(row);
 });
 app.get('/api/procedures/:id/file',auth,ready,viewUniverse('Procédures'),async(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Document invalide.');
  const row=(await db.query('SELECT file_name,file_type,file_content FROM procedure_documents WHERE id=$1 AND active=TRUE AND file_content IS NOT NULL',[id])).rows[0];
  if(!row)throw fail(404,'Fichier introuvable.');
  res.type(row.file_type).attachment(row.file_name).send(row.file_content);
 });
 app.post('/api/procedures',...guard,async(req,res)=>{
  const d=validate(req.body);
  const row=(await db.query('INSERT INTO procedure_documents(category,title,description,keywords,url) VALUES($1,$2,$3,$4,$5) RETURNING '+columns,Object.keys(fields).map(k=>d[k]))).rows[0];
  await publish('Procédures','Document ajouté : '+d.title);
  res.status(201).json(row);
 });
 app.put('/api/procedures/:id',...guard,async(req,res)=>{
  const existing=(await db.query('SELECT url,file_name FROM procedure_documents WHERE id=$1 AND active=TRUE',[req.params.id])).rows[0];
  if(!existing)throw fail(404,'Document introuvable.');
  const d=validate(req.body,existing.file_name?existing.url:null);
  const row=(await db.query('UPDATE procedure_documents SET category=$1,title=$2,description=$3,keywords=$4,url=$5 WHERE id=$6 AND active=TRUE RETURNING '+columns,[...Object.keys(fields).map(k=>d[k]),req.params.id])).rows[0];
  if(!row)throw fail(404,'Document introuvable.');
  res.json(row);
 });
 app.delete('/api/procedures/:id',...guard,async(req,res)=>{const row=(await db.query('UPDATE procedure_documents SET active=FALSE WHERE id=$1 AND active=TRUE RETURNING id',[req.params.id])).rows[0];if(!row)throw fail(404,'Document introuvable.');res.json({ok:true});});
 app.post('/api/procedures/:id/restore',...guard,async(req,res)=>{const row=(await db.query('UPDATE procedure_documents SET active=TRUE WHERE id=$1 AND active=FALSE RETURNING id',[req.params.id])).rows[0];if(!row)throw fail(404,'Document introuvable.');res.json({ok:true});});
}
