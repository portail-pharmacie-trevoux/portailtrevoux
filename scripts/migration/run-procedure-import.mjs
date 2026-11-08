// Execute only inside an approved internal Scalingo runner. Default is audit.
import pg from 'pg';
import {readFile,lstat,open} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {readProcedureArchive,auditProcedureImport,applyProcedureImport} from './procedure-batch.mjs';
let db;
try{
 const [mode='audit',zipPath,approvalPath,receiptPath]=process.argv.slice(2);
 if(!['audit','apply'].includes(mode)||!zipPath)throw Error('AUDIT_OR_APPLY_AND_ARCHIVE_REQUIRED');
 const approval=mode==='apply'?JSON.parse(await readFile(approvalPath,'utf8')):null;
 if(mode==='apply'&&approval?.approved!==true)throw Error('PROCEDURE_IMPORT_NOT_AUTHORIZED');
 const urlText=process.env.PORTAIL_SCALINGO_PROCEDURE_DATABASE_URL||process.env.SCALINGO_POSTGRESQL_URL;
 if(!urlText)throw Error('INTERNAL_SCALINGO_DATABASE_BINDING_REQUIRED');
 if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('TLS_VERIFICATION_REQUIRED');
 const url=new URL(urlText);if(!['postgres:','postgresql:'].includes(url.protocol)||decodeURIComponent(url.pathname.slice(1))!=='portailplus_7495')throw Error('DESTINATION_DATABASE_MISMATCH');
 for(const k of ['ssl','sslmode','sslcert','sslkey','sslrootcert','options'])url.searchParams.delete(k);
 const bundle=await readProcedureArchive(zipPath);
 if(bundle.documents.length!==55||bundle.documents.reduce((n,d)=>n+d.bytes,0)!==7930504||JSON.stringify(bundle.documents.map(d=>d.id).sort((a,b)=>a-b))!==JSON.stringify([...Array.from({length:54},(_,i)=>i+1),303]))throw Error('UNEXPECTED_SOURCE_BATCH');
 db=new pg.Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:10000,options:'-c search_path=public,pg_catalog',application_name:'portailplus_controlled_procedure_import'});db.on('error',()=>{});
 if(mode==='audit'){console.log(JSON.stringify(await auditProcedureImport({db,bundle})));}
 else{
  if(!receiptPath||process.env.PORTAIL_PROCEDURE_RECEIPT_STORE_PERSISTENT!=='true')throw Error('PRIVATE_DURABLE_RECEIPT_REQUIRED');
  const file=resolve(receiptPath),directory=await lstat(dirname(file));if(!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o077)!==0)throw Error('PRIVATE_DIRECTORY_REQUIRED');
  const result=await applyProcedureImport({db,bundle,approval,beforeCommit:async receipt=>{
   const fd=await open(file,'wx',0o600);try{await fd.writeFile(JSON.stringify(receipt));await fd.sync();}finally{await fd.close();}
   const copy=JSON.parse(await readFile(file,'utf8'));if(JSON.stringify(copy)!==JSON.stringify(receipt))throw Error('RECEIPT_READBACK_FAILED');
  }});console.log(JSON.stringify(result));
 }
}catch(e){console.error(JSON.stringify({status:'blocked',code:/^[A-Z_]+$/.test(e.message)?e.message:'PROCEDURE_OPERATION_UNAVAILABLE',neverRetryAutomatically:true,noRecordContentsLogged:true}));process.exitCode=1;}finally{if(db)await db.end().catch(()=>{});}
