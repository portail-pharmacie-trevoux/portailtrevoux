const limits={conditions:4000,franco:1000,commercialName:160,commercialRole:160,commercialEmail:254,commercialPhone:50,commercialMobile:50,labAddress:500,labPhone:50,labEmail:254,labWebsite:500,orderEmail:254,customerNumber:100,notes:4000};
export function validateLaboratory(body,fail){
 if(!body||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>160)throw fail(400,'Renseignez le nom du laboratoire (160 caractères maximum).');
 if(!['pharmacie','groupement'].includes(body.orderMode))throw fail(400,'Choisissez Pharmacie ou Groupement.');
 const responsibleId=body.orderMode==='pharmacie'?Number(body.responsibleId):null;
 if(body.orderMode==='pharmacie'&&(!Number.isSafeInteger(responsibleId)||responsibleId<1))throw fail(400,'Choisissez le collaborateur responsable.');
 const details={};for(const [key,max] of Object.entries(limits)){const value=body[key]??'';if(typeof value!=='string'||value.trim().length>max)throw fail(400,'Champ trop long ou invalide : '+key);details[key]=value.trim();}
 for(const key of ['commercialEmail','labEmail','orderEmail'])if(details[key]&&!/^[^\s<>"\r\n]+@[^\s<>"\r\n]+\.[^\s<>"\r\n]+$/.test(details[key]))throw fail(400,'Adresse e-mail invalide.');
 if(details.labWebsite){try{const url=new URL(details.labWebsite);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error();}catch{throw fail(400,'Le site internet doit commencer par https:// ou http://.');}}
 return {name:body.name.trim(),orderMode:body.orderMode,responsibleId,details};
}
export function registerLaboratories({app,db,auth,ready,csrf,viewUniverse,fail,publish}){
 const access=viewUniverse('Laboratoires'),guard=[auth,ready,access,csrf];
 const rowSQL='SELECT l.*,u.name AS responsible_name FROM laboratories l LEFT JOIN users u ON u.id=l.responsible_id';
 const clean=r=>({id:r.id,name:r.name,orderMode:r.order_mode,responsibleId:r.responsible_id,responsibleName:r.responsible_name,revision:r.revision,...r.details});
 app.get('/api/laboratories',auth,ready,access,async(req,res)=>res.json((await db.query(rowSQL+' ORDER BY lower(l.name),l.id')).rows.map(clean)));
 app.get('/api/laboratories/responsibles',auth,ready,access,async(req,res)=>res.json((await db.query('SELECT id,name FROM users WHERE active=TRUE ORDER BY last_name,first_name,id')).rows));
 async function validate(body){const data=validateLaboratory(body,fail);if(data.responsibleId&&!(await db.query('SELECT id FROM users WHERE id=$1 AND active=TRUE',[data.responsibleId])).rows[0])throw fail(400,'Le responsable doit être un collaborateur actif.');return data;}
 app.post('/api/laboratories',...guard,async(req,res)=>{const d=await validate(req.body);const row=(await db.query('INSERT INTO laboratories(name,order_mode,responsible_id,details,updated_by) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *',[d.name,d.orderMode,d.responsibleId,JSON.stringify(d.details),req.auth.id])).rows[0];await publish('Laboratoires','Laboratoire ajouté : '+d.name);res.status(201).json(clean(row));});
 app.put('/api/laboratories/:id',...guard,async(req,res)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Laboratoire invalide.');const d=await validate(req.body);if(!Number.isSafeInteger(req.body.revision))throw fail(400,'Actualisez la fiche avant de la modifier.');const row=(await db.query('UPDATE laboratories SET name=$2,order_mode=$3,responsible_id=$4,details=$5::jsonb,updated_by=$6,updated_at=now(),revision=revision+1 WHERE id=$1 AND revision=$7 RETURNING *',[id,d.name,d.orderMode,d.responsibleId,JSON.stringify(d.details),req.auth.id,req.body.revision])).rows[0];if(!row)throw fail(409,'Cette fiche a changé. Revenez au répertoire et ouvrez sa version actuelle.');res.json(clean(row));});
}
