// Read-only PostgreSQL TLS check for Scalingo one-off execution.
// Run only inside the Scalingo application network: node scripts/check-postgres-tls.mjs
import pg from 'pg';
const url = process.env.SCALINGO_POSTGRESQL_URL || process.env.DATABASE_URL;
if (!url) throw new Error('Missing database connection URL');
const client = new pg.Client({connectionString:url,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try {
  await client.connect();
  const result=await client.query('SELECT current_setting(\'server_version\') AS version, current_database() AS database, (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS tls');
  const row=result.rows[0];
  if(!row.tls) throw new Error('Connection established without TLS');
  console.log(JSON.stringify({status:'ok',tls:true,version:row.version,database:row.database}));
} catch (err) {
  console.error('TLS connection test failed:',err.message);
  process.exitCode=1;
} finally {
  await client.end().catch(()=>{});
}
