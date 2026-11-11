// Explicit future opt-in only. No schema writes, seeds, imports, purge or scheduler.
import pg from 'pg';import {pathToFileURL} from 'node:url';
import {createScalingoProductionApp} from './scalingo-production-profile.mjs';
export async function startScalingoProduction(env=process.env){
 if(env.SCALINGO_RUNTIME_PROFILE!=='production'||env.SCALINGO_PRODUCTION_RUNTIME_APPROVED!=='true'||env.SCALINGO_REQUIRE_DB_TLS!=='true')throw Error('SCALINGO_PRODUCTION_PROFILE_NOT_APPROVED');
 const url=new URL(env.SCALINGO_POSTGRESQL_URL||env.DATABASE_URL||'');if(!['postgres:','postgresql:'].includes(url.protocol)||decodeURIComponent(url.pathname.slice(1))!=='portailplus_7495')throw Error('SCALINGO_DATABASE_REQUIRED');
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert','ssl','options'])url.searchParams.delete(key);
 const db=new pg.Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true},max:5});
 try{const runtime=await createScalingoProductionApp(db,env);const server=runtime.app.listen(Number(env.PORT)||3000,'0.0.0.0');process.once('SIGTERM',()=>server.close(()=>db.end()));return {server,db};}catch(error){await db.end();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await startScalingoProduction();
