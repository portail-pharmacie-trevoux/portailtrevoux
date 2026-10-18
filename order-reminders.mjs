import {isOrderService} from './order-service.mjs';
export {isOrderService} from './order-service.mjs';
import {decrypt} from './security.mjs';
import {orderNextDate} from './order-planning.mjs';
export function parisDate(now){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));return {day:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour)};}
const humanDate=value=>String(value).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3-$2-$1');
const shift=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export function reminderTuesday(now){const {day,hour}=parisDate(now),weekday=new Date(day+'T12:00:00Z').getUTCDay();let offset=(weekday+5)%7;if(!offset&&hour<8)offset=7;return shift(day,-offset);}
export function orderDigest(rows,secret,day){
 const end=shift(day,7),items=[];let suspended=0,unreadable=0;const counts={unplanned:0,waiting:0,late:0,soon:0,incomplete:0};
 for(const row of rows){let r;try{r=decrypt(row.content,secret);}catch{unreadable++;items.push({id:row.id,issues:['Ligne illisible : faire vérifier les données par un administrateur.']});continue;}if(r.suspended){suspended++;continue;}
  const due=orderNextDate(r),waiting=!!r.confirmation&&(!r.delivery||Date.parse(r.confirmation.at)>Date.parse(r.delivery.at)),issues=[];
  if(!due){counts.unplanned++;issues.push('Sans date de prochaine commande.');}
  if(waiting){counts.waiting++;issues.push('Commande passée le '+humanDate(r.confirmation.date||'date inconnue')+' mais non délivrée.');}
  if(due&&!waiting&&due<day){counts.late++;issues.push('Commande en retard depuis le '+humanDate(due)+'.');}
  if(due&&!waiting&&due>=day&&due<=end){counts.soon++;issues.push('Commande à passer pour le '+humanDate(due)+'.');}
  const missing=[];if(!r.frequency)missing.push('fréquence');if(!r.treatment?.trim())missing.push('traitement');if(!r.mode?.trim())missing.push('mode de commande');if(missing.length){counts.incomplete++;issues.push('À compléter : '+missing.join(', ')+'.');}
  if(issues.length)items.push({id:row.id,issues});
 }
 return {from:day,to:end,counts,suspended,unreadable,items:items.sort((a,b)=>a.id-b.id)};
}
async function sendDigest(db,secret,userId,key,day,example=false){
 if((await db.query('SELECT 1 FROM order_weekly_reminders WHERE period=$1 AND user_id=$2',[key,userId])).rows.length)return;
 const rows=(await db.query('SELECT id,content FROM order_planning ORDER BY id')).rows,digest=orderDigest(rows,secret,day);
 const text=(example?'EXEMPLE — ':'')+'Commandes programmées : point du '+day.split('-').reverse().join('-')+' pour les 7 jours à venir. '+digest.items.length+' ligne(s) à vérifier. Consultez le détail ci-dessous puis le tableau sécurisé. Les lignes suspendues sont exclues.';
 return db.query(`WITH target AS MATERIALIZED (SELECT id FROM users WHERE id=$1 AND active=TRUE FOR SHARE), due AS (
  INSERT INTO order_weekly_reminders(period,user_id) SELECT $2,id FROM target ON CONFLICT DO NOTHING RETURNING user_id
 ), message AS (
  INSERT INTO team_messages(sender_name,text,priority,can_archive,order_digest) SELECT 'Portail+',$3,'important',TRUE,$4::jsonb FROM due RETURNING id
 ) INSERT INTO team_message_recipients(message_id,user_id) SELECT message.id,due.user_id FROM message CROSS JOIN due RETURNING message_id`,[userId,key,text,JSON.stringify(digest)]);
}
export async function orderWeeklyReminders(db,secret,now=new Date()){
 const tuesday=reminderTuesday(now),start=(await db.query("SELECT value FROM settings WHERE key='order_reminder_start'")).rows[0]?.value;
 if(!start||tuesday<start)return;
 const targets=(await db.query('SELECT DISTINCT u.id,s.service FROM quality_services s JOIN users u ON u.id=s.collaborator_id WHERE u.active=TRUE')).rows.filter(r=>isOrderService(r.service));
 for(const id of new Set(targets.map(t=>t.id)))await sendDigest(db,secret,id,tuesday,parisDate(now).day);
}
export async function sendOrderExample(db,secret){
 // One example explicitly requested by Nicolas Marchand on 18 October 2026.
 const recipient=(await db.query("SELECT id FROM users WHERE id=1 AND name='Nicolas Marchand' AND role='admin' AND active=TRUE")).rows[0];
 if(recipient)await sendDigest(db,secret,recipient.id,'example:2026-10-18',parisDate(new Date()).day,true);
}
