import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import {scalingoGoogleCalendarConfig,registerScalingoGoogleCalendar} from '../scripts/scalingo-google-calendar-preview.mjs';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {decrypt} from '../security.mjs';
test('Scalingo Calendar OAuth: protections, readonly requests and encrypted isolated persistence',async()=>{
const secret='audit-only-'.repeat(4),settings=new Map(),calls=[];
let role='admin';
let stateHash='',verifier='',scope='openid email https://www.googleapis.com/auth/calendar.readonly';
const db={query:async(sql,args=[])=>{
 if(sql.startsWith('SELECT s.id'))return {rows:[{id:1,role,csrf:'csrf',session_id:'audit',must_change:false,active:true}]};
 if(sql.startsWith('UPDATE sessions SET oauth_state=$1')){stateHash=args[0];verifier=args[1];return {rows:[]};}
 if(sql.startsWith('SELECT oauth_verifier'))return {rows:[{oauth_verifier:verifier}]};
 if(sql.startsWith('UPDATE sessions SET oauth_state=NULL')){if(args[1]!==stateHash)return {rows:[]};stateHash='';return {rows:[{verifier:args[2]}]};}
 if(sql.startsWith('SELECT events FROM calendar_cache'))return {rows:[]};
 if(sql.startsWith('DELETE FROM calendar_cache')||sql.startsWith('INSERT INTO calendar_cache'))return {rows:[]};
 if(sql.startsWith('INSERT INTO settings')){settings.set(args[0],args[1]);return {rows:[]};}
 if(sql.startsWith('SELECT value FROM settings'))return {rows:settings.has(args[0])?[{value:settings.get(args[0])}]:[]};
 throw Error('Unexpected query '+sql);
}};
const nativeFetch=global.fetch;
global.fetch=async(url,options={})=>{
 calls.push({url:String(url),method:options.method||'GET'});
 if(String(url)==='https://oauth2.googleapis.com/token')return {ok:true,json:async()=>({access_token:'dummy-access',refresh_token:'dummy-refresh',expires_in:3600,scope})};
 if(String(url)==='https://openidconnect.googleapis.com/v1/userinfo')return {ok:true,json:async()=>({email:'audit@example.invalid',email_verified:true})};
 if(String(url).includes('/calendar/v3/calendars/'))return {ok:true,json:async()=>({items:[]})};
 if(String(url).endsWith('/calendar/v3/users/me/calendarList/dummy-calendar'))return {ok:true,json:async()=>({id:'dummy-calendar',summary:'Audit'})};
 if(String(url).startsWith('https://www.googleapis.com/calendar/v3/users/me/calendarList?'))return {ok:true,json:async()=>({items:[{id:'dummy-calendar',summary:'Audit'}]})};
 throw Error('Unexpected external request');
};
const {app}=createApp(db,{origin:'https://portailplus-hds.osc-fr1.scalingo.io',secret,googleId:'dummy-client',googleSecret:'dummy-secret',googleEmail:'audit@example.invalid'});
const gate=express();gate.use(express.json());registerScalingoGoogleCalendar(gate,app,{enabled:true});gate.use(app);gate.use((req,res)=>res.sendStatus(403));
const server=gate.listen(0,'127.0.0.1');await once(server,'listening');
const base='http://127.0.0.1:'+server.address().port,headers={origin:'https://portailplus-hds.osc-fr1.scalingo.io',cookie:'trevoux_session='+'a'.repeat(43),'x-csrf-token':'csrf','content-type':'application/json'};
try{
 const callback=async state=>nativeFetch(base+'/auth/google/callback?state='+encodeURIComponent(state)+'&code=dummy',{headers,redirect:'manual'});
 for(const path of ['connect','calendar','sync','disconnect']){
 assert.equal((await nativeFetch(base+'/api/google/'+path,{method:'POST',headers:{origin:headers.origin,'content-type':'application/json'},body:'{}'})).status,401);
 role='employee';assert.equal((await nativeFetch(base+'/api/google/'+path,{method:'POST',headers,body:'{}'})).status,403);role='admin';
 assert.equal((await nativeFetch(base+'/api/google/'+path,{method:'POST',headers:{...headers,'x-csrf-token':'wrong'},body:'{}'})).status,403);
 assert.equal((await nativeFetch(base+'/api/google/'+path,{method:'POST',headers:{...headers,origin:'https://other.invalid'},body:'{}'})).status,403);
 }
 assert.equal((await nativeFetch(base+'/auth/google/callback?state=invalid')).status,401);
 role='employee';assert.equal((await callback('invalid')).status,403);role='admin';
 assert.equal((await callback('mail_fake')).status,403);assert.equal((await callback('youtube_fake')).status,403);
 const connect=async()=>{const r=await nativeFetch(base+'/api/google/connect',{method:'POST',headers,body:'{}'});assert.equal(r.status,200);const u=new URL((await r.json()).url);assert.equal(u.searchParams.get('redirect_uri'),'https://portailplus-hds.osc-fr1.scalingo.io/auth/google/callback');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('scope'),'openid email https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly');return u;};

 assert.equal((await callback('invalid')).status,400);assert.equal(calls.length,0);
 let u=await connect();assert.equal((await callback(u.searchParams.get('state'))).status,400);assert.equal(settings.has('google_tokens'),false);

 scope='openid email https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly';u=await connect();assert.equal((await callback(u.searchParams.get('state'))).status,302);
 assert.equal((await callback(u.searchParams.get('state'))).status,400);
 assert.equal(decrypt(settings.get('google_tokens'),secret).refresh_token,'dummy-refresh');assert.throws(()=>decrypt(settings.get('google_tokens'),'different-dummy-key'));
 assert.equal(settings.has('mail_tokens'),false);assert.equal(settings.has('youtube_tokens'),false);
 assert.equal((await nativeFetch(base+'/api/google/calendars',{headers})).status,200);
 for(const path of ['calendar','sync'])assert.equal((await nativeFetch(base+'/api/google/'+path,{method:'POST',headers,body:JSON.stringify({id:'dummy-calendar'})})).status,200);
 const status=await (await nativeFetch(base+'/api/google/status',{headers})).json();
 assert.equal(status.configured,true);assert.equal(status.environment,'scalingo');assert.equal(status.calendarEnabled,true);assert.doesNotMatch(JSON.stringify(status),/dummy-secret|dummy-client|dummy-refresh/);
 assert.equal(settings.get('calendar_id'),'dummy-calendar');
 assert.ok(calls.filter(c=>c.url.includes('/calendar/v3/')).every(c=>c.method==='GET'));


}finally{global.fetch=nativeFetch;server.close();}

});
test('Scalingo Calendar opt-in requires its own complete configuration',()=>{
 assert.equal(scalingoGoogleCalendarConfig({}).enabled,false);
 assert.throws(()=>scalingoGoogleCalendarConfig({GOOGLE_CLIENT_ID:'dummy'}));
 assert.throws(()=>scalingoGoogleCalendarConfig({SCALINGO_ENABLE_GOOGLE_CALENDAR:'true'}));
 const config=scalingoGoogleCalendarConfig({SCALINGO_ENABLE_GOOGLE_CALENDAR:'true',GOOGLE_CLIENT_ID:'dummy',GOOGLE_CLIENT_SECRET:'dummy',GOOGLE_ACCOUNT_EMAIL:'audit@example.invalid'});
 assert.equal(config.enabled,true);
});
test('Disabled Calendar stays closed; unrelated integrations and methods never dispatched',async()=>{
 for(const enabled of [false,true]){
  const gate=express();let dispatched=0;
  registerScalingoGoogleCalendar(gate,(req,res)=>{dispatched++;res.sendStatus(204);},{enabled});
  gate.use((req,res)=>res.sendStatus(403));
  const server=gate.listen(0,'127.0.0.1');await once(server,'listening');
  try{const base='http://127.0.0.1:'+server.address().port;
   for(const path of ['/api/mail/connect','/api/youtube/connect','/api/google/calendar/extra'])assert.equal((await fetch(base+path,{method:'POST'})).status,403);
   assert.equal((await fetch(base+'/api/google/calendar',{method:'PUT'})).status,403);
   assert.equal((await fetch(base+'/api/google/connect',{method:'POST'})).status,enabled?204:403);
   assert.equal(dispatched,enabled?1:0);
  }finally{server.close();}
 }
});
