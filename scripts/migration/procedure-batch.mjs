// Dedicated procedure import, no startup, app handlers, publications or messages.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {validateMigratedProcedure} from '../../procedure-file-migration.mjs';
const fail=code=>Object.assign(Error(code),{code});
const metadata=['id','category','title','description','keywords','url','active','created_at','file_name','file_type','builtin_key','source_url','source_imported_at'];
const expectedColumns=[...metadata,'file_content'].sort();
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const hash=b=>createHash('sha256').update(b).digest('hex');
function timestamp(v){if(v===null)return null;const match=String(v).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/);if(!match)throw fail('UNSUPPORTED_TIMESTAMP');const offset=match[4].length===3?match[4]+':00':match[4];const d=new Date(match[1]+'T'+match[2]+offset);if(!Number.isFinite(d.getTime()))throw fail('INVALID_TIMESTAMP');return d.toISOString().slice(0,19)+'.'+(match[3]||'').padEnd(6,'0')+'Z';}
const stableRow=r=>metadata.map(k=>['created_at','source_imported_at'].includes(k)?timestamp(r[k]):r[k]);
const same=(a,b)=>JSON.stringify(stableRow(a))===JSON.stringify(stableRow(b))&&a.sha256===b.sha256&&a.bytes===b.bytes;
export async function readProcedureArchive(path){
 const script=new URL('./read-procedure-zip.py',import.meta.url).pathname;
 const code="import importlib.util,json,sys; s=importlib.util.spec_from_file_location('reader',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); sys.stdout.write(json.dumps(m.read_bundle(sys.argv[2])))";
 let bundle;try{const result=await promisify(execFile)('python3',['-c',code,script,path],{maxBuffer:40*1024*1024});bundle=JSON.parse(result.stdout);}catch{throw fail('PROCEDURE_ARCHIVE_INVALID');}
 for(const d of bundle.documents){
  for(const k of ['category','title','description','keywords','url','file_name','file_type'])if(typeof d[k]!=='string')throw fail('INVALID_DOCUMENT_METADATA');
  for(const k of ['builtin_key','source_url','source_imported_at'])if(d[k]!==null&&typeof d[k]!=='string')throw fail('INVALID_DOCUMENT_METADATA');
  stableRow(d);d.content=Buffer.from(d.file_base64,'base64');delete d.file_base64;
  const file=validateMigratedProcedure({fileName:d.file_name,size:d.bytes,sha256:d.sha256},d.content);if(file.fileType!==d.file_type)throw fail('FILE_TYPE_MISMATCH');
 }
 return bundle;
}
async function guard(client,expected){const r=(await client.query("SELECT current_database() AS database,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];if(r?.database!==expected||r.tls!==true)throw fail('DESTINATION_DATABASE_TLS_GUARD');}
async function state(client){
 const columns=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='procedure_documents' ORDER BY column_name")).rows.map(r=>r.column_name);if(JSON.stringify(columns)!==JSON.stringify(expectedColumns))throw fail('UNREVIEWED_PROCEDURE_SCHEMA');
 const security=(await client.query("SELECT relrowsecurity OR relforcerowsecurity AS hidden FROM pg_class WHERE oid='public.procedure_documents'::regclass")).rows[0];if(security?.hidden!==false)throw fail('UNREVIEWED_PROCEDURE_RLS');
 const hooks=(await client.query("SELECT (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.procedure_documents'::regclass AND NOT tgisinternal AND tgenabled<>'D')+(SELECT count(*) FROM pg_rewrite WHERE ev_class='public.procedure_documents'::regclass AND rulename<>'_RETURN') AS count")).rows[0];if(Number(hooks.count)!==0)throw fail('UNREVIEWED_PROCEDURE_HOOKS');
 const rows=(await client.query('SELECT '+metadata.map(k=>['created_at','source_imported_at'].includes(k)?quote(k)+'::text AS '+quote(k):quote(k)).join(',')+",octet_length(file_content) AS bytes,encode(sha256(file_content),'hex') AS sha256 FROM public.procedure_documents ORDER BY id")).rows;
 const sequence=(await client.query("SELECT n.nspname AS schema,c.relname AS name,s.seqincrement::text AS increment,s.seqcycle AS cycle FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_sequence s ON s.seqrelid=c.oid WHERE c.oid=pg_get_serial_sequence('public.procedure_documents','id')::regclass")).rows[0];if(!sequence||sequence.increment!=='1'||sequence.cycle)throw fail('UNREVIEWED_PROCEDURE_SEQUENCE');
 const seq=(await client.query('SELECT last_value::text,is_called FROM '+quote(sequence.schema)+'.'+quote(sequence.name))).rows[0];
 return {rows,sequence:{...sequence,...seq},digest:hash(JSON.stringify(rows.map(r=>[...stableRow(r),r.bytes,r.sha256])))};
}
function classify(bundle,snapshot){const insert=[],present=[],conflicts=[];
 for(const d of bundle.documents){const old=snapshot.rows.find(r=>r.id===d.id);if(old){if(same(d,old))present.push(d.id);else conflicts.push({id:d.id,reason:'EXISTING_ID_DIFFERS'});continue;}
  const builtin=d.builtin_key!==null&&snapshot.rows.find(r=>r.builtin_key===d.builtin_key),duplicate=snapshot.rows.find(r=>r.sha256===d.sha256);
  if(builtin)conflicts.push({id:d.id,targetId:builtin.id,reason:'BUILTIN_KEY_EXISTS'});else if(duplicate)conflicts.push({id:d.id,targetId:duplicate.id,reason:'SAME_BYTES_OTHER_ID_REQUIRES_REVIEW'});else insert.push(d.id);
 }return {insert,present,conflicts};}
export async function auditProcedureImport({db,bundle,expectedDatabase='portailplus_7495'}){const c=await db.connect();try{await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='10s'");await c.query("SET LOCAL TIME ZONE 'UTC'");await guard(c,expectedDatabase);const s=await state(c);return {archiveSha256:bundle.archiveSha256,documents:bundle.documents.length,binaryBytes:bundle.documents.reduce((n,d)=>n+d.bytes,0),targetCount:s.rows.length,targetDigest:s.digest,sequence:s.sequence,...classify(bundle,s),dataWrites:0};}finally{await c.query('ROLLBACK').catch(()=>{});c.release();}}
export async function applyProcedureImport({db,bundle,approval,expectedDatabase='portailplus_7495',beforeCommit}){
 if(approval?.approved!==true||!approval.authorizationReference||approval.archiveSha256!==bundle.archiveSha256||!approval.nativeBackupReference||approval.restoreVerified!==true||approval.backupDurable!==true||!approval.targetDigest||typeof beforeCommit!=='function')throw fail('PROCEDURE_IMPORT_NOT_AUTHORIZED');
 const c=await db.connect();try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='3s'");await c.query("SET LOCAL statement_timeout='15s'");await c.query("SET LOCAL idle_in_transaction_session_timeout='15s'");await c.query("SET LOCAL TIME ZONE 'UTC'");await guard(c,expectedDatabase);
  await c.query('LOCK TABLE public.procedure_documents IN SHARE ROW EXCLUSIVE MODE');const before=await state(c),plan=classify(bundle,before);if(!plan.insert.length&&!plan.conflicts.length&&BigInt(before.sequence.last_value)+(before.sequence.is_called?1n:0n)>BigInt(Math.max(0,...before.rows.map(r=>r.id)))){await c.query('ROLLBACK');return {alreadyImported:true,insertedIds:[],alreadyPresentIds:plan.present,verifiedHashes:bundle.documents.length,dataWrites:0};}if(before.digest!==approval.targetDigest)throw fail('DESTINATION_CHANGED');if(plan.conflicts.length)throw fail('PROCEDURE_CONFLICT_REQUIRES_DECISION');
  for(const d of bundle.documents.filter(d=>plan.insert.includes(d.id))){await c.query('INSERT INTO public.procedure_documents('+metadata.map(quote).join(',')+',file_content) VALUES('+metadata.map((_,i)=>'$'+(i+1)).join(',')+',$14)',[...metadata.map(k=>d[k]),d.content]);}
  const verified=await state(c);for(const d of bundle.documents){const row=verified.rows.find(r=>r.id===d.id);if(!row||!same(d,row))throw fail('IMPORTED_DOCUMENT_VERIFICATION_FAILED');}
  const max=BigInt(Math.max(0,...verified.rows.map(r=>r.id))),next=BigInt(verified.sequence.last_value)+(verified.sequence.is_called?1n:0n),safeNext=max+1n>next?max+1n:next;
  if(safeNext>2147483647n)throw fail('PROCEDURE_SEQUENCE_EXHAUSTED');
  // RESTART is transactional. setval() would survive a later rollback.
  if(safeNext!==next)await c.query('ALTER SEQUENCE '+quote(verified.sequence.schema)+'.'+quote(verified.sequence.name)+' RESTART WITH '+safeNext.toString());
  const receipt={archiveSha256:bundle.archiveSha256,insertedIds:plan.insert,alreadyPresentIds:plan.present,targetBeforeDigest:before.digest,targetAfterDigest:verified.digest,sequenceBefore:before.sequence,sequenceNext:safeNext.toString()};
  await beforeCommit(receipt);await c.query('COMMIT');return {...receipt,verifiedHashes:bundle.documents.length,notificationsCreated:0};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
