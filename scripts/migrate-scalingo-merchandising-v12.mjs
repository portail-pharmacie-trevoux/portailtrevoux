// One-time schema-only upgrade for isolated Scalingo preview. No production data.
import pg from 'pg';
import {readFile} from 'node:fs/promises';
const env=process.env;
if(env.SCALINGO_PREVIEW_SAFE_MODE!=='true'||env.SCALINGO_PREVIEW_UI_ENABLED!=='true'||env.SCALINGO_REQUIRE_DB_TLS!=='true')throw Error('Safe preview flags required');
if(env.SCALINGO_ENABLE_BUSINESS_STARTUP==='true'||env.SCALINGO_ENABLE_SCHEDULED_JOBS==='true')throw Error('Business startup or jobs must stay disabled');
if(env.APP_URL!=='https://portailplus-hds.osc-fr1.scalingo.io'||!env.DATABASE_URL)throw Error('Unexpected staging configuration');
const url=new URL(env.DATABASE_URL);
for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(k);
const pool=new pg.Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true},max:1});
let c;
try{
 c=await pool.connect();
 const identity=(await c.query("SELECT current_database() AS name,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
 if(identity.name!=='portailplus_7495'||identity.tls!==true)throw Error('Unexpected database identity or TLS');
 const users=(await c.query('SELECT email,role,active FROM users')).rows;
 const allow=new Set(['admin-test@portailplus.invalid','adjoint.demo@portailplus.invalid','preparateur.demo@portailplus.invalid','preparatrice.demo@portailplus.invalid','apprenti.demo@portailplus.invalid','rayonniste.demo@portailplus.invalid']);
 if(users.length<1||users.length>6||users.some(u=>!allow.has(u.email)||!u.active)||users.filter(u=>u.role==='admin').length!==1||!users.some(u=>u.email==='admin-test@portailplus.invalid'&&u.role==='admin'))throw Error('Unexpected staging accounts');
 await c.query('BEGIN');
 await c.query('SELECT pg_advisory_xact_lock(20261029,12)');
 await c.query(await readFile(new URL('./scalingo-merchandising-v12-schema.sql',import.meta.url),'utf8'));
 await c.query('COMMIT');
 const count=(await c.query('SELECT COUNT(*)::int AS count FROM merchandising_promotions')).rows[0].count;
 console.log(JSON.stringify({status:'ok',database:identity.name,tls:true,merchandisingVersion:'1.2',existingPromotions:count,importedBusinessData:false,productionUntouched:true}));
}catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});console.error('Staging schema migration failed:',e.message);process.exitCode=1;}finally{if(c)c.release();await pool.end();}
