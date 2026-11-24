import {createHash} from 'node:crypto';
import {taskEvent} from './calendar-tasks.mjs';
const parisDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'});
function eventTask(event,completed){
 const date=event.start.date||parisDate.format(new Date(event.start.dateTime));
 return {...taskEvent({id:'google-'+event.id,title:event.title,description:event.description,icon:'📌',task_date:date}),sourceEventId:event.id,completed};
}
function completionKey(userId,calendarId,eventId){
 const hash=createHash('sha256').update(JSON.stringify([calendarId,eventId])).digest('hex');
 return 'calendar_event_done:'+userId+':'+hash;
}
export function registerCalendarReminders({app,db,auth,ready,csrf,viewUniverse,fail,getSetting,taskCompletion=false}) {
 app.post('/api/calendar/reminders',auth,ready,viewUniverse('Agenda'),csrf,async(req,res)=>{
  const {eventId,enabled,completed}=req.body||{};
  if(typeof eventId!=='string'||!eventId||eventId.length>1024||typeof enabled!=='boolean'||completed!==undefined&&(!taskCompletion||!enabled||typeof completed!=='boolean'))throw fail(400,'Rappel invalide.');
  const calendarId=await getSetting('calendar_id');if(!calendarId)throw fail(409,'Choisissez un agenda.');
  const key=completionKey(req.auth.id,calendarId,eventId);
  let task;
  if(enabled){
   const cached=(await db.query('SELECT events FROM calendar_cache WHERE singleton=TRUE')).rows[0];
   const event=cached?.events?.find(e=>e.id===eventId);
   if(!event?.start?.date&&!event?.start?.dateTime)throw fail(404,'Cet événement n’est plus disponible. Actualisez l’agenda.');
   if(completed!==undefined){
    const {rows}=await db.query(
     "INSERT INTO settings(key,value) SELECT $4,$5 WHERE EXISTS (SELECT 1 FROM calendar_reminders WHERE user_id=$1 AND calendar_id=$2 AND event_id=$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value RETURNING value",
     [req.auth.id,calendarId,eventId,key,String(completed)]);
    if(!rows.length)throw fail(404,'Tâche introuvable.');
    return res.json({completed});
   }
   await db.query('INSERT INTO calendar_reminders(user_id,calendar_id,event_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[req.auth.id,calendarId,eventId]);
   if(taskCompletion)task=eventTask(event,await getSetting(key)==='true');
  }else await db.query('DELETE FROM calendar_reminders WHERE user_id=$1 AND calendar_id=$2 AND event_id=$3',[req.auth.id,calendarId,eventId]);
  res.json({eventId,remind:enabled,...(task?{task}:{})});
 });
 return async function personalEvents(userId,events){
  const calendarId=await getSetting('calendar_id');
  const ids=new Set((await db.query('SELECT event_id FROM calendar_reminders WHERE user_id=$1 AND calendar_id=$2',[userId,calendarId||''])).rows.map(r=>r.event_id));
  const tasks=(await db.query("SELECT id,title,description,to_char(task_date,'YYYY-MM-DD') AS task_date,icon FROM calendar_tasks WHERE user_id=$1 ORDER BY task_date,id",[userId])).rows;
  const selected=taskCompletion?events.filter(event=>ids.has(event.id)&&(event.start?.date||event.start?.dateTime)):[];
  const completionKeys=[
   ...tasks.map(task=>'calendar_task_done:'+userId+':'+task.id),
   ...selected.map(event=>completionKey(userId,calendarId,event.id))
  ];
  const completed=taskCompletion&&completionKeys.length?(await db.query("SELECT key FROM settings WHERE key = ANY($1::text[]) AND value='true'",[completionKeys])).rows:[];
  const keys=new Set(completed.map(row=>row.key));
  return [
   ...events.map(e=>({...e,remind:ids.has(e.id)})),
   ...tasks.map(task=>taskCompletion?{...taskEvent(task),completed:keys.has('calendar_task_done:'+userId+':'+task.id)}:taskEvent(task)),
   ...selected.map(event=>eventTask(event,keys.has(completionKey(userId,calendarId,event.id))))
  ];
 };
}
