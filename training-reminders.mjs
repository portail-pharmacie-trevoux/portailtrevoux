import {isTrainingProfession,trainingOverview} from './quality-training.mjs';
export function trainingReminderPeriod(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const year=Number(p.year),quarter=Math.floor((Number(p.month)-1)/3),today=p.year+'-'+p.month+'-'+p.day;
 const due=new Date(Date.UTC(year,quarter*3+2,0)).toISOString().slice(0,10),end=new Date(Date.UTC(year,quarter*3+3,0)).toISOString().slice(0,10);
 if(year<2026||today<due||today===due&&Number(p.hour)<8)return null;
 return {year,quarter:quarter+1,today,due,end,key:year+'-Q'+(quarter+1)};
}
const frDate=day=>day.split('-').reverse().join('/');
export function trainingReminderText(person,period){
 return 'Formation — trimestre '+period.quarter+' / '+period.year+'\n\nBonjour,\nAucune formation DPC ou non DPC n’est recensée pour vous ce trimestre. Merci d’effectuer au moins une formation avant le '+frDate(period.end)+'.\nPour rappel, le versement des primes d’engagement est lié au respect de cette obligation de formation.\nConsultez Démarche qualité → Suivi des formations. Si votre formation est déjà réalisée, transmettez son attestation à un administrateur.';
}
export async function trainingQuarterlyReminders(db,now=new Date()){
 const period=trainingReminderPeriod(now);if(!period)return;
 const people=(await db.query('SELECT id,name,job FROM users WHERE active=TRUE ORDER BY id')).rows.filter(p=>isTrainingProfession(p.job));if(!people.length)return;
 const documents=(await db.query("SELECT owner_id,title,training_title,to_char(training_date,'YYYY-MM-DD') AS training_date,training_kind FROM hr_documents WHERE active=TRUE AND scope='personal' AND owner_id=ANY($1::int[]) AND (training_date IS NOT NULL OR title LIKE 'Attestation%')",[people.map(p=>p.id)])).rows;
 const overview=trainingOverview(people,documents,period.year,period.today);
 for(const person of people){if(overview.people.find(p=>p.id===person.id).quarters[period.quarter-1].status==='done')continue;
  // Atomic delivery and quarterly claim: retries and concurrent ticks cannot duplicate messages.
  await db.query(`WITH target AS MATERIALIZED (
   SELECT id FROM users WHERE id=$1 AND active=TRUE AND job=$4
  ), due AS (
   INSERT INTO quality_monthly_reminders(service,month,user_id)
   SELECT 'training-quarter',$2,id FROM target ON CONFLICT DO NOTHING RETURNING user_id
  ), message AS (
   INSERT INTO team_messages(sender_name,text,priority,can_archive)
   SELECT 'Portail+',$3,'normal',TRUE WHERE EXISTS(SELECT 1 FROM due) RETURNING id
  ) INSERT INTO team_message_recipients(message_id,user_id)
   SELECT message.id,due.user_id FROM message CROSS JOIN due`,[person.id,period.key,trainingReminderText(person,period),person.job]);
 }
}
