const categories=[['TG','Têtes de gondole'],['BS','Bacs soldeurs'],['IC','Intercomptoirs'],['SA','Zones saisonnières'],['EV','Zone événementielle'],['DS','Déstockage']];
export function zoneCategory(id){return id<=10||id===24?'TG':id<=18?'IC':id<=22?'BS':id===23?'EV':id<=28?'SA':'DS';}
export function defaultZoneName(id){return id<=10?'TG'+id:id<=18?'IC'+(id-10):id<=22?'BS'+(id-18):id===23?'EV':id===24?'TG11':id<=28?'SA'+(id-24):'DS'+(id-28);}
export function merchandisingFreeDigest(zones,month){
 const free=[];for(let id=1;id<=30;id++){const zone=zones.find(z=>z.id===id);if(!String(zone?.months?.[month]||'').trim())free.push({id,name:zone?.name?.trim()||defaultZoneName(id),type:zoneCategory(id)});}
 const label=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(month+'-01T12:00:00Z'));
 const groups=categories.map(([type,title])=>({type,title,names:free.filter(z=>z.type===type).map(z=>z.name).sort((a,b)=>a.localeCompare(b,'fr',{numeric:true,sensitivity:'base'}))})).filter(g=>g.names.length);
 const text='Merchandising — Emplacements libres pour '+label+'\n\nBonjour à tous,\n\nLes emplacements suivants sont encore disponibles pour les mises en avant de '+label+' :\n\n'+groups.map(g=>'• '+g.title+' : '+g.names.join(', ')).join('\n')+'\n\nMerci de renseigner vos propositions d’opérations ou de produits dans Outils d’aide au merchandising → Organisation de l’espace vente, en sélectionnant '+label+'.\n\nUne zone déjà renseignée est considérée comme occupée, même si elle attend encore sa validation.';
 return{free,groups,text};
}
export function merchandisingReminderPeriod(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 if(Number(p.day)<25)return null;const next=new Date(Date.UTC(Number(p.year),Number(p.month),1));return{period:p.year+'-'+p.month,targetMonth:next.toISOString().slice(0,7)};
}
export async function merchandisingFreeReminders(db,now=new Date()){
 const due=merchandisingReminderPeriod(now);if(!due)return;
 if((await db.query('SELECT period FROM merchandising_free_reminders WHERE period=$1',[due.period])).rows.length)return;
 const zones=(await db.query('SELECT id,name,months FROM merchandising_zones ORDER BY id')).rows,digest=merchandisingFreeDigest(zones,due.targetMonth);
 // Claim once per month and deliver to a single snapshot of the active staff.
 // A skipped month is also recorded, so subsequent ticks cannot produce a late duplicate.
 return (await db.query(`WITH targets AS MATERIALIZED (
  SELECT id FROM users WHERE active=TRUE FOR SHARE
 ), due AS (
  INSERT INTO merchandising_free_reminders(period,target_month,free_count,recipient_count,status)
  SELECT $1,$2,$4,CASE WHEN $4>0 THEN (SELECT count(*) FROM targets) ELSE 0 END,
   CASE WHEN $4=0 THEN 'no_free' WHEN NOT EXISTS(SELECT 1 FROM targets) THEN 'no_recipients' ELSE 'sent' END
  WHERE $1>=COALESCE((SELECT value FROM settings WHERE key='merchandising_free_reminder_start'),'9999-12')
  ON CONFLICT DO NOTHING RETURNING period,status
 ), message AS (
  INSERT INTO team_messages(sender_name,text,priority,can_archive,merchandising_month)
  SELECT 'Portail+',$3,'normal',TRUE,$2 FROM due WHERE status='sent' RETURNING id
 ), deliveries AS (
  INSERT INTO team_message_recipients(message_id,user_id) SELECT message.id,targets.id FROM message CROSS JOIN targets RETURNING user_id
 ) SELECT (SELECT id FROM message) AS message_id,(SELECT count(*) FROM deliveries)::int AS recipients`,[due.period,due.targetMonth,digest.text,digest.free.length])).rows[0];
}
