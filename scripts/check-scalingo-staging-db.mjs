// Read-only verification of the isolated Scalingo staging database.
import pg from 'pg';
const env=process.env;
if(env.SCALINGO_PREVIEW_SAFE_MODE!=='true')throw Error('Preview safe mode required');
if(env.SCALINGO_REQUIRE_DB_TLS!=='true')throw Error('TLS required');
if(!env.DATABASE_URL)throw Error('DATABASE_URL missing');
const url=new URL(env.DATABASE_URL);
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
const client=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try{
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const identity=(await client.query("SELECT current_database() AS database, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
  if(identity.database!=='portailplus_7495'||!identity.tls)throw Error('Unexpected database or TLS state');
  const tables=Number((await client.query("SELECT count(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname='public'")).rows[0].count);
  const required=(await client.query("SELECT to_regclass('public.users') AS users, to_regclass('public.sessions') AS sessions, to_regclass('public.settings') AS settings")).rows[0];
  if(!required.users||!required.sessions||!required.settings)throw Error('Required tables missing');
  const users=Number((await client.query('SELECT count(*)::int AS count FROM users')).rows[0].count);
  const sessions=Number((await client.query('SELECT count(*)::int AS count FROM sessions')).rows[0].count);
  await client.query('ROLLBACK');
  console.log(JSON.stringify({status:users===0&&sessions===0?'ok':'review_required',database:identity.database,tls:true,publicTables:tables,users,sessions,readOnly:true}));
}catch(error){
  await client.query('ROLLBACK').catch(()=>{});
  console.error('Staging database check failed:',error.message);
  process.exitCode=1;
}finally{await client.end().catch(()=>{});}
