// Additive, Scalingo-only preparation; never run schema.sql or seed documents.
export async function ensureScalingoTrainingDocumentsSchema(db){
 const client=await db.connect();
 try{
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");
  await client.query('SELECT pg_advisory_xact_lock(783414)');
  const columns=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='training_documents'")).rows.map(r=>r.column_name);
  for(const required of ['id','category','title','file_name','file_type','file_content'])if(!columns.includes(required))throw Error('Scalingo training_documents prerequisite missing: '+required);
  const added=[];
  if(!columns.includes('removed_at')){await client.query('ALTER TABLE training_documents ADD COLUMN removed_at TIMESTAMPTZ');added.push('removed_at');}
  if(!columns.includes('removed_by')){await client.query('ALTER TABLE training_documents ADD COLUMN removed_by INTEGER REFERENCES users(id) ON DELETE SET NULL');added.push('removed_by');}
  await client.query('COMMIT');return {added};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
