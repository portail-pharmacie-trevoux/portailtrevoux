import {readFile} from 'node:fs/promises';

// The caller has already verified the Scalingo database name and TLS. Unlike
// server.mjs, the preview does not execute schema.sql during initialization.
export async function ensureScalingoTemperatureSchema(db){
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query('SELECT pg_advisory_xact_lock(783412)');
  const columns=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='temperature_comments'")).rows.map(r=>r.column_name);
  if(!columns.length)throw Error('Scalingo temperature_comments table missing; refusing to recreate data');
  const added=['validation','revision','updated_at','history'].filter(c=>!columns.includes(c));
  if(added.length)await client.query(await readFile(new URL('./scalingo-temperature-validation-schema.sql',import.meta.url),'utf8'));
  await client.query('COMMIT');return {added};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
