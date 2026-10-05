import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {requestedEmployeeRole} from '../collaborateurs.mjs';
import {canAccess,canModify,universes} from '../security.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
test('administrateur : rôle explicite, tous les univers et protection des administrateurs existants',()=>{
 const role=requestedEmployeeRole({administratorRights:true},{role:'employee'},fail);assert.equal(role,'admin');
 for(const universe of universes){assert.equal(canAccess({role},universe),true);assert.equal(canModify({role},universe),true);}
 assert.equal(requestedEmployeeRole({}, {role:'admin'},fail),'admin');
 assert.throws(()=>requestedEmployeeRole({administratorRights:'true'},null,fail),e=>e.status===400);
 assert.throws(()=>requestedEmployeeRole({administratorRights:false},{role:'admin'},fail),e=>e.status===400);
});
test('promotion protégée et suppression définitive réservée aux inactifs, avec transaction',async t=>{
 let actor={id:1,role:'admin',csrf:'test',must_change:false},target={id:2,role:'employee',active:true,first_name:'Exemple',last_name:'TEST',email:'test@example.test',password_hash:'existing-hash',rights:[],edit_rights:[],permissions_configured:true},invalidated=false,deleted=false,planningCleaned=false;const queries=[];
 const db={query:async(sql,args=[])=>{
  queries.push(sql);
  if(sql.startsWith('SELECT s.id'))return {rows:[actor]};
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};
  if(sql.startsWith('SELECT * FROM users')||sql.startsWith('SELECT id,active,role'))return {rows:target?[target]:[]};
  if(sql.startsWith('UPDATE users SET name')){assert.equal(args[14],'admin');target={...target,role:args[14]};return {rows:[target]};}
  if(sql.startsWith('DELETE FROM sessions')){invalidated=true;return {rows:[]};}
  if(sql.startsWith('UPDATE schedule_weeks SET')){planningCleaned=true;assert.equal(args[0],2);assert.match(sql,/published_revision=CASE/);return {rows:[]};}
  if(sql.startsWith('DELETE FROM users')){assert.equal(target.active,false);assert.equal(target.role,'employee');deleted=true;target=null;return {rows:[]};}
  throw Error('Unexpected query: '+sql);
 }};
 const {app}=createApp(db,{origin:'https://portal.test',secret:'s'.repeat(32)}),server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const headers={cookie:'trevoux_session='+'a'.repeat(43),origin:'https://portal.test','x-csrf-token':'test','content-type':'application/json'};
 const request=(path,method,body,extra={})=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{...headers,...extra},body:JSON.stringify(body)});
 const change={firstName:'Exemple',lastName:'TEST',administratorRights:true};
 actor.role='employee';assert.equal((await request('/api/users/2','PUT',change)).status,403);actor.role='admin';
 assert.equal((await request('/api/users/2','PUT',change,{'x-csrf-token':''})).status,403);
 assert.equal((await request('/api/users/2','PUT',change)).status,200);assert.equal(target.role,'admin');assert.equal(invalidated,true);
 target={...target,role:'employee',active:true};
 assert.equal((await request('/api/users/2/permanent','DELETE',{confirmation:2})).status,409);assert.equal(deleted,false);assert.equal(planningCleaned,false);assert.equal(queries.at(-1),'ROLLBACK');
 target.active=false;assert.equal((await request('/api/users/2/permanent','DELETE',{confirmation:3})).status,400);
 actor.role='employee';assert.equal((await request('/api/users/2/permanent','DELETE',{confirmation:2})).status,403);actor.role='admin';
 assert.equal((await request('/api/users/2/permanent','DELETE',{confirmation:2})).status,200);assert.equal(deleted,true);assert.equal(planningCleaned,true);assert.equal(queries.at(-1),'COMMIT');
});
