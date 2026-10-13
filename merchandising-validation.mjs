export async function canValidateMerchandising(db,user){
 if(user?.role==='admin')return true;if(!user?.id)return false;
 return !!(await db.query(`SELECT EXISTS(SELECT 1 FROM quality_services s JOIN users u ON u.id=s.collaborator_id WHERE u.id=$1 AND u.active=TRUE AND regexp_replace(lower(translate(s.service,'âàäéèêëîïôöùûüç','aaaeeeeiioouuuc')),'[^a-z]','','g') IN ('merch','merchandising')) AS allowed`,[user.id])).rows[0]?.allowed;
}
export const lockedMonthsSQL=`NOT EXISTS(SELECT 1 FROM jsonb_each(month_approvals) AS approval WHERE COALESCE((approval.value->>'validated')::boolean,FALSE) AND (COALESCE(months->>approval.key,'') IS DISTINCT FROM COALESCE(COALESCE($5::jsonb,months)->>approval.key,'') OR COALESCE(month_labs->>approval.key,'') IS DISTINCT FROM COALESCE(COALESCE($7::jsonb,month_labs)->>approval.key,'')))`;
export function registerMerchandisingValidation({app,db,auth,ready,csrf,view,fail,zoneCount}){
 app.put('/api/merchandising/:id/months/:month/validation',auth,ready,view,csrf,async(req,res)=>{
  if(!await canValidateMerchandising(db,req.auth))throw fail(403,'Validation réservée au référent Merchandising et aux administrateurs.');
  const id=Number(req.params.id),month=req.params.month,b=req.body;if(!Number.isInteger(id)||id<1||id>zoneCount||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||typeof b?.validated!=='boolean'||!Number.isInteger(b.revision)||b.revision<1)throw fail(400,'Zone, mois, validation ou version invalide.');
  const row=(await db.query(`WITH changed AS (
   UPDATE merchandising_zones SET month_approvals=jsonb_set(month_approvals,ARRAY[$2::text],COALESCE(month_approvals->$2,'{}'::jsonb)||jsonb_build_object('validated',$3::boolean)||CASE WHEN $3::boolean THEN jsonb_build_object('validatedAt',now(),'validatedBy',$5::text) ELSE jsonb_build_object('invalidatedAt',now(),'invalidatedBy',$5::text) END),revision=revision+1
   WHERE id=$1 AND revision=$4 AND COALESCE((month_approvals->$2->>'validated')::boolean,FALSE) IS DISTINCT FROM $3::boolean AND (NOT $3::boolean OR btrim(COALESCE(months->>$2,''))<>'')
   RETURNING id,name,comment,months,month_labs AS "monthLabs",month_approvals AS "monthApprovals",revision,number
  ), logged AS (
   INSERT INTO merchandising_validation_events(zone_id,month,action,operator_id,operator_name,offer,laboratory)
   SELECT id,$2,CASE WHEN $3::boolean THEN 'validated' ELSE 'invalidated' END,$6,$5,COALESCE(months->>$2,''),COALESCE("monthLabs"->>$2,'') FROM changed
   RETURNING id,month,action,created_at,operator_name
  ) SELECT changed.*,to_jsonb(logged) AS "validationEvent" FROM changed CROSS JOIN logged`,[id,month,b.validated,b.revision,req.auth.name,req.auth.id])).rows[0];
  if(!row)throw fail(409,'Case vide, état déjà modifié ou nouvelle version. Rechargez la fiche avant de valider ou d’invalider.');res.json(row);
 });
}
