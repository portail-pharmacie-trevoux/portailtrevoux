// Explicit, idempotent seed of five fictitious collaborators on isolated Scalingo DB.
// Never import real staff data. No invitations, mail, schedules or external calls.
import pg from 'pg';
import {hashPassword,token,universes} from '../security.mjs';
const e=process.env;
if(e.SCALINGO_PREVIEW_SAFE_MODE!=='true'||e.SCALINGO_PREVIEW_UI_ENABLED!=='true'||e.SCALINGO_REQUIRE_DB_TLS!=='true'||e.SCALINGO_ENABLE_BUSINESS_STARTUP==='true'||e.SCALINGO_ENABLE_SCHEDULED_JOBS==='true')throw Error('Staging safety flags not satisfied');
if(e.APP_URL!=='https://portailplus-hds.osc-fr1.scalingo.io'||!e.DATABASE_URL)throw Error('Staging identity not satisfied');
const profiles=[
 ['Claire','DEMO','Pharmacienne adjointe','adjoint.demo@portailplus.invalid'],
 ['Lucas','ESSAI','Préparateur','preparateur.demo@portailplus.invalid'],
 ['Emma','FICTIVE','Préparatrice','preparatrice.demo@portailplus.invalid'],
 ['Noah','EXEMPLE','Apprenti','apprenti.demo@portailplus.invalid'],
 ['Léa','SIMULATION','Rayonniste','rayonniste.demo@portailplus.invalid']
];
const url=new URL(e.DATABASE_URL);for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(k);
const db=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
let transaction=false;
try{
 await db.connect();await db.query('BEGIN');transaction=true;
 await db.query('SELECT pg_advisory_xact_lock(20261028, 3)');
 const id=(await db.query("SELECT current_database() AS name,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
 if(id.name!=='portailplus_7495'||id.tls!==true)throw Error('Wrong DB or missing TLS');
 const existing=(await db.query('SELECT email,role,active FROM users')).rows;
 const allowed=new Set(['admin-test@portailplus.invalid',...profiles.map(p=>p[3])]);
 if(existing.some(u=>!allowed.has(u.email)))throw Error('Unexpected account: abort');
 if(existing.filter(u=>u.role==='admin').length!==1||!existing.some(u=>u.email==='admin-test@portailplus.invalid'&&u.role==='admin'&&u.active))throw Error('Fictitious admin missing');
 const hash=await hashPassword(token());
 let created=0;
 for(const [first,last,job,email] of profiles){
   const old=existing.find(u=>u.email===email);
   if(old){if(old.role==='admin'||!old.active)throw Error('Demo account state unexpected');continue;}
   await db.query("INSERT INTO users(name,first_name,last_name,job,email,password_hash,role,rights,must_change,active) VALUES($1,$2,$3,$4,$5,$6,'employee',$7::jsonb,FALSE,TRUE)",[first+' '+last,first,last,job,email,hash,JSON.stringify(universes)]);
   created++;
 }
 await db.query('COMMIT');transaction=false;
 console.log(JSON.stringify({status:'ok',database:id.name,tls:true,created,existingDemo:profiles.length-created,totalExpectedAccounts:6,fictitiousOnly:true,mailSent:false,schedulesCreated:false}));
}catch(err){console.error('Fictitious collaborator seed refused:',err.message);process.exitCode=1;}
finally{if(transaction)await db.query('ROLLBACK').catch(()=>{});await db.end().catch(()=>{});}
