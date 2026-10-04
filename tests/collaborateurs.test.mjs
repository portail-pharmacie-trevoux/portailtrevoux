import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeastCalendar,parisDate,normalizeName,publicPerson} from '../collaborateurs.mjs';
test('calendrier des fêtes : date de Paris, variantes, cache puis renouvellement quotidien',async()=>{
 let current=new Date('2026-10-04T21:59:00Z'),calls=0;
 const calendar=createFeastCalendar({now:()=>current,fetchImpl:async(url)=>{calls++;const params=new URL(url).searchParams;assert.equal(params.get('jour'),calls===1?'04':'05');return {ok:true,json:async()=>({response:{prenoms:{majeurs:{Fleur:{}},derives:{Flora:{}}}}})};}});
 const first=await calendar();assert.equal(first.day,'2026-10-04');assert.deepEqual(first.names,['Fleur','Flora']);await calendar();assert.equal(calls,1);
 current=new Date('2026-10-04T22:01:00Z');assert.equal((await calendar()).day,'2026-10-05');assert.equal(calls,2);
 assert.equal(normalizeName('Élodie'),'elodie');assert.equal(parisDate(new Date('2026-01-01T23:30:00Z')),'2026-01-02');
});
test('fêtes indisponibles : aucune fête inventée et anniversaire toujours calculable',async()=>{
 const calendar=createFeastCalendar({fetchImpl:async()=>{throw Error('offline');}});const data=await calendar();assert.equal(data.available,false);assert.deepEqual(data.names,[]);assert.deepEqual(data.feasts,[]);
});
test('annuaire salarié ne contient jamais naissance, fonction, email ou droits',()=>{
 const result=publicPerson({id:2,first_name:'Alice',last_name:'Test',phone:'0600000000',active:true,birthday:'1990-01-01',email:'private@example.test',job:'Private',rights:['Agenda'],role:'employee'},false,2);
 assert.deepEqual(Object.keys(result).sort(),['id','firstName','lastName','phone','active','isSelf'].sort());assert.equal(result.isSelf,true);
});
