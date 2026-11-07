// Read-only functional readiness check for a populated Scalingo preview database.
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
 if(identity.database!=='portailplus_7495'||identity.tls!==true)throw Error('Wrong database or TLS disabled');
 const users=(await db.query('SELECT id,email,role,active,must_change FROM users')).rows;
 const sessions=(await db.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n;
 const administrators=users.filter(row=>row.role==='admin');
 const employees=users.filter(row=>row.role==='employee');
 const testAdmins=administrators.filter(row=>row.email==='admin-test@portailplus.invalid');
 const emailList=users.filter(row=>row.email).map(row=>row.email.trim().toLowerCase());
 const duplicates=emailList.length-new Set(emailList).size;
 const invalidRoles=users.filter(row=>!['admin','employee'].includes(row.role)).length;
 const ok=duplicates===0&&invalidRoles===0&&testAdmins.length<=1&&administrators.every(row=>row.email&&row.active);
 await db.query('ROLLBACK');
 console.log(JSON.stringify({status:ok?'ok':'review_required',database:identity.database,tls:true,users:users.length,employees:employees.length,administrators:administrators.length,testAdministrators:testAdmins.length,duplicateEmails:duplicates,invalidRoles,activeAdministrators:administrators.filter(row=>row.active).length,sessions,previewSafeMode:true,scheduledJobs:false,readOnly:true,realAdminAccessVerified:false}));
 if(!ok)process.exitCode=1;
}catch(err){await db.query('ROLLBACK').catch(()=>{});console.error('Preflight failed:',err.message);process.exitCode=1;}finally{await db.end().catch(()=>{});}
