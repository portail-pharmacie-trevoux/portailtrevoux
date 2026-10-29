// Read-only preflight for isolated Scalingo functional testing.
import pg from 'pg';
const env=process.env;
if(env.SCALINGO_PREVIEW_SAFE_MODE!=='true'||env.SCALINGO_REQUIRE_DB_TLS!=='true')throw Error('Safe preview and TLS required');
if(env.SCALINGO_ENABLE_BUSINESS_STARTUP==='true'||env.SCALINGO_ENABLE_SCHEDULED_JOBS==='true')throw Error('Background actions must remain disabled');
if(!env.DATABASE_URL)throw Error('DATABASE_URL missing');
const url=new URL(env.DATABASE_URL);
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
const db=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try{
 await db.connect();
 await db.query('BEGIN READ ONLY');
 const identity=(await db.query("SELECT current_database() AS database,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
 if(identity.database!=='portailplus_7495'||!identity.tls)throw Error('Wrong database or TLS disabled');
 const users=(await db.query('SELECT id,email,role,active,must_change FROM users')).rows;
 const sessions=(await db.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n;
 const ok=users.length===1&&users[0].email==='admin-test@portailplus.invalid'&&users[0].role==='admin'&&users[0].active===true&&sessions===0;
 console.log(JSON.stringify({status:ok?'ok':'review_required',database:identity.database,tls:true,fictitiousAdminOnly:users.length===1&&users[0]?.email==='admin-test@portailplus.invalid',adminActive:users.length===1&&users[0]?.active===true,sessions,previewSafeMode:true,scheduledJobs:false,readOnly:true}));
 await db.query('ROLLBACK');
 if(!ok)process.exitCode=1;
}catch(err){await db.query('ROLLBACK').catch(()=>{});console.error('Preflight failed:',err.message);process.exitCode=1;}finally{await db.end().catch(()=>{});}
