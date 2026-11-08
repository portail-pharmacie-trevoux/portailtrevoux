import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {sourceSnapshot,auditGrouped,applyGrouped} from './database.mjs';
const emit=report=>console.log(JSON.stringify(report));
let source,target,phase='setup',commitConfirmed=false;
try{
 const runtime=JSON.parse(await readFile('/tmp/uploads/runtime.json','utf8'));
 if(!['audit','execute'].includes(runtime.mode)||!runtime.backup?.id||!Number.isFinite(Date.parse(runtime.backup.createdAt))||Date.now()-Date.parse(runtime.backup.createdAt)>36*60*60*1000)throw Error('RECENT_AVAILABLE_BACKUP_REQUIRED');
 if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||process.env.SCALINGO_APP_NAME&&process.env.SCALINGO_APP_NAME!=='portailplus-hds')throw Error('APPLICATION_TLS_GUARD');
 if(process.env.SCALINGO_PREVIEW_SAFE_MODE!=='true'||process.env.SCALINGO_PREVIEW_UI_ENABLED!=='true')throw Error('BACKGROUND_JOBS_NOT_CONFIRMED_DISABLED');
 const sourceUrl=new URL(process.env.PORTAIL_RENDER_READONLY_DATABASE_URL||''),targetUrl=new URL(process.env.SCALINGO_POSTGRESQL_URL||'');
 delete process.env.PORTAIL_RENDER_READONLY_DATABASE_URL;
 if(!['postgres:','postgresql:'].includes(sourceUrl.protocol)||!sourceUrl.hostname.endsWith('.render.com')||decodeURIComponent(sourceUrl.pathname.slice(1))!=='portailtrevoux_db')throw Error('EXTERNAL_RENDER_READONLY_ENDPOINT_REQUIRED');
 if(!['postgres:','postgresql:'].includes(targetUrl.protocol)||decodeURIComponent(targetUrl.pathname.slice(1))!=='portailplus_7495'||sourceUrl.hostname===targetUrl.hostname)throw Error('SCALINGO_DESTINATION_REQUIRED');
 for(const u of [sourceUrl,targetUrl])for(const key of ['ssl','sslmode','sslcert','sslkey','sslrootcert','options'])u.searchParams.delete(key);
 const {Pool}=createRequire(resolve(process.cwd(),'package.json'))('pg');
 source=new Pool({connectionString:sourceUrl.toString(),ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000,options:'-c default_transaction_read_only=on -c search_path=public,pg_catalog',application_name:'portailplus_grouped_readonly_source'});
 target=new Pool({connectionString:targetUrl.toString(),ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000,options:'-c search_path=public,pg_catalog',application_name:'portailplus_grouped_destination'});
 source.on('error',()=>{});target.on('error',()=>{});
 phase='source_read';
 const snapshotAt=new Date().toISOString(),snapshot=await sourceSnapshot(source);await source.end();source=null;
 phase='target_audit';const audit=await auditGrouped(snapshot,target);emit({event:'audit',snapshotAt,...audit});
 if(!audit.ready){process.exitCode=2;}
 else if(runtime.mode==='audit')emit({event:'audit_only',dataWrites:0,backupReference:runtime.backup.id});
 else{
  const terminal=createInterface({input:process.stdin,output:process.stdout});let answer;
  try{answer=await terminal.question('Autoriser la transaction unique ? Saisir MIGRER MESSAGERIE ET PLANNING : ');}finally{terminal.close();}
  if(answer!=='MIGRER MESSAGERIE ET PLANNING')emit({event:'cancelled',dataWrites:0});
  else{
   phase='target_transaction';const result=await applyGrouped({source:snapshot,pool:target,approval:{approved:true,reference:'Local CLI confirmation '+new Date().toISOString(),sourceDigest:audit.sourceDigest,targetDigest:audit.targetDigest,backupReference:runtime.backup.id}});
   commitConfirmed=true;emit({event:'committed',...result});phase='post_commit_verification';
   const check=await auditGrouped(snapshot,target);
   if(!check.ready||Object.values(check.tables).some(t=>t.insert||t.update))throw Error('POST_COMMIT_VERIFICATION_REQUIRES_REVIEW');
   emit({event:'verified',...check});
  }
 }
}catch(e){emit({event:'blocked',phase,commitConfirmed,code:/^[A-Z_]+$/.test(e.code||e.message)?e.code||e.message:'GROUPED_OPERATION_FAILED',details:e.details||{},neverRetryAutomatically:true,noCredentialsOrBusinessContentsLogged:true});process.exitCode=1;}
finally{if(source)await source.end().catch(()=>{});if(target)await target.end().catch(()=>{});}
