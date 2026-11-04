import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pg from 'pg';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createApp} from '../server.mjs';
import {digest,hashPassword,decrypt} from '../security.mjs';
import {totp,orderIdleMs} from '../order-mfa.mjs';
import {registerScalingoOrderMFA} from '../scripts/scalingo-order-mfa-preview.mjs';
import {scalingoUniverseBoundary} from '../scripts/scalingo-universal-rights.mjs';
const origin='https://portailplus-hds.osc-fr1.scalingo.io',database=process.env.PORTAIL_ORDER_MFA_TEST_DATABASE_URL;
test('Scalingo MFA gateway: only personal TOTP verification and guarded order reads',async t=>{
 const gate=express();registerScalingoOrderMFA(gate,(q,s)=>s.sendStatus(204));gate.use((q,s)=>s.sendStatus(403));const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 for(const [method,path,status] of [['GET','/api/order-mfa/status',204],['POST','/api/order-mfa/setup',204],['POST','/api/order-mfa/confirm',204],['POST','/api/order-mfa/unlock',204],['POST','/api/order-mfa/touch',204],['POST','/api/order-mfa/lock',204],['GET','/api/order-planning',204],['GET','/api/order-planning/options',204],['GET','/api/order-mfa/users',403],['POST','/api/order-mfa/reset',403],['POST','/api/order-mfa/totp-disable',403],['POST','/api/order-mfa/paper',403],['POST','/api/order-mfa/recovery',403],['POST','/api/order-planning',403],['GET','/api/order-planning/export.xlsx',403],['POST','/api/order-mfa/unlock/',403],['GET','/api/order-mfa/secret',403],['DELETE','/api/order-mfa/unlock',403]])assert.equal((await fetch('http://127.0.0.1:'+server.address().port+path,{method})).status,status,method+path);
});
test('PostgreSQL Scalingo: real password/TOTP, missing/wrong/valid/replayed MFA, idle expiry, expired portal session and unauthorized access',{skip:!database},async t=>{
 const u=new URL(database);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/portailplus_order_mfa_test');const db=new pg.Pool({connectionString:database});t.after(()=>db.end());
 await db.query(`DROP TABLE IF EXISTS order_mfa_audit,order_mfa,sessions,users,login_attempts,order_planning CASCADE;
 CREATE TABLE users(id int PRIMARY KEY,name text,email text,password_hash text,role text,active boolean,must_change boolean,rights jsonb,edit_rights jsonb,permissions_configured boolean);
 CREATE TABLE sessions(id text PRIMARY KEY,user_id int REFERENCES users(id),csrf text,expires_at timestamptz,order_mfa_at timestamptz,order_mfa_generation int DEFAULT 0);
 CREATE TABLE login_attempts(key text PRIMARY KEY,count int,until_at timestamptz);
 CREATE TABLE order_planning(id serial PRIMARY KEY,revision int,content text);`);
 const schema=await readFile(new URL('../schema.sql',import.meta.url),'utf8');for(const name of ['order_mfa','order_mfa_audit']){const a=schema.indexOf('CREATE TABLE IF NOT EXISTS '+name+' ('),b=schema.indexOf('\n);',a)+4;assert(a>=0);await db.query(schema.slice(a,b));}
 await db.query("ALTER TABLE order_mfa ADD COLUMN paper_enabled boolean DEFAULT false,ADD COLUMN paper_hashes jsonb DEFAULT '[]',ADD COLUMN paper_reference text");
 const password='Local TEST password only 123!',key='Local MFA encryption only-'.repeat(2),hash=await hashPassword(password);
 for(const [id,role,rights] of [[1,'admin',[]],[2,'employee',[]]]){await db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,true,false,$6,$6,true)',[id,'TEST '+id,'test'+id+'@example.invalid',hash,role,JSON.stringify(rights)]);await db.query("INSERT INTO sessions(id,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')",[digest(String(id).repeat(43)),id]);}
 const {app}=createApp(db,{origin,secret:key}),gate=express();gate.use(express.json());gate.use(scalingoUniverseBoundary(db));registerScalingoOrderMFA(gate,app);gate.use((q,s)=>s.sendStatus(403));gate.use((e,q,s,n)=>s.status(e.status||500).json({error:e.message,code:e.code}));const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
 const req=(path,body,user=1,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method:body===undefined?'GET':'POST',headers:{origin,cookie:user?'trevoux_session='+String(user).repeat(43):'','x-csrf-token':'csrf','content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const status=async()=>{const r=await req('/api/order-mfa/status');assert.equal(r.status,200);return r.json();};
 assert.equal((await req('/api/order-mfa/status',undefined,0)).status,401);assert.equal((await req('/api/order-mfa/status',undefined,2)).status,403);assert.equal((await req('/api/order-mfa/unlock',{code:'000000'},2)).status,403);
 assert.equal((await status()).unlocked,false);const locked=await req('/api/order-planning');assert.equal(locked.status,403);assert.equal((await locked.json()).code,'MFA_REQUIRED');
 assert.equal((await req('/api/order-mfa/setup',{password},1,{'x-csrf-token':'bad'})).status,403);assert.equal((await req('/api/order-mfa/setup',{password},1,{origin:'https://other.invalid'})).status,403);assert.equal((await req('/api/order-mfa/setup',{password:'wrong'})).status,400);
 const r=await req('/api/order-mfa/setup',{password});assert.equal(r.status,200);const setup=await r.json();assert.match(setup.qr,/^data:image\/png/);const stored=(await db.query('SELECT * FROM order_mfa WHERE user_id=1')).rows[0];assert.equal(decrypt(stored.pending_secret,key),setup.secret);assert.notEqual(stored.pending_secret,setup.secret);
 const step=Math.floor(Date.now()/30000),prior=totp(setup.secret,step-1);assert.equal((await req('/api/order-mfa/confirm',{code:prior})).status,200);assert.equal((await status()).unlocked,true);
 assert.equal((await req('/api/order-mfa/lock',{})).status,200);assert.equal((await req('/api/order-planning')).status,403);assert.equal((await req('/api/order-mfa/unlock',{code:prior})).status,400);
 const current=Math.floor(Date.now()/30000),valid=totp(setup.secret,current),validCodes=new Set([current-1,current,current+1].map(n=>totp(setup.secret,n))),wrong=['000000','111111','222222','333333'].find(c=>!validCodes.has(c));assert.equal((await req('/api/order-mfa/unlock',{code:wrong})).status,400);assert.equal((await status()).unlocked,false);
 assert.equal((await req('/api/order-mfa/unlock',{code:valid})).status,200);assert.equal((await req('/api/order-planning')).status,200);assert.equal((await req('/api/order-planning/options')).status,200);assert.equal((await req('/api/order-mfa/touch',{})).status,200);
 await db.query("UPDATE sessions SET order_mfa_at=now()-interval '11 minutes' WHERE user_id=1");assert.equal((await status()).unlocked,false);assert.equal((await req('/api/order-planning')).status,403);assert.equal((await req('/api/order-mfa/touch',{})).status,403);
 await db.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=1");assert.equal((await req('/api/order-mfa/status')).status,401);assert.equal((await req('/api/order-mfa/unlock',{code:valid})).status,401);assert.equal((await req('/api/order-planning')).status,401);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM order_planning')).rows[0].n,0);assert((await db.query("SELECT * FROM order_mfa_audit WHERE action='unlock'")).rows.length>0);
});
