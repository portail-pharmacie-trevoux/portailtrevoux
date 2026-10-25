export function hrAttestationPeriod(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(v=>[v.type,v.value]));
 const last=new Date(Date.UTC(Number(p.year),Number(p.month),0)).getUTCDate(),due=Math.min(29,last);
 if(p.year+'-'+p.month<'2026-10'||Number(p.day)<due||Number(p.day)===due&&Number(p.hour)<8)return null;
 return p.year+'-'+p.month;
}
export const hrAttestationText='📚 Attestations de formation — rappel RH\n\nMerci de récupérer les nouvelles attestations classiques et DPC de l’équipe dans Ma Formation Officinale → Ma pharmacie → Attestations (les deux onglets).\n\nAjoutez-les aux documents personnels des collaborateurs concernés dans Portail+, en conservant la distinction classique / DPC et en évitant les doublons. Vérifiez ensuite la mise à jour dans Démarche qualité → Suivi des formations.';
export async function hrAttestationReminders(db,now=new Date()){
 const month=hrAttestationPeriod(now);if(!month)return;
 await db.query(`WITH targets AS MATERIALIZED (
 SELECT DISTINCT u.id FROM quality_services s JOIN users u ON u.id=s.collaborator_id
 WHERE u.active=TRUE AND regexp_replace(lower(s.service),'[^a-z]','','g')=ANY($2::text[])
 ), due AS (
 INSERT INTO quality_monthly_reminders(service,month,user_id)
 SELECT 'rh-attestations',$1,id FROM targets ON CONFLICT DO NOTHING RETURNING user_id
 ), message AS (
 INSERT INTO team_messages(sender_name,text,priority,can_archive)
 SELECT 'Portail+',$3,'normal',TRUE WHERE EXISTS(SELECT 1 FROM due) RETURNING id
 ) INSERT INTO team_message_recipients(message_id,user_id)
 SELECT message.id,due.user_id FROM message CROSS JOIN due`,[month,['rh','ressourceshumaines','emploisdutempsrh'],hrAttestationText]);
}
