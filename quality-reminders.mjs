import {hrAttestationReminders} from './hr-attestation-reminders.mjs';
import {trainingQuarterlyReminders} from './training-reminders.mjs';
export async function qualityMonthlyReminders(db,now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value])),month=p.year+'-'+p.month,previous=new Date(Date.UTC(Number(p.year),Number(p.month)-2,1)).toLocaleDateString('fr-FR',{timeZone:'UTC',month:'long',year:'numeric'});
 const jobs=[{service:'tierspayant',aliases:['tierspayant','tierpayant'],due:true,text:'Tiers payant : pensez à renseigner les résultats de '+previous+' dans Démarche qualité → Suivi des rejets tiers payant : nombre de factures, nombre de rejets et montant des rejets. Le seuil de tolérance est fixé à 2 %.'},{service:'merchandising',aliases:['merch','merchandising'],due:Number(p.day)>=20,text:'Merchandising : rappel du 20 du mois. Pensez à vérifier et valider, zone par zone et mois par mois, la disposition des produits dans les zones promotionnelles. Rendez-vous dans Outils d’aide au merchandising → Organisation de l’espace vente.'}];
 await qualityAnnualReminders(db,now);
 await trainingQuarterlyReminders(db,now);
 await hrAttestationReminders(db,now);
 for(const job of jobs){if(!job.due)continue;await db.query(`WITH targets AS MATERIALIZED (
 SELECT DISTINCT u.id FROM quality_services s JOIN users u ON u.id=s.collaborator_id WHERE u.active=TRUE AND regexp_replace(lower(s.service),'[^a-z]','','g')=ANY($3::text[]) AND $1>=(SELECT value FROM settings WHERE key=$2||'_reminder_start')
 ), due AS (INSERT INTO quality_monthly_reminders(service,month,user_id) SELECT $2,$1,id FROM targets ON CONFLICT DO NOTHING RETURNING user_id), message AS (
 INSERT INTO team_messages(sender_name,text,priority,can_archive) SELECT 'Portail+',$4,'important',FALSE WHERE EXISTS(SELECT 1 FROM due) RETURNING id
 ) INSERT INTO team_message_recipients(message_id,user_id) SELECT message.id,due.user_id FROM message CROSS JOIN due`,[month,job.service,job.aliases,job.text]);}
}

export function annualEvaluationPeriod(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 return p.month==='11'&&Number(p.day)>=15?p.year+'-11':null;
}
export function annualEvaluationText(service){
 return '📋 Évaluation annuelle des pratiques — '+service+'\n\nBonjour,\n\nEn tant que référent du service « '+service+' », merci de prévoir un rendez-vous d’une heure auprès de la secrétaire pour réaliser l’évaluation annuelle des pratiques de ce service.\n\nAvant ce rendez-vous, pensez à consulter votre fiche dans Démarche qualité → Référents services et à préparer un bilan des missions : réalisations, difficultés rencontrées et pistes d’amélioration.\n\nMerci pour votre participation.';
}
export async function qualityAnnualReminders(db,now=new Date()){
 const period=annualEvaluationPeriod(now);if(!period)return;
 const services=(await db.query('SELECT s.id,s.service,s.collaborator_id FROM quality_services s JOIN users u ON u.id=s.collaborator_id WHERE u.active=TRUE ORDER BY s.id')).rows;
 for(const service of services){
  // One atomic claim per service and year, even when several services share a referent.
  await db.query(`WITH target AS MATERIALIZED (
   SELECT u.id FROM quality_services s JOIN users u ON u.id=s.collaborator_id
   WHERE s.id=$1 AND u.id=$2 AND u.active=TRUE AND s.service=$5
  ), due AS (
   INSERT INTO quality_monthly_reminders(service,month,user_id)
   SELECT $3,$4,id FROM target
   WHERE NOT EXISTS(SELECT 1 FROM quality_monthly_reminders WHERE service=$3 AND month=$4)
   ON CONFLICT DO NOTHING RETURNING user_id
  ), message AS (
   INSERT INTO team_messages(sender_name,text,priority,can_archive)
   SELECT 'Portail+',$6,'important',TRUE WHERE EXISTS(SELECT 1 FROM due) RETURNING id
  ) INSERT INTO team_message_recipients(message_id,user_id)
   SELECT message.id,due.user_id FROM message CROSS JOIN due`,
  [service.id,service.collaborator_id,'annual-evaluation:'+service.id,period,service.service,annualEvaluationText(service.service)]);
 }
}
