import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {auditAuthContinuity,renderAuthReference} from '../scripts/audit-auth-continuity.mjs';
import {createApp} from '../server.mjs';
import {scalingoAllowedOrigins} from '../scripts/scalingo-origins-preview.mjs';
let available=true;try{execFileSync('git',['cat-file','-e',renderAuthReference+':security.mjs'],{stdio:'ignore'});}catch{available=false;}
const skip=available?false:'Référence Git Render absente ; récupérer le commit documenté pour exécuter cet audit.';
test('offline cross-version verification: unchanged Render scrypt hashes accepted without APP_SECRET; rights differences explicitly reported',{skip},async()=>{
 const result=await auditAuthContinuity();assert(result.passwords.crossVerification&&result.passwords.wrongPasswordRejected&&result.passwords.hashFunctionsIdentical&&result.passwords.verificationFunctionsIdentical);
 assert.equal(result.passwords.requiresSourceAppSecret,false);assert.equal(result.liveDataVerified,false);assert.equal(result.remoteWrites,0);
 assert.equal(result.illustrativeRightsDifferences.length,4);assert(result.illustrativeRightsDifferences.every(x=>x.render===true&&x.scalingo===false));
});
test('Scalingo login accepts an unchanged source-generated hash and keeps email, role, rights and existing must_change state',{skip},async t=>{
 const source=execFileSync('git',['show',renderAuthReference+':security.mjs'],{encoding:'utf8'}),render=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const password=randomBytes(32).toString('base64url'),encoded=await render.hashPassword(password);
 const user={id:200,name:'Compte fictif de continuité',email:'continuity-fixture@example.invalid',role:'employee',active:true,must_change:false,password_hash:encoded,rights:['Agenda','Actualités','Laboratoires'],edit_rights:['Laboratoires'],permissions_configured:true};
 const before=JSON.stringify(user),sessions=new Map();let sessionWrites=0;
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('INSERT INTO login_attempts'))return {rows:[{count:1}]};
  if(sql==='SELECT * FROM users WHERE email=$1')return {rows:args[0]===user.email?[user]:[]};
  if(sql.startsWith('INSERT INTO sessions')){sessions.set(args[0],{session_id:args[0],csrf:args[2]});sessionWrites++;return {rows:[]};}
  if(sql.startsWith('SELECT s.id AS session_id'))return {rows:sessions.has(args[0])?[{...user,...sessions.get(args[0])}]:[]};
  if(sql.startsWith('DELETE FROM sessions WHERE id=')){sessions.delete(args[0]);return {rows:[]};}
  throw Error('Unexpected operation in isolated mock');
 }};
 const {app}=createApp(db,{origin:scalingoAllowedOrigins[0],allowedOrigins:scalingoAllowedOrigins,secret:'independent-scalingo-fixture-secret'.repeat(2),dummyHash:encoded});const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port;
 const login=async(origin,body)=>fetch(base+'/api/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 for(const origin of scalingoAllowedOrigins){
  const r=await login(origin,{email:user.email,password});assert.equal(r.status,200);const result=await r.json();assert.equal(result.user.email,user.email);assert.equal(result.user.mustChange,false);assert.equal(result.user.role,'employee');assert.deepEqual(result.user.rights,user.rights);assert.deepEqual(result.user.editRights,user.edit_rights);assert.equal(result.user.permissionsConfigured,true);assert(!('password_hash' in result.user));
  const cookie=r.headers.get('set-cookie');assert(cookie.includes('Secure')&&cookie.includes('HttpOnly')&&cookie.includes('SameSite=Lax')&&!cookie.includes('Domain='));const headers={cookie:cookie.split(';')[0],origin,'x-csrf-token':result.csrf};
  assert.equal((await fetch(base+'/api/me',{headers})).status,200);assert.equal((await fetch(base+'/api/logout',{method:'POST',headers})).status,200);assert.equal((await fetch(base+'/api/me',{headers})).status,401);
 }
 assert.equal((await login(scalingoAllowedOrigins[2],{email:user.email,password:password+'wrong'})).status,401);
 assert.equal((await login('https://foreign.invalid',{email:user.email,password})).status,403);
 assert(JSON.stringify(user)===before,'Source-equivalent account fields must remain unchanged');assert.equal(sessionWrites,3);
});
