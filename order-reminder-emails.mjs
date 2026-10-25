import {sameMailAccount,emailValid} from './invitations.mjs';
import {reminderTuesday} from './order-reminders.mjs';
import {isOrderService} from './order-service.mjs';
import {legacyOrderAlerts} from './public/order-alerts.js';
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors={late:'#b62232',soon:'#ba5605',waiting:'#2467b0',unplanned:'#7842ad',incomplete:'#596974',unreadable:'#b62232'},symbols={late:'🔴',soon:'🟠',waiting:'🔵',unplanned:'🟣',incomplete:'⚪',unreadable:'🔴'};
export function orderEmailContent(row,origin){
 const items=row.digest.items,lines=items.map(item=>'Ligne #'+item.id+'\n'+legacyOrderAlerts(item).map(a=>symbols[a.code]+' ⚠ '+a.text).join('\n'));
 const text=row.heading+'\n\n'+(lines.join('\n\n')||'Aucune anomalie ni commande à prévoir.')+'\n\nRetrouvez le tableau sécurisé dans Portail+ : '+origin;
 const html='<div style="font-family:Arial,sans-serif;color:#183241"><h2>Commandes programmées</h2><p>'+escape(row.heading)+'</p>'+items.map(item=>'<h3>Ligne #'+item.id+'</h3>'+legacyOrderAlerts(item).map(a=>'<p><span style="color:'+(colors[a.code]||colors.unreadable)+';font-size:22px" aria-label="Alerte">&#9888;</span> '+escape(a.text)+'</p>').join('')).join('')+(!items.length?'<p>Aucune anomalie ni commande à prévoir.</p>':'')+'<p><a href="'+escape(origin)+'">Consulter Portail+</a> - accès aux commandes protégé.</p></div>';
 return {subject:'Portail+ - Commandes programmées - point du '+row.period.split('-').reverse().join('-'),text,html};
}
export async function orderReminderEmails(db,mailer,origin,now=new Date(),includeScheduled=false){
 const period=reminderTuesday(now);
 const rows=(await db.query(`SELECT w.period,w.user_id,w.digest,w.heading,u.email,s.service FROM order_weekly_reminders w JOIN users u ON u.id=w.user_id JOIN quality_services s ON s.collaborator_id=u.id WHERE (w.period=$1 OR ($2::boolean AND w.period ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' AND w.sent_at>now()-interval '15 days')) AND w.digest IS NOT NULL AND u.active=TRUE AND NOT EXISTS(SELECT 1 FROM order_reminder_emails e WHERE e.period=w.period AND e.user_id=w.user_id AND e.status IN ('sent','sending','uncertain'))`,[period,includeScheduled])).rows.filter(r=>isOrderService(r.service)&&emailValid(r.email));
 if(!rows.length)return;const status=await mailer.status();if(!status.connected||!sameMailAccount(status.sender,'pharmacie.trevoux@gmail.com'))return;
 const done=new Set();for(const row of rows){if(done.has(row.user_id))continue;done.add(row.user_id);
  const claim=(await db.query(`INSERT INTO order_reminder_emails(period,user_id,email,status) VALUES($1,$2,$3,'sending') ON CONFLICT(period,user_id) DO UPDATE SET status='sending',email=EXCLUDED.email WHERE order_reminder_emails.status='failed' RETURNING user_id`,[period,row.user_id,row.email])).rows[0];if(!claim)continue;
  try{const messageId=await mailer.sendText({email:row.email,...orderEmailContent(row,origin)});await db.query("UPDATE order_reminder_emails SET status='sent',sent_at=now(),message_id=$3 WHERE period=$1 AND user_id=$2",[period,row.user_id,messageId]);}
  catch(error){await db.query('UPDATE order_reminder_emails SET status=$3 WHERE period=$1 AND user_id=$2',[period,row.user_id,error.status===409?'failed':'uncertain']);}
 }
}
