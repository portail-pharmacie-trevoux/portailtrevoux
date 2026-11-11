import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {createHash} from 'node:crypto';
import {createProductionJobController} from '../scripts/scalingo-production-jobs.mjs';
import {createScalingoProductionApp,checkProductionPrerequisites} from '../scripts/scalingo-production-profile.mjs';
import {hashPassword,token,digest} from '../security.mjs';
import {PDFDocument} from 'pdf-lib';
import {totp} from '../order-mfa.mjs';
const address=process.env.PORTAIL_SYNTHETIC_POSTGRES_ADDRESS;
test('Production profile / isolated PostgreSQL: real handlers, synthetic data only',{skip:!address,timeout:90000},async t=>{
 assert.match(address,/^127\.0\.0\.1:\d+$/);
 const options={host:'127.0.0.1',port:Number(address.split(':')[1]),user:'postgres',ssl:{ca:await readFile(process.env.PORTAIL_SYNTHETIC_POSTGRES_CA,'utf8'),rejectUnauthorized:true}};
 const admin=new pg.Client({...options,database:'postgres'});await admin.connect();assert.equal((await admin.query('SHOW cluster_name')).rows[0].cluster_name,'portailplus-grouped-synthetic');await admin.query('CREATE DATABASE portailplus_daily_test');await admin.end();
 const db=new pg.Pool({...options,database:'portailplus_daily_test',max:8});t.after(()=>db.end());
 await db.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
 const rights=['Agenda','Actualités','Emplois du temps',"Outils d'aide aux commandes",'Collaborateurs','Ressources humaines','Formations','Laboratoires','Contacts utiles','Challenges','Fun',"Outils d'aide à la démarche qualité", "Outils d'aide au merchandising",'Procédures'];
 const password='Synthetic-only-passphrase-2026!',hash=await hashPassword(password),cookies={};
 for(const [id,role]of [[59,'admin'],[60,'admin'],[7,'employee'],[8,'employee'],[9,'employee']]){
  await db.query(`INSERT INTO users(id,name,first_name,last_name,email,password_hash,role,job,active,must_change,permissions_configured,rights,edit_rights,directory_key) VALUES($1,$2,$2,'Fixture',$3,$4,$5,'MANUAL PROTECTED JOB',true,false,true,$6,$7,$8)`,[id,'Synthetic '+id,'synthetic-'+id+'@example.invalid',hash,role,JSON.stringify(rights),JSON.stringify(['Agenda','Actualités','Fun']),'synthetic-key-'+id]);
  const raw=token();cookies[id]='trevoux_session='+raw;await db.query("INSERT INTO sessions(id,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[digest(raw),id,'csrf-'+id]);
 }
 await db.query("INSERT INTO schedule_weeks(week,draft,published,revision,published_revision,published_at) VALUES('2026-11-02','{}','{}',12,12,now())");
 const protectedState=async()=>({users:(await db.query('SELECT * FROM users ORDER BY id')).rows,week:(await db.query("SELECT * FROM schedule_weeks WHERE week='2026-11-02'")).rows});
 await db.query("INSERT INTO schedule_posts(id,name,color) VALUES(1,'Synthetic post','#123456')");
 const before=await protectedState();
 await t.test('Additive SQL is transactional, repeatable and preserves manually entered records',async()=>{
  const sql=await readFile(new URL('../scripts/sql/scalingo-production-parity.sql',import.meta.url),'utf8');await db.query(sql);await db.query(sql);assert.deepEqual(await protectedState(),before);assert.equal((await checkProductionPrerequisites(db)).dataWrites,0);
 });
 let external=0;const env={APP_URL:'https://www.portailplus-officine.fr',APP_SECRET:'synthetic-daily-profile-secret-'.repeat(3)};
 const runtime=await createScalingoProductionApp(db,env,{fetch:async()=>{external++;throw Error('External call forbidden');}});
 const server=runtime.app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
 const request=(path,method='GET',body,user=59,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{origin:env.APP_URL,cookie:cookies[user]||'','x-csrf-token':'csrf-'+user,'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
 const ok=async(path,method='GET',body,user=59,status=200)=>{const r=await request(path,method,body,user);const text=await r.text();assert.equal(r.status,status,path+': '+text.slice(0,300));return text?JSON.parse(text):null;};
 await t.test('No test administrator, no startup seed, purge, scheduler or external request',async()=>{
  assert.deepEqual(await protectedState(),before);assert.equal(runtime.jobsStarted,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM team_messages')).rows[0].n,0);assert.equal(external,0);
  assert.equal((await request('/api/schedule?week=2026-11-02','GET',undefined,0)).status,401);
  assert.equal((await request('/api/news','POST',{text:'Synthetic',recipients:[7]},59,{origin:'https://foreign.invalid'})).status,403);
  assert.equal((await request('/api/news','POST',{text:'Synthetic',recipients:[7]},59,{'x-csrf-token':'wrong'})).status,403);
  assert.equal((await request('/staging-personal-admin-diagnostic')).status,403);
  assert.equal((await request('/api/mail/connect','POST',{})).status,409);
 });
 await t.test('Templates persist, apply to a week, reject stale revisions and non-administrators',async()=>{
  const template=await ok('/api/schedule-templates','POST',{name:'Synthetic paired template'},59,201);
  const day={revision:template.revision,userId:7,weekday:0,kind:'travail',slots:[['08:00','12:00']],postIds:[1]};
  const modified=await ok('/api/schedule-templates/'+template.id+'/day','PUT',day);
  assert.equal((await request('/api/schedule-templates/'+template.id+'/day','PUT',day)).status,409);
  assert.equal((await request('/api/schedule-templates','POST',{name:'Denied'},7)).status,403);
  assert.equal((await ok('/api/schedule-templates/'+template.id)).entries[0].userId,7);
  await ok('/api/schedule/2026-11-09/apply-template','POST',{revision:0,templateId:template.id,templateRevision:modified.revision});
  assert.equal((await ok('/api/schedule?week=2026-11-09')).entries[0].userId,7);
 });
 await t.test('Publication: changed recipients only, concurrent replay, revision protection and preserved unread',async()=>{
  const week='2026-11-16',old={['7:'+week]:{userId:7,day:week,kind:'travail',slots:[['08:00','12:00']]}},draft={...old,['8:'+week]:{userId:8,day:week,kind:'repos',slots:[]}};
  await db.query('INSERT INTO schedule_weeks(week,draft,published,revision,published_revision,published_at) VALUES($1,$2,$3,3,2,now())',[week,JSON.stringify(draft),JSON.stringify(old)]);
  const attempts=await Promise.all([ok('/api/schedule/'+week+'/publish','POST',{revision:3}),ok('/api/schedule/'+week+'/publish','POST',{revision:3})]);assert.equal(attempts.filter(r=>r.alreadyPublished).length,1);
  const notice=(await db.query('SELECT id FROM team_messages WHERE planning_week=$1',[week])).rows;assert.equal(notice.length,1);assert.deepEqual((await db.query('SELECT user_id,seen FROM team_message_recipients WHERE message_id=$1',[notice[0].id])).rows,[{user_id:8,seen:false}]);
  const loaded=await ok('/api/schedule?week='+week);assert.equal(loaded.unpublishedChanges,false);assert(loaded.publishedAt);
  assert.equal((await request('/api/schedule/'+week+'/publish','POST',{revision:2})).status,409);
  assert.equal((await request('/api/schedule/'+week+'/publish','POST',{revision:3},7)).status,403);
  assert.deepEqual((await db.query('SELECT published FROM schedule_weeks WHERE week=$1',[week])).rows[0].published,draft);
 });
 await t.test('Publication delivery failure rolls back state, notice and publication',async()=>{
  const week='2026-11-30',draft={['7:'+week]:{userId:7,day:week,kind:'repos',slots:[]}};
  await db.query('INSERT INTO schedule_weeks(week,draft,revision) VALUES($1,$2,1)',[week,JSON.stringify(draft)]);
  const before=(await db.query('SELECT * FROM schedule_weeks WHERE week=$1',[week])).rows;
  await db.query("CREATE FUNCTION fail_synthetic_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;CREATE TRIGGER synthetic_failure BEFORE INSERT ON team_message_recipients FOR EACH ROW EXECUTE FUNCTION fail_synthetic_delivery()");
  try{assert.equal((await request('/api/schedule/'+week+'/publish','POST',{revision:1})).status,500);assert.deepEqual((await db.query('SELECT * FROM schedule_weeks WHERE week=$1',[week])).rows,before);assert.equal((await db.query('SELECT count(*)::int AS n FROM team_messages WHERE planning_week=$1',[week])).rows[0].n,0);}finally{await db.query('DROP TRIGGER synthetic_failure ON team_message_recipients;DROP FUNCTION fail_synthetic_delivery()');}
 });
 await t.test('Leave requests: own request, admin decision, planning revisions, rollback of stale decision, reversible approval',async()=>{
  const leave=await ok('/api/leave-requests','POST',{leaveType:'Congés payés',startDate:'2026-11-23',endDate:'2026-11-23',startPart:'full',endPart:'full',comment:'Synthetic only'},7,201);
  const preview=await ok('/api/leave-requests/'+leave.id+'/preview');
  const body={revision:leave.revision,status:'approved',note:'Synthetic approved',weekRevisions:preview.weekRevisions};
  assert.equal((await request('/api/leave-requests/'+leave.id+'/review','POST',body,8)).status,403);
  assert.equal((await request('/api/leave-requests/'+leave.id+'/review','POST',{...body,weekRevisions:{'2026-11-23':99}})).status,409);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM leave_schedule_changes WHERE request_id=$1',[leave.id])).rows[0].n,0);
  const approved=await ok('/api/leave-requests/'+leave.id+'/review','POST',body);
  assert.equal(approved.status,'approved');assert.equal((await db.query("SELECT published FROM schedule_weeks WHERE week='2026-11-23'")).rows[0].published['7:2026-11-23'].kind,'conge');
  assert.equal((await request('/api/leave-requests/'+leave.id+'/review','POST',body)).status,409);
  await ok('/api/leave-requests/'+leave.id+'/cancel-approved','POST',{revision:approved.revision});
  assert.equal((await db.query('SELECT status FROM leave_requests WHERE id=$1',[leave.id])).rows[0].status,'cancelled');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM leave_schedule_changes WHERE request_id=$1',[leave.id])).rows[0].n,1);
  assert.equal((await db.query("SELECT published FROM schedule_weeks WHERE week='2026-11-23'")).rows[0].published['7:2026-11-23'],undefined);
 });
 await t.test('Messages: binary attachment, recipient ACL, reply, read persistence and no read-side purge',async()=>{
  const bytes=Buffer.alloc(70000,0);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);
  await ok('/api/news','POST',{text:'Synthetic attachment',recipients:[7],attachment:{fileName:'synthetic.png',fileData:bytes.toString('base64')} },59,201);
  const id=(await db.query("SELECT id FROM team_messages WHERE text='Synthetic attachment'")).rows[0].id;
  const download=await request('/api/news/'+id+'/attachment','GET',undefined,7);assert.equal(download.status,200);assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
  assert.equal((await request('/api/news/'+id+'/attachment','GET',undefined,8)).status,404);
  await ok('/api/news/'+id,'PATCH',{seen:true},7);assert((await ok('/api/news','GET',undefined,7)).some(m=>m.id===id&&m.seen));
  await ok('/api/news','POST',{text:'Synthetic reply',recipients:[59],replyTo:id},7,201);
  const expired=(await db.query("INSERT INTO team_messages(sender_name,text,created_at) VALUES('Synthetic system','Expired preserved',now()-interval '30 days') RETURNING id")).rows[0].id;await db.query('INSERT INTO team_message_recipients(message_id,user_id) VALUES($1,7)',[expired]);
  await ok('/api/news','GET',undefined,7);assert.equal((await db.query('SELECT count(*)::int AS n FROM team_messages WHERE id=$1',[expired])).rows[0].n,1);
 });
 await t.test('Message to Agenda: one task per recipient, persistence, retry preserves edits and ACL',async()=>{
  const id=(await db.query("INSERT INTO team_messages(sender_name,text,reminder_kind) VALUES('Portail +','Synthetic reminder','custom') RETURNING id")).rows[0].id;await db.query('INSERT INTO team_message_recipients(message_id,user_id) VALUES($1,7)',[id]);
  const body={sourceMessageId:id,title:'Synthetic reminder',description:'',date:'2026-11-20',icon:'📌'};
  const first=await ok('/api/calendar/tasks','POST',body,7,201);await ok('/api/calendar/tasks/'+first.id,'PUT',{...body,title:'Manually edited'},7);
  const again=await ok('/api/calendar/tasks','POST',body,7);assert.equal(again.id,first.id);assert(again.alreadyExists);assert.equal((await db.query('SELECT title FROM calendar_tasks WHERE id=$1',[first.id])).rows[0].title,'Manually edited');
  assert.equal((await request('/api/calendar/tasks','POST',body,8)).status,404);
  assert.equal((await request('/api/calendar/tasks/'+first.id,'DELETE',undefined,8)).status,404);
 });
 await t.test('Publications: individual unread watermark persists and does not mark another user read',async()=>{
  const first=(await db.query("INSERT INTO publications(universe,title) VALUES('Agenda','Synthetic publication') RETURNING id::text")).rows[0].id;
  assert((await ok('/api/publications/'+encodeURIComponent('Agenda'),'GET',undefined,7)).some(p=>p.id===first&&p.unread));
  await ok('/api/publications/'+encodeURIComponent('Agenda')+'/read','POST',{id:first},7);
  assert((await ok('/api/publications/'+encodeURIComponent('Agenda'),'GET',undefined,7)).some(p=>p.id===first&&!p.unread));
  assert((await ok('/api/publications/'+encodeURIComponent('Agenda'),'GET',undefined,8)).some(p=>p.id===first&&p.unread));
 });
 await t.test('HR documents: binary hash, personal owner/admin access and forbidden third party',async()=>{
  const pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save());
  const doc=await ok('/api/hr/documents/import','POST',{title:'Synthetic confidential',scope:'personal',ownerId:7,fileName:'synthetic.pdf',fileData:bytes.toString('base64')},59,201);
  const owner=await request('/api/hr/documents/'+doc.id+'/file','GET',undefined,7);assert.equal(owner.status,200);assert.deepEqual(Buffer.from(await owner.arrayBuffer()),bytes);
  assert.equal((await request('/api/hr/documents/'+doc.id+'/file','GET',undefined,8)).status,404);
  assert.equal((await request('/api/hr/documents/'+doc.id,'PATCH',{title:'Denied'},7)).status,403);
  assert.equal((await db.query('SELECT file_hash FROM hr_documents WHERE id=$1',[doc.id])).rows[0].file_hash,createHash('sha256').update(bytes).digest('hex'));
 });
 await t.test('Personal training: local scan, explicit confirmation, own-only ACL, structured metadata and deduplication',async()=>{
  const bytes=Buffer.alloc(40);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);
  const file={fileName:'synthetic-attestation.png',fileData:bytes.toString('base64'),ownerId:7};
  assert.equal((await request('/api/quality/training/imports/analyze','POST',{...file,ownerId:8},7)).status,403);
  const analyzed=await ok('/api/quality/training/imports/analyze','POST',file,7,201);
  const facts={title:'Synthetic training',kind:'Classique',date:'2025-11-02',identityConfirmed:true};
  assert.equal((await request('/api/quality/training/imports/'+analyzed.id+'/confirm','POST',facts,8)).status,404);
  const doc=await ok('/api/quality/training/imports/'+analyzed.id+'/confirm','POST',facts,7,201);
  const saved=(await db.query('SELECT owner_id,training_title,training_kind,file_hash FROM hr_documents WHERE id=$1',[doc.id])).rows[0];assert.equal(saved.owner_id,7);assert.equal(saved.training_title,facts.title);assert.equal(saved.training_kind,'Classique');
  assert.equal((await request('/api/quality/training/imports/analyze','POST',file,7)).status,409);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM training_attestation_imports')).rows[0].n,0);
 });
 await t.test('Quality temperatures: explicit legacy assessment remains visible without rewriting history',async()=>{
  const time=new Date(Date.now()-3600000).toISOString().slice(0,19).replace('T',' '),month=time.slice(0,7);
  await db.query("INSERT INTO temperature_sensors(id,name) VALUES('synthetic-sensor','Synthetic sensor')");await db.query("INSERT INTO temperature_readings VALUES('synthetic-sensor',$1::timestamp AT TIME ZONE 'UTC',10)",[time]);
  const row=(await db.query("INSERT INTO temperature_comments(sensor_id,happened_at,text,operator_name,created_by,assessment) VALUES('synthetic-sensor',$1::timestamp AT TIME ZONE 'UTC','Synthetic explicit review','Synthetic',59,'ok') RETURNING *",[time])).rows[0];
  const loaded=await ok('/api/quality/temperatures/synthetic-sensor?month='+month);assert(loaded.events.some(e=>e.validation==='V'));
  assert.deepEqual((await db.query('SELECT * FROM temperature_comments WHERE id=$1',[row.id])).rows[0],row);
  await ok('/api/quality/temperatures/synthetic-sensor/comments/'+row.id,'PUT',{revision:row.revision,text:'Synthetic local review',validation:'X'});
  assert((await ok('/api/quality/temperatures/synthetic-sensor?month='+month)).events.some(e=>e.validation==='X'));
  assert.equal((await request('/api/quality/temperatures/synthetic-sensor/comments/'+row.id,'PUT',{revision:row.revision,text:'Stale',validation:'V'})).status,409);
  const saved=(await db.query('SELECT * FROM temperature_comments WHERE id=$1',[row.id])).rows[0];assert.equal(saved.assessment,'ok');assert.equal(saved.history.length,1);
 });
 await t.test('Local P1 documents and Fun: persistence, original bytes, rename revision and CSV deduplication',async()=>{
  const contact=await ok('/api/contacts','POST',{scope:'Synthetic',name:'Synthetic contact'},59,201);
  const pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save()),file={fileName:'synthetic-shared.pdf',fileData:bytes.toString('base64'),title:'Synthetic shared'};
  const attachment=await ok('/api/contacts/'+contact.id+'/documents','POST',file,59,201);
  const download=await request('/api/contacts/'+contact.id+'/documents/'+attachment.id+'/file','GET',undefined,7);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
  assert.equal((await request('/api/contacts/'+contact.id+'/documents','POST',file,7)).status,403);
  const lab=await ok('/api/laboratories','POST',{name:'Synthetic laboratory',orderMode:'groupement'},59,201);
  const document=await ok('/api/laboratories/'+lab.id+'/documents','POST',file,59,201);
  await ok('/api/laboratories/'+lab.id+'/documents/'+document.id,'PUT',{title:'Renamed locally',previousTitle:document.title});
  assert.equal((await request('/api/laboratories/'+lab.id+'/documents/'+document.id,'PUT',{title:'Stale',previousTitle:document.title})).status,409);
  assert.equal((await ok('/api/laboratories/'+lab.id+'/documents')).find(d=>d.id===document.id).file_name,file.fileName);
  const music={tracks:[{artist:'Synthetic Artist',title:'Synthetic Track'},{artist:'Synthetic Artist',title:'Synthetic Track'}]};
  await ok('/api/music/import','POST',music);await ok('/api/music/import','POST',music);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM music_tracks')).rows[0].n,1);
  assert.equal((await request('/api/contacts/export.xlsx')).status,200);assert.equal((await request('/api/laboratories/export.xlsx')).status,200);
 });
 await t.test('Automations: administration, revision and target checks persist; no execution at save/read',async()=>{
  const body={name:'Synthetic disabled job',enabled:false,config:{frequency:'weekly',startDate:'2026-11-02',time:'09:00',monthEnd:false,text:'Synthetic reminder {date}',priority:'normal',canArchive:true,audience:{mode:'users',userIds:[7],serviceIds:[]}}};
  assert.equal((await request('/api/news/automations','POST',body,7)).status,403);
  const job=await ok('/api/news/automations','POST',body,59,201);
  assert.equal((await request('/api/news/automations/'+job.id,'PUT',{...body,revision:0})).status,400);
  const changed=await ok('/api/news/automations/'+job.id,'PUT',{...body,revision:job.revision,name:'Synthetic saved'});assert(changed.revision>job.revision);
  assert.equal((await request('/api/news/automations/'+job.id,'PUT',{...body,revision:job.revision})).status,409);
  assert((await ok('/api/news/automations')).jobs.some(j=>j.id===job.id&&j.name==='Synthetic saved'));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM message_automation_changes WHERE automation_id=$1',[job.id])).rows[0].n,2);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM message_automation_runs')).rows[0].n,0);
 });
 await t.test('Ente Auth is mandatory: setup/confirm, incorrect code, encrypted orders, stale edit, lock and expiry',async()=>{
  assert.equal((await request('/api/order-planning')).status,403);
  const setup=await ok('/api/order-mfa/setup','POST',{password});
  assert.equal((await request('/api/order-mfa/confirm','POST',{code:'invalid'})).status,400);
  await ok('/api/order-mfa/confirm','POST',{code:totp(setup.secret,Math.floor(Date.now()/30000))});
  const order=await ok('/api/order-planning','POST',{lastName:'Synthetic',firstName:'Only',treatment:'Synthetic treatment',mode:'grossiste',frequency:28,nextOrder:'2026-11-23'},59,201);
  assert(!(await db.query('SELECT content FROM order_planning WHERE id=$1',[order.id])).rows[0].content.includes('Synthetic treatment'));
  assert((await ok('/api/order-planning')).some(o=>o.id===order.id));
  assert.equal((await request('/api/order-planning/'+order.id,'PUT',{...order,revision:0})).status,409);
  await ok('/api/order-mfa/lock','POST',{});assert.equal((await request('/api/order-planning')).status,403);
  assert.equal((await request('/api/order-mfa/unlock','POST',{code:totp(setup.secret,Math.floor(Date.now()/30000))})).status,400);
  await db.query("UPDATE sessions SET expires_at=now()-interval '1 minute' WHERE user_id=60");assert.equal((await request('/api/order-mfa/status','GET',undefined,60)).status,401);
 });
 await t.test('Google OAuth canonical callback, PKCE, single-use state and encrypted read-only credentials with mock provider',async()=>{
  const calls=[],googleEnv={...env,SCALINGO_ENABLE_GOOGLE_CALENDAR:'true',GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_ACCOUNT_EMAIL:'calendar@example.invalid'};
  const provider=async(url,options={})=>{calls.push({url:String(url),options});return new Response(JSON.stringify(String(url).includes('/token')?{access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly'}:{email:'calendar@example.invalid',email_verified:true}),{status:200,headers:{'content-type':'application/json'}});};
  const other=await createScalingoProductionApp(db,googleEnv,{fetch:provider}),listener=other.app.listen(0,'127.0.0.1');await once(listener,'listening');
  try{
   const req=(path,method='GET',body,extra={})=>new Promise((resolve,reject)=>{const r=httpRequest({hostname:'127.0.0.1',port:listener.address().port,path,method,headers:{origin:env.APP_URL,host:'www.portailplus-officine.fr',cookie:cookies[59],'x-csrf-token':'csrf-59','content-type':'application/json',...extra}},response=>{const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers})));});r.on('error',reject);r.end(body===undefined?undefined:JSON.stringify(body));});
   assert.equal((await req('/api/google/connect','POST',{}, {host:'portailplus-hds.osc-fr1.scalingo.io'})).status,409);
   const started=await req('/api/google/connect','POST',{});assert.equal(started.status,200,await started.clone().text());const auth=new URL((await started.json()).url);assert.equal(auth.searchParams.get('redirect_uri'),env.APP_URL+'/auth/google/callback');assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert(auth.searchParams.get('scope').includes('calendar.events.readonly'));assert(!auth.searchParams.get('scope').includes('calendar.events '));
   assert.equal((await req('/auth/google/callback?state=wrong&code=synthetic')).status,400);assert.equal(calls.length,0);
   const callback='/auth/google/callback?state='+encodeURIComponent(auth.searchParams.get('state'))+'&code=synthetic';assert.equal((await req(callback)).status,302);assert.equal(calls.length,2);assert(calls[0].options.body.get('code_verifier'));assert.equal((await req(callback)).status,400);
   const stored=(await db.query("SELECT value FROM settings WHERE key='google_tokens'")).rows[0].value;assert(!stored.includes('synthetic-access'));assert(!stored.includes('synthetic-refresh'));
   await req('/api/calendar');assert.equal(calls.length,2,'Reading cache never implicitly synchronizes');
   await assert.rejects(other.config.calendarFetch('https://www.googleapis.com/calendar/v3/calendars/synthetic/events',{method:'DELETE'}));assert.equal(calls.length,2);
  }finally{listener.closeAllConnections();await new Promise(r=>listener.close(r));}
 });
 await t.test('Original manual week, jobs, keys, users and passwords unchanged; no external transport used',async()=>{assert.deepEqual(await protectedState(),before);assert.equal(external,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM message_automation_runs')).rows[0].n,0);});
 await t.test('Explicit synthetic worker only: one occurrence, one recipient, pause remains active and no email',async()=>{
  const body={name:'Synthetic once worker test',enabled:true,config:{frequency:'once',startDate:'2030-01-01',time:'10:00',monthEnd:false,text:'Synthetic once {date}',priority:'normal',canArchive:true,audience:{mode:'users',userIds:[7],serviceIds:[]}}};
  const job=await ok('/api/news/automations','POST',body,59,201);let paused=false,sends=0;
  const worker=createProductionJobController({db,secret:env.APP_SECRET,origin:env.APP_URL,enabled:true,approvalReference:'synthetic-fixture-only',isPaused:async()=>paused,mailer:{status:async()=>({connected:false}),sendText:async()=>{sends++;}}});
  await worker.tick(new Date('2030-01-01T09:01:00Z'));await worker.tick(new Date('2030-01-01T09:01:00Z'));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM message_automation_runs WHERE automation_id=$1',[job.id])).rows[0].n,1);
  const messages=(await db.query("SELECT id FROM team_messages WHERE automation_text='Synthetic once 01/01/2030'")).rows;assert.equal(messages.length,1);assert.deepEqual((await db.query('SELECT user_id FROM team_message_recipients WHERE message_id=$1',[messages[0].id])).rows,[{user_id:7}]);
  paused=true;await assert.rejects(worker.tick(new Date('2030-01-01T09:02:00Z')),/PAUSED/);assert.equal(paused,true);assert.equal(sends,0);assert.equal(external,0);
 });

});
