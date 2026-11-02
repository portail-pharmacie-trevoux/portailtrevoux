// Only mounted in Scalingo. Business references always block deletion, even
// where a foreign key would otherwise CASCADE or SET NULL.
const fail=(status,message)=>Object.assign(Error(message),{status});
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const table=r=>quote(r.schema_name)+'.'+quote(r.table_name);
const owned=new Set(['sessions.user_id','employee_details.user_id']);
const referenceKeys=['userId','user_id','collaboratorId','collaborator_id','employeeId','employee_id','ownerId','owner_id','responsibleId','responsible_id','operatorId','operator_id','actorId','actor_id','createdBy','created_by','updatedBy','updated_by','added_by','confirmed_by','by','userIds','user_ids','collaboratorIds','employeeIds','participants'];
const label=name=>name.startsWith('schedule_')?'Planning':name.startsWith('hr_')?'Ressources humaines':/challenge/.test(name)?'Challenges':name.startsWith('quality_')||name.startsWith('temperature_')?'Qualité':name.startsWith('leave_')?'Congés':/invitation/.test(name)?'Invitations':/message|publication/.test(name)?'Communication':'Autres données associées';
export async function ensureScalingoEmployeeDeletionAudit(db){
 const client=await db.connect();try{
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");
  await client.query('SELECT pg_advisory_xact_lock(783415)');
  await client.query(`CREATE TABLE IF NOT EXISTS scalingo_employee_deletion_audit(
   id BIGSERIAL PRIMARY KEY,deleted_user_id INTEGER NOT NULL,deleted_by INTEGER NOT NULL,
   deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),action TEXT NOT NULL CHECK(action='employee_deleted'),
   checks_version INTEGER NOT NULL DEFAULT 1
  )`);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
async function dependencyColumns(client){
 const foreign=(await client.query(`SELECT n.nspname AS schema_name,t.relname AS table_name,a.attname AS column_name,target.attname AS target_column
 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 CROSS JOIN LATERAL unnest(c.conkey,c.confkey) AS k(local_key,foreign_key)
 JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.local_key
 JOIN pg_attribute target ON target.attrelid=c.confrelid AND target.attnum=k.foreign_key
 WHERE c.contype='f' AND c.confrelid='public.users'::regclass`)).rows;
 const structured=(await client.query(`SELECT n.nspname AS schema_name,t.relname AS table_name,a.attname AS column_name,ty.typname AS data_type
 FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_type ty ON ty.oid=a.atttypid
 WHERE t.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
 AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
 AND t.relname NOT IN ('users','sessions','employee_details','scalingo_employee_deletion_audit')
 AND (ty.typname IN ('json','jsonb') OR (ty.typname IN ('int2','int4','int8') AND a.attname ~ '(^((user|collaborator|employee|responsible|owner|operator|actor)_id)$|_by$)'))`)).rows;
 return {foreign,structured};
}
export async function deleteScalingoEmployee({db,id,actorId}){
 const client=await db.connect();try{
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='15s'");
  await client.query('SELECT pg_advisory_xact_lock(783415)');
  await client.query('LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE');
  const columns=await dependencyColumns(client);
  // Stabilize referenced tables and the roster while testing dependencies and
  // deleting. This blocks concurrent writes rather than editing linked history.
  const tables=[...new Set(['"public"."users"',...columns.foreign.map(table),...columns.structured.map(table)])].sort();
  await client.query('LOCK TABLE '+tables.join(',')+' IN SHARE ROW EXCLUSIVE MODE');
  const person=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!person)throw fail(404,'Collaborateur introuvable.');
  if(person.role!=='employee'||person.id===actorId||person.email==='admin-test@portailplus.invalid')throw fail(403,'Compte administrateur protégé : suppression interdite.');
  if(person.active)throw fail(409,'Retirez d’abord ce collaborateur : seuls les collaborateurs inactifs peuvent être supprimés définitivement.');
  const blockers=new Set(),checked=new Set();
  for(const r of columns.foreign){
   if(r.schema_name==='public'&&owned.has(r.table_name+'.'+r.column_name))continue;
   const key=table(r)+'.'+r.column_name;checked.add(key);
   const value=person[r.target_column];if(value===null||value===undefined)continue;
   if((await client.query(`SELECT EXISTS(SELECT 1 FROM ${table(r)} WHERE ${quote(r.column_name)}=$1) AS found`,[value])).rows[0].found)blockers.add(label(r.table_name));
  }
  for(const r of columns.structured){
   if(checked.has(table(r)+'.'+r.column_name))continue;
   if(!['json','jsonb'].includes(r.data_type)){
    if((await client.query(`SELECT EXISTS(SELECT 1 FROM ${table(r)} WHERE ${quote(r.column_name)}=$1) AS found`,[id])).rows[0].found)blockers.add(label(r.table_name));
    continue;
   }
   const keys=[...referenceKeys];
   if(/challenge/.test(r.table_name)||['participants','analysis'].includes(r.column_name))keys.push('id');
   const predicate=keys.map(k=>`@.${k} == $id || @.${k} == $sid`).join(' || ');
   const path='lax $.** ? ('+predicate+')';
   const vars=JSON.stringify({id,sid:String(id)});
   if((await client.query(`SELECT EXISTS(SELECT 1 FROM ${table(r)} WHERE jsonb_path_exists(${quote(r.column_name)}::jsonb,$1::jsonpath,$2::jsonb)) AS found`,[path,vars])).rows[0].found)blockers.add(label(r.table_name));
   if(r.column_name==='participants'&&(await client.query(`SELECT EXISTS(SELECT 1 FROM ${table(r)} WHERE jsonb_path_exists(${quote(r.column_name)}::jsonb,'lax $[*] ? (@ == $id || @ == $sid)',$1::jsonb)) AS found`,[vars])).rows[0].found)blockers.add(label(r.table_name));
   if(/challenge/.test(r.table_name)&&(await client.query(`SELECT EXISTS(SELECT 1 FROM ${table(r)} WHERE jsonb_path_exists(${quote(r.column_name)}::jsonb,'lax $.** ? (@.type() == "object").keyvalue() ? (@.key == $sid)',$1::jsonb)) AS found`,[vars])).rows[0].found)blockers.add(label(r.table_name));
  }
  if(blockers.size)throw fail(409,'Suppression impossible : des données sont liées à cette fiche ('+[...blockers].sort().join(', ')+'). Les documents et historiques sont conservés ; gardez la fiche inactive.');
  await client.query("INSERT INTO scalingo_employee_deletion_audit(deleted_user_id,deleted_by,action) VALUES($1,$2,'employee_deleted')",[id,actorId]);
  // Only credentials/session state and this person's own private profile are
  // erased explicitly; no other cascade or history cleanup is permitted.
  await client.query('DELETE FROM sessions WHERE user_id=$1',[id]);
  await client.query('DELETE FROM employee_details WHERE user_id=$1',[id]);
  const result=await client.query("DELETE FROM users WHERE id=$1 AND active=FALSE AND role='employee' RETURNING id",[id]);
  if(!result.rows[0])throw fail(409,'Le statut a changé. Rechargez l’annuaire.');
  await client.query('COMMIT');return {ok:true};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});
  if(['23503','55P03','57014','40001','40P01'].includes(e.code))throw fail(409,'Suppression non effectuée : une dépendance ou une opération en cours empêche une suppression sûre. Conservez la fiche inactive et réessayez après vérification.');
  throw e;
 }finally{client.release();}
}
