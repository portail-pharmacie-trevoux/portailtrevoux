import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {selectScalingoEntry} from '../scripts/start-scalingo.mjs';
import {productionConfig} from '../scripts/scalingo-production-profile.mjs';
import {createProductionJobController} from '../scripts/scalingo-production-jobs.mjs';
const env={APP_URL:'https://www.portailplus-officine.fr',APP_SECRET:'synthetic-test-secret-'.repeat(3)};
test('Scalingo launch is fail-closed with no implicit seed/import startup',()=>{
 assert.throws(()=>selectScalingoEntry({}),/NO_BUSINESS_STARTUP/);assert.equal(selectScalingoEntry({SCALINGO_PREVIEW_SAFE_MODE:'true',SCALINGO_PREVIEW_UI_ENABLED:'true'}),'scripts/serve-scalingo-ui-preview.mjs');
 assert.throws(()=>selectScalingoEntry({SCALINGO_RUNTIME_PROFILE:'production'}),/NOT_APPROVED/);assert.equal(selectScalingoEntry({SCALINGO_RUNTIME_PROFILE:'production',SCALINGO_PRODUCTION_RUNTIME_APPROVED:'true',SCALINGO_REQUIRE_DB_TLS:'true'}),'scripts/serve-scalingo-production.mjs');
});
test('Production defaults disable all deliveries, reads with side effects and automatic jobs',async()=>{
 let calls=0;const config=productionConfig(env,{fetch:async()=>{calls++;}});assert.equal(config.invitationSendingEnabled,false);assert.equal(config.purgeNewsOnRead,false);assert.equal(config.calendarReadThrough,false);assert(config.messageAutomationAdminEnabled);assert(config.trainingAttestationsEnabled);
 for(const [fn,url]of [[config.mailFetch,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'],[config.calendarFetch,'https://www.googleapis.com/calendar/v3/calendars/fixture/events'],[config.employeeScanFetch,'https://api.openai.com/v1/responses']])await assert.rejects(fn(url),/non autorisé/);assert.equal(calls,0);
 assert.throws(()=>productionConfig({...env,SCALINGO_ENABLE_SCHEDULED_JOBS:'true'}),/SCHEDULER_NOT_RELEASED/);assert.throws(()=>productionConfig({...env,SCALINGO_ENABLE_BUSINESS_STARTUP:'true'}),/SEED_FORBIDDEN/);
});
test('Calendar capability allows token refresh/read but rejects any Calendar mutation and unknown hosts',async()=>{
 const calls=[],config=productionConfig({...env,SCALINGO_ENABLE_GOOGLE_CALENDAR:'true',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',GOOGLE_ACCOUNT_EMAIL:'fixture@example.invalid'},{fetch:async(...args)=>{calls.push(args);return {ok:true};}});
 await config.calendarFetch('https://www.googleapis.com/calendar/v3/calendars/fixture/events');await config.calendarFetch('https://oauth2.googleapis.com/token',{method:'POST'});
 await assert.rejects(config.calendarFetch('https://www.googleapis.com/calendar/v3/calendars/fixture/events',{method:'POST'}));await assert.rejects(config.calendarFetch('https://foreign.invalid/'));assert.equal(calls.length,2);
});
test('Mail delivery needs independent approval and sender; no credential alone authorizes sending',async()=>{
 const config=productionConfig({...env,MAIL_SENDER_EMAIL:'fixture@example.invalid',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',GOOGLE_ACCOUNT_EMAIL:'fixture@example.invalid',SCALINGO_ENABLE_MAIL_DELIVERY:'true'});assert.equal(config.invitationSendingEnabled,false);
 assert.throws(()=>productionConfig({...env,SCALINGO_EXTERNAL_SERVICES_APPROVED:'true',SCALINGO_ENABLE_MAIL_DELIVERY:'true'}),/SENDER_AND_OAUTH/);
});
test('Job controller is inert before explicit approval and never resumes notifications',async()=>{
 let touched=0;const db={connect:async()=>{touched++;}};
 await assert.rejects(createProductionJobController({db}).tick(),/NOT_APPROVED/);await assert.rejects(createProductionJobController({db,enabled:true,approvalReference:'fixture-authorized'}).tick(),/PAUSED/);assert.equal(touched,0);
});
test('Production SQL is additive, separate from initialization, and does not modify business records',async()=>{
 const sql=await readFile(new URL('../scripts/sql/scalingo-production-parity.sql',import.meta.url),'utf8');assert(!/\b(?:INSERT INTO|UPDATE\s+users|DELETE FROM|TRUNCATE|DROP TABLE|DO\s+\$)/i.test(sql));
 const startup=await readFile(new URL('../scripts/serve-scalingo-production.mjs',import.meta.url),'utf8');assert(!/initialize\(|setInterval\(|schema\.sql|purgeNews\(/.test(startup));const executor=await readFile(new URL('../scripts/migration/grouped/secure-executor.mjs',import.meta.url),'utf8');assert.match(executor,/REAL_EXECUTION_ENABLED=false/);
});

test('Initial opening limits logins, existing sessions and invitation activation to the intended scope',async t=>{
 const {createApp}=await import('../server.mjs');
 const {hashPassword,digest}=await import('../security.mjs');
 const email='owner@example.invalid';
 const password='fixture-password-123';
 const password_hash=await hashPassword(password);
 const owner={id:1,email,role:'admin',active:true,must_change:false,password_hash};
 const other={...owner,id:2,email:'other@example.invalid'};
 const db={async query(sql,[key]=[]){
  if(sql.startsWith('SELECT s.id AS session_id'))return {rows:[key===digest('a'.repeat(43))?owner:other]};
  if(sql.startsWith('INSERT INTO login_attempts'))return {rows:[{count:1}]};
  if(sql.startsWith('SELECT * FROM users WHERE email'))return {rows:[key===email?owner:other]};
  if(sql.startsWith('INSERT INTO sessions')&&key)return {rows:[]};
  throw Error('Unexpected database operation');
 }};
 assert.throws(()=>productionConfig({...env,SCALINGO_INITIAL_ACCESS_EMAIL:'admin-test@portailplus.invalid'}),/INVALID_INITIAL_ACCESS_EMAIL/);
 const config=productionConfig({...env,SCALINGO_INITIAL_ACCESS_EMAIL:email});
 assert.equal(config.allowsPortalUser({...owner,role:'employee'}),false);
 const {app}=createApp(db,config);
 const server=app.listen(0,'127.0.0.1');
 t.after(()=>server.close());
 await new Promise(resolve=>server.once('listening',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 const post=(path,body)=>fetch(url+path,{method:'POST',headers:{origin:config.origin,'content-type':'application/json'},body:JSON.stringify(body)});
 const me=letter=>fetch(url+'/api/me',{headers:{cookie:'trevoux_session='+letter.repeat(43)}});
 assert.equal((await post('/api/login',{email,password})).status,200);
 assert.equal((await post('/api/login',{email:other.email,password})).status,401);
 assert.equal((await me('a')).status,200);
 assert.equal((await me('b')).status,401);
 assert.equal((await post('/api/invitations/check',{})).status,403);
 assert.equal((await post('/api/invitations/accept',{})).status,403);
});

test('Menu-only opening checks authentication storage and closes module routes',async t=>{
 const {createScalingoProductionApp}=await import('../scripts/scalingo-production-profile.mjs');
 const email='owner@example.invalid';
 const user={id:1,email,role:'admin',active:true,must_change:false,csrf:'fixture-csrf'};
 const settings={...env,SCALINGO_MENU_ONLY:'true',SCALINGO_ENABLE_GOOGLE_CALENDAR:'true',GOOGLE_ACCOUNT_EMAIL:'calendar@example.invalid',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture'};
 const {encrypt}=await import('../security.mjs');
 const stored=encrypt({access_token:'fixture',expires_at:Date.now()+3600000},env.APP_SECRET);
 const googleCalls=[];
 assert.throws(()=>productionConfig(settings),/INITIAL_ACCESS_EMAIL_REQUIRED/);
 const queries=[];
 let completed=false;
 const db={async connect(){return {async query(sql){
  queries.push(sql);
  if(sql.includes('current_database()'))return {rows:[{name:'portailplus_7495',tls:true}]};
  if(sql.includes('FROM users'))return {rows:[user]};
  if(sql.includes('information_schema')||sql.includes('pg_indexes'))throw Error('Unexpected module schema check');
  return {rows:[]};
 },release(){}};},async query(sql,[key]=[]){
  if(sql.startsWith('SELECT s.id AS session_id')||sql.startsWith('SELECT u.* FROM sessions'))return {rows:[user]};
  if(sql.startsWith('SELECT * FROM calendar_cache'))return {rows:[{events:[],synced_at:new Date()}]};
  if(sql.startsWith('SELECT event_id FROM calendar_reminders'))return {rows:[]};
  if(sql.includes('FROM calendar_tasks WHERE user_id'))return {rows:[{id:7,title:'Fixture task',task_date:'2026-11-24',icon:'✅'}]};
  if(sql.startsWith('SELECT key,value FROM settings'))return {rows:completed?[{key:key[0],value:'2026-11-24'}]:[]};
  if(sql.startsWith('WITH owned AS')){
   assert.match(sql,/user_id=\$3/);
   if(key!=='calendar_task_done:1:7')return {rows:[]};
   completed=sql.includes('INSERT INTO settings');
   return {rows:[{id:7}]};
  }
  if(sql.startsWith('SELECT links,revision'))return {rows:[]};
  if(sql.startsWith('SELECT value FROM settings'))return {rows:[{value:key==='calendar_id'?'selected-calendar':key==='google_tokens'?stored:''}]};
  throw Error('Unexpected application query');
 }};
 const {app}=await createScalingoProductionApp(db,{...settings,SCALINGO_INITIAL_ACCESS_EMAIL:email},{fetch:async url=>{
  googleCalls.push(String(url));
  return {ok:true,json:async()=>({email:settings.GOOGLE_ACCOUNT_EMAIL,email_verified:true})};
 }});
 assert.equal(queries.at(-1),'ROLLBACK');
 const server=app.listen(0,'127.0.0.1');
 t.after(()=>server.close());
 await new Promise(resolve=>server.once('listening',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 const headers={cookie:'trevoux_session='+'a'.repeat(43)};
 const page=await fetch(url+'/trevoux');
 assert.equal(page.status,200);
 const html=await page.text();
 const original=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const top=markup=>markup.slice(markup.indexOf('<body'),markup.indexOf('<div class="section-label"'));
 assert.equal(top(html),top(original));
 assert.match(html,/class="grid bento-menu"/);
 assert.doesNotMatch(html,/id="organize-tiles"/);
 assert.match(html,/>Documents de référence<\/strong>/);
 assert.match(html,/>Commandes<\/strong>/);
 assert.equal((await fetch(url+'/api/quick-links')).status,401);
 assert.deepEqual((await (await fetch(url+'/api/quick-links',{headers})).json()).links,[]);
 assert.equal((await fetch(url+'/api/quick-links',{method:'PUT',headers:{...headers,origin:env.APP_URL}})).status,403);
 const session=await fetch(url+'/api/me',{headers});
 assert.equal(session.status,200);
 assert.equal((await session.json()).features.menuOnly,true);
 const verify=await fetch(url+'/api/google/verify-calendar',{method:'POST',headers:{...headers,origin:env.APP_URL,'x-csrf-token':user.csrf}});
 assert.equal(verify.status,200);
 assert.deepEqual(await verify.json(),{ok:true});
 assert.deepEqual(googleCalls,['https://openidconnect.googleapis.com/v1/userinfo','https://www.googleapis.com/calendar/v3/calendars/selected-calendar/events?maxResults=1']);
 const read=async()=>await (await fetch(url+'/api/calendar',{headers})).json();
 assert.equal((await read()).events[0].completed,false);
 const taskHeaders={...headers,origin:env.APP_URL,'x-csrf-token':user.csrf,'content-type':'application/json'};
 const update=await fetch(url+'/api/calendar/tasks/7/completion',{method:'PATCH',headers:taskHeaders,body:JSON.stringify({completed:true})});
 assert.equal(update.status,200);
 assert.equal((await read()).events[0].completed,true);
 assert.equal((await fetch(url+'/api/calendar/tasks/8/completion',{method:'PATCH',headers:taskHeaders,body:JSON.stringify({completed:true})})).status,404);
 assert.equal((await fetch(url+'/api/calendar/tasks/7/completion',{method:'PATCH',headers})).status,403);
 for(const path of ['/api/google/calendars','/api/calendar/tasks','/API/USERS','/auth/google/callback?state=mail_fixture','/auth/google/callback?state=youtube_fixture']){
  assert.equal((await fetch(url+path,{headers})).status,503,path);
 }
 assert.equal((await fetch(url+'/auth/google/callback')).status,401);
 assert.equal((await fetch(url+'/api/google/connect',{method:'POST',headers:{...headers,origin:env.APP_URL}})).status,403);
 assert.equal((await fetch(url+'/api/invitations/accept',{method:'POST',headers})).status,503);
});
