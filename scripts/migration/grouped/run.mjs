import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {sourceSnapshot,auditGrouped,targetSnapshot} from './database.mjs';
import {previousAttempt} from './diagnostics.mjs';
import {receiveSourceUrl,encryptPrivateReport} from './secure-channel.mjs';
const emit=report=>console.log(JSON.stringify(report));
let source,target,phase='setup';
try{
 const runtime=JSON.parse(await readFile('/tmp/uploads/runtime.json','utf8'));
 if(runtime.mode!=='audit')throw Error('AUDIT_ONLY_RELEASE_EXECUTION_LOCKED');
 if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||process.env.SCALINGO_APP_NAME&&process.env.SCALINGO_APP_NAME!=='portailplus-hds')throw Error('APPLICATION_TLS_GUARD');
 // Audit does not run jobs or require changing any existing security flag.
 const raw=await receiveSourceUrl(process.stdin),sourceUrl=new URL(raw),targetUrl=new URL(process.env.SCALINGO_POSTGRESQL_URL||'');
 if(!['postgres:','postgresql:'].includes(sourceUrl.protocol)||!sourceUrl.hostname.endsWith('.render.com')||decodeURIComponent(sourceUrl.pathname.slice(1))!=='portailtrevoux_db')throw Error('EXTERNAL_RENDER_READONLY_ENDPOINT_REQUIRED');
 if(!['postgres:','postgresql:'].includes(targetUrl.protocol)||decodeURIComponent(targetUrl.pathname.slice(1))!=='portailplus_7495'||sourceUrl.hostname===targetUrl.hostname)throw Error('SCALINGO_DESTINATION_REQUIRED');
 for(const u of [sourceUrl,targetUrl])for(const key of ['ssl','sslmode','sslcert','sslkey','sslrootcert','options'])u.searchParams.delete(key);
 const {Pool}=createRequire(resolve(process.cwd(),'package.json'))('pg');
 const readonly={ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000,options:'-c default_transaction_read_only=on -c search_path=public,pg_catalog'};
 source=new Pool({...readonly,connectionString:sourceUrl.toString(),application_name:'portailplus_grouped_readonly_source'});
 target=new Pool({...readonly,connectionString:targetUrl.toString(),application_name:'portailplus_grouped_readonly_audit'});
 source.on('error',()=>{});target.on('error',()=>{});
 phase='previous_attempt_readonly';emit({event:'previous_attempt',...previousAttempt(await targetSnapshot(target)),dataWrites:0});
 phase='source_read';const snapshotAt=new Date().toISOString(),snapshot=await sourceSnapshot(source);await source.end();source=null;
 phase='target_audit';const audit=await auditGrouped(snapshot,target,{decisions:runtime.decisions||{},includePrivate:true});
 const privateDetails=audit.privateDetails;delete audit.privateDetails;
 emit({event:'audit',snapshotAt,...audit,simulationOnly:true,executionLocked:true,dataWrites:0});
 emit(encryptPrivateReport({...privateDetails,snapshotAt,previousAttempt:audit.previousAttempt},runtime.reportPublicKey));
 emit({event:'audit_only',dataWrites:0,executionLocked:true,conflicts:audit.issueSummary.total});
 if(!audit.ready)process.exitCode=2;
}catch(e){emit({event:'blocked',phase,commitConfirmed:false,dataWrites:0,executionLocked:true,code:/^[A-Z_]+$/.test(e.code||e.message)?e.code||e.message:'GROUPED_AUDIT_FAILED',details:e.details||{},neverRetryAutomatically:true});process.exitCode=1;}
finally{if(source)await source.end().catch(()=>{});if(target)await target.end().catch(()=>{});}
