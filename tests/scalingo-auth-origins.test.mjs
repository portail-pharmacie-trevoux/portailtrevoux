import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pg from 'pg';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {hashPassword,digest} from '../security.mjs';
import {scalingoAllowedOrigins,isScalingoOrigin} from '../scripts/scalingo-origins-preview.mjs';
import {registerScalingoTrevouxEntry} from '../scripts/scalingo-trevoux-entry-preview.mjs';
import {scalingoHomepage} from '../scripts/scalingo-retired-calculations-preview.mjs';
import {registerScalingoTemperaturePreview} from '../scripts/scalingo-temperature-preview.mjs';
import {registerScalingoEmployeeRecords} from '../scripts/scalingo-employee-records-preview.mjs';
import {registerScalingoRights,scalingoTestAdminAuth} from '../scripts/scalingo-universal-rights.mjs';
const canonical=scalingoAllowedOrigins[0],database=process.env.PORTAIL_AUTH_ORIGINS_TEST_DATABASE_URL;
const refused=[undefined,'null','http://portailplus-officine.fr','https://portailplus-officine.fr:444','https://portailplus-officine.fr.evil.invalid','https://evil.portailplus-officine.fr','https://portailplus-officine.fr/trevoux','https://evil.invalid'];
test('Scalingo exact origin allowlist: no wildcard, HTTP, path, port, null or suffix',()=>{
 assert.equal(scalingoAllowedOrigins.length,3);for(const value of scalingoAllowedOrigins)assert.equal(isScalingoOrigin(value),true);
 for(const value of refused)assert.equal(isScalingoOrigin(value),false);
});
test('Secondary preview guards share exact origins while retaining admin, CSRF and backup requirements',async t=>{
 const db={query:async sql=>{assert(sql.startsWith('SELECT'));return {rows:[{id:1,email:'admin-test@portailplus.invalid',role:'admin',active:true,must_change:false,csrf:'csrf'}]};}},gate=express();gate.use(express.json());const adminAuth=scalingoTestAdminAuth(db);
 registerScalingoTemperaturePreview(gate,{db,origin:canonical,isAllowedOrigin:isScalingoOrigin});registerScalingoEmployeeRecords({gate,db,adminAuth,origin:canonical,secret:'test'.repeat(12),isAllowedOrigin:isScalingoOrigin});registerScalingoRights({gate,db,adminAuth,origin:canonical,env:{},isAllowedOrigin:isScalingoOrigin});
 gate.post('/api/quality/temperatures/sensor/comments',(q,s)=>s.sendStatus(204));gate.use((e,q,s,n)=>s.status(e.status||500).json({error:e.message}));
 const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const send=(path,origin,csrf='csrf')=>fetch('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{origin,cookie:'trevoux_session='+'a'.repeat(43),'x-csrf-token':csrf,'content-type':'application/json'},body:'{}'});
 for(const origin of scalingoAllowedOrigins){assert.equal((await send('/api/quality/temperatures/sensor/comments',origin)).status,204);assert.equal((await send('/api/users',origin)).status,400);assert.equal((await send('/api/staging-universal-rights',origin)).status,409);}
 for(const path of ['/api/quality/temperatures/sensor/comments','/api/users','/api/staging-universal-rights']){assert.equal((await send(path,'https://evil.invalid')).status,403);assert.equal((await send(path,scalingoAllowedOrigins[1],'wrong')).status,403);}
});
test('PostgreSQL: login/logout/sessions/CSRF/admin protections on custom and historical origins; default remains strict',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_auth_origins_test');const db=new pg.Pool({connectionString:database});t.after(()=>db.end());
 await db.query(`DROP TABLE IF EXISTS sessions,users,settings,login_attempts CASCADE;
 CREATE TABLE users(id int PRIMARY KEY,name text,email text,password_hash text,role text,active boolean,must_change boolean,rights jsonb,edit_rights jsonb,permissions_configured boolean);
 CREATE TABLE sessions(id text PRIMARY KEY,user_id int REFERENCES users(id),csrf text,expires_at timestamptz);
 CREATE TABLE settings(key text PRIMARY KEY,value text);
 CREATE TABLE login_attempts(key text PRIMARY KEY,count int,until_at timestamptz);`);
 const password='Local fixture authentication 123!',hash=await hashPassword(password);
 for(const [id,role]of [[1,'admin'],[2,'employee']])await db.query("INSERT INTO users VALUES($1,$2,$3,$4,$5,true,false,'[]','[]',true)",[id,'TEST '+id,'test'+id+'@example.invalid',hash,role]);
 const start=async additional=>{const {app}=createApp(db,{origin:canonical,secret:'local-auth-fixture-'.repeat(3),homepageHTML:scalingoHomepage(),...(additional?{allowedOrigins:scalingoAllowedOrigins}:{})}),gate=express();registerScalingoTrevouxEntry(gate,app);gate.use(app);const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});return server;};
 let server=await start(true);
 const request=(path,{origin=canonical,body,cookie,headers={},omitOrigin=false}={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method:body===undefined?'GET':'POST',headers:{...(omitOrigin?{}:{origin}),'content-type':'application/json',...(cookie?{cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
 for(const origin of refused){const r=await request('/api/login',{origin,omitOrigin:origin===undefined,body:{email:'test1@example.invalid',password},headers:{'x-forwarded-host':'portailplus-officine.fr','x-forwarded-proto':'https'}});assert.equal(r.status,403);assert.equal((await r.json()).error,'Origine de la demande refusée.');}
 assert.equal((await db.query('SELECT count(*)::int AS n FROM login_attempts')).rows[0].n,0);
 for(const path of ['/trevoux','/trevoux/']){const r=await request(path);assert.equal(r.status,200);assert((await r.text()).includes('id="login-form"'));}
 const assertCookie=value=>{for(const part of ['HttpOnly','Secure','SameSite=Lax','Path=/'])assert(value.includes(part),'Missing cookie protection');assert(!/domain=/i.test(value),'Cookie must remain host-only');};
 const seen=new Set();
 for(const origin of scalingoAllowedOrigins){
  assert.equal((await request('/api/me')).status,401);
  const r=await request('/api/login',{origin,body:{email:'test1@example.invalid',password},headers:{'x-forwarded-proto':'http'}});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),null);const data=await r.json(),setCookie=r.headers.get('set-cookie');assertCookie(setCookie);const cookie=setCookie.split(';')[0];assert(!seen.has(cookie));seen.add(cookie);
  assert.equal((await request('/api/me',{cookie})).status,200);const status=await request('/api/google/status',{cookie});assert.equal(status.status,200);assert.equal((await status.json()).callback,canonical+'/auth/google/callback');
  assert.equal((await request('/api/logout',{origin,body:{},cookie,headers:{'x-csrf-token':'wrong'}})).status,403);assert.equal((await request('/api/logout',{origin:'https://evil.invalid',body:{},cookie,headers:{'x-csrf-token':data.csrf}})).status,403);assert.equal((await request('/api/me',{cookie})).status,200);
  const logout=await request('/api/logout',{origin,body:{},cookie,headers:{'x-csrf-token':data.csrf}});assert.equal(logout.status,200);assertCookie(logout.headers.get('set-cookie'));assert.equal((await request('/api/me',{cookie})).status,401);
 }
 const employee=await request('/api/login',{origin:scalingoAllowedOrigins[1],body:{email:'test2@example.invalid',password}});assert.equal(employee.status,200);const employeeData=await employee.json(),employeeCookie=employee.headers.get('set-cookie').split(';')[0];assert.equal((await request('/api/google/status',{cookie:employeeCookie})).status,403);await request('/api/logout',{origin:scalingoAllowedOrigins[1],body:{},cookie:employeeCookie,headers:{'x-csrf-token':employeeData.csrf}});
 assert.equal((await request('/api/login',{origin:scalingoAllowedOrigins[1],body:{email:'test1@example.invalid',password:'wrong'}})).status,401);
 const expired=await request('/api/login',{body:{email:'test1@example.invalid',password}}),expiredCookie=expired.headers.get('set-cookie').split(';')[0];await db.query("UPDATE sessions SET expires_at=now()-interval '1 second'");assert.equal((await request('/api/me',{cookie:expiredCookie})).status,401);
 server.closeAllConnections();server.close();server=await start(false);assert.equal((await request('/api/login',{origin:scalingoAllowedOrigins[1],body:{}})).status,403);assert.equal((await request('/api/login',{body:{}})).status,400);
});
