import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {validateNewsTitle,registerNews} from '../news.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
test('Optional message title is trimmed, bounded independently and rejects invalid types',()=>{
 for(const v of [undefined,null,'','   '])assert.equal(validateNewsTitle(v,fail),null);
 assert.equal(validateNewsTitle('  Réunion équipe  ',fail),'Réunion équipe');
 assert.equal(validateNewsTitle('😀'.repeat(120),fail),'😀'.repeat(120));
 for(const v of [5,{},'a'.repeat(121),'Deux\nlignes'])assert.throws(()=>validateNewsTitle(v,fail),e=>e.status===400);
});
test('Message title is saved atomically with recipients and returned by inbox, sent and thread queries',async t=>{
 const app=express();app.use(express.json());const pass=(q,s,n)=>{q.auth={id:1,name:'Test'};n();};let title;
 const db={query:async(sql,args)=>{
  if(sql.startsWith('WITH targets')){assert.match(sql,/thread_id,title\)/);assert.match(sql,/\$11::text/);title=args[10];return{rows:[{id:1,sent:1}]};}
  if(sql.includes('SELECT m.id')){assert.match(sql,/m.title/);return{rows:[{id:1,title,sender_id:1,created_at:'2026-10-26T09:00:00Z'}]};}
  return{rows:[]};
 }};
 registerNews({app,db,auth:pass,ready:pass,csrf:pass,viewUniverse:()=>pass,fail});app.use((e,q,s,n)=>s.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port+'/api/news';
 const send=body=>fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'Message',recipients:[2],...body})});
 assert.equal((await send({title:'  Information  '})).status,201);assert.equal(title,'Information');
 for(const path of ['', '/sent'])assert.equal((await(await fetch(base+path)).json())[0].title,'Information');
 assert.equal((await(await fetch(base+'/threads/1')).json()).messages[0].title,'Information');
 assert.equal((await send({})).status,201);assert.equal(title,null);
 assert.equal((await send({title:'x'.repeat(121)})).status,400);
});
