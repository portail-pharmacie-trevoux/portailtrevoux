import {automationOccurrence,automationContext,parisWall,normalizeService,renderAutomationText} from './message-automation-model.mjs';
import {orderDigest} from './order-reminders.mjs';
import {isOrderService} from './order-service.mjs';
import {merchandisingFreeDigest} from './merchandising-free-reminders.mjs';
import {isTrainingProfession,trainingOverview} from './quality-training.mjs';
const serviceAliases={rh:['rh','ressourceshumaines','emploisdutempsrh'],temperature:['chainedufroid'],tierspayant:['tierspayant','tierpayant'],'merch-validation':['merch','merchandising']};
export async function automationPayloads(db,job,date,secret,now=new Date()){
 const people=(await db.query('SELECT id,name,job FROM users WHERE active=TRUE ORDER BY id FOR SHARE')).rows;
 const services=(await db.query('SELECT id,service,collaborator_id FROM quality_services ORDER BY id')).rows;
 const c=job.config,a=c.audience;let ids;
 if(a.mode==='users')ids=new Set(a.userIds);
 else if(a.mode==='services')ids=new Set(services.filter(s=>a.serviceIds.includes(s.id)).map(s=>s.collaborator_id));
 else if(a.mode==='all'||['custom','merch-free','challenges','training','annual'].includes(job.kind))ids=new Set(people.map(p=>p.id));
 else ids=new Set(services.filter(s=>job.kind==='orders'?isOrderService(s.service):serviceAliases[job.kind]?.includes(normalizeService(s.service))).map(s=>s.collaborator_id));
 const targets=people.filter(p=>ids.has(p.id)),base=automationContext(date),payload=(recipients,extra={},metadata={})=>({recipients,text:renderAutomationText(c.text,{...base,...extra}),...metadata});
 if(!targets.length)return [];
 if(job.kind==='annual')return services.filter(s=>targets.some(p=>p.id===s.collaborator_id)&&(a.mode!=='services'||a.serviceIds.includes(s.id))).map(s=>payload([s.collaborator_id],{service:s.service}));
 if(job.kind==='training'){
  const eligible=targets.filter(p=>isTrainingProfession(p.job));if(!eligible.length)return [];
  const documents=(await db.query("SELECT owner_id,title FROM hr_documents WHERE active=TRUE AND scope='personal' AND owner_id=ANY($1::int[]) AND title LIKE 'Attestation%'",[eligible.map(p=>p.id)])).rows;
  const overview=trainingOverview(eligible,documents,Number(date.slice(0,4)),parisWall(now).slice(0,10)),quarter=Math.floor((Number(date.slice(5,7))-1)/3);
  const missing=overview.people.filter(p=>p.quarters[quarter].status!=='done').map(p=>p.id);return missing.length?[payload(missing)]:[];
 }
 if(job.kind==='challenges'){
  const challenges=(await db.query('SELECT c.id,c.title,c.metric,c.target,c.participants,l.name AS laboratory FROM team_challenges c JOIN laboratories l ON l.id=c.laboratory_id WHERE c.month=$1 ORDER BY lower(c.title),c.id',[date.slice(0,7)])).rows;
  return targets.flatMap(person=>{const own=challenges.filter(c=>c.participants.some(p=>Number(p.id)===person.id)).map(({participants,...c})=>c);return own.length?[payload([person.id],{}, {challengeDigest:own})]:[];});
 }
 if(job.kind==='merch-free'){
  const [year,month]=date.split('-').map(Number),targetMonth=new Date(Date.UTC(year,month,1)).toISOString().slice(0,7),zones=(await db.query('SELECT id,name,months FROM merchandising_zones ORDER BY id')).rows,digest=merchandisingFreeDigest(zones,targetMonth);
  if(!digest.free.length)return [];
  return [payload(targets.map(p=>p.id),{emplacements:digest.groups.map(g=>'• '+g.title+' : '+g.names.join(', ')).join('\n')},{merchandisingMonth:targetMonth})];
 }
 if(job.kind==='orders'){
  const today=parisWall(now).slice(0,10),rows=(await db.query('SELECT id,content FROM order_planning ORDER BY id')).rows,digest=orderDigest(rows,secret,today);
  return [payload(targets.map(p=>p.id),{...automationContext(today),nombre_lignes:String(digest.items.length)},{orderDigest:digest})];
 }
 return [payload(targets.map(p=>p.id))];
}
export async function runMessageAutomations(db,secret,now=new Date()){
 const jobs=(await db.query('SELECT id FROM message_automations WHERE enabled=TRUE AND deleted_at IS NULL ORDER BY id')).rows;
 for(const candidate of jobs){
  const client=await db.connect();let occurrence=null;
  try{
   await client.query('BEGIN');
   const job=(await client.query('SELECT * FROM message_automations WHERE id=$1 FOR UPDATE',[candidate.id])).rows[0];
   if(!job||!job.enabled||job.deleted_at){await client.query('COMMIT');continue;}
   occurrence=automationOccurrence(job.config,now);
   if(!occurrence||occurrence.wall<parisWall(new Date(job.activation_at))){await client.query('COMMIT');continue;}
   const previous=(await client.query('SELECT status FROM message_automation_runs WHERE automation_id=$1 AND occurrence=$2::date',[job.id,occurrence.date])).rows[0];
   if(previous&&previous.status!=='failed'){await client.query('COMMIT');continue;}
   const payloads=await automationPayloads(client,job,occurrence.date,secret,now);let deliveries=0,messages=0;
   for(const p of payloads){
    if(!p.recipients.length)continue;
    if(!p.text.trim()||p.text.length>10000)throw Error('Invalid generated message');
    const row=(await client.query(`INSERT INTO team_messages(sender_name,text,priority,can_archive,reminder_kind,automation_text,challenge_digest,order_digest,merchandising_month)
     VALUES('Portail+',$1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8) RETURNING id`,[p.text.slice(0,500),job.config.priority,job.config.canArchive,job.kind,p.text,p.challengeDigest?JSON.stringify(p.challengeDigest):null,p.orderDigest?JSON.stringify(p.orderDigest):null,p.merchandisingMonth||null])).rows[0];
    const recipients=(await client.query('INSERT INTO team_message_recipients(message_id,user_id) SELECT $1,id FROM users WHERE active=TRUE AND id=ANY($2::int[]) RETURNING user_id',[row.id,p.recipients])).rows;
    deliveries+=recipients.length;messages++;
    if(job.kind==='orders')for(const person of recipients)await client.query('INSERT INTO order_weekly_reminders(period,user_id,digest,heading) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(period,user_id) DO NOTHING',[occurrence.date,person.user_id,JSON.stringify(p.orderDigest),p.text.slice(0,500)]);
   }
   await client.query(`INSERT INTO message_automation_runs(automation_id,occurrence,status,recipient_count,message_count)
    VALUES($1,$2::date,$3,$4,$5) ON CONFLICT(automation_id,occurrence) DO UPDATE SET status=EXCLUDED.status,recipient_count=EXCLUDED.recipient_count,message_count=EXCLUDED.message_count,error=NULL,completed_at=now()`,[job.id,occurrence.date,deliveries?'sent':'skipped',deliveries,messages]);
   await client.query('COMMIT');
  }catch(error){
   await client.query('ROLLBACK');
   if(occurrence)await db.query(`INSERT INTO message_automation_runs(automation_id,occurrence,status,error) VALUES($1,$2::date,'failed',$3)
    ON CONFLICT(automation_id,occurrence) DO UPDATE SET error=EXCLUDED.error,completed_at=now() WHERE message_automation_runs.status='failed'`,[candidate.id,occurrence.date,'Envoi échoué : vérification technique nécessaire.']);
   console.error('Programmation Messagerie à vérifier :',candidate.id);
  }finally{client.release();}
 }
}
