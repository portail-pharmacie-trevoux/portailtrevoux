// Read-only inspection of password-hash readiness; never request or print credentials.
import pg from 'pg';
import {verifyPassword} from '../security.mjs';
const env=process.env;
if(env.SCALINGO_PREVIEW_SAFE_MODE!=='true'||env.SCALINGO_REQUIRE_DB_TLS!=='true')throw Error('Safe preview and verified TLS required');
if(env.SCALINGO_ENABLE_BUSINESS_STARTUP==='true'||env.SCALINGO_ENABLE_SCHEDULED_JOBS==='true')throw Error('Business processes must remain disabled');
if(!env.DATABASE_URL)throw Error('DATABASE_URL missing');
const url=new URL(env.DATABASE_URL);
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
const db=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try{
 await db.connect();
 await db.query('BEGIN READ ONLY');
 const identity=(await db.query("SELECT current_database() AS database,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
 if(identity.database!=='portailplus_7495'||identity.tls!==true)throw Error('Unexpected database or TLS');
 const {rows}=await db.query('SELECT id,email,role,active,password_hash FROM users');
 const active=rows.filter(row=>row.active);
 const hashes=active.filter(row=>typeof row.password_hash==='string'&&/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(row.password_hash));
 const malformed=active.length-hashes.length;
 const distinctEmails=new Set(rows.filter(row=>row.email).map(row=>row.email.trim().toLowerCase()));
 const emailCount=rows.filter(row=>row.email).length;
 const missingEmail=active.filter(row=>!row.email).length;
 const invalidRoles=rows.filter(row=>!['admin','employee'].includes(row.role)).length;
 // A deliberately incorrect password is tested against a single stored hash, without exposing it.
 const wrongPasswordRejected=hashes.length?!(await verifyPassword('this-is-not-the-test-password',hashes[0].password_hash)):null;
 const ok=malformed===0&&distinctEmails.size===emailCount&&missingEmail===0&&invalidRoles===0&&wrongPasswordRejected!==false;
 await db.query('ROLLBACK');
 console.log(JSON.stringify({status:ok?'ok':'review_required',database:identity.database,tls:true,totalUsers:rows.length,activeUsers:active.length,administrators:rows.filter(row=>row.role==='admin').length,activeHashesValid:hashes.length,malformedActiveHashes:malformed,duplicateEmails:emailCount-distinctEmails.size,activeWithoutEmail:missingEmail,invalidRoles,wrongPasswordRejected,readOnly:true,previewSafeMode:true,actualPasswordNotRequested:true,passwordContinuityVerified:false}));
 if(!ok)process.exitCode=1;
}catch(err){await db.query('ROLLBACK').catch(()=>{});console.error('Authentication precheck failed:',err.message);process.exitCode=1;}finally{await db.end().catch(()=>{});}
