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
