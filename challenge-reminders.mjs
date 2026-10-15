export function challengeDigestText(month){
 const label=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(month+'-15T12:00:00Z'));
 return 'Vos challenges pour '+label+' sont regroupés ci-dessous. Retrouvez les modalités et votre progression dans la rubrique Challenges.';
}
export async function challengeMonthlyReminders(db,now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value])),month=parts.year+'-'+parts.month;
 const users=(await db.query(`SELECT u.id FROM users u WHERE u.active=TRUE AND $1>=COALESCE((SELECT value FROM settings WHERE key='challenges_reminder_start'),'9999-12') AND EXISTS(SELECT 1 FROM team_challenges c WHERE c.month=$1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.participants) p WHERE (p->>'id')::int=u.id)) ORDER BY u.id`,[month])).rows;
 for(const user of users)await db.query(`WITH target AS MATERIALIZED (
  SELECT id FROM users WHERE id=$1 AND active=TRUE FOR SHARE
 ), challenges AS MATERIALIZED (
  SELECT c.id,c.title,c.metric,c.target,l.name AS laboratory FROM team_challenges c JOIN laboratories l ON l.id=c.laboratory_id
  WHERE c.month=$2 AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.participants) p WHERE (p->>'id')::int=$1) FOR SHARE OF c,l
 ), due AS (
  INSERT INTO challenge_monthly_digests(month,user_id) SELECT $2,id FROM target WHERE EXISTS(SELECT 1 FROM challenges) AND $2>=COALESCE((SELECT value FROM settings WHERE key='challenges_reminder_start'),'9999-12') ON CONFLICT DO NOTHING RETURNING user_id
 ), message AS (
  INSERT INTO team_messages(sender_name,text,priority,can_archive,challenge_digest)
  SELECT 'Portail+',$3,'normal',TRUE,(SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'laboratory',laboratory,'metric',metric,'target',target) ORDER BY lower(title),id) FROM challenges) FROM due RETURNING id
 ) INSERT INTO team_message_recipients(message_id,user_id) SELECT message.id,due.user_id FROM message CROSS JOIN due`,[user.id,month,challengeDigestText(month)]);
}
