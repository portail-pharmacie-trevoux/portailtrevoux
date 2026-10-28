// Read-only PostgreSQL TLS check using the same connection configuration as server.mjs.
// Run only inside Scalingo: node scripts/check-postgres-tls.mjs
import pg from 'pg';
const env=process.env;
if(env.SCALINGO_REQUIRE_DB_TLS!=='true')throw new Error('SCALINGO_REQUIRE_DB_TLS must be true for this test');
if(!env.DATABASE_URL)throw new Error('DATABASE_URL missing');
const databaseUrl=new URL(env.DATABASE_URL);
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])databaseUrl.searchParams.delete(key);
const client=new pg.Client({connectionString:databaseUrl.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try{
  await client.connect();
  const result=await client.query("SELECT current_setting('server_version') AS version, current_database() AS database, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls");
  const row=result.rows[0];
  if(!row.tls)throw new Error('Connection established without TLS');
  console.log(JSON.stringify({status:'ok',tls:true,certificateVerification:'enabled',version:row.version,database:row.database}));
}catch(err){
  console.error('Application TLS configuration test failed:',err.message);
  process.exitCode=1;
}finally{await client.end().catch(()=>{});}
