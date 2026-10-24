import {validateCallFollowUp} from './quality-progress.mjs';
import {exportQualityErrors} from './quality-errors-export.mjs';
import {errorTypes} from './public/quality-error-types.js';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function validateQualityError(b){
 const date=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(!date(b.identifiedDate)||!date(b.errorDate)||b.identifiedDate>day()||b.errorDate>b.identifiedDate)throw Object.assign(Error('Vérifiez les dates : l’erreur doit précéder ou correspondre à son identification, sans date future.'),{status:400});
 if(!errorTypes.includes(b.type)||!Number.isSafeInteger(b.responsibleId)||b.responsibleId<1||!Number.isInteger(b.severity)||b.severity<1||b.severity>4||typeof b.details!=='string'||!b.details.trim()||b.details.length>5000||typeof b.actions!=='string'||b.actions.length>5000)throw Object.assign(Error('Renseignez le type, le détail, le responsable et une gravité de 1 à 4.'),{status:400});
 return [b.identifiedDate,b.type,b.details.trim(),b.responsibleId,b.errorDate,b.actions.trim(),b.severity];
}
export function registerQualityErrors({app,db,auth,ready,csrf,viewUniverse,fail}){
 const read=[auth,ready,viewUniverse("Outils d'aide à la démarche qualité")],write=[...read,csrf];
 app.get('/api/quality/prescriber-calls',...read,async(req,res)=>res.json({today:day(),calls:(await db.query('SELECT * FROM quality_prescriber_calls ORDER BY call_date DESC,created_at DESC,id DESC')).rows.map(r=>({...r,can_edit:req.auth.role==='admin'||r.created_by===req.auth.id}))}));
 app.post('/api/quality/prescriber-calls',...write,async(req,res)=>{
  const b=req.body;if(typeof b?.callDate!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(b.callDate)||Number.isNaN(Date.parse(b.callDate))||new Date(b.callDate).toISOString().slice(0,10)!==b.callDate||b.callDate>day()||typeof b.prescriber!=='string'||!b.prescriber.trim()||b.prescriber.length>200||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>5000||typeof b.outcome!=='string'||b.outcome.length>5000||typeof b.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(b.requestId)||b.errorId!=null&&(!Number.isSafeInteger(b.errorId)||b.errorId<1))throw fail(400,'Vérifiez la date, le prescripteur et le motif de l’appel.');
  if(b.errorId!=null&&!(await db.query('SELECT id FROM quality_errors WHERE id=$1 AND doctor_notified_at IS NOT NULL',[b.errorId])).rows[0])throw fail(409,'Cette erreur a changé ou le médecin n’est plus indiqué comme prévenu. Rechargez le registre.');
  const follow=validateCallFollowUp(b);
  const row=(await db.query('INSERT INTO quality_prescriber_calls(request_id,error_id,call_date,prescriber,reason,outcome,created_by,operator_name,follow_up,follow_up_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(request_id) DO NOTHING RETURNING id',[b.requestId,b.errorId??null,b.callDate,b.prescriber.trim(),b.reason.trim(),b.outcome.trim(),req.auth.id,req.auth.name,follow.text,follow.due])).rows[0];if(!row)throw fail(409,'Cette déclaration a déjà été enregistrée. Consultez le registre des appels.');res.status(201).json(row);
 });
 app.put('/api/quality/prescriber-calls/:id',...write,async(req,res)=>{
  const b=req.body,n=Number(req.params.id),follow=validateCallFollowUp(b);
  if(!Number.isSafeInteger(n)||n<1||!Number.isSafeInteger(b.revision)||b.revision<1||typeof b.outcome!=='string'||b.outcome.length>5000)throw fail(400,'Résultat ou version de l’appel invalide.');
  const row=(await db.query(`UPDATE quality_prescriber_calls SET outcome=$2,follow_up=$3,follow_up_date=$4,follow_up_done_at=CASE WHEN $5::boolean THEN COALESCE(follow_up_done_at,now()) ELSE NULL END,follow_up_done_name=CASE WHEN $5::boolean THEN COALESCE(follow_up_done_name,$6) ELSE NULL END,updated_at=now(),updated_by_name=$6,revision=revision+1 WHERE id=$1 AND revision=$7 AND (created_by=$8 OR $9::boolean) RETURNING *`,[n,b.outcome.trim(),follow.text,follow.due,follow.done,req.auth.name,b.revision,req.auth.id,req.auth.role==='admin'])).rows[0];
  if(!row)throw fail(409,'Cet appel a changé ou sa modification est réservée au déclarant et aux administrateurs. Rechargez le registre.');res.json(row);
 });
 const id=req=>{const n=Number(req.params.id);if(!Number.isSafeInteger(n)||n<1)throw fail(400,'Erreur invalide.');return n;};
 app.get('/api/quality/errors',...read,async(req,res)=>{const rows=(await db.query('SELECT e.*, $1::boolean AS can_edit FROM quality_errors e ORDER BY e.identified_date DESC,e.created_at DESC,e.id DESC',[req.auth.role==='admin'])).rows;const people=(await db.query('SELECT id,name,active FROM users ORDER BY lower(name),id')).rows;res.json({isAdmin:req.auth.role==='admin',errors:rows,people,operatorName:req.auth.name,today:day()});});
 app.get('/api/quality/errors/export.xlsx',...read,async(req,res)=>{const rows=(await db.query('SELECT * FROM quality_errors ORDER BY identified_date DESC,created_at DESC,id DESC')).rows;res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('erreurs-delivrance-'+day()+'.xlsx').send(exportQualityErrors(rows));});
 app.post('/api/quality/errors',...write,async(req,res)=>{const v=validateQualityError(req.body);const row=(await db.query(`INSERT INTO quality_errors(identified_date,error_type,details,responsible_id,error_date,actions,severity,created_by,operator_name,responsible_name) SELECT $1,$2,$3,u.id,$5,$6,$7,$8,$9,u.name FROM users u WHERE u.id=$4 RETURNING *`,[...v,req.auth.id,req.auth.name])).rows[0];if(!row)throw fail(400,'Collaborateur introuvable.');res.json(row);});
 app.put('/api/quality/errors/:id',...write,async(req,res)=>{if(req.auth.role!=='admin')throw fail(403,'Modification réservée à l’administrateur.');const v=validateQualityError(req.body);if(!Number.isSafeInteger(req.body.revision)||req.body.revision<1)throw fail(400,'Version invalide.');const row=(await db.query(`UPDATE quality_errors e SET identified_date=$1,error_type=$2,details=$3,responsible_id=u.id,error_date=$5,actions=$6,severity=$7,responsible_name=u.name,revision=e.revision+1 FROM users u WHERE u.id=$4 AND e.id=$8 AND e.revision=$9 AND $10::boolean RETURNING e.*`,[...v,id(req),req.body.revision,req.auth.role==='admin'])).rows[0];if(!row)throw fail(409,'Modification non autorisée ou ligne modifiée. Rechargez le registre.');res.json(row);});
 app.delete('/api/quality/errors/:id',...write,async(req,res)=>{if(req.auth.role!=='admin')throw fail(403,'Suppression réservée à l’administrateur.');if(!Number.isSafeInteger(req.body.revision)||req.body.revision<1)throw fail(400,'Version invalide.');const row=(await db.query('DELETE FROM quality_errors WHERE id=$1 AND revision=$2 RETURNING id',[id(req),req.body.revision])).rows[0];if(!row)throw fail(409,'Cette ligne a changé. Rechargez le registre avant de la supprimer.');res.json({ok:true});});
 app.put('/api/quality/errors/:id/status',...write,async(req,res)=>{throw fail(409,'L’état est calculé automatiquement à partir des coches des actions correctives.');});
 app.put('/api/quality/errors/:id/notification',...write,async(req,res)=>{
  const b=req.body;if(!['operator','patient','doctor','corrected'].includes(b.target)||typeof b.checked!=='boolean'||!Number.isSafeInteger(b.revision)||b.revision<1)throw fail(400,'Validation invalide.');
  const field={operator:'operator_notified',patient:'patient_notified',doctor:'doctor_notified',corrected:'corrected'}[b.target];
  const corrected=b.target==='corrected'?'$2::boolean':'error_corrected';
  const patient=b.target==='patient'?'$2::boolean':'patient_notified_at IS NOT NULL';
  const doctor=b.target==='doctor'?'$2::boolean':'doctor_notified_at IS NOT NULL';
  const row=(await db.query(`WITH next_state AS (
   SELECT id,CASE WHEN ${corrected} THEN 'closed' WHEN (${patient}) OR (${doctor}) THEN 'in_progress' ELSE 'declared' END AS value
   FROM quality_errors WHERE id=$1 AND revision=$5
  ) UPDATE quality_errors e SET
   ${field}_at=CASE WHEN $2::boolean THEN COALESCE(${field}_at,now()) ELSE NULL END,
   ${field}_by=CASE WHEN $2::boolean THEN COALESCE(${field}_by,$3) ELSE NULL END,
   ${field}_name=CASE WHEN $2::boolean THEN COALESCE(${field}_name,$4) ELSE NULL END,
   error_corrected=${b.target==='corrected'?'$2::boolean':'e.error_corrected'},
   status_history=CASE WHEN status<>next_state.value THEN status_history||jsonb_build_array(jsonb_build_object('from',status,'to',next_state.value,'at',now(),'by',$4::text)) ELSE status_history END,
   status=next_state.value,revision=revision+1
   FROM next_state WHERE e.id=next_state.id AND e.id=$1 AND e.revision=$5 RETURNING e.*`,[id(req),b.checked,req.auth.id,req.auth.name,b.revision])).rows[0];
  if(!row)throw fail(409,'Cette ligne a changé. Rechargez le registre.');res.json(row);
 });
}
