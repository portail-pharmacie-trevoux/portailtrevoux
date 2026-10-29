// Verify the fictitious administrator's stored password hash without asking for or printing a password.
// This is a read-only precursor to the isolated HTTP login smoke test.
import pg from 'pg';
import {verifyPassword} from '../security.mjs';
const env=process.env;
if(env.SCALINGO_PREVIEW_SAFE_MODE!=='true'||env.SCALINGO_REQUIRE_DB_TLS!=='true')throw Error('Safe preview and verified TLS required');
if(env.SCALINGO_ENABLE_BUSINESS_STARTUP==='true'||env.SCALINGO_ENABLE_SCHEDULED_JOBS==='true')throw Error('Business processes must remain disabled');
if(!env.DATABASE_URL)throw Error('DATABASE_URL missing');
const u=new URL(env.DATABASE_URL);
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(key);
const db=new pg.Client({connectionString:u.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try{
 await db.connect();
 await db.query('BEGIN READ ONLY');
 const identity=(await db.query("SELECT current_database() AS database,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
 if(identity.database!=='portailplus_7495'||identity.tls!==true)throw Error('Unexpected database or TLS');
 const {rows}=await db.query('SELECT id,email,role,active,password_hash FROM users');
 if(rows.length!==1||rows[0].email!=='admin-test@portailplus.invalid'||rows[0].role!=='admin'||rows[0].active!==true)throw Error('Expected isolated fictitious administrator');
 const encoded=rows[0].password_hash;
 if(typeof encoded!=='string'||!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded))throw Error('Password hash format invalid');
 const wrongPasswordRejected=!(await verifyPassword('this-is-not-the-test-password',encoded));
 await db.query('ROLLBACK');
 console.log(JSON.stringify({status:wrongPasswordRejected?'ok':'review_required',database:identity.database,tls:true,administrator:'fictitious',hashFormat:'valid',wrongPasswordRejected,readOnly:true,previewSafeMode:true,actualPasswordNotRequested:true}));
 if(!wrongPasswordRejected)process.exitCode=1;
}catch(err){await db.query('ROLLBACK').catch(()=>{});console.error('Authentication precheck failed:',err.message);process.exitCode=1;}finally{await db.end().catch(()=>{});}
