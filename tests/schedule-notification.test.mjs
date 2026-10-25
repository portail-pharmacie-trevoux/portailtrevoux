import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {registerSchedule,changedScheduleUsers} from '../schedule.mjs';import {registerNews} from '../news.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status}),pass=(q,s,n)=>{q.auth={id:1,role:'admin'};n();};
const entry=(id,start='08:00')=>({userId:id,day:'2026-10-12',kind:'travail',slots:[[start,'12:00']]});
test('Planning: compare additions, deletions, posts, types, comments and optional defaults',()=>{
 const a=entry(2),key='2:2026-10-12',old={[key]:a};
 assert.deepEqual(changedScheduleUsers(old,{[key]:{...a,postIds:[null],comments:[''],slotKinds:['travail'],durations:[],mealTicket:false}}),[]);
 for(const patch of [{slots:[['09:00','12:00']]},{postIds:[3]},{comments:['Conseil']},{slotKinds:['reunion']},{mealTicket:true},{durations:[{kind:'conge',minutes:60}]}])assert.deepEqual(changedScheduleUsers(old,{[key]:{...a,...patch}}),[2]);
 assert.deepEqual(changedScheduleUsers(old,{}),[2]);assert.deepEqual(changedScheduleUsers({},old),[2]);
 assert.deepEqual(changedScheduleUsers(old,{[key]:{...a,leaveRequestId:123}}),[]);
});
test('Planning publication targets only changed collaborators and preserves unaffected notices',async t=>{
 let row={revision:0,published_revision:null,published:{},draft:{a:entry(2),b:entry(3)}},sent=[],commits=0;
 const db={connect:async()=>({query:db.query,release(){}}),query:async(sql,a)=>{
 if(sql==='COMMIT'){commits++;return {rows:[]};}
 if(sql==='BEGIN'||sql==='ROLLBACK'||sql.includes('pg_advisory_xact_lock')||sql.startsWith('DELETE FROM team_messages'))return {rows:[]};
 if(sql.startsWith('INSERT INTO schedule_weeks'))return{rows:[]};
 if(sql.startsWith('SELECT *'))return{rows:[row]};
 assert.match(sql,/WITH changed/);assert.match(sql,/DELETE FROM team_message_recipients r USING team_messages m/);
 assert.match(sql,/r.user_id=ANY\(\$5::int\[\]\)/);assert.match(sql,/u.active=TRUE AND u.id=ANY\(\$5::int\[\]\)/);
 assert.ok(!sql.includes('seen=TRUE'));assert.match(a[3],/semaine du 12\/10\/2026 au 18\/10\/2026/);
 if(row.published_revision===row.revision)return {rows:[]};
 row.published=structuredClone(row.draft);row.published_revision=row.revision;
 if(a[4].length)sent.push(a[4]);return {rows:[{id:1}]};
 }};
 const app=express();app.use(express.json());registerSchedule({app,db,auth:pass,ready:pass,admin:pass,csrf:pass,canAccess:()=>true,canModify:()=>true,fail});app.use((e,q,s,n)=>s.status(e.status||500).json({error:e.message}));
 const server=app.listen(0);t.after(()=>server.close());const post=revision=>fetch('http://127.0.0.1:'+server.address().port+'/api/schedule/2026-10-12/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({revision})});
 assert.equal((await post(0)).status,200);assert.deepEqual(sent,[[2,3]]);
 assert.equal((await(await post(0)).json()).alreadyPublished,true);assert.equal(sent.length,1);
 row.revision=1;row.draft.a=entry(2,'09:00');assert.equal((await post(1)).status,200);assert.deepEqual(sent,[[2,3],[2]]);
 row.revision=2;assert.equal((await post(2)).status,200);assert.equal(sent.length,2);
 row.revision=3;delete row.draft.b;assert.equal((await post(3)).status,200);assert.deepEqual(sent.at(-1),[3]);
 assert.equal((await post(1)).status,409);assert.equal(sent.length,3);assert.equal(commits,5);
});
test('Notification planning : Vu autorisé, archivage refusé côté serveur',async t=>{const app=express();app.use(express.json());const db={query:async(sql,a)=>{if(sql.startsWith('DELETE'))return{rows:[]};assert.match(sql,/m.can_archive OR \$4::boolean IS NOT TRUE/);return{rows:a[3]===true?[]:[{seen:true,archived:false}]};}};registerNews({app,db,auth:pass,ready:pass,csrf:pass,viewUniverse:()=>pass,fail});app.use((e,q,s,n)=>s.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());const patch=body=>fetch('http://127.0.0.1:'+server.address().port+'/api/news/1',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal((await patch({archived:true})).status,404);assert.equal((await patch({seen:true})).status,200);});
