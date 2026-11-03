import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import pg from 'pg';
import {createApp} from '../server.mjs';
import {token,digest} from '../security.mjs';
import {validateMusic} from '../music.mjs';
import {registerScalingoMusic,isScalingoMusicImport} from '../scripts/scalingo-music-preview.mjs';
import {scalingoUniverseBoundary} from '../scripts/scalingo-universal-rights.mjs';
const origin='https://portailplus-hds.osc-fr1.scalingo.io',database=process.env.PORTAIL_MUSIC_TEST_DATABASE_URL;
const deny=(q,s)=>s.status(403).json({error:'Fonction désactivée dans la prévisualisation'});
test('Scalingo Fun : import/export/suppression ciblés, autres routes fermées',async t=>{
 const gate=express();registerScalingoMusic(gate,(q,s)=>s.json({ok:true}));gate.use(deny);const server=gate.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 for(const [method,path,status]of [['POST','/api/music/import',200],['POST','/api/music/export.csv',200],['POST','/api/music/delete-selected',200],['DELETE','/api/music/1',200],['PUT','/api/music/import',403],['GET','/api/music/export.csv',403],['POST','/api/music/1',403],['DELETE','/api/music/0',403],['POST','/api/music/sync',403],['POST','/api/users',403]])assert.equal((await fetch('http://127.0.0.1:'+server.address().port+path,{method})).status,status,method+path);
 assert(isScalingoMusicImport({method:'POST',path:'/api/music/import'}));assert(!isScalingoMusicImport({method:'POST',path:'/api/music/export.csv'}));
});
test('Scalingo Fun/PostgreSQL : doublons normalisés, réimport, persistance, sélection et export',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/portailplus_music_test');assert.equal(url.search,'');
 const db=new pg.Pool({connectionString:database,max:3});t.after(()=>db.end());
 await db.query(`DROP TABLE IF EXISTS music_tracks,publications,sessions,users CASCADE;
 CREATE TABLE users(id integer PRIMARY KEY,name text,role text,active boolean,must_change boolean,rights jsonb,edit_rights jsonb,permissions_configured boolean);
 CREATE TABLE sessions(id text PRIMARY KEY,user_id integer REFERENCES users(id),csrf text,expires_at timestamptz);
 CREATE TABLE music_tracks(id serial PRIMARY KEY,artist text NOT NULL,title text NOT NULL,track_key text UNIQUE NOT NULL,contributor text NOT NULL DEFAULT '',source text NOT NULL DEFAULT 'manual',added_by integer REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE publications(id bigserial PRIMARY KEY,universe text,title text,source_key text UNIQUE,created_at timestamptz DEFAULT now());`);
 const cookies={};for(const [id,role,active,mustChange,read]of [[1,'admin',true,false,true],[2,'employee',true,false,true],[3,'employee',true,false,false],[4,'admin',true,true,true],[5,'admin',false,false,true]]){await db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,$6,$6,true)',[id,'Compte TEST local '+id,role,active,mustChange,JSON.stringify(read?['Fun']:[])]);const raw=token();cookies[id]='trevoux_session='+raw;await db.query("INSERT INTO sessions VALUES($1,$2,$3,now()+interval '1 hour')",[digest(raw),id,'csrf-'+id]);}
 const existing=validateMusic({artist:'Existant protégé',title:'Conservé'});await db.query("INSERT INTO music_tracks(id,artist,title,track_key,source) VALUES(100,$1,$2,$3,'manual')",[existing.artist,existing.title,existing.trackKey]);const protectedRow=async()=>(await db.query('SELECT * FROM music_tracks WHERE id=100')).rows[0],before=await protectedRow();
 function start(){const {app}=createApp(db,{origin,secret:'local-music-only-'.repeat(3)}),gate=express(),small=express.json({limit:'64kb'});gate.use((q,s,n)=>isScalingoMusicImport(q)?n():small(q,s,n));gate.use(scalingoUniverseBoundary(db));registerScalingoMusic(gate,app);gate.get('/api/music',(q,s,n)=>app(q,s,n));gate.use(deny);gate.use((e,q,s,n)=>s.status(e.status||500).json({error:e.message}));const server=gate.listen(0,'127.0.0.1');t.after(()=>{server.closeAllConnections();server.close();});return server;}
 let server=start();await once(server,'listening');const request=(path,method='GET',body,user=1,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{origin,cookie:cookies[user]||'','x-csrf-token':'csrf-'+user,'content-type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const body={tracks:[{artist:'Björk',title:'Jóga'},{artist:'  bjork ',title:'JOGA'},{artist:'Adele',title:'Hello'},{artist:existing.artist,title:existing.title}]};
 for(const [path,payload]of [['/api/music/import',body],['/api/music/export.csv',{ids:[100]}],['/api/music/delete-selected',{ids:[100]}]]){for(const user of [0,5])assert.equal((await request(path,'POST',payload,user)).status,401);for(const user of [2,3,4])assert.equal((await request(path,'POST',payload,user)).status,403);assert.equal((await request(path,'POST',payload,1,{'x-csrf-token':'bad'})).status,403);assert.equal((await request(path,'POST',payload,1,{origin:'https://wrong.invalid'})).status,403);}
 const first=await request('/api/music/import','POST',body);assert.equal(first.status,200);assert.deepEqual(await first.json(),{added:2,duplicates:2});assert.deepEqual(await(await request('/api/music/import','POST',body)).json(),{added:0,duplicates:4});assert.equal((await db.query('SELECT count(*)::int AS n FROM publications')).rows[0].n,1);
 for(const tracks of [[],new Array(26).fill({artist:'A',title:'B'}),[{artist:'Valid',title:'Track'},{artist:'',title:'Bad'}]])assert.equal((await request('/api/music/import','POST',{tracks})).status,400);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM music_tracks')).rows[0].n,3);
 // 25 maximum-length UTF-8 titles need more than the ordinary 16 KiB parser.
 const unicode={tracks:Array.from({length:25},(_,i)=>({artist:'曲'.repeat(198)+i,title:'歌'.repeat(198)+i}))};assert(Buffer.byteLength(JSON.stringify(unicode))>16384);const large=await request('/api/music/import','POST',unicode);assert.equal(large.status,200);assert.equal((await large.json()).added,25);
 const oversized=await request('/api/music/import','POST',{tracks:[],padding:'x'.repeat(65536)});assert.equal(oversized.status,413);assert.match((await oversized.json()).error,/64 Ko/);
 server.closeAllConnections();await new Promise(r=>server.close(r));server=start();await once(server,'listening');const list=await(await request('/api/music','GET',undefined,2)).json();assert.equal(list.length,28);assert.equal((await request('/api/music','GET',undefined,3)).status,403);
 const bjork=list.find(t=>t.artist==='Björk'),adele=list.find(t=>t.artist==='Adele');assert(bjork&&adele);
 const exported=await request('/api/music/export.csv','POST',{ids:[bjork.id]});assert.equal(exported.status,200);const csv=await exported.text();assert.match(csv,/"Artist","Title"/);assert.match(csv,/"Björk","Jóga"/);assert(!csv.includes('Adele'));assert.match(exported.headers.get('content-disposition'),/Playlist_PortailPlus_Trevoux.csv/);
 assert.equal((await request('/api/music/'+adele.id,'DELETE',undefined,2)).status,403);assert.equal((await request('/api/music/'+adele.id,'DELETE',undefined,1,{'x-csrf-token':'bad'})).status,403);
 assert.equal((await request('/api/music/'+adele.id,'DELETE')).status,200);assert.equal((await request('/api/music/delete-selected','POST',{ids:[bjork.id]})).status,200);
 const independent=new pg.Client({connectionString:database});await independent.connect();try{assert.equal((await independent.query('SELECT count(*)::int AS n FROM music_tracks WHERE id=ANY($1::int[])',[[adele.id,bjork.id]])).rows[0].n,0);}finally{await independent.end();}
 assert.deepEqual(await protectedRow(),before);
});
