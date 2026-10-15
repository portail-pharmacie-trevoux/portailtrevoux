export function challengeReminderText(challenge){
 const label=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(challenge.month+'-15T12:00:00Z')),number=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(Number(challenge.target));
 return 'Challenge '+(/^[aeiou]/i.test(label)?'d’':'de ')+label+' : « '+challenge.title+' » — '+challenge.laboratory_name+'. Objectif collectif : '+number+(challenge.metric==='units'?' unités vendues':' € de chiffre d’affaires')+'. Retrouvez les modalités et votre progression dans la rubrique Challenges.';
}
export async function challengeMonthlyReminders(db,now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value])),month=parts.year+'-'+parts.month;
 const challenges=(await db.query(`SELECT c.id,c.month,c.title,c.metric,c.target,c.revision,l.name AS laboratory_name FROM team_challenges c JOIN laboratories l ON l.id=c.laboratory_id WHERE c.month=$1 AND $1>=COALESCE((SELECT value FROM settings WHERE key='challenges_reminder_start'),'9999-12') ORDER BY c.id`,[month])).rows;
 for(const challenge of challenges)await db.query(`WITH targets AS MATERIALIZED (
  SELECT u.id FROM users u JOIN team_challenges c ON c.id=$1 AND c.month=$2 AND c.revision=$4
  WHERE u.active=TRUE AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.participants) p WHERE (p->>'id')::int=u.id) FOR SHARE OF u,c
 ), due AS (
  INSERT INTO challenge_monthly_reminders(challenge_id,month,user_id) SELECT $1,$2,id FROM targets ON CONFLICT DO NOTHING RETURNING user_id
 ), message AS (
  INSERT INTO team_messages(sender_name,text,priority,can_archive) SELECT 'Portail+',$3,'normal',TRUE WHERE EXISTS(SELECT 1 FROM due) RETURNING id
 ) INSERT INTO team_message_recipients(message_id,user_id) SELECT message.id,due.user_id FROM message CROSS JOIN due`,[challenge.id,month,challengeReminderText(challenge),challenge.revision]);
}
