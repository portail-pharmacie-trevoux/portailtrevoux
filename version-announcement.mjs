export const announcementKey='announcement:portailplus:1.1:2026-10-13';
export const announcementText='Bonjour à tous, la version 1.1 de Portail+ est en cours de déploiement. Elle complète les fonctionnalités existantes avec le nouvel espace « Outils d’aide à la démarche qualité ». Pour vous accompagner, le manuel utilisateur est disponible dans Procédures → Logiciels et matériel, sous « Manuel de l’utilisateur Portail+ ».';
export async function announceVersion11(db){
 const result=await db.query(`WITH targets AS MATERIALIZED (
 SELECT id FROM users WHERE active=TRUE FOR SHARE
 ), claim AS (
 INSERT INTO settings(key,value) SELECT $1,'sent' WHERE EXISTS(SELECT 1 FROM targets)
 ON CONFLICT(key) DO NOTHING RETURNING key
 ), message AS (
 INSERT INTO team_messages(sender_name,text,priority)
 SELECT 'Portail+',$2,'normal' FROM claim RETURNING id
 ), deliveries AS (
 INSERT INTO team_message_recipients(message_id,user_id)
 SELECT message.id,targets.id FROM message CROSS JOIN targets RETURNING message_id
 ) SELECT COUNT(*)::int AS sent FROM deliveries`,[announcementKey,announcementText]);
 return result.rows[0]?.sent||0;
}
