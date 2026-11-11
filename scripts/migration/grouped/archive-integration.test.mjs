import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {syntheticEvidence} from './execution-test-fixture.mjs';
import {executionCodeDigest} from './execution-policy.mjs';
import {executeIsolatedFixture,readExecutionReceipt,executionReceiptKey} from './secure-executor.mjs';
import {prepareExecution} from './execution-preflight.mjs';
import {automationDDL,sourceSnapshot,targetSnapshot,readSnapshot,auditGrouped,applyGrouped} from './database.mjs';
import {hash,makePlan,ledgerKey,key} from './model.mjs';
const address=process.env.PORTAIL_SYNTHETIC_POSTGRES_ADDRESS;
const decisions={publicationConflicts:'preserve-both',readHistory:'preserve-target-archive-source',planningConflicts:'preserve-target-archive-source',orphanTemplates:'archive-source-unmapped'};
test('Isolated PostgreSQL: execution preflight and conservative archives',{skip:!address,timeout:90000},async t=>{
 assert.match(address,/^127\.0\.0\.1:\d+$/);
 const container=process.env.PORTAIL_SYNTHETIC_POSTGRES_CONTAINER;assert.match(container,/^portail-grouped-synthetic-[a-f0-9]{12}$/);
 const ssl={ca:await readFile(process.env.PORTAIL_SYNTHETIC_POSTGRES_CA,'utf8'),rejectUnauthorized:true};
 const options={connectionTimeoutMillis:5000,host:'127.0.0.1',port:Number(address.split(':')[1]),user:'postgres',ssl};
 const admin=new pg.Client({...options,database:'postgres'});await admin.connect();
 assert.equal((await admin.query('SHOW cluster_name')).rows[0].cluster_name,'portailplus-grouped-synthetic');
 // These names satisfy application guards but exist only in the disposable local cluster.
 for(const name of ['portailtrevoux_db','portailplus_7495'])await admin.query('CREATE DATABASE '+name);
 await admin.end();
 const source=new pg.Pool({...options,database:'portailtrevoux_db'}),target=new pg.Pool({...options,database:'portailplus_7495'});
 const statements=[];target.on('connect',client=>{client.query=function(...args){statements.push(typeof args[0]==='string'?args[0]:args[0].text);return pg.Client.prototype.query.apply(this,args);};});
 t.after(async()=>{await source.end();await target.end();});
 for(const pool of [source,target]){await pool.query(await readFile(new URL('../../../schema.sql',import.meta.url),'utf8'));await pool.query(automationDDL);await pool.query('ALTER TABLE team_messages ADD COLUMN reminder_kind text; ALTER TABLE team_messages ADD COLUMN automation_text text');}
 const pairs=[[3,7],[2,8],[16,9],[17,10],[4,11],[12,12],[13,13],[10,14],[6,15],[8,16],[5,17],[21,18],[9,19],[11,20],[7,21],[20,22],[1,59],[15,60]];
 for(const [a,b]of pairs)for(const [pool,id]of [[source,a],[target,b]])await pool.query('INSERT INTO users(id,name,first_name,last_name,email,role,job,directory_key,rights,active) VALUES($1,$2,$2,$3,$4,$5,$6,$7,$8,true)',[id,'Synthetic-'+a,'Fixture','fixture-'+a+'@example.invalid',[1,15].includes(a)?'admin':'employee',pool===target?'PROTECTED MANUAL JOB':'source job','fixture-'+id+'-'+(pool===target?'target':'source'),'["fixture-right"]']);
 await target.query("INSERT INTO users(id,name,first_name,last_name,role) VALUES(1,'Synthetic test admin','Synthetic','Test','admin')");
 await target.query("INSERT INTO sessions(id,user_id,csrf,expires_at) VALUES('synthetic-session',59,'synthetic-csrf','2099-01-01')");
 await target.query("INSERT INTO order_mfa(user_id,secret) VALUES(59,'synthetic-not-a-real-secret')");
 for(const pool of [source,target])await pool.query("INSERT INTO schedule_posts(id,name,color) VALUES(1,$1,'#123456')",[pool===source?'Source post':'Protected post']);
 const cell={'3:2026-11-02':{userId:3,postIds:[1],leaveRequestId:1,note:'Synthetic source week'}};
 await source.query("INSERT INTO schedule_weeks(week,draft,published,revision,published_revision,published_at,locked_days) VALUES('2026-11-02',$1,$1,7,7,'2026-11-01T12:00:00.123456Z',$2),('2026-11-09',$1,NULL,2,NULL,NULL,'{}')",[JSON.stringify(cell),JSON.stringify({'2026-11-02':{by:1}})]);
 await target.query("INSERT INTO schedule_weeks(week,draft,published,revision,published_revision,published_at,locked_days) VALUES('2026-11-02',$1,$1,21,21,'2026-11-02T12:00:00Z',$2)",[JSON.stringify({'7:2026-11-02':{userId:7,note:'PROTECTED TARGET',postIds:[1]}}),JSON.stringify({'2026-11-02':{by:59}})]);
 const template={'14:0':{userId:14,postIds:[1],note:'Unknown historical source user'},'3:1':{userId:3,postIds:[1]}};
 for(const [id,name]of [[1,'Semaine paire fictive'],[2,'Semaine impaire fictive']])await source.query('INSERT INTO schedule_templates(id,name,content) VALUES($1,$2,$3)',[id,name,JSON.stringify(template)]);
 await source.query("INSERT INTO schedule_templates(id,name,content) VALUES(3,'Known-only fictive template',$1)",[JSON.stringify({'3:0':{userId:3,postIds:[1]}})]);
 await target.query("INSERT INTO schedule_templates(id,name,content) VALUES(1,'Protected target template','{}')");
 await source.query("INSERT INTO leave_requests(id,user_id,leave_type,start_date,end_date,start_part,end_part,status,reviewed_by,planning_applied) VALUES(1,3,'paid','2026-11-02','2026-11-02','day','day','approved',1,true)");
 await source.query("INSERT INTO leave_schedule_changes VALUES(1,'2026-11-02','2026-11-02','null'::jsonb,$1,'null'::jsonb,$1)",[JSON.stringify(cell)]);
 await source.query("INSERT INTO team_messages(id,sender_id,sender_name,text,thread_id) VALUES(2,15,'Synthetic second admin','Synthetic parent',2)");
 await source.query("INSERT INTO team_messages(id,sender_id,sender_name,text,thread_id,reply_to_id,is_reply,attachment_name,attachment_type,attachment_content) VALUES(1,3,'Synthetic','Synthetic reply',2,2,true,'fixture.bin','application/octet-stream',$1)",[Buffer.from([0,255,12,0,127])]);
 await target.query("INSERT INTO team_messages(id,sender_id,sender_name,text,thread_id) VALUES(1,59,'Protected','Protected message',99)");
 await source.query('INSERT INTO team_message_recipients(message_id,user_id,seen,archived) VALUES(1,15,true,false),(2,3,false,true)');
 await source.query("INSERT INTO message_automations(id,kind,name,config,created_by,updated_by) VALUES('synthetic-job','custom','Synthetic enabled job',$1,15,1)",[JSON.stringify({audience:{userIds:[3,15]}})]);
 await source.query("INSERT INTO message_automation_runs(id,automation_id,occurrence,status) VALUES(1,'synthetic-job','2026-11-02','sent')");
 await source.query("INSERT INTO message_automation_changes(id,automation_id,actor_id,action) VALUES(1,'synthetic-job',15,'create')");
 await source.query("INSERT INTO publications(id,universe,title,source_key) VALUES(1,'Fixture','Source publication','synthetic-collision')");
 await target.query("INSERT INTO publications(id,universe,title,source_key) VALUES(1,'Fixture','Protected publication','synthetic-collision')");
 await source.query("INSERT INTO publication_reads VALUES(3,'Fixture',1)");await target.query("INSERT INTO publication_reads VALUES(7,'Fixture',1)");
 const env={...process.env};for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[k];
 const docker=(...args)=>execFileSync('docker',['--host=unix:///var/run/docker.sock','exec',container,...args],{env,encoding:'utf8'});
 const sequences=async(pool=target)=>{
  const rows=(await pool.query("SELECT * FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows;
  for(const row of rows)Object.assign(row,(await pool.query('SELECT last_value::text AS exact_value,is_called FROM public."'+row.sequencename.replaceAll('"','""')+'"')).rows[0]);
  return rows;
 };
 const fullState=async()=>({snapshot:await targetSnapshot(target),protected:(await target.query("SELECT jsonb_build_object('users',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM users u),'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM sessions s),'mfa',(SELECT jsonb_agg(to_jsonb(m) ORDER BY user_id) FROM order_mfa m)) AS value")).rows[0].value,sequences:await sequences(),allSettings:(await target.query('SELECT key,value FROM settings ORDER BY key')).rows});
 await target.query('ALTER SEQUENCE team_messages_id_seq RESTART WITH 500');
 const baseline=await fullState(),snapshot=await sourceSnapshot(source);
 const backupReceipt={verified:true,reference:'synthetic-restored-backup',completedAt:new Date().toISOString()},operatorApproval={approved:true,reference:'synthetic-isolated-tests-only'};
 const preflight=(src,dst,extra={})=>prepareExecution({source:src,target:dst,decisions,backupReceipt,operatorApproval,...extra});
 await t.test('TLS, source snapshot and preflight never write; missing backup/approval/decisions fail closed',async()=>{
  t.diagnostic('Synthetic PostgreSQL '+(await target.query('SHOW server_version')).rows[0].server_version);
  assert.equal((await target.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);
  const before=hash(await fullState());const pre=preflight(snapshot,baseline.snapshot);assert.equal(pre.executionEnabled,false);assert.equal(pre.dataWrites,0);assert.deepEqual(pre.archiveCounts,{weeks:1,templates:2});
  for(const extra of [{backupReceipt:null},{backupReceipt:{...backupReceipt,verified:false}},{backupReceipt:{...backupReceipt,completedAt:'invalid'}},{operatorApproval:null},{decisions:{}},{source:{}}])assert.throws(()=>preflight(snapshot,baseline.snapshot,extra));
  assert.equal(hash(await fullState()),before);
 });
 await t.test('A synthetic logical pg_dump backup is restored separately and checked before any application import',async()=>{
  docker('pg_dump','-U','postgres','-d','portailplus_7495','-Fc','-f','/tmp/synthetic-backup.dump');docker('createdb','-U','postgres','synthetic_restore');docker('pg_restore','-U','postgres','-d','synthetic_restore','--exit-on-error','/tmp/synthetic-backup.dump');
  const restored=new pg.Client({...options,database:'synthetic_restore'});await restored.connect();try{await restored.query('BEGIN READ ONLY');assert.equal((await readSnapshot(restored)).digest,baseline.snapshot.digest);assert.deepEqual(await sequences(restored),baseline.sequences);const restoredProtected=(await restored.query("SELECT jsonb_build_object('users',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM users u),'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM sessions s),'mfa',(SELECT jsonb_agg(to_jsonb(m) ORDER BY user_id) FROM order_mfa m)) AS value")).rows[0].value;assert.deepEqual(restoredProtected,baseline.protected);await restored.query('ROLLBACK');}finally{await restored.end();}
 });
 await t.test('Archived week and both orphan templates contain exact original JSON and SHA-256; user 14 stays unmapped',async()=>{
  const plan=makePlan(snapshot,baseline.snapshot,decisions);assert.equal(plan.ready,true,JSON.stringify(plan.issues));assert.equal(plan.maps.users[14],undefined);assert.equal(plan.maps.users[15],60);assert.equal(plan.maps.users[3],7);
  for(const a of Object.values(plan.nextLedger.planningArchives)){assert.equal(a.sourceHash,hash(a.source));assert.equal(a.sourceKey,key(a.table,a.source));assert.deepEqual(a.source,snapshot.tables[a.table].find(r=>key(a.table,r)===a.sourceKey));}
  assert(Object.values(plan.nextLedger.planningArchives).filter(a=>a.table==='schedule_templates').every(a=>Number(a.unmappedSourceUserId)===14));
  assert.equal(plan.operations.filter(o=>o.table==='schedule_templates').length,1);assert.equal(plan.operations.find(o=>o.table==='schedule_templates').row.content['7:0'].userId,7);
 });
 await t.test('Stale target and missing execution approval refuse before writes',async()=>{
  await assert.rejects(applyGrouped({source:snapshot,pool:target,decisions,approval:{}}),/AUTHORIZATION/);
  const approval=preflight(snapshot,baseline.snapshot).approval;await target.query("UPDATE schedule_posts SET color='#654321' WHERE id=1");const before=hash(await fullState());await assert.rejects(applyGrouped({source:snapshot,pool:target,decisions,approval}),/DESTINATION_CHANGED/);assert.equal(hash(await fullState()),before);await target.query("UPDATE schedule_posts SET color='#123456' WHERE id=1");
 });
 await t.test('Forced late failure rolls back inserted rows, archive receipt, DDL and sequence restarts',async()=>{
  await target.query('DROP TABLE message_automation_changes,message_automation_runs,message_automations');await target.query('ALTER TABLE team_messages DROP COLUMN reminder_kind; ALTER TABLE team_messages DROP COLUMN automation_text');
  const before=await fullState(),approval=preflight(snapshot,before.snapshot).approval;
  await assert.rejects(applyGrouped({source:snapshot,pool:target,decisions,approval,beforeCommit:async()=>{throw Error('SYNTHETIC_INJECTED_FAILURE');}}),/SYNTHETIC_INJECTED_FAILURE/);assert.deepEqual(await fullState(),before);
  await target.query(automationDDL);await target.query('ALTER TABLE team_messages ADD COLUMN reminder_kind text; ALTER TABLE team_messages ADD COLUMN automation_text text');
 });
 await t.test('SQL check constraint failure rolls back all earlier module inserts',async()=>{
  const bad=structuredClone(snapshot);bad.tables.team_messages[0].title='x'.repeat(121);bad.digest=hash(bad);
  const before=await fullState(),approval=preflight(bad,before.snapshot).approval;await assert.rejects(applyGrouped({source:bad,pool:target,decisions,approval}),e=>e.code==='23514');assert.deepEqual(await fullState(),before);
 });
 await t.test('Unsafe sequence increments are refused and all module writes roll back',async()=>{
  await target.query('ALTER SEQUENCE team_messages_id_seq INCREMENT BY 2');
  try{const before=await fullState(),approval=preflight(snapshot,before.snapshot).approval;await assert.rejects(applyGrouped({source:snapshot,pool:target,decisions,approval}),/UNREVIEWED_SEQUENCE/);assert.deepEqual(await fullState(),before);}finally{await target.query('ALTER SEQUENCE team_messages_id_seq INCREMENT BY 1');}
 });
 await t.test('Atomic import preserves target week, maps FKs and JSON, keeps users, MFA and sessions, emits no notifications',async()=>{
  let attempts=0;const savedFetch=globalThis.fetch;globalThis.fetch=()=>{attempts++;throw Error('NETWORK_SEND_FORBIDDEN');};
  const listener=new pg.Client({...options,database:'portailplus_7495'});await listener.connect();const notifications=[];listener.on('notification',n=>notifications.push(n));await listener.query('LISTEN portail_notification');
  try{const approval=preflight(snapshot,(await targetSnapshot(target))).approval;const result=await applyGrouped({source:snapshot,pool:target,decisions,approval});assert.equal(result.committed,true);assert.equal(result.totalInserted,13);const receipt=await targetSnapshot(target);assert.equal(result.ledgerDigest,hash(receipt.ledger));assert.equal(result.targetAfterDigest,receipt.digest);assert.equal(result.outboundNotifications,0);assert.equal(result.accountsUpdated,0);assert.equal(attempts,0);assert.deepEqual(notifications,[]);assert(!statements.some(sql=>/\b(NOTIFY|pg_notify)\b/i.test(sql)));}finally{globalThis.fetch=savedFetch;await listener.end();}
  const after=await fullState(),plan=makePlan(snapshot,after.snapshot,decisions);assert.deepEqual(after.protected,baseline.protected);
  assert.deepEqual(after.snapshot.tables.schedule_weeks.find(w=>w.week==='2026-11-02'),baseline.snapshot.tables.schedule_weeks[0]);
  const week=after.snapshot.tables.schedule_weeks.find(w=>w.week==='2026-11-09');assert.equal(week.draft['7:2026-11-02'].userId,7);assert.equal(week.draft['7:2026-11-02'].postIds[0],2);
  const parent=after.snapshot.tables.team_messages.find(m=>m.text==='Synthetic parent'),reply=after.snapshot.tables.team_messages.find(m=>m.text==='Synthetic reply');assert.equal(parent.sender_id,60);assert.equal(reply.sender_id,7);assert.equal(reply.reply_to_id,parent.id);assert.equal(reply.thread_id,parent.id);assert.equal(reply.attachment_content,snapshot.tables.team_messages[0].attachment_content);
  assert(after.snapshot.tables.team_message_recipients.some(r=>r.user_id===60&&r.message_id===reply.id));assert.equal(after.snapshot.tables.leave_requests[0].user_id,7);assert.equal(after.snapshot.tables.leave_schedule_changes[0].request_id,after.snapshot.tables.leave_requests[0].id);
  assert.equal(plan.issues.length,0);assert.equal(Object.keys(after.snapshot.ledger.planningArchives).length,3);assert.equal(after.sequences.find(s=>s.sequencename==='team_messages_id_seq').exact_value,'500');assert.equal(after.sequences.find(s=>s.sequencename==='team_messages_id_seq').is_called,false);
 });
 await t.test('Second execution is idempotent including the complete archive ledger and every sequence',async()=>{
  const before=await fullState(),pre=preflight(snapshot,before.snapshot);const result=await applyGrouped({source:snapshot,pool:target,decisions,approval:pre.approval});assert.equal(result.totalInserted,0);assert.equal(result.totalUpdated,0);assert.deepEqual(await fullState(),before);
 });
 await t.test('Archive corruption in a stored ledger is rejected, not silently repaired or overwritten',async()=>{
  const before=await targetSnapshot(target),corrupt=structuredClone(before);Object.values(corrupt.ledger.planningArchives)[0].sourceHash='bad';assert.throws(()=>preflight(snapshot,corrupt),/ARCHIVE_INTEGRITY/);
  await target.query('UPDATE settings SET value=$1 WHERE key=$2',[JSON.stringify(corrupt.ledger),ledgerKey]);
  try{const damaged=await targetSnapshot(target),state=await fullState(),approval={...preflight(snapshot,before).approval,targetDigest:damaged.digest};await assert.rejects(applyGrouped({source:snapshot,pool:target,decisions,approval}),/ARCHIVE_INTEGRITY/);assert.deepEqual(await fullState(),state);}finally{await target.query('UPDATE settings SET value=$1 WHERE key=$2',[JSON.stringify(before.ledger),ledgerKey]);}
 });
 await t.test('Source deltas add immutable archive versions; the previous original is retained',async()=>{
  const before=await targetSnapshot(target),changed=structuredClone(snapshot);
  changed.tables.schedule_templates[0].content['14:0'].note='Synthetic later source correction';
  changed.tables.schedule_weeks.find(w=>w.week==='2026-11-02').revision++;
  changed.digest=hash(changed);
  const approval=preflight(changed,before).approval;await applyGrouped({source:changed,pool:target,decisions,approval});
  const after=await targetSnapshot(target);assert.equal(Object.keys(after.ledger.planningArchives).length,5);
  for(const [k,a]of Object.entries(before.ledger.planningArchives))assert.deepEqual(after.ledger.planningArchives[k],a);
  const state=await fullState();await applyGrouped({source:changed,pool:target,decisions,approval:preflight(changed,after).approval});assert.deepEqual(await fullState(),state);
 });
 await t.test('Separate secure executor: refusals, atomic receipt, replay and uncertain COMMIT',async secure=>{
  await source.query("INSERT INTO team_messages(id,sender_id,sender_name,text,thread_id) VALUES(77,15,'Synthetic secure sender','Synthetic secure batch',77)");
  let resumes=0,outbound=0;const originalFetch=globalThis.fetch;globalThis.fetch=()=>{outbound++;throw Error('EXTERNAL_SEND_FORBIDDEN');};
  const request=async()=>{
   const data=syntheticEvidence(await sourceSnapshot(source),await targetSnapshot(target),await executionCodeDigest());
   return {...data,sourcePool:source,targetPool:target,quiescence:{verifyPaused:async()=>({...data.proofs.pause,observedAt:new Date().toISOString()}),resume:()=>{resumes++;throw Error('RESUME_FORBIDDEN');}}};
  };
  try{
   await secure.test('Missing final human authorization leaves all rows and receipts untouched',async()=>{
    const data=await request(),before=await fullState();data.authorization=null;await assert.rejects(executeIsolatedFixture(data),/DISTINCT_FINAL_HUMAN/);assert.deepEqual(await fullState(),before);
   });
   await secure.test('Insufficient pool capacity refuses instead of waiting forever with a retained mutex',async()=>{
    const data=await request(),before=await fullState(),max=target.options.max;target.options.max=1;
    try{await assert.rejects(executeIsolatedFixture(data),/EXECUTOR_POOL_REQUIRES_TWO_CONNECTIONS/);}finally{target.options.max=max;}assert.deepEqual(await fullState(),before);
   });
   await secure.test('An active scheduler lock prevents import without stopping or resuming a job',async()=>{
    const data=await request(),before=await fullState(),busy=await target.connect();await busy.query('SELECT pg_advisory_lock(20261028,1)');
    try{await assert.rejects(executeIsolatedFixture(data),e=>e.code==='SCHEDULER_OR_STARTUP_BUSY'&&e.commitState==='NOT_STARTED');assert.deepEqual(await fullState(),before);}finally{await busy.query('SELECT pg_advisory_unlock(20261028,1)');busy.release();}
   });
   await secure.test('Lost pause before COMMIT rolls back the entire transaction',async()=>{
    const data=await request(),before=await fullState();let calls=0;data.quiescence.verifyPaused=async()=>({...data.proofs.pause,notificationsStopped:++calls<3,observedAt:new Date().toISOString()});
    await assert.rejects(executeIsolatedFixture(data),e=>e.code==='VERIFIED_QUIESCENCE_REQUIRED'&&e.commitState==='ROLLED_BACK');assert.deepEqual(await fullState(),before);
   });
   await secure.test('Failure after receipt INSERT rolls back data, archive and receipt together',async()=>{
    const data=await request(),before=await fullState();data.beforeCommit=async()=>{throw Error('SYNTHETIC_AFTER_RECEIPT_FAILURE');};
    await assert.rejects(executeIsolatedFixture(data),e=>e.commitState==='ROLLED_BACK'&&e.neverRetryAutomatically===true);assert.deepEqual(await fullState(),before);
    const receipt=await readExecutionReceipt(target,data.authorization.reference);assert.equal(receipt.state,'NO_COMMIT_RECEIPT');assert.equal(receipt.rollbackProven,false);
   });
   await secure.test('A source modification after audit refuses before transaction writes',async()=>{
    const data=await request(),before=await fullState();await source.query("UPDATE team_messages SET text='Synthetic late edit' WHERE id=77");
    try{await assert.rejects(executeIsolatedFixture(data),e=>e.code==='SOURCE_CHANGED_SINCE_AUDIT'&&e.commitState==='NOT_STARTED');assert.deepEqual(await fullState(),before);}finally{await source.query("UPDATE team_messages SET text='Synthetic secure batch' WHERE id=77");}
   });
   let committedRequest;
   await secure.test('Receipt is visible only with committed data and contains no personal data or secrets',async()=>{
    committedRequest=await request();const result=await executeIsolatedFixture(committedRequest);assert.equal(result.commitConfirmed,true);assert.equal(result.replayed,false);assert.equal(result.automaticResume,false);assert.equal(result.pauseAfterCommit,'confirmed');assert.equal(result.totalInserted,1);
    assert.equal(result.targetAfterDigest,(await targetSnapshot(target)).digest);const stored=await readExecutionReceipt(target,committedRequest.authorization.reference);assert.equal(stored.state,'COMMIT_RECORDED');assert.equal(stored.receipt.receiptDigest,result.receiptDigest);assert(!JSON.stringify(result).includes('@example.invalid'));assert.equal((await target.query("SELECT count(*)::int AS n FROM team_messages WHERE text='Synthetic secure batch'")).rows[0].n,1);
   });
   await secure.test('Replaying the same approved batch returns its receipt with zero duplicate writes',async()=>{
    const before=await fullState(),result=await executeIsolatedFixture(committedRequest);assert.equal(result.replayed,true);assert.equal(result.commitConfirmed,true);assert.deepEqual(await fullState(),before);
   });
   await secure.test('A final authorization cannot be reused for another source/target batch',async()=>{
    const data=await request(),before=await fullState();await assert.rejects(executeIsolatedFixture(data),e=>e.code==='AUTHORIZATION_ALREADY_USED_FOR_OTHER_BATCH'&&e.commitState==='NOT_STARTED');assert.deepEqual(await fullState(),before);
   });
   await secure.test('A corrupted durable receipt is refused and never treated as permission to rerun',async()=>{
    const reference=committedRequest.authorization.reference,k=executionReceiptKey(reference),row=(await target.query('SELECT value FROM settings WHERE key=$1',[k])).rows[0],bad=JSON.parse(row.value);bad.totalInserted++;
    await target.query('UPDATE settings SET value=$1 WHERE key=$2',[JSON.stringify(bad),k]);
    try{await assert.rejects(readExecutionReceipt(target,reference),/EXECUTION_RECEIPT_CORRUPT/);const before=await fullState();await assert.rejects(executeIsolatedFixture(committedRequest),e=>e.code==='EXECUTION_RECEIPT_CORRUPT');assert.deepEqual(await fullState(),before);}finally{await target.query('UPDATE settings SET value=$1 WHERE key=$2',[row.value,k]);}
   });
   await secure.test('Lost COMMIT response is UNKNOWN; read-only receipt proves the commit without automatic retry',async()=>{
    await source.query("INSERT INTO team_messages(id,sender_id,sender_name,text,thread_id) VALUES(78,15,'Synthetic secure sender','Synthetic uncertain commit',78)");
    const data=await request();data.authorization.reference='fixture-final-authorization-002';const original=pg.Client.prototype.query;let fired=false;
    pg.Client.prototype.query=function(...args){const result=original.apply(this,args);if(this.database==='portailplus_7495'&&args[0]==='COMMIT'&&!fired){fired=true;return Promise.resolve(result).then(()=>{throw Object.assign(Error('Synthetic lost commit response'),{code:'SYNTHETIC_LOST_COMMIT'});});}return result;};
    try{await assert.rejects(executeIsolatedFixture(data),e=>e.commitState==='UNKNOWN'&&e.neverRetryAutomatically===true&&e.receiptKey===executionReceiptKey(data.authorization.reference));}finally{pg.Client.prototype.query=original;}
    const receipt=await readExecutionReceipt(target,data.authorization.reference);assert.equal(receipt.state,'COMMIT_RECORDED');assert.equal(receipt.executionAllowed,false);const before=await fullState(),replay=await executeIsolatedFixture(data);assert.equal(replay.replayed,true);assert.deepEqual(await fullState(),before);
   });
   await secure.test('Pause verification loss after COMMIT is reported as committed, never as a rollback or automatic resume',async()=>{
    await source.query("INSERT INTO team_messages(id,sender_id,sender_name,text,thread_id) VALUES(79,15,'Synthetic secure sender','Synthetic post-commit pause check',79)");
    const data=await request();data.authorization.reference='fixture-final-authorization-003';let calls=0;data.quiescence.verifyPaused=async()=>({...data.proofs.pause,notificationsStopped:++calls<4,observedAt:new Date().toISOString()});
    const result=await executeIsolatedFixture(data);assert.equal(result.commitConfirmed,true);assert.equal(result.pauseAfterCommit,'UNKNOWN_REQUIRES_OPERATOR');assert.equal(result.automaticResume,false);assert.equal((await readExecutionReceipt(target,data.authorization.reference)).state,'COMMIT_RECORDED');
   });
   assert.equal(resumes,0,'No path may resume notifications or workers');assert.equal(outbound,0);assert(!statements.some(sql=>/\b(NOTIFY|pg_notify)\b/i.test(sql)));
  }finally{globalThis.fetch=originalFetch;await source.query('DELETE FROM team_messages WHERE id IN (77,78,79)');}
 });
 await t.test('PostgreSQL primary keys, FKs, CHECK and unique constraints remain active',async()=>{
  for(const [sql,code]of [["INSERT INTO team_message_recipients(message_id,user_id) VALUES(999999,7)",'23503'],["INSERT INTO publications(id,universe,title) VALUES(1,'Fixture','duplicate')",'23505'],["INSERT INTO leave_requests(id,user_id,leave_type,start_date,end_date,start_part,end_part,status) VALUES(999,7,'paid','2026-11-02','2026-11-02','day','day','invalid')",'23514']])await assert.rejects(target.query(sql),e=>e.code===code);
  const check=await target.connect();try{await check.query('BEGIN');await check.query("INSERT INTO leave_requests(id,user_id,leave_type,start_date,end_date,start_part,end_part,status) VALUES(998,7,'paid','2026-11-12','2026-11-12','day','day','pending')");await assert.rejects(check.query("INSERT INTO leave_requests(id,user_id,leave_type,start_date,end_date,start_part,end_part,status) VALUES(997,7,'paid','2026-11-12','2026-11-12','day','day','pending')"),e=>e.code==='23505');}finally{await check.query('ROLLBACK');check.release();}
  const constraints=(await target.query("SELECT count(*)::int AS n FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace")).rows[0].n;assert(constraints>0);
 });
 await t.test('Sequence allocation remains above imported and reserved thread IDs',async()=>{
  for(const table of ['schedule_posts','schedule_templates','leave_requests','team_messages','message_automation_runs','message_automation_changes','publications']){
   const next=(await target.query("SELECT nextval(pg_get_serial_sequence($1,'id'))::int AS id",['public.'+table])).rows[0].id;const max=Math.max(0,...(await targetSnapshot(target)).tables[table].map(r=>Number(r.id)));assert(next>max,table);if(table==='team_messages')assert(next>99);
  }
 });
 assert.equal((await sourceSnapshot(source)).digest,snapshot.digest,'source fixture was never changed by migration');
 const run=await readFile(new URL('./run.mjs',import.meta.url),'utf8');assert.match(run,/runtime\.mode!=='audit'/);assert.doesNotMatch(run,/applyGrouped\s*\(/);
});
