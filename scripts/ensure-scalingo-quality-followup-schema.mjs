import {readFile} from 'node:fs/promises';
// Only called by the Scalingo preview after its database/TLS/administrator checks.
export async function ensureScalingoQualityFollowupSchema(db){
 const client=await db.connect();
 try{
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");
  await client.query('SELECT pg_advisory_xact_lock(783413)');
  const columns=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='quality_errors'")).rows.map(r=>r.column_name);
  for(const required of ['id','status','status_history','revision','actions','patient_notified_at','doctor_notified_at'])if(!columns.includes(required))throw Error('Scalingo quality_errors prerequisite missing: '+required);
  const added=['corrected_at','corrected_by','corrected_name','error_corrected','correction_note','correction_note_history'].filter(c=>!columns.includes(c));
  if(added.length)await client.query(await readFile(new URL('./scalingo-quality-followup-schema.sql',import.meta.url),'utf8'));
  await client.query('COMMIT');return {added};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
