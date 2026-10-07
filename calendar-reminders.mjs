export function registerCalendarReminders({app,db,auth,ready,csrf,viewUniverse,fail,getSetting}) {
 app.post('/api/calendar/reminders',auth,ready,viewUniverse('Agenda'),csrf,async(req,res)=>{
  const {eventId,enabled}=req.body||{};
  if(typeof eventId!=='string'||!eventId||eventId.length>1024||typeof enabled!=='boolean')throw fail(400,'Rappel invalide.');
  const calendarId=await getSetting('calendar_id');if(!calendarId)throw fail(409,'Choisissez un agenda.');
  if(enabled){
   const cached=(await db.query('SELECT events FROM calendar_cache WHERE singleton=TRUE')).rows[0];
   if(!cached?.events?.some(e=>e.id===eventId))throw fail(404,'Cet événement n’est plus disponible. Actualisez l’agenda.');
   await db.query('INSERT INTO calendar_reminders(user_id,calendar_id,event_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[req.auth.id,calendarId,eventId]);
  }else await db.query('DELETE FROM calendar_reminders WHERE user_id=$1 AND calendar_id=$2 AND event_id=$3',[req.auth.id,calendarId,eventId]);
  res.json({eventId,remind:enabled});
 });
 return async function personalEvents(userId,events){
  const calendarId=await getSetting('calendar_id');
  const ids=new Set((await db.query('SELECT event_id FROM calendar_reminders WHERE user_id=$1 AND calendar_id=$2',[userId,calendarId||''])).rows.map(r=>r.event_id));
  return events.map(e=>({...e,remind:ids.has(e.id)}));
 };
}
