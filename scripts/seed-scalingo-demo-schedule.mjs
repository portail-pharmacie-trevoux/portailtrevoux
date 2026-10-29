// Seed one entirely fictitious draft schedule in isolated Scalingo staging only.
// Idempotent; refuses existing nonempty schedule data. No publication or emails.
import pg from 'pg';
import {validWeek,validateDay} from '../schedule.mjs';
const e=process.env;
if(e.SCALINGO_PREVIEW_SAFE_MODE!=='true'||e.SCALINGO_PREVIEW_UI_ENABLED!=='true'||e.SCALINGO_REQUIRE_DB_TLS!=='true'||e.SCALINGO_ENABLE_BUSINESS_STARTUP==='true'||e.SCALINGO_ENABLE_SCHEDULED_JOBS==='true'||e.APP_URL!=='https://portailplus-hds.osc-fr1.scalingo.io'||!e.DATABASE_URL)throw Error('Unsafe staging environment');
const week=validWeek('2026-11-02');
const profiles=['admin-test@portailplus.invalid','adjoint.demo@portailplus.invalid','preparateur.demo@portailplus.invalid','preparatrice.demo@portailplus.invalid','apprenti.demo@portailplus.invalid','rayonniste.demo@portailplus.invalid'];
const url=new URL(e.DATABASE_URL);for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(k);
const db=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
let transaction=false;
try{
 await db.connect();await db.query('BEGIN');transaction=true;await db.query('SELECT pg_advisory_xact_lock(20261028, 3)');
 const id=(await db.query("SELECT current_database() AS name,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
 if(id.name!=='portailplus_7495'||id.tls!==true)throw Error('Unexpected database or TLS disabled');
 const users=(await db.query('SELECT id,email FROM users')).rows;
 if(users.length!==6||users.some(u=>!profiles.includes(u.email)))throw Error('Only six fictitious accounts expected');
 const existing=(await db.query('SELECT week,draft,published FROM schedule_weeks')).rows;
 if(existing.some(r=>Object.keys(r.draft||{}).length||Object.keys(r.published||{}).length))throw Error('Nonempty schedule already exists; no changes');
 const row=existing.find(r=>String(r.week).slice(0,10)===week||new Date(r.week).toISOString().slice(0,10)===week);
 if(row){console.log(JSON.stringify({status:'already_present',week,entries:0,notOverwritten:true}));await db.query('ROLLBACK');transaction=false;}
 else{
 const days=['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07'];
 const entries={};
 for(const [i,email] of profiles.entries()){
  const user=users.find(u=>u.email===email);
  for(let d=0;d<days.length;d++){
   if(i===0||d===5&&i%2===0)continue;
   const slots=d===2?[['08:30','12:30']]:i%2?[['08:30','12:30'],['14:00','18:00']]:[['09:00','13:00'],['15:00','19:00']];
   const entry=validateDay({userId:user.id,day:days[d],kind:'travail',slots},week);
   entries[user.id+':'+days[d]]=entry;
  }
 }
 await db.query('INSERT INTO schedule_weeks(week,draft) VALUES($1::date,$2::jsonb)',[week,JSON.stringify(entries)]);
 await db.query('COMMIT');transaction=false;
 console.log(JSON.stringify({status:'ok',week,entries:Object.keys(entries).length,users:6,draftOnly:true,published:false,externalCalls:false,productionUntouched:true}));
 }
}catch(err){console.error('Demo schedule refused:',err.message);process.exitCode=1;}
finally{if(transaction)await db.query('ROLLBACK').catch(()=>{});await db.end().catch(()=>{});}
