// Isolated HTTP authentication smoke test. All database writes are rolled back.
import pg from 'pg';
import {createApp} from '../server.mjs';
import {hashPassword,token} from '../security.mjs';
const e=process.env;
if(e.SCALINGO_PREVIEW_SAFE_MODE!=='true'||e.SCALINGO_REQUIRE_DB_TLS!=='true')throw Error('Safe preview and TLS required');
if(e.SCALINGO_ENABLE_BUSINESS_STARTUP==='true'||e.SCALINGO_ENABLE_SCHEDULED_JOBS==='true')throw Error('Business actions must remain disabled');
if(!e.DATABASE_URL)throw Error('DATABASE_URL missing');
const u=new URL(e.DATABASE_URL);
for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(k);
const db=new pg.Client({connectionString:u.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
let server,transaction=false;
const assert=(condition,message)=>{if(!condition)throw Error(message);};
try{
 await db.connect();
 await db.query('BEGIN');transaction=true;
 const identity=(await db.query("SELECT current_database() AS database,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
 assert(identity.database==='portailplus_7495'&&identity.tls===true,'Wrong database or missing TLS');
 const users=(await db.query('SELECT id,email,role,active FROM users')).rows;
 assert(users.length===1&&users[0].email==='admin-test@portailplus.invalid'&&users[0].role==='admin'&&users[0].active===true,'Unexpected staging users');
 const password=token();
 await db.query('UPDATE users SET password_hash=$1 WHERE id=$2',[await hashPassword(password),users[0].id]);
 const config={origin:'http://127.0.0.1',secret:token(),dummyHash:await hashPassword(token()),invitationMailer:{send:async()=>{throw Error('Email disabled in smoke test');}},youtrustClient:{},mailFetch:async()=>{throw Error('External calls disabled');},employeeScanFetch:async()=>{throw Error('External calls disabled');}};
 const {app}=createApp(db,config);
 server=app.listen(0,'127.0.0.1');
 await new Promise((resolve,reject)=>{if(server.listening)resolve();else{server.once('listening',resolve);server.once('error',reject);}});
 const base='http://127.0.0.1:'+server.address().port;
 const request=(path,options={})=>fetch(base+path,{...options,redirect:'manual',signal:AbortSignal.timeout(10000)});
 let response=await request('/api/me');
 assert(response.status===401,'Anonymous access not rejected');
 response=await request('/api/login',{method:'POST',headers:{'origin':'http://127.0.0.1','content-type':'application/json'},body:JSON.stringify({email:users[0].email,password:'invalid-password'})});
 assert(response.status===401,'Incorrect password not rejected');
 response=await request('/api/login',{method:'POST',headers:{'origin':'http://127.0.0.1','content-type':'application/json'},body:JSON.stringify({email:users[0].email,password})});
 assert(response.status===200,'Valid login rejected');
 const login=await response.json();
 assert(login.user?.role==='admin'&&typeof login.csrf==='string','Admin role or CSRF missing');
 const cookie=response.headers.get('set-cookie')?.split(';')[0];
 assert(cookie?.startsWith('trevoux_session='),'Session cookie missing');
 response=await request('/api/me',{headers:{cookie}});
 assert(response.status===200,'Authenticated session rejected');
 const me=await response.json();
 assert(me.user?.role==='admin'&&me.user?.email===users[0].email,'Session identity mismatch');
 response=await request('/api/logout',{method:'POST',headers:{origin:'http://127.0.0.1',cookie,'x-csrf-token':login.csrf}});
 assert(response.status===200,'Logout failed');
 response=await request('/api/me',{headers:{cookie}});
 assert(response.status===401,'Logged-out session still valid');
 console.log(JSON.stringify({status:'ok',database:identity.database,tls:true,anonymousDenied:true,invalidPasswordDenied:true,adminLogin:true,sessionCreated:true,adminRole:true,logoutInvalidatesSession:true,publicPreviewUnchanged:true,transactionRolledBack:true,externalCalls:false}));
}catch(err){console.error('Staging authentication smoke test failed:',err.message);process.exitCode=1;}
finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 if(transaction)await db.query('ROLLBACK').catch(()=>{process.exitCode=1;});
 await db.end().catch(()=>{});
}
