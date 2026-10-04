import test from 'node:test';
import assert from 'node:assert/strict';
import { parisDate,safeJoke,createDailyJoke } from '../updates.mjs';
const joke=id=>({error:false,lang:'fr',safe:true,id,type:'twopart',setup:'Question ?',delivery:'Réponse !',flags:{nsfw:false,religious:false,political:false,racist:false,sexist:false,explicit:false}});
test('le changement de jour suit minuit à Paris, été et hiver',()=>{
  assert.equal(parisDate(new Date('2026-10-04T21:59:59Z')),'2026-10-04');
  assert.equal(parisDate(new Date('2026-10-04T22:00:00Z')),'2026-10-05');
  assert.equal(parisDate(new Date('2026-12-04T23:00:00Z')),'2026-12-05');
});
test('les contenus non français, signalés ou mal formés sont refusés',()=>{
  assert.equal(safeJoke({...joke(1),lang:'en'}),null);
  assert.equal(safeJoke({...joke(1),flags:{...joke(1).flags,explicit:true}}),null);
  assert.equal(safeJoke({...joke(1),safe:false}),null);
  assert.equal(safeJoke({...joke(1),setup:null}),null);
  assert.equal(safeJoke(joke(1)).text,'Question ?\nRéponse !');
});
test('une seule blague partagée par jour, cache persistant et renouvellement sans répétition',async()=>{
  const settings=new Map();let date=new Date('2026-10-04T20:00:00Z'),calls=0,publications=0;
  const config={getSetting:async k=>settings.get(k),setSetting:async(k,v)=>settings.set(k,v),publish:async()=>publications++,now:()=>date,
    fetchImpl:async()=>({ok:true,json:async()=>joke(++calls)})};
  let daily=createDailyJoke(config);
  const [a,b]=await Promise.all([daily(),daily()]);assert.equal(a.id,b.id);assert.equal(calls,1);
  daily=createDailyJoke(config);assert.equal((await daily()).id,1);assert.equal(calls,1);
  date=new Date('2026-10-04T22:00:00Z');assert.equal((await daily()).id,2);assert.equal(publications,2);
});
test('source indisponible : conserve la dernière blague avec sa vraie date et limite les tentatives',async()=>{
  const settings=new Map([['daily_joke',JSON.stringify({id:1,text:'Une blague',day:'2026-10-04',source:'JokeAPI'})]]);let calls=0;
  const daily=createDailyJoke({getSetting:async k=>settings.get(k),setSetting:async()=>assert.fail(),publish:async()=>assert.fail(),now:()=>new Date('2026-10-05T12:00:00Z'),fetchImpl:async()=>{calls++;throw Error('offline');}});
  assert.equal((await daily()).stale,true);assert.equal((await daily()).day,'2026-10-04');assert.equal(calls,1);
});
