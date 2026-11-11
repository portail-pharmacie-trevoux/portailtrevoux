// SQL only. No server, initialize, application handlers, jobs or external mail clients.
import {tables,pk,ledgerKey,hash,canonical,key,fail,makePlan} from './model.mjs';
import {previousAttempt,identityDiagnostics,publicationDiagnostics,issueSummary} from './diagnostics.mjs';
export const quote=s=>'"'+s.replaceAll('"','""')+'"';
const optional={team_messages:['title','reminder_kind','automation_text']};
export const automationDDL=`CREATE TABLE IF NOT EXISTS public.message_automations(id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,enabled BOOLEAN NOT NULL DEFAULT TRUE,config JSONB NOT NULL,revision INTEGER NOT NULL DEFAULT 1,activation_at TIMESTAMPTZ NOT NULL DEFAULT now(),created_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,updated_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),deleted_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS public.message_automation_runs(id BIGSERIAL PRIMARY KEY,automation_id TEXT NOT NULL REFERENCES public.message_automations(id),occurrence DATE NOT NULL,status TEXT NOT NULL CHECK(status IN ('sent','skipped','failed')),recipient_count INTEGER NOT NULL DEFAULT 0,message_count INTEGER NOT NULL DEFAULT 0,error TEXT,completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(automation_id,occurrence));
CREATE TABLE IF NOT EXISTS public.message_automation_changes(id BIGSERIAL PRIMARY KEY,automation_id TEXT NOT NULL REFERENCES public.message_automations(id),actor_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,action TEXT NOT NULL,before_value JSONB,after_value JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT now());`;
export async function guard(c,name,readOnly=false){const r=(await c.query("SELECT current_database() AS database,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,current_setting('transaction_read_only') AS readonly")).rows[0];if(r.database!==name||r.tls!==true||readOnly&&r.readonly!=='on')throw fail('DATABASE_TLS_READONLY_GUARD');}
export async function readSnapshot(c,{source=false}={}){
 await c.query("SET LOCAL TIME ZONE 'UTC'");
 const schema=(await c.query("SELECT table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position",[Object.keys(tables)])).rows;
 const ddl=[],data={};let totalBytes=0;
 for(const [table,expected]of Object.entries(tables)){
  const columns=schema.filter(x=>x.table_name===table),names=columns.map(x=>x.column_name);
  if(!columns.length){if(!source&&table.startsWith('message_automation')){ddl.push(table);data[table]=[];continue;}throw fail('REQUIRED_TABLE_MISSING',{table});}
  if(names.some(n=>!expected.includes(n))||expected.some(n=>!names.includes(n)&&!optional[table]?.includes(n)))throw fail('UNREVIEWED_SCHEMA',{table});
  if(!source)for(const field of (optional[table]||[]).filter(n=>!names.includes(n)))ddl.push(table+'.'+field);
  const hooks=(await c.query("SELECT c.relrowsecurity OR c.relforcerowsecurity AS rls,(SELECT count(*)::int FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal AND tgenabled<>'D') AS triggers,(SELECT count(*)::int FROM pg_rewrite WHERE ev_class=c.oid AND rulename<>'_RETURN') AS rules FROM pg_class c WHERE c.oid=$1::regclass",['public.'+table])).rows[0];
  if(hooks.rls||hooks.triggers||hooks.rules)throw fail('UNREVIEWED_TABLE_HOOKS',{table});
  const size=(await c.query('SELECT count(*)::int AS n,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM public.'+quote(table)+' t')).rows[0];totalBytes+=Number(size.bytes);
  if(size.n>200000||totalBytes>64*1024*1024)throw fail('SOURCE_OR_TARGET_SIZE_LIMIT',{table});
  const bigint=columns.filter(x=>x.udt_name==='int8').map(x=>"'"+x.column_name+"',t."+quote(x.column_name)+'::text');
  const nullFields=columns.filter(x=>['json','jsonb'].includes(x.udt_name)).map(x=>'CASE WHEN t.'+quote(x.column_name)+" IS NULL THEN '"+x.column_name+"' ELSE NULL END");
  const extra=(bigint.length?' || jsonb_build_object('+bigint.join(',')+')':'')+" || jsonb_build_object('__sqlNulls',"+(nullFields.length?'array_remove(ARRAY['+nullFields.join(',')+'],NULL)':'ARRAY[]::text[]')+')';
  const result=(await c.query('SELECT to_jsonb(t)'+extra+' AS row FROM public.'+quote(table)+' t ORDER BY '+pk[table].map(quote).join(','))).rows.map(r=>r.row);
  for(const r of result){for(const field of optional[table]||[])if(!names.includes(field)){r[field]=null;if(field==='title'||field==='reminder_kind'||field==='automation_text'){};}r.__sqlNulls.sort();}
  data[table]=result;
 }
 if(!source){const hooks=(await c.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid='public.settings'::regclass AND NOT tgisinternal AND tgenabled<>'D'")).rows[0];const rules=(await c.query("SELECT count(*)::int AS n FROM pg_rewrite WHERE ev_class='public.settings'::regclass AND rulename<>'_RETURN'")).rows[0];if(hooks.n||rules.n)throw fail('UNREVIEWED_SETTINGS_HOOKS');}
 const users=(await c.query('SELECT id,name,first_name,last_name,email,directory_key,role,active,job,schedule_position FROM public.users ORDER BY id')).rows;
 let services=[];if((await c.query("SELECT to_regclass('public.quality_services') AS name")).rows[0].name)services=(await c.query('SELECT id,service,collaborator_id FROM public.quality_services ORDER BY id')).rows;
 const settings=(await c.query("SELECT key,value FROM public.settings WHERE key='schedule_accountant_email' ORDER BY key")).rows;
 const marker=source?null:(await c.query('SELECT value FROM public.settings WHERE key=$1',[ledgerKey])).rows[0];let ledger=null;if(marker){try{ledger=JSON.parse(marker.value);}catch{throw fail('INVALID_MIGRATION_LEDGER');}}
 const result={tables:data,users,services,settings,ledger,schema,ddl};result.digest=hash(result);return result;
}
export async function sourceSnapshot(pool){const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='30s'");await guard(c,'portailtrevoux_db',true);const result=await readSnapshot(c,{source:true});await c.query('ROLLBACK');return result;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}
export async function targetSnapshot(pool){const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await guard(c,'portailplus_7495',true);return await readSnapshot(c);}finally{await c.query('ROLLBACK').catch(()=>{});c.release();}}
export function reviewSchema(source,target){const issues=[];for(const a of source.schema){const b=target.schema.find(b=>b.table_name===a.table_name&&b.column_name===a.column_name);if(b&&(a.udt_name!==b.udt_name||a.is_nullable!==b.is_nullable))issues.push({code:'SCHEMA_TYPE_OR_NULLABILITY_DIFFERS',table:a.table_name,column:a.column_name});}return issues;}
export const summarize=p=>({ready:p.ready,sourceDigest:p.sourceDigest,targetDigest:p.targetDigest,tables:p.count,decisionsDigest:p.decisionsDigest,issues:p.issues,issueSummary:issueSummary(p.issues),warnings:p.warnings,publicationConflicts:p.publicationConflicts,usersMapped:Object.keys(p.maps.users).length,outboundNotifications:0,accountsUpdated:0});
// Read-only structural diagnostics. Do not export planning contents or employee identities.
function planningConflictDiagnostics(source,target,issues){
 const weeks=issues.filter(i=>i.code==='EXISTING_TARGET_CONFLICT'&&i.table==='schedule_weeks').map(i=>{
  const sourceWeek=source.tables.schedule_weeks.find(r=>key('schedule_weeks',r)===i.sourceKey);
  const targetWeek=target.tables.schedule_weeks.find(r=>key('schedule_weeks',r)===i.sourceKey);
  const fields=sourceWeek&&targetWeek?Object.keys(sourceWeek).filter(f=>hash(sourceWeek[f])!==hash(targetWeek[f])):[];
  return {sourceKey:i.sourceKey,sourcePresent:!!sourceWeek,targetPresent:!!targetWeek,
   differingFields:fields,sourceRevision:sourceWeek?.revision??null,targetRevision:targetWeek?.revision??null,
   sourcePublishedRevision:sourceWeek?.published_revision??null,targetPublishedRevision:targetWeek?.published_revision??null,
   sourcePublishedAt:sourceWeek?.published_at??null,targetPublishedAt:targetWeek?.published_at??null,
   sourceFieldDigests:Object.fromEntries(fields.map(f=>[f,hash(sourceWeek[f])])),
   targetFieldDigests:Object.fromEntries(fields.map(f=>[f,hash(targetWeek[f])])),
   recommendation:'Manual comparison required; preserve existing Scalingo week. No automatic overwrite.'};
 });
 const orphanTemplates=issues.filter(i=>i.code==='UNMAPPED_REFERENCE'&&i.table==='schedule_templates').map(i=>{
  const template=source.tables.schedule_templates.find(r=>key('schedule_templates',r)===i.sourceKey);
  const paths=[];
  function scan(v,path){
   if(paths.length>=100||v===null||typeof v!=='object')return;
   for(const [k,x]of Object.entries(v)){
    const next=path.concat(k);
    if(/^14:(?:\\d{4}-\\d{2}-\\d{2}|[0-6])$/.test(k)||(['userId','by'].includes(k)&&String(x)==='14'))paths.push(next.join('.'));
    scan(x,next);
   }
  }
  if(template)scan(template.content,['content']);
  return {sourceKey:i.sourceKey,sourceId:i.sourceId,sourcePresent:!!template,
   templateName:template?.name??null,referencePaths:paths,referencePathsTruncated:paths.length>=100,
   recommendation:'Historical identity evidence required. Do not assign to another employee or discard original template.'};
 });
 return {weeks,orphanTemplates,readOnly:true,automaticMergeAuthorized:false};
}
export async function auditGrouped(source,pool,{decisions={},includePrivate=false}={}){
 const target=await targetSnapshot(pool),plan=makePlan(source,target,decisions);plan.issues.push(...reviewSchema(source,target));plan.ready=plan.issues.length===0;
 const identities=identityDiagnostics(source,target,plan);
 const publicationReview=publicationDiagnostics(source,target,plan);
 const baseline=makePlan(source,target);baseline.issues.push(...reviewSchema(source,target));
 const report={...summarize(plan),decisionReview:{applied:decisions,withoutDecisions:issueSummary(baseline.issues),withDecisions:issueSummary(plan.issues)},previousAttempt:previousAttempt(target),ddl:target.ddl,publicationReview:publicationReview.map(({source,target,...rest})=>rest),identityReferences:identities.map(({sourceIdentity,accountCorrectionProposal,...rest})=>rest)};
 report.issueSummary.unresolvedUserIds=identities.filter(r=>r.state!=='MATCHED').map(r=>r.sourceId).sort((a,b)=>a-b);
 if(includePrivate)report.privateDetails={planningConflicts:planningConflictDiagnostics(source,target,plan.issues),identities,publications:publicationReview,decisionsRequired:plan.issues.filter(i=>['PUBLICATION_FORK_DECISION_REQUIRED','READ_WATERMARK_CANNOT_REPRESENT_BOTH_HISTORIES','READ_WATERMARK_WOULD_MARK_LOCAL_UNREAD_AS_READ','UNMAPPED_REFERENCE'].includes(i.code)),proposedReadPolicy:{value:'preserve-target-archive-source',requiresExplicitApproval:true,liveSourceReadStateMayAppearUnread:true,originalHistoriesPreserved:true,alternative:'Per-publication read-state model and application adaptation require a separate approved change.'}};
 return report;
}
async function materialize(c,op,schema){
 const columns=schema.filter(x=>x.table_name===op.table),names=columns.map(x=>x.column_name),assign=col=>['json','jsonb'].includes(col.udt_name)?'CASE WHEN $2::text[] @> ARRAY[\''+col.column_name+'\'] THEN NULL::'+col.udt_name+' ELSE COALESCE(r.'+quote(col.column_name)+",'null'::"+col.udt_name+') END':'r.'+quote(col.column_name);
 const values=columns.some(col=>['json','jsonb'].includes(col.udt_name))?[JSON.stringify(op.row),op.row.__sqlNulls||[]]:[JSON.stringify(op.row)],record='json_populate_record(NULL::public.'+quote(op.table)+',$1::json) r';
 if(op.action==='insert')await c.query('INSERT INTO public.'+quote(op.table)+'('+names.map(quote).join(',')+') SELECT '+columns.map(assign).join(',')+' FROM '+record,values);
 else if(op.action==='update'){
  const updates=columns.filter(x=>!pk[op.table].includes(x.column_name));
  const where=pk[op.table].map(k=>'t.'+quote(k)+'=r.'+quote(k)).join(' AND ');
  await c.query('UPDATE public.'+quote(op.table)+' t SET '+updates.map(col=>quote(col.column_name)+'='+assign(col)).join(',')+' FROM '+record+' WHERE '+where,values);
 }
}
const order=['schedule_posts','schedule_templates','leave_requests','schedule_weeks','leave_schedule_changes','message_automations','team_messages','team_message_recipients','message_automation_runs','message_automation_changes','publications','publication_reads'];
export async function applyGrouped({source,pool,approval,beforeCommit=async()=>{},beforeWrite=async()=>{},decisions={}}){
 if(approval?.approved!==true||!approval.reference||!approval.backupReference||approval.sourceDigest!==source.digest||!approval.targetDigest)throw fail('EXPLICIT_BATCH_AUTHORIZATION_REQUIRED');
 if(Object.keys(decisions).length&&approval.decisionsDigest!==hash(decisions))throw fail('EXPLICIT_DECISION_AUTHORIZATION_REQUIRED');
 const c=await pool.connect();let commitStarted=false;try{
  await c.query('BEGIN');await guard(c,'portailplus_7495');await c.query("SET LOCAL lock_timeout='3s'");await c.query("SET LOCAL statement_timeout='30s'");await c.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
  await c.query("SELECT pg_advisory_xact_lock(hashtext('portailplus-grouped-render-migration'))");
  const present=(await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])",[Object.keys(tables)])).rows.map(r=>r.table_name);
  await c.query('LOCK TABLE '+[...present.map(t=>'public.'+quote(t)),'public.settings'].sort().join(',')+' IN SHARE ROW EXCLUSIVE MODE');await c.query('LOCK TABLE public.users IN SHARE MODE');
  // Lock only the referent lookup if it exists; no quality data is written.
  if((await c.query("SELECT to_regclass('public.quality_services') AS name")).rows[0].name)await c.query('LOCK TABLE public.quality_services IN SHARE MODE');
  const before=await readSnapshot(c);if(before.digest!==approval.targetDigest)throw fail('DESTINATION_CHANGED_SINCE_AUDIT');
  if(approval.decisionsDigest!==undefined&&approval.decisionsDigest!==hash(decisions))throw fail('DECISIONS_CHANGED');
  const plan=makePlan(source,before,decisions);plan.issues.push(...reviewSchema(source,before));if(plan.issues.length)throw fail('GROUPED_CONFLICTS',{issues:plan.issues});
  await beforeWrite(c,before);
  if(before.ddl.some(t=>!t.includes('.')))await c.query(automationDDL);
  for(const item of before.ddl.filter(t=>t.includes('.'))){const [table,col]=item.split('.');await c.query('ALTER TABLE public.'+quote(table)+' ADD COLUMN '+quote(col)+' TEXT');}
  const schema=(await c.query("SELECT table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position",[Object.keys(tables)])).rows;
  // Reply FK is immediate. Insert parents first; deleted root thread IDs need no FK row.
  const messages=plan.operations.filter(o=>o.table==='team_messages'),sorted=[],waiting=[...messages],done=new Set(before.tables.team_messages.map(r=>String(r.id)));
  while(waiting.length){const index=waiting.findIndex(o=>o.row.reply_to_id===null||done.has(String(o.row.reply_to_id)));if(index<0)throw fail('REPLY_CYCLE_OR_MISSING_PARENT');const [op]=waiting.splice(index,1);sorted.push(op);done.add(String(op.row.id));}
  for(const table of order)for(const op of table==='team_messages'?sorted:plan.operations.filter(o=>o.table===table))if(op.action!=='keep')await materialize(c,op,schema);
  for(const setting of source.settings)if(!before.settings.some(s=>s.key===setting.key))await c.query('INSERT INTO public.settings(key,value) VALUES($1,$2)',[setting.key,setting.value]);
  // Serial restarts are transactional and never lower a sequence or reuse ghost thread IDs.
  for(const table of order.filter(t=>pk[t].length===1&&pk[t][0]==='id'&&t!=='message_automations')){
   if(!Object.keys(plan.maps[table]||{}).length)continue;
   const seq=(await c.query("SELECT n.nspname AS schema,c.relname AS name,s.seqincrement::text AS increment,s.seqcycle AS cycle FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_sequence s ON s.seqrelid=c.oid WHERE c.oid=pg_get_serial_sequence($1,'id')::regclass",['public.'+table])).rows[0];
   if(!seq||seq.increment!=='1'||seq.cycle)throw fail('UNREVIEWED_SEQUENCE',{table});const qualified=quote(seq.schema)+'.'+quote(seq.name),value=(await c.query('SELECT last_value::text,is_called FROM '+qualified)).rows[0];
   const max=BigInt(Math.max(0,...(before.tables[table]||[]).map(r=>Number(r.id)),...Object.values(plan.maps[table]).map(Number))),current=BigInt(value.last_value)+(value.is_called?1n:0n),next=max+1n>current?max+1n:current;
   if(next>2147483647n)throw fail('IDENTIFIERS_EXHAUSTED');if(next!==current)await c.query('ALTER SEQUENCE '+qualified+' RESTART WITH '+next);
  }
  const after=await readSnapshot(c),allowedUpdates=new Set(plan.operations.filter(o=>o.action==='update').map(o=>o.table+':'+o.targetKey));
  for(const [table,rows]of Object.entries(before.tables))for(const old of rows){const existing=after.tables[table].find(r=>key(table,r)===key(table,old));if(!existing||!allowedUpdates.has(table+':'+key(table,old))&&hash(existing)!==hash(old))throw fail('PRESERVED_TARGET_ROW_CHANGED',{table});}
  for(const op of plan.operations){if(op.action==='keep')continue;const actual=after.tables[op.table].find(r=>key(op.table,r)===op.targetKey);if(!actual||hash(actual)!==hash(op.row))throw fail('IMPORTED_RECORD_INTEGRITY_FAILED',{table:op.table});}
  if(hash(before.users)!==hash(after.users)||hash(before.services)!==hash(after.services))throw fail('PROTECTED_REFERENTS_CHANGED');
  for(const [table,rows]of Object.entries(before.tables)){const inserted=plan.operations.filter(o=>o.table===table&&o.action==='insert').length;if(after.tables[table].length!==rows.length+inserted)throw fail('ROW_COUNT_MISMATCH',{table});}
  const changed=hash(plan.nextLedger)!==hash(before.ledger);
  if(changed)await c.query('INSERT INTO public.settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[ledgerKey,JSON.stringify(plan.nextLedger)]);
  // The final receipt must include the ledger written above, not its pre-write value.
  const committedSnapshot={...after,ledger:plan.nextLedger};delete committedSnapshot.digest;
  const result={...summarize(plan),committed:true,sourceDigest:source.digest,ledgerDigest:hash(plan.nextLedger),targetAfterDigest:hash(committedSnapshot),totalInserted:plan.operations.filter(o=>o.action==='insert').length,totalUpdated:plan.operations.filter(o=>o.action==='update').length,attachmentsVerified:source.tables.team_messages.filter(r=>r.attachment_content!==null).length};
  await beforeCommit(result,c);commitStarted=true;await c.query('COMMIT');return result;
 }catch(e){let rolledBack=false;try{await c.query('ROLLBACK');rolledBack=true;}catch{}
  e.migrationTransactionState=commitStarted?'UNKNOWN':rolledBack?'ROLLED_BACK':'UNKNOWN';throw e;
 }finally{c.release();}
}
