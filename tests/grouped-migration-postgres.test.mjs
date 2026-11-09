import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {readFile} from 'node:fs/promises';
import {automationDDL,sourceSnapshot,targetSnapshot,auditGrouped,applyGrouped} from '../scripts/migration/grouped/database.mjs';
import {previousAttempt,identityDiagnostics} from '../scripts/migration/grouped/diagnostics.mjs';
import {hash,makePlan,ledgerKey} from '../scripts/migration/grouped/model.mjs';
const connection=process.env.PORTAIL_GROUPED_FIXTURE_URL;
test('Grouped communication/planning transaction on two isolated TLS fixture databases',{skip:!connection,timeout:60000},async t=>{
 const url=new URL(connection);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55445');assert.equal(url.pathname,'/postgres');
 const ssl={ca:await readFile('/tmp/portail-migration-fixture-tls/server.crt','utf8'),rejectUnauthorized:true},admin=new pg.Client({connectionString:connection,ssl});await admin.connect();
 for(const name of ['portailtrevoux_db','portailplus_7495']){await admin.query('DROP DATABASE IF EXISTS '+name);await admin.query('CREATE DATABASE '+name);}await admin.end();
 const source=new pg.Pool({connectionString:'postgres://postgres@127.0.0.1:55445/portailtrevoux_db',ssl}),target=new pg.Pool({connectionString:'postgres://postgres@127.0.0.1:55445/portailplus_7495',ssl});t.after(async()=>{await source.end();await target.end();});
 for(const db of [source,target]){await db.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));await db.query(automationDDL);await db.query('ALTER TABLE team_messages ADD COLUMN reminder_kind text; ALTER TABLE team_messages ADD COLUMN automation_text text');}
 const pairs=[[3,7],[2,8],[16,9],[17,10],[4,11],[12,12],[13,13],[10,14],[6,15],[8,16],[5,17],[21,18],[9,19],[11,20],[7,21],[20,22],[1,59]];
 for(const [a,b]of pairs){for(const [db,id]of [[source,a],[target,b]])await db.query('INSERT INTO users(id,name,first_name,last_name,role,active,job) VALUES($1,$2,$2,$3,$4,true,$5)',[id,'Synthetic '+a,'Fixture',a===1?'admin':'employee',db===source?'Render job':'Protected Scalingo job']);}
 await target.query("INSERT INTO users(id,name,first_name,last_name,role,active) VALUES(1,'Test fixture admin','Admin','Test','admin',true)");
 await source.query("INSERT INTO quality_services(id,collaborator_id,collaborator_name,service) VALUES(1,3,'Synthetic','Synthetic service')");await target.query("INSERT INTO quality_services(id,collaborator_id,collaborator_name,service) VALUES(2,7,'Synthetic','Synthetic service')");
 await source.query("INSERT INTO schedule_posts(id,name,color) VALUES(1,'Source post','#112233')");await target.query("INSERT INTO schedule_posts(id,name,color) VALUES(1,'Protected post','#ffffff')");
 const draft={'3:2026-11-02':{userId:3,postIds:[1],leaveRequestId:1,note:'Synthetic planning'}};
 await source.query("INSERT INTO schedule_weeks VALUES('2026-11-02',$1::jsonb,$2::jsonb,15,NULL,'2026-11-01T15:12:22.337123Z',$3::jsonb)",[JSON.stringify(draft),JSON.stringify(draft),JSON.stringify({'2026-11-02':{by:1,reason:'Synthetic lock'}})]);
 await target.query("INSERT INTO schedule_weeks(week,draft) VALUES('2026-11-09','{}')");
 await source.query("INSERT INTO schedule_templates(id,name,content) VALUES(1,'Source template',$1::jsonb)",[JSON.stringify({'3:0':{userId:3,postIds:[1]}})]);
 await source.query("INSERT INTO leave_requests(id,user_id,leave_type,start_date,end_date,start_part,end_part,status,reviewed_by,planning_applied) VALUES(1,3,'paid','2026-11-02','2026-11-02','day','day','approved',1,true)");
 await source.query("INSERT INTO leave_schedule_changes VALUES(1,'2026-11-02','2026-11-02','null'::jsonb,$1::jsonb,'null'::jsonb,$1::jsonb)",[JSON.stringify(draft)]);
 await source.query("INSERT INTO team_messages(id,sender_id,sender_name,text,thread_id,title,attachment_name,attachment_type,attachment_content) VALUES(1,1,'Synthetic admin','Synthetic root',1,'Synthetic title','fixture.pdf','application/pdf',$1)",[Buffer.from('%PDF-1.4\nSynthetic attachment\n%%EOF')]);
 await source.query("INSERT INTO team_messages(id,sender_id,sender_name,text,thread_id,reply_to_id,is_reply) VALUES(2,3,'Synthetic user','Synthetic reply',1,1,true),(3,3,'Synthetic user','Deleted root thread',99,NULL,false)");
 await target.query("INSERT INTO team_messages(id,sender_id,sender_name,text,thread_id) VALUES(1,59,'Existing','Protected target message',1)");
 await source.query("INSERT INTO team_message_recipients(message_id,user_id,seen,archived,seen_at) VALUES(1,3,true,true,'2026-11-01T12:01:02.123456Z'),(2,1,false,false,NULL),(3,3,false,true,NULL)");
 const config={frequency:'weekly',audience:{mode:'users',userIds:[3],serviceIds:[1]}};
 await source.query("INSERT INTO message_automations(id,kind,name,config,created_by,updated_by) VALUES('fixture-job','custom','Synthetic job',$1::jsonb,1,1)",[JSON.stringify(config)]);
 await source.query("INSERT INTO message_automation_runs(id,automation_id,occurrence,status) VALUES(1,'fixture-job','2026-11-02','sent')");
 await source.query("INSERT INTO message_automation_changes(id,automation_id,actor_id,action,before_value,after_value) VALUES(1,'fixture-job',1,'create',NULL,$1::jsonb)",[JSON.stringify({config})]);
 await source.query("INSERT INTO publications(id,universe,title,source_key) VALUES(1,'Emplois du temps','Source publication 1','fixture-source-1'),(2,'Emplois du temps','Source publication 2','fixture-source-2')");
 await target.query("INSERT INTO publications(id,universe,title,source_key) VALUES(1,'Actualités','Protected publication','fixture-target')");
 await source.query("INSERT INTO publication_reads VALUES(3,'Emplois du temps',1)");await target.query("INSERT INTO publication_reads VALUES(7,'Actualités',1)");
 await source.query("INSERT INTO settings VALUES('schedule_accountant_email','accountant@example.invalid')");
 const untouched=async()=>hash((await target.query('SELECT to_jsonb(u) r FROM users u ORDER BY id')).rows),usersBefore=await untouched();
 let snapshot=await sourceSnapshot(source),audit=await auditGrouped(snapshot,target);
 const approve=a=>({approved:true,reference:'SYNTHETIC TEST ONLY',backupReference:'SYNTHETIC BACKUP',sourceDigest:snapshot.digest,targetDigest:a.targetDigest});
 await t.test('Read-only source export and cross-module audit produce no writes',async()=>{assert.equal(audit.ready,true,JSON.stringify(audit.issues));assert.equal(audit.usersMapped,17);assert.equal(audit.tables.team_messages.insert,3);assert.equal((await targetSnapshot(target)).ledger,null);});
 await t.test('Complete audit works with both connections forced read-only and leaves the target unchanged',async()=>{
  const readOptions={ssl,options:'-c default_transaction_read_only=on'},a=new pg.Pool({...readOptions,connectionString:'postgres://postgres@127.0.0.1:55445/portailtrevoux_db'}),b=new pg.Pool({...readOptions,connectionString:'postgres://postgres@127.0.0.1:55445/portailplus_7495'});
  try{const before=(await targetSnapshot(target)).digest,src=await sourceSnapshot(a),result=await auditGrouped(src,b,{includePrivate:true});assert.equal(result.ready,true);assert.equal(result.previousAttempt.state,'NO_COMMIT_RECEIPT');assert.equal((await b.query("SELECT current_setting('transaction_read_only') AS value")).rows[0].value,'on');assert.equal((await targetSnapshot(target)).digest,before);assert.equal(result.issueSummary.total,0);}finally{await a.end();await b.end();}
 });
 await t.test('Missing optional communication schema is declared and created transactionally',async()=>{
  await target.query('DROP TABLE message_automation_changes,message_automation_runs,message_automations');await target.query('ALTER TABLE team_messages DROP COLUMN reminder_kind; ALTER TABLE team_messages DROP COLUMN automation_text');
  audit=await auditGrouped(snapshot,target);assert.equal(audit.ready,true,JSON.stringify(audit.issues));assert.deepEqual(new Set(audit.ddl),new Set(['message_automations','message_automation_runs','message_automation_changes','team_messages.reminder_kind','team_messages.automation_text']));
 });
 await t.test('Authorization and stale destination are refused before writing',async()=>{await assert.rejects(applyGrouped({source:snapshot,pool:target,approval:{}}),/AUTHORIZATION/);await target.query("UPDATE schedule_posts SET color='#123456' WHERE id=1");await assert.rejects(applyGrouped({source:snapshot,pool:target,approval:approve(audit)}),/DESTINATION_CHANGED/);await target.query("UPDATE schedule_posts SET color='#ffffff' WHERE id=1");});
 await t.test('Unknown referenced collaborator blocks the entire lot',async()=>{const copy=structuredClone(snapshot);copy.tables.team_messages[0].sender_id=15;const p=makePlan(copy,await targetSnapshot(target));assert.equal(p.ready,false);assert(p.issues.some(i=>i.code==='UNMAPPED_REFERENCE'));});
 await t.test('Existing different week and incompatible read watermark block instead of overwriting',async()=>{
  await target.query("INSERT INTO schedule_weeks(week,draft) VALUES('2026-11-02','{}')");let p=makePlan(snapshot,await targetSnapshot(target));assert(p.issues.some(i=>i.table==='schedule_weeks'&&i.code==='EXISTING_TARGET_CONFLICT'));await target.query("DELETE FROM schedule_weeks WHERE week='2026-11-02'");
  await target.query("UPDATE publications SET universe='Emplois du temps' WHERE id=1");p=makePlan(snapshot,await targetSnapshot(target));assert(p.issues.some(i=>i.code==='READ_WATERMARK_WOULD_MARK_LOCAL_UNREAD_AS_READ'));await target.query("UPDATE publications SET universe='Actualités' WHERE id=1");
 });
 await t.test('Failure after all module inserts and sequence restarts rolls everything back',async()=>{
  const before=await targetSnapshot(target),seq=(await target.query('SELECT last_value::text,is_called FROM team_messages_id_seq')).rows[0];
  await assert.rejects(applyGrouped({source:snapshot,pool:target,approval:approve(audit),beforeCommit:async()=>{throw Error('SYNTHETIC_PRECOMMIT_FAILURE');}}),/SYNTHETIC_PRECOMMIT_FAILURE/);
  assert.equal((await targetSnapshot(target)).digest,before.digest);assert.deepEqual((await target.query('SELECT last_value::text,is_called FROM team_messages_id_seq')).rows[0],seq);
 });
 await t.test('One commit preserves all relations, publication null revisions, binary files and JSON nulls',async()=>{
  const result=await applyGrouped({source:snapshot,pool:target,approval:approve(audit)});assert.equal(result.committed,true);assert.equal(result.accountsUpdated,0);assert.equal(result.outboundNotifications,0);assert.equal(result.attachmentsVerified,1);
  const s=await targetSnapshot(target),w=s.tables.schedule_weeks.find(w=>w.week==='2026-11-02');assert.equal(w.revision,15);assert.equal(w.published_revision,null);assert.match(w.published_at,/337123/);assert.equal(w.draft['7:2026-11-02'].userId,7);assert.deepEqual(w.draft['7:2026-11-02'].postIds,[2]);assert.equal(w.locked_days['2026-11-02'].by,59);
  const root=s.tables.team_messages.find(m=>m.text==='Synthetic root'),reply=s.tables.team_messages.find(m=>m.text==='Synthetic reply');assert.equal(root.sender_id,59);assert.equal(reply.sender_id,7);assert.equal(reply.reply_to_id,root.id);assert.equal(reply.thread_id,root.id);assert.equal(root.attachment_content,snapshot.tables.team_messages[0].attachment_content);
  const cell=await target.query('SELECT draft_before IS NULL AS sql_null,jsonb_typeof(draft_before) AS json_type FROM leave_schedule_changes');assert.equal(cell.rows[0].sql_null,false);assert.equal(cell.rows[0].json_type,'null');assert.equal(await untouched(),usersBefore);
  const job=s.tables.message_automations[0];assert.deepEqual(job.config.audience.userIds,[7]);assert.deepEqual(job.config.audience.serviceIds,[2]);assert.equal(s.tables.message_automation_changes[0].actor_id,59);assert.equal(s.tables.team_message_recipients.find(r=>r.message_id===root.id).seen,true);
 });
 await t.test('Identical rerun is idempotent without duplicate messages or histories',async()=>{audit=await auditGrouped(snapshot,target);assert.equal(audit.ready,true,JSON.stringify(audit.issues));for(const v of Object.values(audit.tables)){assert.equal(v.insert,0);assert.equal(v.update,0);}const before=await targetSnapshot(target);await applyGrouped({source:snapshot,pool:target,approval:approve(audit)});assert.equal((await targetSnapshot(target)).digest,before.digest);});
 await t.test('A source-only change updates only the unchanged previously imported row',async()=>{
  await source.query("UPDATE schedule_weeks SET revision=revision+1,draft=jsonb_set(draft,'{3:2026-11-02,note}','\"Synthetic source delta\"'::jsonb) WHERE week='2026-11-02'");snapshot=await sourceSnapshot(source);audit=await auditGrouped(snapshot,target);assert.equal(audit.ready,true,JSON.stringify(audit.issues));assert.equal(audit.tables.schedule_weeks.update,1);const result=await applyGrouped({source:snapshot,pool:target,approval:approve(audit)});assert.equal(result.totalInserted,0);assert.equal(result.totalUpdated,1);assert.equal((await targetSnapshot(target)).tables.schedule_weeks.find(w=>w.week==='2026-11-02').draft['7:2026-11-02'].note,'Synthetic source delta');
 });
 await t.test('Independent target edits are preserved; conflicting source and target edits block',async()=>{
  await target.query("UPDATE team_messages SET text='Local preserved reply' WHERE text='Synthetic reply'");let p=makePlan(snapshot,await targetSnapshot(target));assert.equal(p.ready,true);assert(p.warnings.some(w=>w.code==='LOCAL_CHANGE_PRESERVED'));
  await source.query("UPDATE team_messages SET text='Different Render reply' WHERE text='Synthetic reply'");const newer=await sourceSnapshot(source);p=makePlan(newer,await targetSnapshot(target));assert(p.issues.some(i=>i.code==='SOURCE_TARGET_DIVERGED'));
 });
 await t.test('Read-only diagnosis distinguishes a commit receipt from a missing receipt',async()=>{
  const current=await targetSnapshot(target);assert.equal(previousAttempt({...current,ledger:null}).state,'NO_COMMIT_RECEIPT');const status=previousAttempt(current);assert.equal(status.commitRecorded,true);assert.equal(status.state,'COMMIT_RECORDED_WITH_LATER_DIFFERENCES');
 });
 await source.query("UPDATE team_messages SET text='Synthetic reply' WHERE id=2");await target.query("UPDATE team_messages SET text='Synthetic reply' WHERE text='Local preserved reply'");
 await t.test('IDs 14/15 are diagnosed as orphan JSON vs a source administrator without a target',async()=>{
  const copy=structuredClone(await sourceSnapshot(source)),dest=await targetSnapshot(target);copy.users.push({id:15,first_name:'Synthetic second',last_name:'Administrator',name:'Fixture',role:'admin',active:true,email:'fixture-second@example.invalid',directory_key:null});copy.tables.schedule_templates[0].content['14:0']={userId:14,postIds:[1]};copy.tables.team_messages[0].sender_id=15;
  const p=makePlan(copy,dest),details=identityDiagnostics(copy,dest,p);assert.equal(details.find(r=>r.sourceId===14).state,'SOURCE_USER_ABSENT_ORPHAN_REFERENCES');assert.equal(details.find(r=>r.sourceId===15).sourceRole,'admin');assert.equal(details.find(r=>r.sourceId===15).sourceActive,true);assert.equal(details.find(r=>r.sourceId===15).state,'SOURCE_USER_EXISTS_TARGET_UNRESOLVED');assert.equal(p.ready,false);
 });
 await source.query("INSERT INTO publications(id,universe,title,source_key,created_at) VALUES(282,'Actualités','Protected publication','fixture-target','2020-01-01T00:00:00Z')");
 await source.query("INSERT INTO publication_reads VALUES(3,'Actualités',282)");
 snapshot=await sourceSnapshot(source);
 await t.test('Metadata-only publication collision reuses Scalingo unchanged and archives exact source metadata',async()=>{
  const before=await targetSnapshot(target),old=before.tables.publications.find(p=>p.id==='1');audit=await auditGrouped(snapshot,target,{includePrivate:true});assert.equal(audit.ready,true,JSON.stringify(audit.issues));assert.equal(audit.publicationConflicts[0].resolution,'reuse_target_archive_source');assert.deepEqual(audit.publicationConflicts[0].differences,['created_at']);
  await applyGrouped({source:snapshot,pool:target,approval:approve(audit)});const after=await targetSnapshot(target);assert.equal(hash(after.tables.publications.find(p=>p.id==='1')),hash(old));assert.equal(after.ledger.publicationSources['282'].created_at,'2020-01-01T00:00:00+00:00');
  const again=await auditGrouped(snapshot,target);assert.equal(again.ready,true,JSON.stringify(again.issues));const saved=after.digest;await applyGrouped({source:snapshot,pool:target,approval:approve(again)});assert.equal((await targetSnapshot(target)).digest,saved);
 });
 await target.query("INSERT INTO publications(id,universe,title,source_key) VALUES(11,'Actualités','Target variant','fixture-conflict')");await source.query("INSERT INTO publications(id,universe,title,source_key) VALUES(284,'Actualités','Source variant','fixture-conflict')");snapshot=await sourceSnapshot(source);
 await t.test('Content collision requires explicit preserve-both decision and never overwrites the target',async()=>{
  const a=await auditGrouped(snapshot,target);assert(a.issues.some(i=>i.code==='PUBLICATION_FORK_DECISION_REQUIRED'));const decisions={publicationConflicts:'preserve-both'},review=await auditGrouped(snapshot,target,{decisions});assert.equal(review.ready,true,JSON.stringify(review.issues));assert(review.decisionReview.withoutDecisions.total>review.decisionReview.withDecisions.total);
  await assert.rejects(applyGrouped({source:snapshot,pool:target,approval:approve(review),decisions}),/EXPLICIT_DECISION_AUTHORIZATION_REQUIRED/);
  await applyGrouped({source:snapshot,pool:target,approval:{...approve(review),decisionsDigest:review.decisionsDigest},decisions});const after=await targetSnapshot(target);assert.equal(after.tables.publications.find(p=>p.id==='11').title,'Target variant');const fork=after.tables.publications.find(p=>p.title==='Source variant');assert.match(fork.source_key,/^migration:render:publication:284:/);assert.equal(after.ledger.publicationSources['284'].source_key,'fixture-conflict');const rerun=await auditGrouped(snapshot,target,{decisions});assert.equal(rerun.tables.publications.insert,0);assert.equal(rerun.tables.publications.update,0);
 });
 await source.query("INSERT INTO publications(id,universe,title,source_key) VALUES(286,'Actualités','New source already read','fixture-read-conflict')");await source.query("UPDATE publication_reads SET last_id=286 WHERE user_id=3 AND universe='Actualités'");snapshot=await sourceSnapshot(source);
 await t.test('Conservative reading policy is opt-in, archives both histories and never marks local unread rows as read',async()=>{
  const review=await auditGrouped(snapshot,target);assert(review.issues.some(i=>i.code==='READ_WATERMARK_WOULD_MARK_LOCAL_UNREAD_AS_READ'));const decisions={publicationConflicts:'preserve-both',readHistory:'preserve-target-archive-source'},a=await auditGrouped(snapshot,target,{decisions});assert.equal(a.ready,true,JSON.stringify(a.issues));assert(a.decisionReview.withoutDecisions.total>a.decisionReview.withDecisions.total);
  const before=await targetSnapshot(target),read=before.tables.publication_reads.find(r=>r.user_id===7&&r.universe==='Actualités');await applyGrouped({source:snapshot,pool:target,approval:{...approve(a),decisionsDigest:a.decisionsDigest},decisions});const after=await targetSnapshot(target);assert.equal(hash(after.tables.publication_reads.find(r=>r.user_id===7&&r.universe==='Actualités')),hash(read));const archived=Object.values(after.ledger.readArchives).find(a=>a.universe==='Actualités');assert.equal(archived.sourceLastId,'286');assert(archived.publications.find(p=>p.sourceId==='286').read);assert.equal(archived.targetPublications.find(p=>p.id==='11').read,false);
  const again=await auditGrouped(snapshot,target,{decisions});assert.equal(again.ready,true);const digest=after.digest;await applyGrouped({source:snapshot,pool:target,approval:{...approve(again),decisionsDigest:again.decisionsDigest},decisions});assert.equal((await targetSnapshot(target)).digest,digest);
 });

});
