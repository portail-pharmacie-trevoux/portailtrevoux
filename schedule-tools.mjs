import {validDate} from './schedule.mjs';
const invalid=message=>Object.assign(Error(message),{status:400});
export const leaveTypes=['Congés payés','RTT','Récupération','Congé sans solde','Autre'];
export function validatePost(body){
 if(typeof body?.name!=='string'||!body.name.trim()||body.name.trim().length>100||typeof body.color!=='string'||!/^#[0-9a-f]{6}$/i.test(body.color))throw invalid('Renseignez un nom de poste (100 caractères maximum) et une couleur valide.');
 if(body.active!==undefined&&typeof body.active!=='boolean')throw invalid('Statut du poste invalide.');
 return {name:body.name.trim(),color:body.color.toLowerCase(),active:body.active??true};
}
export function validateLeave(body){
 if(!leaveTypes.includes(body?.leaveType))throw invalid('Choisissez le type de congé.');
 const start=validDate(body.startDate),end=validDate(body.endDate),parts=['full','morning','afternoon'];
 if(!parts.includes(body.startPart)||!parts.includes(body.endPart)||end<start||Date.parse(end)-Date.parse(start)>365*86400000)throw invalid('Vérifiez la période demandée (366 jours maximum).');
 if(start===end&&body.startPart!==body.endPart)throw invalid('Pour une seule date, choisissez la même journée ou demi-journée au début et à la fin.');
 if(typeof body.comment!=='string'||body.comment.length>1200)throw invalid('Commentaire limité à 1 200 caractères.');
 return {leaveType:body.leaveType,startDate:start,endDate:end,startPart:body.startPart,endPart:body.endPart,comment:body.comment.trim()};
}
export function registerScheduleTools({app,db,auth,ready,admin,csrf,canAccess,fail}){
 const access=(req,res,next)=>canAccess(req.auth,'Emplois du temps')?next():next(fail(403,'Accès refusé.')),read=[auth,ready,access],write=[...read,csrf],adminWrite=[...write,admin];
 const id=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw fail(400,'Identifiant invalide.');return n;};
 const revision=body=>{if(!Number.isSafeInteger(body?.revision)||body.revision<1)throw fail(400,'Actualisez les données.');return body.revision;};
 app.get('/api/schedule-posts',...read,async(req,res)=>res.json((await db.query('SELECT id,name,color,active,revision FROM schedule_posts ORDER BY name,id')).rows));
 app.post('/api/schedule-posts',...adminWrite,async(req,res)=>{const p=validatePost(req.body);res.status(201).json((await db.query('INSERT INTO schedule_posts(name,color,active) VALUES($1,$2,$3) RETURNING id,name,color,active,revision',[p.name,p.color,p.active])).rows[0]);});
 app.put('/api/schedule-posts/:id',...adminWrite,async(req,res)=>{const p=validatePost(req.body),r=revision(req.body);const row=(await db.query('UPDATE schedule_posts SET name=$2,color=$3,active=$4,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$5 RETURNING id,name,color,active,revision',[id(req.params.id),p.name,p.color,p.active,r])).rows[0];if(!row)throw fail(409,'Ce poste a changé. Rechargez la liste.');res.json(row);});
 app.delete('/api/schedule-posts/:id',...adminWrite,async(req,res)=>{const row=(await db.query('UPDATE schedule_posts SET active=FALSE,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$2 RETURNING id',[id(req.params.id),revision(req.body)])).rows[0];if(!row)throw fail(409,'Ce poste a changé. Rechargez la liste.');res.json({ok:true});});
 app.get('/api/leave-requests',...read,async(req,res)=>{
  const team=req.query.scope==='team';if(req.query.scope&&!['mine','team'].includes(req.query.scope))throw fail(400,'Vue invalide.');if(team&&req.auth.role!=='admin')throw fail(403,'Réservé aux administrateurs.');
  const rows=(await db.query(`SELECT l.id,l.user_id,u.name,l.leave_type,l.start_date::text,l.end_date::text,l.start_part,l.end_part,l.comment,l.status,l.revision,l.review_note,l.created_at,l.reviewed_at,r.name AS reviewer_name FROM leave_requests l JOIN users u ON u.id=l.user_id LEFT JOIN users r ON r.id=l.reviewed_by ${team?'':'WHERE l.user_id=$1'} ORDER BY l.created_at DESC,l.id DESC`,team?[]:[req.auth.id])).rows;res.json(rows);
 });
 app.post('/api/leave-requests',...write,async(req,res)=>{const l=validateLeave(req.body);try{const row=(await db.query('INSERT INTO leave_requests(user_id,leave_type,start_date,end_date,start_part,end_part,comment) VALUES($1,$2,$3::date,$4::date,$5,$6,$7) RETURNING id,status,revision',[req.auth.id,l.leaveType,l.startDate,l.endDate,l.startPart,l.endPart,l.comment])).rows[0];res.status(201).json(row);}catch(e){if(e.code==='23505')throw fail(409,'Cette demande est déjà en attente de validation.');throw e;}});
 app.post('/api/leave-requests/:id/cancel',...write,async(req,res)=>{const row=(await db.query("UPDATE leave_requests SET status='cancelled',revision=revision+1 WHERE id=$1 AND user_id=$2 AND revision=$3 AND status='pending' RETURNING id,status,revision",[id(req.params.id),req.auth.id,revision(req.body)])).rows[0];if(!row)throw fail(409,'La demande a changé ou ne peut plus être annulée.');res.json(row);});
 app.post('/api/leave-requests/:id/review',...adminWrite,async(req,res)=>{if(!['approved','refused'].includes(req.body?.status)||typeof req.body.note!=='string'||req.body.note.length>1200)throw fail(400,'Décision invalide.');const row=(await db.query("UPDATE leave_requests SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=now(),revision=revision+1 WHERE id=$1 AND revision=$5 AND status='pending' AND user_id<>$4 RETURNING id,status,revision",[id(req.params.id),req.body.status,req.body.note.trim(),req.auth.id,revision(req.body)])).rows[0];if(!row)throw fail(409,'La demande a changé, ou vous ne pouvez pas valider votre propre demande.');res.json(row);});
 return {validatePostIds:async(entry,previous={})=>{const ids=[...new Set((entry.postIds||[]).filter(x=>x!==null))];if(!ids.length)return;const rows=(await db.query('SELECT id,active FROM schedule_posts WHERE id=ANY($1::int[])',[ids])).rows;if(rows.length!==ids.length)throw fail(400,'Un poste sélectionné n’existe plus.');for(const row of rows)if(row.active===false&&(entry.postIds.filter(id=>id===row.id).length>(previous.postIds||[]).filter(id=>id===row.id).length))throw fail(400,'Ce poste est archivé. Choisissez un poste actif.');}};
}
