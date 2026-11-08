// Run only in the application's one-off container, never import server.mjs.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {validateProcedureBundle,auditProcedureImport,applyProcedureImport} from '../procedure-batch.mjs';
const batchHash='6dfe4d44359976eee044b98bbe20929ceee4f0791e41eb7072f2e6af668c1e8a';
const emit=value=>console.log(JSON.stringify(value));
export async function run({mode,payloadPath,approvalPath,expectedPayloadHash,baselinePath='/tmp/uploads/audit.json',env=process.env,Pool}){
 if(!['audit','apply','verify'].includes(mode))throw Error('INVALID_MODE');
 const payload=await readFile(payloadPath);
 if(createHash('sha256').update(payload).digest('hex')!==expectedPayloadHash)throw Error('PAYLOAD_HASH_MISMATCH');
 const bundle=validateProcedureBundle(JSON.parse(payload));
 if(bundle.archiveSha256!==batchHash||bundle.documents.length!==55||bundle.documents.reduce((n,d)=>n+d.bytes,0)!==7930504||JSON.stringify(bundle.documents.map(d=>d.id).sort((a,b)=>a-b))!==JSON.stringify([...Array.from({length:54},(_,i)=>i+1),303]))throw Error('UNEXPECTED_SOURCE_BATCH');
 if(env.SCALINGO_APP_NAME&&env.SCALINGO_APP_NAME!=='portailplus-hds')throw Error('WRONG_APPLICATION');
 if(env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('TLS_VERIFICATION_REQUIRED');
 let approval;
 if(mode==='apply'){
  approval=JSON.parse(await readFile(approvalPath,'utf8'));
  if(approval.approved!==true||approval.allocation!=='remap'||approval.archiveSha256!==batchHash||!approval.targetDigest||!approval.nativeBackupReference||approval.backupDurable!==true||approval.restoreRiskAccepted!==true||!approval.authorizationReference)throw Error('EXPLICIT_APPROVAL_REQUIRED');
 }
 const raw=env.SCALINGO_POSTGRESQL_URL;
 if(!raw)throw Error('SCALINGO_DATABASE_BINDING_REQUIRED');
 const url=new URL(raw);
 if(!['postgres:','postgresql:'].includes(url.protocol)||decodeURIComponent(url.pathname.slice(1))!=='portailplus_7495')throw Error('WRONG_DATABASE');
 for(const key of ['ssl','sslmode','sslcert','sslkey','sslrootcert','options'])url.searchParams.delete(key);
 const db=new Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:10000,options:'-c search_path=public,pg_catalog',application_name:'portailplus_procedures_import'});
 db.on('error',()=>{});
 try{
  const options={db,bundle,allocation:'remap'},audit=await auditProcedureImport(options);
  // Known protected rows must remain outside the source mapping. Never reuse test rows.
  const protectedRows=audit.existingDocuments.filter(r=>[1,2].includes(r.id));
  if(protectedRows.length!==2||protectedRows.some(r=>r.active!==false||!(r.bytes>0)))throw Error('PROTECTED_TEST_ROWS_CHANGED');
  if(audit.mapping.some(m=>[1,2].includes(m.targetId)))throw Error('PROTECTED_TEST_ID_MATCHES_SOURCE');
  if(mode==='audit'){emit({event:'audit',...audit});return;}
  if(mode==='verify'){
   const initial=JSON.parse(await readFile(baselinePath,'utf8'));
   if(initial.event!=='audit'||initial.archiveSha256!==batchHash||initial.targetCount!==2||initial.existingDocuments?.length!==2)throw Error('INVALID_INITIAL_AUDIT');
   for(const old of initial.existingDocuments){if(!audit.existingDocuments.some(r=>r.id===old.id&&r.fingerprint===old.fingerprint))throw Error('EXISTING_DOCUMENT_CHANGED');}
   if(audit.conflicts.length||audit.insert.length||audit.present.length!==55)throw Error('POST_IMPORT_VERIFICATION_FAILED');
   emit({event:'verified',verifiedHashes:55,preservedTestIds:[1,2],...audit});return;
  }
  const result=await applyProcedureImport({...options,approval,beforeCommit:async receipt=>emit({event:'transaction_verified_not_yet_committed',...receipt})});
  emit({event:'committed',...result});
 }finally{await db.end();}
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 try{
  const pg=createRequire(resolve(process.cwd(),'package.json'))('pg');
  await run({mode:process.argv[2],payloadPath:new URL('../../../payload.json',import.meta.url),approvalPath:'/tmp/uploads/approval.json',expectedPayloadHash:process.argv[3],Pool:pg.Pool});
 }catch(e){emit({event:'blocked',code:/^[A-Z_]+$/.test(e.message)?e.message:'PROCEDURE_OPERATION_FAILED',neverRetryAutomatically:true});process.exitCode=1;}
}
