// Explicit operator action, never run automatically on app startup.
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {backupReady} from './scalingo-universal-rights.mjs';
const env=process.env;
if(env.APP_URL!=='https://portailplus-hds.osc-fr1.scalingo.io'||env.SCALINGO_PREVIEW_SAFE_MODE!=='true'||env.SCALINGO_REQUIRE_DB_TLS!=='true'||!backupReady(env))throw Error('Scalingo safe mode, TLS and verified successful backup from the last 24 hours required.');
const url=new URL(env.DATABASE_URL);
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
const db=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true}});
try{
 await db.connect();await db.query('BEGIN');
 const {rows}=await db.query("SELECT current_database() AS name,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls");
 if(rows[0]?.name!=='portailplus_7495'||rows[0]?.tls!==true)throw Error('Unexpected database or missing TLS');
 await db.query(await readFile(new URL('./scalingo-temperature-validation-schema.sql',import.meta.url),'utf8'));
 await db.query('COMMIT');console.log('Temperature validation columns verified. Existing readings and comments preserved.');
}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end();}
