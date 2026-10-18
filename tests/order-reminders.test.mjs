import test from 'node:test';import assert from 'node:assert/strict';
import {encrypt} from '../security.mjs';
import {orderDigest,reminderTuesday,isOrderService,orderWeeklyReminders,sendOrderExample} from '../order-reminders.mjs';
const secret='a secure test secret more than 32 characters';
test('Récapitulatif commandes : limites J+7, retards, cycles, suspensions et confidentialité',()=>{
 const base={lastName:'PATIENT',firstName:'Secret',treatment:'Traitement privé',mode:'grossiste',frequency:28};
 const row=(id,data)=>({id,content:encrypt({...base,...data},secret)});
 const rows=[row(1,{}),row(2,{initialNextOrder:'2026-10-19'}),row(3,{initialNextOrder:'2026-10-27'}),row(4,{initialNextOrder:'2026-10-28'}),row(5,{confirmation:{date:'2026-10-15',at:'2026-10-15T10:00:00Z'}}),row(6,{suspended:true}),row(7,{delivery:{date:'2026-10-01',at:'2026-10-01T10:00:00Z'},confirmation:{at:'2026-09-30T10:00:00Z'}}),row(8,{frequency:null,treatment:'',mode:''}),{id:9,content:'invalid'}];
 const d=orderDigest(rows,secret,'2026-10-20');assert.equal(d.to,'2026-10-27');assert.deepEqual(d.counts,{unplanned:3,waiting:1,late:1,soon:1,incomplete:1});assert.equal(d.suspended,1);assert.equal(d.unreadable,1);assert(!d.items.some(x=>x.id===4||x.id===6||x.id===7));const text=JSON.stringify(d);assert(!text.includes('PATIENT'));assert(!text.includes('Traitement privé'));assert.equal(d.items.find(x=>x.id===8).issues.length,2);
});
test('Mardi à 8 h Paris, passage heure hiver, rattrapage et nom du service',()=>{
 assert.equal(reminderTuesday(new Date('2026-10-20T05:59:00Z')),'2026-10-13');assert.equal(reminderTuesday(new Date('2026-10-20T06:00:00Z')),'2026-10-20');assert.equal(reminderTuesday(new Date('2026-10-28T08:00:00Z')),'2026-10-27');assert.equal(reminderTuesday(new Date('2026-10-19T09:00:00Z')),'2026-10-13');
 assert(isOrderService('Commandes programmées et traitements chers'));assert(!isOrderService('Merchandising'));
});
test('Un envoi par mardi et référent actif, exemple uniquement Nicolas, contenus atomiques',async()=>{
 const sent=new Set(),calls=[];const db={query:async(sql,args=[])=>{calls.push({sql,args});if(sql.startsWith('SELECT value'))return {rows:[{value:'2026-10-20'}]};if(sql.startsWith('SELECT DISTINCT'))return {rows:[{id:20,service:'Commandes programmées et traitements chers'},{id:20,service:'Commandes programmées'},{id:15,service:'Tiers payant'}]};if(sql.startsWith('SELECT id FROM users'))return {rows:[{id:1}]};if(sql.startsWith('SELECT 1'))return {rows:sent.has(args.join(':'))?[{}]:[]};if(sql.startsWith('SELECT id,content'))return {rows:[]};if(sql.startsWith('WITH target')){sent.add([args[1],args[0]].join(':'));return {rows:[{message_id:10}]};}throw Error(sql);}};
 await orderWeeklyReminders(db,secret,new Date('2026-10-18T09:00:00Z'));assert.equal(sent.size,0);
 await orderWeeklyReminders(db,secret,new Date('2026-10-20T06:00:00Z'));await orderWeeklyReminders(db,secret,new Date('2026-10-21T09:00:00Z'));assert.equal(sent.size,1);assert(sent.has('2026-10-20:20'));
 await sendOrderExample(db,secret);await sendOrderExample(db,secret);assert.equal(sent.size,2);assert(sent.has('example:2026-10-18:1'));
 const sends=calls.filter(c=>c.sql.startsWith('WITH target'));assert.equal(sends.length,2);assert.match(sends[0].sql,/ON CONFLICT DO NOTHING/);assert.match(sends[0].sql,/team_message_recipients/);assert.match(sends[1].args[2],/EXEMPLE/);
});
