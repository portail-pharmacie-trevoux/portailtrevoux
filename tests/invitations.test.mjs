import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {invitationAddress,welcomeMessage,createInvitationMailer,gmailSendScope,sameMailAccount} from '../invitations.mjs';
import {digest,encrypt,decrypt,verifyPassword} from '../security.mjs';
import {publicPerson} from '../collaborateurs.mjs';
const secret='s'.repeat(32),fail=(status,message)=>Object.assign(Error(message),{status});
test('invitation : adresse issue de la fiche, confidentialité et identification du compte Gmail',async()=>{
 const db={query:async()=>({rows:[{payload:encrypt({personalEmail:'alice@example.test'},secret),revision:1}]})};
 assert.equal(await invitationAddress(db,{id:2,email:null},secret),'alice@example.test');
 assert.equal(await invitationAddress(db,{id:2,email:'login@example.test'},secret),'login@example.test');
 assert.equal(sameMailAccount('pharmacietrevoux@gmail.com','pharmacie.trevoux@gmail.com'),true);
 assert.equal(sameMailAccount('pharmaciedetrevoux@gmail.com','pharmacie.trevoux@gmail.com'),false);
 assert.equal(sameMailAccount('a.b@example.test','ab@example.test'),false);
 assert.equal(publicPerson({password_hash:'hash',must_change:false},true,1).passwordConfigured,true);
 assert.equal(publicPerson({password_hash:'hash',must_change:true},true,1).passwordConfigured,false);
 assert.equal(publicPerson({password_hash:'hash',must_change:false,email:'private'},false,1).passwordConfigured,undefined);
});
test('mail de bienvenue MIME : expéditeur demandé, lien personnel, échappement et injection refusée',()=>{
 const mime=Buffer.from(welcomeMessage({sender:'pharmacie.trevoux@gmail.com',email:'alice@example.test',firstName:'Alice <script>',url:'https://portal.test/#invitation=secret'}).raw,'base64url').toString();
 assert.match(mime,/From: Pharmacie de Trevoux <pharmacie.trevoux@gmail.com>/);assert.match(mime,/To: alice@example.test/);
 const parts=mime.split('Content-Transfer-Encoding: base64\r\n\r\n').slice(1).map(p=>Buffer.from(p.split('\r\n--')[0].replace(/\r\n/g,''),'base64').toString());
 assert.match(parts[0],/72 heures/);assert.match(parts[0],/https:\/\/portal.test\/#invitation=secret/);assert.match(parts[1],/Alice &lt;script&gt;/);assert.doesNotMatch(parts[1],/<script>/);
 assert.throws(()=>welcomeMessage({sender:'pharmacie.trevoux@gmail.com',email:'a@example.test\r\nBcc: other@example.test',firstName:'Alice',url:'https://portal.test'}));
});
test('Gmail : autorisation chiffrée, renouvellement partagé et envoi seulement avec le bon compte et scope',async()=>{
 const settings=new Map(),calls=[];
 settings.set('mail_tokens',encrypt({sender:'pharmacie.trevoux@gmail.com',scope:gmailSendScope,access_token:'old',refresh_token:'refresh',expires_at:0},secret));
 const mailer=createInvitationMailer({secret,clientId:'id',clientSecret:'client-secret',fail,getSetting:async k=>settings.get(k),setSetting:async(k,v)=>settings.set(k,v),fetchImpl:async(url,options)=>{
  calls.push({url,options});if(url.includes('/token'))return {ok:true,json:async()=>({access_token:'new',expires_in:3600})};return {ok:true,json:async()=>({id:'mail-id'})};
 }});
 assert.equal((await mailer.status()).connected,true);
 const args={email:'alice@example.test',firstName:'Alice',url:'https://portal.test/#invitation=token'};await Promise.all([mailer.send(args),mailer.send(args)]);
 assert.equal(calls.filter(c=>c.url.includes('/token')).length,1);assert.equal(calls.filter(c=>c.url.includes('/messages/send')).length,2);
 assert.equal(decrypt(settings.get('mail_tokens'),secret).access_token,'new');assert.doesNotMatch(settings.get('mail_tokens'),/refresh/);
 assert.equal(calls.at(-1).options.headers.Authorization,'Bearer new');
 settings.set('mail_tokens',encrypt({sender:'other@gmail.com',scope:gmailSendScope,expires_at:Date.now()+3600000},secret));await assert.rejects(mailer.send(args),e=>e.status===409);
 settings.set('mail_tokens',encrypt({sender:'pharmacie.trevoux@gmail.com',scope:'openid',expires_at:Date.now()+3600000},secret));await assert.rejects(mailer.send(args),e=>e.status===409);
});
test('connexion Gmail : compte attendu, autorisation d’envoi seule et tokens séparés de l’agenda',async t=>{
 const actor={id:1,role:'admin',csrf:'csrf',session_id:'session',must_change:false},settings=new Map([['google_tokens','calendar-unchanged']]);let stateHash='',verifier='',identity='pharmacietrevoux@gmail.com';
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT s.id'))return {rows:[actor]};
  if(sql.startsWith('UPDATE sessions SET oauth_state=$1')){stateHash=args[0];verifier=args[1];return {rows:[]};}
  if(sql.startsWith('SELECT oauth_verifier'))return {rows:[{oauth_verifier:verifier}]};
  if(sql.startsWith('UPDATE sessions SET oauth_state=NULL')){if(args[1]!==stateHash)return {rows:[]};stateHash='';return {rows:[{verifier:args[2]}]};}
  if(sql.startsWith('INSERT INTO settings')){settings.set(args[0],args[1]);return {rows:[]};}
  throw Error('Unexpected query '+sql);
 }};
 const originalFetch=global.fetch;
 global.fetch=async url=>url.includes('/token')?{ok:true,json:async()=>({access_token:'test-access',refresh_token:'test-refresh',scope:'openid email '+gmailSendScope,expires_in:3600})}:{ok:true,json:async()=>({email:identity,email_verified:true})};
 t.after(()=>global.fetch=originalFetch);
 const {app}=createApp(db,{origin:'https://portal.test',secret,googleId:'client-id',googleSecret:'client-secret',googleEmail:'calendar@example.test'}),server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port,headers={origin:'https://portal.test',cookie:'trevoux_session='+'a'.repeat(43),'x-csrf-token':'csrf','content-type':'application/json'};
 const connect=async()=>{const result=await originalFetch(base+'/api/mail/connect',{method:'POST',headers,body:'{}'});assert.equal(result.status,200);return new URL((await result.json()).url);};
 const url=await connect();assert.match(url.searchParams.get('state'),/^mail_/);assert.equal(url.searchParams.get('login_hint'),'pharmacie.trevoux@gmail.com');assert.equal(url.searchParams.get('scope'),'openid email '+gmailSendScope);assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 let result=await originalFetch(base+'/auth/google/callback?state='+url.searchParams.get('state')+'&code=test',{headers,redirect:'manual'});assert.equal(result.status,302);assert.equal(result.headers.get('location'),'/?mail=connected');
 assert.equal(settings.get('google_tokens'),'calendar-unchanged');const tokens=decrypt(settings.get('mail_tokens'),secret);assert.equal(tokens.sender,'pharmacie.trevoux@gmail.com');assert.equal(tokens.refresh_token,'test-refresh');
 identity='wrong@gmail.com';const other=await connect();result=await originalFetch(base+'/auth/google/callback?state='+other.searchParams.get('state')+'&code=test',{headers,redirect:'manual'});assert.equal(result.status,403);
 assert.equal(decrypt(settings.get('mail_tokens'),secret).sender,'pharmacie.trevoux@gmail.com');
});
test('un compte salarié peut être créé avec son e-mail en attendant son invitation',async t=>{
 let saved;
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT s.id'))return {rows:[{id:1,role:'admin',csrf:'csrf',must_change:false}]};
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};
  if(sql.startsWith('INSERT INTO users(name')){saved={id:2,name:args[0],first_name:args[1],last_name:args[2],email:args[7],password_hash:args[8],role:args[12],active:true,must_change:true};return {rows:[saved]};}
  throw Error('Unexpected query '+sql);
 }};
 const {app}=createApp(db,{origin:'https://portal.test',secret}),server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const result=await fetch('http://127.0.0.1:'+server.address().port+'/api/users',{method:'POST',headers:{origin:'https://portal.test',cookie:'trevoux_session='+'a'.repeat(43),'x-csrf-token':'csrf','content-type':'application/json'},body:JSON.stringify({firstName:'Alice',lastName:'Exemple',email:'alice@example.test'})});
 assert.equal(result.status,201);assert.equal(saved.email,'alice@example.test');assert.equal(saved.password_hash,null);assert.equal((await result.json()).passwordConfigured,false);
});
test('invitation : administrateur, envoi confirmé, rollback, expiration, création du mot de passe et usage unique',async t=>{
 let actor={id:1,name:'Administrateur',role:'admin',csrf:'csrf',session_id:'session',must_change:false},person={id:2,first_name:'Alice',name:'Alice Test',email:'alice@example.test',active:true,password_hash:null,must_change:true},invites=[],snapshot=null,connected=true,sendFailure=false,mail=null;
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT s.id'))return {rows:[actor]};
  if(sql==='BEGIN'){snapshot=structuredClone({person,invites});return {rows:[]};}
  if(sql==='ROLLBACK'){({person,invites}=snapshot);return {rows:[]};}
  if(sql==='COMMIT'){snapshot=null;return {rows:[]};}
  if(sql.startsWith('SELECT * FROM users WHERE id'))return {rows:person?[person]:[]};
  if(sql.startsWith('DELETE FROM employee_invitations')){invites=invites.filter(i=>i.used_at);return {rows:[]};}
  if(sql.startsWith('INSERT INTO employee_invitations')){invites.push({hash:args[0],user_id:args[1],email:args[2],expires_at:Date.now()+72*3600000,sent_at:null,used_at:null});return {rows:[]};}
  if(sql.startsWith('UPDATE users SET email')){person.email=args[0];person.password_hash=null;person.must_change=true;return {rows:[]};}
  if(sql.startsWith('UPDATE employee_invitations SET sent_at')){invites.find(i=>i.hash===args[0]).sent_at=Date.now();return {rows:[]};}
  if(sql.startsWith('UPDATE users SET invitation_sent_at')){person.invitation_sent_at=new Date().toISOString();return {rows:[]};}
  if(sql.startsWith('DELETE FROM sessions'))return {rows:[]};
  if(sql.startsWith('INSERT INTO login_attempts'))return {rows:[{count:1}]};
  if(sql.startsWith('SELECT u.*,i.email')){
   assert.match(sql,/i.sent_at IS NOT NULL/);assert.match(sql,/i.used_at IS NULL/);assert.match(sql,/i.expires_at>now\(\)/);assert.match(sql,/u.email=i.email/);assert.match(sql,/u.active=TRUE/);
   const i=invites.find(i=>i.hash===args[0]&&i.sent_at&&!i.used_at&&i.expires_at>Date.now()&&person.active&&i.email===person.email&&(!person.password_hash||person.must_change));return {rows:i?[{...person,invitation_email:i.email}]:[]};
  }
  if(sql.startsWith('UPDATE users SET password_hash')){person.password_hash=args[0];person.must_change=false;return {rows:[person]};}
  if(sql.startsWith('UPDATE employee_invitations SET used_at')){invites.forEach(i=>i.used_at=Date.now());return {rows:[]};}
  if(sql.startsWith('INSERT INTO sessions'))return {rows:[]};
  throw Error('Unexpected query '+sql);
 }};
 const mailer={status:async()=>({connected}),send:async args=>{if(sendFailure)throw fail(502,'Envoi refusé');mail=args;}};
 const {app}=createApp(db,{origin:'https://portal.test',secret,invitationMailer:mailer}),server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const headers={origin:'https://portal.test',cookie:'trevoux_session='+'a'.repeat(43),'x-csrf-token':'csrf','content-type':'application/json'};
 const request=(path,body,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
 const send=()=>request('/api/users/2/invitation',{});
 assert.equal((await request('/api/users/2/invitation',{}, {cookie:''})).status,401);assert.equal((await request('/api/users/2/invitation',{}, {'x-csrf-token':''})).status,403);
 actor.role='employee';assert.equal((await send()).status,403);actor.role='admin';connected=false;assert.equal((await send()).status,409);connected=true;
 person.active=false;assert.equal((await send()).status,409);person.active=true;
 person.password_hash='configured';person.must_change=false;assert.equal((await send()).status,409);person.password_hash=null;person.must_change=true;
 assert.equal((await request('/api/users/2/invitation',{email:'changed@example.test'})).status,409);
 const sent=await send();assert.equal(sent.status,200);assert.deepEqual(await sent.json(),{ok:true,email:'alice@example.test'});
 const raw=mail.url.split('#invitation=')[1];assert.match(raw,/^[\w-]{43}$/);assert.equal(invites[0].hash,digest(raw));assert.notEqual(invites[0].hash,raw);assert.equal((await send()).status,429);
 person.invitation_sent_at=null;const previous=structuredClone(invites);sendFailure=true;assert.equal((await send()).status,502);assert.deepEqual(invites,previous);sendFailure=false;
 const check=()=>request('/api/invitations/check',{token:raw},{cookie:''});
 assert.deepEqual(await (await check()).json(),{firstName:'Alice',email:'alice@example.test'});assert.equal(person.password_hash,null);assert.equal(invites[0].used_at,null);
 invites[0].expires_at=0;assert.equal((await check()).status,400);invites[0].expires_at=Date.now()+3600000;
 person.email='changed@example.test';assert.equal((await check()).status,400);person.email='alice@example.test';person.active=false;assert.equal((await check()).status,400);person.active=true;
 assert.equal((await request('/api/invitations/accept',{token:raw,password:'short'},{cookie:''})).status,400);
 const accepted=await request('/api/invitations/accept',{token:raw,password:'Mot-de-passe-personnel-123!'},{cookie:''});assert.equal(accepted.status,200);assert.match(accepted.headers.get('set-cookie'),/HttpOnly/);const session=await accepted.json();assert.equal(session.user.mustChange,false);assert.equal(await verifyPassword('Mot-de-passe-personnel-123!',person.password_hash),true);assert.ok(invites[0].used_at);
 assert.equal((await check()).status,400);assert.equal((await request('/api/invitations/accept',{token:raw,password:'Mot-de-passe-personnel-123!'},{cookie:''})).status,400);assert.equal((await send()).status,409);
});
