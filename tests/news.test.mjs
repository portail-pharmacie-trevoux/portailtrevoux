import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {validateMessage,purgeNews} from '../news.mjs';
import {canAccess} from '../security.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
test('Actualités est accessible par défaut, les droits personnalisés restent respectés',()=>{
  assert.equal(canAccess({role:'employee',rights:[]},'Actualités'),true);
  assert.equal(canAccess({role:'employee',rights:[],permissions_configured:true},'Actualités'),false);
});
test('messages : texte court, caractères Unicode, destinataires explicites et dédoublonnés',()=>{
  assert.deepEqual(validateMessage({text:' Bonjour ',recipients:[2,2,3]},fail),{text:'Bonjour',recipients:[2,3]});
  assert.equal(Array.from(validateMessage({text:'😀'.repeat(500),recipients:[2]},fail).text).length,500);
  for(const body of [{text:' ',recipients:[2]},{text:'x'.repeat(501),recipients:[2]},{text:'Bonjour',recipients:[]},{text:'Bonjour',recipients:['2']},{text:'Bonjour',recipients:[-1]}])assert.throws(()=>validateMessage(body,fail),e=>e.status===400);
});
test('purge : expiration à 30 jours, archives par destinataire et suppression des messages sans copie',async()=>{
  const queries=[];await purgeNews({query:async sql=>{queries.push(sql);return {rows:[]};}});
  assert.match(queries[0],/NOT r.archived/);assert.match(queries[0],/created_at<=now\(\)-interval '30 days'/);
  assert.match(queries[1],/NOT EXISTS/);assert.match(queries[1],/r.message_id=m.id/);
});
test('messagerie : accès, envoi atomique aux actifs, boîte personnelle, cases indépendantes et badge privé',async t=>{
  let actor={id:1,name:'Alice',role:'employee',rights:['Actualités'],permissions_configured:true,edit_rights:[],must_change:false,csrf:'csrf'};
  const active=new Set([1,2,3]);let nextId=0;const messages=[],copies=[];
  const db={query:async(sql,args=[])=>{
    if(sql.startsWith('SELECT s.id'))return {rows:[actor]};
    if(sql.startsWith('SELECT id,name FROM users'))return {rows:[...active].map(id=>({id,name:'Collaborateur '+id}))};
    if(sql.startsWith('WITH targets')){
      assert.match(sql,/active=TRUE/);assert.match(sql,/FOR SHARE/);assert.match(sql,/COUNT\(\*\).*cardinality/s);
      if(args[0].some(id=>!active.has(id)))return {rows:[]};
      const m={id:++nextId,sender:args[2],text:args[3],created_at:new Date().toISOString(),expires_at:new Date(Date.now()+30*86400000).toISOString()};messages.push(m);
      args[0].forEach(id=>copies.push({message_id:m.id,user_id:id,seen:false,archived:false}));return {rows:[{id:m.id,sent:args[0].length}]};
    }
    if(sql.startsWith('DELETE FROM team_message'))return {rows:[]};
    if(sql.startsWith('SELECT m.id')){
      assert.match(sql,/r.user_id=\$1/);assert.match(sql,/ORDER BY m.created_at DESC,m.id DESC/);
      return {rows:copies.filter(c=>c.user_id===args[0]).map(c=>({...messages.find(m=>m.id===c.message_id),seen:c.seen,archived:c.archived})).reverse()};
    }
    if(sql.startsWith('UPDATE team_message_recipients')){
      assert.match(sql,/r.user_id=\$2/);assert.match(sql,/r.archived OR m.created_at>now\(\)-interval '30 days'/);
      const copy=copies.find(c=>c.message_id===args[0]&&c.user_id===args[1]);if(!copy)return {rows:[]};
      if(args[2]!==null)copy.seen=args[2];if(args[3]!==null)copy.archived=args[3];return {rows:[copy]};
    }
    if(sql.startsWith('SELECT p.universe'))return {rows:[]};
    if(sql.startsWith('SELECT COUNT(*)::int AS unread')){assert.match(sql,/r.user_id=\$1 AND NOT r.seen/);assert.match(sql,/r.archived OR m.created_at/);return {rows:[{unread:copies.filter(c=>c.user_id===args[0]&&!c.seen).length}]};}
    throw Error('Unexpected query '+sql);
  }};
  const {app}=createApp(db,{origin:'https://portal.test',secret:'s'.repeat(32)}),server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  const headers={origin:'https://portal.test',cookie:'trevoux_session='+'a'.repeat(43),'x-csrf-token':'csrf','content-type':'application/json'};
  const request=(path,method='GET',body,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{...headers,...extra},body:body===undefined?undefined:JSON.stringify(body)});
  const message={text:'Message pour Bob et Chloé',recipients:[2,3]};
  assert.equal((await request('/api/news','POST',message,{cookie:''})).status,401);
  assert.equal((await request('/api/news','POST',message,{'x-csrf-token':''})).status,403);
  assert.equal((await request('/api/news','POST',message,{origin:'https://evil.test'})).status,403);
  actor.must_change=true;assert.equal((await request('/api/news')).status,403);actor.must_change=false;
  actor.rights=[];assert.equal((await request('/api/news')).status,403);actor.rights=['Actualités'];
  assert.equal((await request('/api/news/recipients')).status,200);
  assert.equal((await request('/api/news','POST',{...message,recipients:[2,99]})).status,409);assert.equal(messages.length,0);
  const sent=await request('/api/news','POST',message);assert.equal(sent.status,201);assert.deepEqual(await sent.json(),{ok:true,sent:2});
  assert.deepEqual(await (await request('/api/news')).json(),[]);
  assert.equal((await request('/api/news/1','PATCH',{seen:true})).status,404);
  actor.id=2;
  let received=await (await request('/api/news')).json();assert.equal(received.length,1);assert.equal(received[0].seen,false);assert.equal(received[0].archived,false);assert.equal(received[0].recipients,undefined);
  assert.equal((await request('/api/news/1','PATCH',{archived:'true'})).status,400);
  assert.equal((await request('/api/news/1','PATCH',{archived:true})).status,200);
  received=await (await request('/api/news')).json();assert.equal(received[0].archived,true);assert.equal(received[0].seen,false);
  assert.deepEqual(await (await request('/api/publications')).json(),[{universe:'Actualités',unread:1}]);
  assert.equal((await request('/api/news/1','PATCH',{seen:true})).status,200);
  assert.deepEqual(await (await request('/api/publications')).json(),[{universe:'Actualités',unread:0}]);
  actor.id=3;received=await (await request('/api/news')).json();assert.equal(received[0].seen,false);assert.equal(received[0].archived,false);
  assert.equal((await request('/api/publications/Actualit%C3%A9s/read','POST',{id:'1'})).status,403);
});
