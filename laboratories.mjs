import {validateProcedureFile} from './procedure-files.mjs';
import express from 'express';
const limits={conditions:4000,franco:1000,commercialName:160,commercialRole:160,commercialEmail:254,commercialPhone:50,commercialMobile:50,labAddress:500,labPhone:50,labEmail:254,labWebsite:500,orderEmail:254,customerNumber:100,notes:4000};
export function validateLaboratory(body,fail){
 if(!body||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>160)throw fail(400,'Renseignez le nom du laboratoire (160 caractères maximum).');
 if(!['pharmacie','groupement'].includes(body.orderMode))throw fail(400,'Choisissez Pharmacie ou Groupement.');
 const responsibleId=body.orderMode==='pharmacie'?Number(body.responsibleId):null;
 if(body.orderMode==='pharmacie'&&(!Number.isSafeInteger(responsibleId)||responsibleId<1))throw fail(400,'Choisissez le collaborateur responsable.');
 const details={};for(const [key,max] of Object.entries(limits)){const value=body[key]??'';if(typeof value!=='string'||value.trim().length>max)throw fail(400,'Champ trop long ou invalide : '+key);details[key]=value.trim();}
 for(const key of ['commercialEmail','labEmail','orderEmail'])if(details[key]&&!/^[^\s<>"\r\n]+@[^\s<>"\r\n]+\.[^\s<>"\r\n]+$/.test(details[key]))throw fail(400,'Adresse e-mail invalide.');
 if(details.labWebsite){try{const url=new URL(details.labWebsite);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error();}catch{throw fail(400,'Le site internet doit commencer par https:// ou http://.');}}
 const conditionsYear=body.conditionsYear==null||body.conditionsYear===''?null:Number(body.conditionsYear);if(conditionsYear!==null&&(!Number.isInteger(conditionsYear)||conditionsYear<2000||conditionsYear>2100))throw fail(400,'Choisissez une année civile entre 2000 et 2100.');details.conditionsYear=conditionsYear;
 return {name:body.name.trim(),orderMode:body.orderMode,responsibleId,details};
}
export function conditionsWithHistory(details,previous={}){const history={...(previous.conditionsHistory||{})};if(previous.conditions||previous.franco){const key=previous.conditionsYear?String(previous.conditionsYear):'non-datees';history[key]={year:previous.conditionsYear||null,conditions:previous.conditions||'',franco:previous.franco||''};}if(details.conditions||details.franco){const key=details.conditionsYear?String(details.conditionsYear):'non-datees';history[key]={year:details.conditionsYear,conditions:details.conditions,franco:details.franco};}return {...details,conditionsHistory:history};}
export function registerLaboratories({app,db,auth,ready,csrf,viewUniverse,fail,publish}){
 const access=viewUniverse('Laboratoires'),guard=[auth,ready,access,csrf];
 const rowSQL='SELECT l.id,l.name,l.order_mode,l.responsible_id,l.details,l.revision,l.logo_version,u.name AS responsible_name FROM laboratories l LEFT JOIN users u ON u.id=l.responsible_id';
 const clean=r=>({id:r.id,name:r.name,orderMode:r.order_mode,responsibleId:r.responsible_id,responsibleName:r.responsible_name,revision:r.revision,logoVersion:r.logo_version||0,...r.details});
 app.get('/api/laboratories',auth,ready,access,async(req,res)=>res.json((await db.query(rowSQL+' ORDER BY lower(l.name),l.id')).rows.map(clean)));
 app.get('/api/laboratories/responsibles',auth,ready,access,async(req,res)=>res.json((await db.query('SELECT id,name FROM users WHERE active=TRUE ORDER BY last_name,first_name,id')).rows));
 app.get('/api/laboratories/:id/logo',auth,ready,access,async(req,res)=>{
  const row=(await db.query('SELECT logo_type,logo_content FROM laboratories WHERE id=$1',[req.params.id])).rows[0];if(!row?.logo_content)throw fail(404,'Logo introuvable.');res.type(row.logo_type).send(row.logo_content);
 });
 app.post('/api/laboratories/:id/logo',...guard,express.json({limit:'3mb'}),async(req,res)=>{
  const raw=req.body?.fileData;if(typeof raw!=='string'||!raw||raw.length>2800000||! /^[A-Za-z0-9+/]+={0,2}$/.test(raw))throw fail(400,'Choisissez une image PNG, JPEG ou WebP de 2 Mo maximum.');
  const bytes=Buffer.from(raw,'base64');if(!bytes.length||bytes.length>2*1024*1024)throw fail(400,'Le logo doit peser au maximum 2 Mo.');
  let type;if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))type='image/png';else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)type='image/jpeg';else if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')type='image/webp';else throw fail(400,'Format du logo invalide : PNG, JPEG ou WebP attendu.');
  const row=(await db.query('UPDATE laboratories SET logo_content=$2,logo_type=$3,logo_version=logo_version+1,revision=revision+1,updated_at=now(),updated_by=$4 WHERE id=$1 AND revision=$5 RETURNING id',[req.params.id,bytes,type,req.auth.id,req.body.revision])).rows[0];if(!row)throw fail(409,'La fiche a changé. Actualisez-la avant de remplacer le logo.');res.json({ok:true});
 });
 app.delete('/api/laboratories/:id/logo',...guard,async(req,res)=>{const row=(await db.query('UPDATE laboratories SET logo_content=NULL,logo_type=NULL,logo_version=0,revision=revision+1,updated_at=now(),updated_by=$2 WHERE id=$1 AND revision=$3 RETURNING id',[req.params.id,req.auth.id,req.body.revision])).rows[0];if(!row)throw fail(409,'La fiche a changé. Actualisez-la.');res.json({ok:true});});
 app.get('/api/laboratories/:id/documents',auth,ready,access,async(req,res)=>res.json((await db.query('SELECT id,title,file_name,created_at FROM laboratory_documents WHERE laboratory_id=$1 ORDER BY created_at DESC,id DESC',[req.params.id])).rows));
 app.post('/api/laboratories/:id/documents',...guard,express.json({limit:'15mb'}),async(req,res)=>{
  if(!(await db.query('SELECT id FROM laboratories WHERE id=$1',[req.params.id])).rows[0])throw fail(404,'Laboratoire introuvable.');
  const file=validateProcedureFile(req.body,fail),title=req.body?.title;if(typeof title!=='string'||!title.trim()||title.trim().length>200)throw fail(400,'Renseignez un nom de document (200 caractères maximum).');
  const row=(await db.query('INSERT INTO laboratory_documents(laboratory_id,title,file_name,file_type,file_content,added_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,title,file_name,created_at',[req.params.id,title.trim(),file.fileName,file.fileType,file.bytes,req.auth.id])).rows[0];res.status(201).json(row);
 });
 app.get('/api/laboratories/:id/documents/:documentId/file',auth,ready,access,async(req,res)=>{
  const row=(await db.query('SELECT file_name,file_type,file_content FROM laboratory_documents WHERE laboratory_id=$1 AND id=$2',[req.params.id,req.params.documentId])).rows[0];if(!row)throw fail(404,'Document introuvable.');res.type(row.file_type).attachment(row.file_name).send(row.file_content);
 });
 app.delete('/api/laboratories/:id/documents/:documentId',...guard,async(req,res)=>{const row=(await db.query('DELETE FROM laboratory_documents WHERE laboratory_id=$1 AND id=$2 RETURNING id',[req.params.id,req.params.documentId])).rows[0];if(!row)throw fail(404,'Document introuvable.');res.json({ok:true});});
 async function validate(body){const data=validateLaboratory(body,fail);if(data.responsibleId&&!(await db.query('SELECT id FROM users WHERE id=$1 AND active=TRUE',[data.responsibleId])).rows[0])throw fail(400,'Le responsable doit être un collaborateur actif.');return data;}
 app.post('/api/laboratories',...guard,async(req,res)=>{const d=await validate(req.body);const row=(await db.query('INSERT INTO laboratories(name,order_mode,responsible_id,details,updated_by) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *',[d.name,d.orderMode,d.responsibleId,JSON.stringify(conditionsWithHistory(d.details)),req.auth.id])).rows[0];await publish('Laboratoires','Laboratoire ajouté : '+d.name);res.status(201).json(clean(row));});
 app.put('/api/laboratories/:id',...guard,async(req,res)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Laboratoire invalide.');const d=await validate(req.body);if(!Number.isSafeInteger(req.body.revision))throw fail(400,'Actualisez la fiche avant de la modifier.');const previous=(await db.query('SELECT id,details,revision FROM laboratories WHERE id=$1',[id])).rows[0];if(!previous||previous.revision!==req.body.revision)throw fail(409,'Cette fiche a changé. Rechargez-la.');const row=(await db.query('UPDATE laboratories SET name=$2,order_mode=$3,responsible_id=$4,details=$5::jsonb,updated_by=$6,updated_at=now(),revision=revision+1 WHERE id=$1 AND revision=$7 RETURNING *',[id,d.name,d.orderMode,d.responsibleId,JSON.stringify(conditionsWithHistory(d.details,previous.details)),req.auth.id,req.body.revision])).rows[0];if(!row)throw fail(409,'Cette fiche a changé. Revenez au répertoire et ouvrez sa version actuelle.');res.json(clean(row));});
}
