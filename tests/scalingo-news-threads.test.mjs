import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pg from 'pg';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {token,digest} from '../security.mjs';
import {registerScalingoNewsThreads} from '../scripts/scalingo-news-threads-preview.mjs';
const database=process.env.PORTAIL_THREADS_TEST_DATABASE_URL,origin='https://portailplus-hds.osc-fr1.scalingo.io',root='/api/news/threads/';
const deny=(q,s)=>s.status(403).json({error:'Fonction désactivée dans la prévisualisation'});
test('Scalingo : seule la lecture des fils identifiés est déléguée',async t=>{
 const gate=express();registerScalingoNewsThreads(gate,(q,s)=>s.json({delegated:true}));gate.use(deny);const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 for(const [method,path,status]of [['GET',root+'2',200],['GET',root+'99',200],['POST',root+'2',403],['PUT',root+'2',403],['DELETE',root+'2',403],['PATCH',root+'2',403],['GET',root+'0',403],['GET',root+'-1',403],['GET',root+'abc',403],['GET',root+'2/participants',403],['GET','/api/news/2/attachment',403],['GET','/api/users/2',403]])assert.equal((await fetch('http://127.0.0.1:'+server.address().port+path,{method})).status,status,method+' '+path);
});
test('Scalingo/PostgreSQL : fil chronologique, accès par message, actualisation et lectures préservées',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_threads_test');assert.equal(url.search,'');
 const db=new pg.Pool({connectionString:database,max:3});t.after(()=>db.end());
 await db.query(`DROP TABLE IF EXISTS team_message_recipients,team_messages,sessions,users CASCADE;
 CREATE TABLE users(id integer PRIMARY KEY,name text,role text,active boolean,must_change boolean,rights jsonb DEFAULT '[]',edit_rights jsonb DEFAULT '[]',permissions_configured boolean DEFAULT true);
 CREATE TABLE sessions(id text PRIMARY KEY,user_id integer REFERENCES users(id),csrf text,expires_at timestamptz);
 CREATE TABLE team_messages(id integer PRIMARY KEY,title text,sender_id integer REFERENCES users(id),sender_name text,text text,priority text DEFAULT 'normal',created_at timestamptz,attachment_name text,can_archive boolean DEFAULT true,planning_week date,is_reply boolean DEFAULT false,reply_to_id integer,thread_id integer,challenge_digest jsonb,order_digest jsonb,merchandising_month text,expires_on date);
 CREATE TABLE team_message_recipients(message_id integer REFERENCES team_messages(id),user_id integer REFERENCES users(id),seen boolean DEFAULT false,seen_at timestamptz,archived boolean DEFAULT false,PRIMARY KEY(message_id,user_id));`);
 const cookies={};async function session(id){const raw=token();cookies[id]='trevoux_session='+raw;await db.query("INSERT INTO sessions VALUES($1,$2,$3,now()+interval '1 hour')",[digest(raw),id,'csrf-'+id]);}
 for(const [id,role,mustChange,active]of [[1,'admin',false,true],[2,'employee',false,true],[3,'employee',false,true],[4,'employee',false,true],[5,'employee',false,true],[6,'employee',true,true],[7,'employee',false,false]]){await db.query('INSERT INTO users(id,name,role,must_change,active) VALUES($1,$2,$3,$4,$5)',[id,'Nom actuel '+id,role,mustChange,active]);await session(id);}
 const anchor=new Date();anchor.setUTCHours(12,0,0,0);const at=hours=>new Date(anchor.getTime()+hours*3600000);
 for(const [id,sender,hours,thread,reply]of [[2,2,-5,2,null],[3,3,-4,2,2],[4,2,-3,2,3],[5,4,-3,2,4],[6,2,-720,2,2],[7,3,-721,2,2],[99,4,-1,99,null]])await db.query('INSERT INTO team_messages(id,title,sender_id,sender_name,text,created_at,thread_id,is_reply,reply_to_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,'Sujet local '+id,sender,'Auteur historique '+sender,'Message local '+id,at(hours),thread,reply!==null,reply]);
 for(const [message,user,seen,archived]of [[2,3,true,false],[3,2,false,false],[4,4,false,false],[5,2,true,false],[6,3,false,false],[7,2,true,true],[99,1,false,false]])await db.query('INSERT INTO team_message_recipients VALUES($1,$2,$3,$4,$5)',[message,user,seen,seen?at(-2):null,archived]);
 const snapshot=async()=>({messages:(await db.query('SELECT * FROM team_messages ORDER BY id')).rows,recipients:(await db.query('SELECT * FROM team_message_recipients ORDER BY message_id,user_id')).rows});const before=await snapshot();
 function start(){const {app}=createApp(db,{origin,secret:'local-threads-only-'.repeat(3)}),gate=express();gate.use(express.json({limit:'64kb'}));registerScalingoNewsThreads(gate,app);gate.use(deny);gate.use((e,q,s,n)=>s.status(e.status||500).json({error:e.message}));const server=gate.listen(0,'127.0.0.1');t.after(()=>{server.closeAllConnections();server.close();});return server;}
 let server=start();await once(server,'listening');const get=(thread,user=2)=>fetch('http://127.0.0.1:'+server.address().port+root+thread,{headers:{cookie:cookies[user]||''}});
 for(const user of [0,7])assert.equal((await get(2,user)).status,401);assert.equal((await get(2,6)).status,403);
 const alice=await(await get(2)).json();assert.deepEqual(alice.messages.map(m=>m.id),[7,2,3,4,5]);assert.equal(alice.truncated,false);
 for(const message of alice.messages){const stored=before.messages.find(m=>m.id===message.id);assert.equal(message.sender,stored.sender_name);assert.equal(message.created_at,stored.created_at.toISOString());assert.equal(message.text,stored.text);assert.equal(message.title,stored.title);assert.equal(message.outgoing,stored.sender_id===2);const recipient=before.recipients.find(r=>r.message_id===message.id&&r.user_id===2);assert.equal(message.seen,recipient?.seen??null);assert.equal(message.archived,recipient?.archived??null);}
 const bob=await(await get(2,3)).json();assert.deepEqual(bob.messages.map(m=>m.id),[2,3]);assert.equal(bob.messages[0].seen,true);assert.equal(bob.messages[1].outgoing,true);
 assert.deepEqual((await(await get(2,4)).json()).messages.map(m=>m.id),[4,5]);
 for(const user of [2,3,5])assert.equal((await get(99,user)).status,404);for(const user of [1,5])assert.equal((await get(2,user)).status,404);assert.equal((await get(999)).status,404);
 assert.deepEqual((await(await get(99,1)).json()).messages.map(m=>m.id),[99]);
 assert.deepEqual(await snapshot(),before);
 server.closeAllConnections();await new Promise(r=>server.close(r));await db.query('DELETE FROM sessions WHERE user_id=2');await session(2);server=start();await once(server,'listening');assert.deepEqual(await(await get(2)).json(),alice);assert.deepEqual(await snapshot(),before);
 // Legacy messages without a stored thread_id remain visible by their own id.
 await db.query('INSERT INTO team_messages(id,sender_id,sender_name,text,created_at) VALUES(200,2,\'Auteur historique 2\',\'Ancien format\',now())');assert.deepEqual((await(await get(200)).json()).messages.map(m=>m.id),[200]);
 // Only the 200 latest accessible messages are returned, ordered oldest first.
 await db.query("INSERT INTO team_messages(id,sender_id,sender_name,text,created_at,thread_id) SELECT 1000+n,2,'Auteur historique 2','Long fil local',now(),1000 FROM generate_series(1,201) n");const long=await(await get(1000)).json();assert.equal(long.truncated,true);assert.equal(long.messages.length,200);assert.equal(long.messages[0].id,1002);assert.equal(long.messages.at(-1).id,1201);
});
