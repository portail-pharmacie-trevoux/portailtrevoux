import test from 'node:test';import assert from 'node:assert/strict';
import {orderEmailContent,orderReminderEmails} from '../order-reminder-emails.mjs';
import {orderAlerts,legacyOrderAlerts} from '../public/order-alerts.js';
import {textMessage} from '../invitations.mjs';
test('Panneaux communs au tableau et au récapitulatif : plusieurs alertes, dates et suspensions',()=>{
 const r={frequency:null,treatment:'',mode:'grossiste',confirmation:{date:'2026-10-15',at:'2026-10-15T10:00:00Z'}};const alerts=orderAlerts(r,'2026-10-20');assert.deepEqual(alerts.map(a=>a.code),['unplanned','waiting','incomplete']);assert.match(alerts[1].text,/15-10-2026/);assert.deepEqual(orderAlerts({...r,suspended:true},'2026-10-20'),[]);
 assert.equal(legacyOrderAlerts({issues:['Commande en retard depuis le 01-10-2026.']})[0].code,'late');
});
test('Mail : codes couleur, contenu échappé et alternative texte',()=>{
 const row={period:'2026-10-20',heading:'Bilan <test>',digest:{items:[{id:2,alerts:[{code:'late',text:'Retard <script>'}]}]}};const email=orderEmailContent(row,'https://portailtrevoux.onrender.com');assert.match(email.html,/#b62232/);assert(!email.html.includes('<script>'));assert.match(email.text,/🔴 ⚠/);assert.match(email.subject,/20-10-2026/);
 const mime=Buffer.from(textMessage({sender:'pharmacie.trevoux@gmail.com',email:'referent@example.org',...email}).raw,'base64url').toString();assert.match(mime,/multipart\/alternative/);assert.match(mime,/text\/plain/);assert.match(mime,/text\/html/);assert.throws(()=>textMessage({sender:'a@b.fr',email:'r@e.fr',subject:'x\r\nBcc: x@y.fr',text:'x',html:'x'}));
});
test('Mail du mardi : référent actif résolu, un seul envoi, succès et résultat incertain sans réessai',async()=>{
 for(const error of [null,Object.assign(Error('timeout'),{status:502})]){
 let state=null,sends=0;const queries=[];const row={period:'2026-10-20',user_id:20,email:'referent@example.org',service:'Commandes programmées et traitements chers',heading:'Bilan',digest:{items:[]}};
 const db={query:async(sql,args)=>{queries.push({sql,args});if(sql.startsWith('SELECT w.period'))return {rows:['sent','sending','uncertain'].includes(state)?[]:[row,row]};if(sql.startsWith('INSERT')){if(state&&state!=='failed')return {rows:[]};state='sending';return {rows:[{user_id:20}]};}if(sql.includes("SET status='sent'")){state='sent';return {rows:[]};}if(sql.startsWith('UPDATE')){state=args[2];return {rows:[]};}throw Error(sql);}};
 const mailer={status:async()=>({connected:true,sender:'pharmacie.trevoux@gmail.com'}),sendText:async payload=>{assert.equal(payload.email,'referent@example.org');sends++;if(error)throw error;return 'gmail-id';}};
 await orderReminderEmails(db,mailer,'https://portailtrevoux.onrender.com',new Date('2026-10-20T06:00:00Z'));await orderReminderEmails(db,mailer,'https://portailtrevoux.onrender.com',new Date('2026-10-20T07:00:00Z'));assert.equal(sends,1);assert.equal(state,error?'uncertain':'sent');assert.equal(queries[0].args[0],'2026-10-20');
 }
});
