export async function temperatureMaintenance(db,now=new Date()){
 await db.query("DELETE FROM temperature_readings WHERE recorded_at<now()-interval '3 years'");
 await db.query("DELETE FROM temperature_comments WHERE happened_at<now()-interval '3 years'");
 await db.query("DELETE FROM temperature_imports WHERE last_reading<now()-interval '3 years'");
 await db.query("DELETE FROM temperature_reminders WHERE sent_at<now()-interval '3 years'");
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value])),month=p.year+'-'+p.month;
 const previous=new Date(Date.UTC(Number(p.year),Number(p.month)-2,1)).toISOString().slice(0,7),label=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(previous+'-01T00:00:00Z'));
 await db.query(`WITH targets AS MATERIALIZED (
 SELECT DISTINCT u.id FROM quality_services s JOIN users u ON u.id=s.collaborator_id
 WHERE u.active=TRUE AND regexp_replace(lower(translate(s.service,'âàäéèêëîïôöùûüç','aaaeeeeiioouuuc')),'[^a-z]','','g')='chainedufroid'
 AND $1 >= (SELECT value FROM settings WHERE key='temperature_reminder_start')
 ), due AS (
 INSERT INTO temperature_reminders(month,user_id) SELECT $1,id FROM targets ON CONFLICT DO NOTHING RETURNING user_id
 ), message AS (
 INSERT INTO team_messages(sender_name,text,priority,can_archive)
 SELECT 'Portail+',$2,'important',FALSE WHERE EXISTS(SELECT 1 FROM due) RETURNING id
 ) INSERT INTO team_message_recipients(message_id,user_id) SELECT message.id,due.user_id FROM message CROSS JOIN due`,[month,'Chaîne du froid : pensez à exporter les relevés des quatre sondes pour '+label+' et à les importer dans Démarche qualité → Suivi des relevés de température. Vérifiez les dépassements et renseignez leurs actions correctives.']);
}
