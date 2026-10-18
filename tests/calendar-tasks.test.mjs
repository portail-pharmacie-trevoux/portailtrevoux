import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {validateTask,taskEvent,registerCalendarTasks} from '../calendar-tasks.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
test('Tâche : dates réelles, limites, icônes et événement local',()=>{
 const body={title:' Appeler ',description:'Note',date:'2028-02-29',icon:'📞',userId:99};
 assert.equal(validateTask(body,fail).title,'Appeler');
 for(const patch of [{date:'2026-02-29'},{date:'2026-13-01'},{title:' '},{title:'a'.repeat(151)},{icon:'<img>'},{description:'a'.repeat(1001)}])assert.throws(()=>validateTask({...body,...patch},fail));
 const e=taskEvent({id:3,title:'Appel',description:'',task_date:'2026-12-31',icon:'📞'});assert.equal(e.end.date,'2027-01-01');assert.equal(e.personalTask,true);assert.equal(e.remind,true);
});
test('Tâches : identité serveur, isolement propriétaire, CSRF et droits Agenda',async t=>{
 const app=express();app.use(express.json());let allowed=true;const calls=[];
 const db={query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.startsWith('INSERT')?[{id:1}]:args.at(-1)===7?[{id:1}]:[]};}};
 const pass=(req,res,next)=>next();registerCalendarTasks({app,db,fail,auth:(req,res,next)=>{req.auth={id:Number(req.headers['x-user']||7)};next();},ready:pass,viewUniverse:()=>((req,res,next)=>allowed?next():next(fail(403,'Droits'))),csrf:(req,res,next)=>req.headers['x-csrf-token']==='ok'?next():next(fail(403,'CSRF'))});
 app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0);t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/api/calendar/tasks';
 const body={title:'Test',date:'2026-10-20',icon:'✅',userId:99};
 const send=(path,method,user=7,csrf='ok')=>fetch(url+path,{method,headers:{'content-type':'application/json','x-user':String(user),'x-csrf-token':csrf},body:JSON.stringify(body)});
 assert.equal((await send('','POST')).status,201);assert.equal(calls[0].args[0],7);
 assert.equal((await send('/1','PUT',8)).status,404);assert.match(calls.at(-1).sql,/AND user_id=\$6/);
 assert.equal((await send('/1','DELETE',8)).status,404);assert.match(calls.at(-1).sql,/AND user_id=\$2/);
 assert.equal((await send('/1','PUT')).status,200);assert.equal((await send('/1','DELETE')).status,200);
 assert.equal((await send('','POST',7,'bad')).status,403);allowed=false;assert.equal((await send('','POST')).status,403);
});
