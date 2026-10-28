// Create a single fictitious administrator in the isolated Scalingo staging database.
// Does not start the web app or send emails. Run only after checking empty staging DB.
import pg from 'pg';
import {hashPassword,token,universes} from '../security.mjs';
const env=process.env;
if(env.SCALINGO_PREVIEW_SAFE_MODE!=='true'||env.SCALINGO_REQUIRE_DB_TLS!=='true')throw Error('Safe preview and TLS are required');
if(env.SCALINGO_ENABLE_BUSINESS_STARTUP==='true'||env.SCALINGO_ENABLE_SCHEDULED_JOBS==='true')throw Error('Business jobs must remain disabled');
if(!env.DATABASE_URL)throw Error('DATABASE_URL missing');
const url=new URL(env.DATABASE_URL);
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
const client=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try{
 await client.connect();
 await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(20261028, 3)');
 const identity=(await client.query("SELECT current_database() AS database, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
 if(identity.database!=='portailplus_7495'||!identity.tls)throw Error('Wrong database or missing TLS');
 const counts=(await client.query("SELECT (SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM sessions) AS sessions")).rows[0];
 if(counts.users!==0||counts.sessions!==0)throw Error('Staging already has accounts or sessions; no changes made');
 const password=token();
 const email='admin-test@portailplus.invalid';
 const hash=await hashPassword(password);
 const result=await client.query("INSERT INTO users(name,first_name,last_name,job,email,password_hash,role,rights,must_change,active) VALUES($1,$2,$3,$4,$5,$6,'admin',$7::jsonb,FALSE,TRUE) RETURNING id",['Administrateur Test','Administrateur','Test','Compte fictif',email,hash,JSON.stringify(universes)]);
 await client.query('COMMIT');
 console.log(JSON.stringify({status:'ok',database:identity.database,userId:result.rows[0].id,email,password,previewSafeMode:true,mailSent:false,scheduledJobs:false,note:'Save this one-time displayed test password securely; it is not recoverable.'}));
}catch(err){
 await client.query('ROLLBACK').catch(()=>{});
 console.error('Staging admin creation failed:',err.message);
 process.exitCode=1;
}finally{await client.end().catch(()=>{});}
