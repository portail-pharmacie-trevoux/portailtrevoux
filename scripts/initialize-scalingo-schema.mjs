// One-shot schema initialization for an empty Scalingo staging database.
// No application startup, imports, emails, or scheduled jobs.
import pg from 'pg';
import {readFile} from 'node:fs/promises';

const env=process.env;
if(env.SCALINGO_PREVIEW_SAFE_MODE!=='true')throw new Error('Safe preview mode must remain enabled');
if(env.SCALINGO_REQUIRE_DB_TLS!=='true')throw new Error('Verified database TLS is required');
if(env.SCALINGO_ENABLE_BUSINESS_STARTUP==='true'||env.SCALINGO_ENABLE_SCHEDULED_JOBS==='true')throw new Error('Business tasks must remain disabled');
if(!env.DATABASE_URL)throw new Error('DATABASE_URL missing');
const url=new URL(env.DATABASE_URL);
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
const pool=new pg.Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:10000});
let client;
try{
  client=await pool.connect();
  const identity=(await client.query("SELECT current_database() AS database, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
  if(!identity.tls||identity.database!=='portailplus_7495')throw new Error('Unexpected database identity or TLS state');
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(20261028, 2)');
  const existing=await client.query("SELECT COUNT(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname='public'");
  if(existing.rows[0].count!==0)throw new Error('Refusing to modify nonempty public schema');
  await client.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
  await client.query('COMMIT');
  const result=await client.query("SELECT COUNT(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname='public'");
  console.log(JSON.stringify({status:'ok',database:identity.database,tls:true,publicTables:result.rows[0].count,imports:false,scheduledJobs:false}));
}catch(err){
  if(client)await client.query('ROLLBACK').catch(()=>{});
  console.error('Technical schema initialization failed:',err.message);
  process.exitCode=1;
}finally{
  if(client)client.release();
  await pool.end();
}
