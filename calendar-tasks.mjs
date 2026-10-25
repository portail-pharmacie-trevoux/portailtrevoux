import {newsDeadline} from './news.mjs';
import {reminderTaskPreset} from './public/news-reminder-presets.js';
export const taskIcons=['✅','📌','📞','✉️','📦','📝','💊','🗣️','🎓','⭐'];
export function validateTask(body,fail){
 const title=typeof body?.title==='string'?body.title.trim():'',description=typeof body?.description==='string'?body.description.trim():'';
 const date=body?.date,icon=body?.icon;
 if(!title||title.length>150||description.length>1000||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||!taskIcons.includes(icon))throw fail(400,'Indiquez un titre (150 caractères maximum), une date valide et une icône.');
 return {title,description,date,icon};
}
export function taskEvent(row){const end=new Date(row.task_date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);return {id:'task-'+row.id,taskId:row.id,personalTask:true,title:row.title,description:row.description,icon:row.icon,remind:true,start:{date:row.task_date},end:{date:end.toISOString().slice(0,10)}};}
export function registerCalendarTasks({app,db,auth,ready,csrf,viewUniverse,fail}){
 const guards=[auth,ready,viewUniverse('Agenda'),csrf];
 app.post('/api/calendar/tasks',...guards,async(req,res)=>{
  const v=validateTask(req.body,fail);
  if(req.body.sourceMessageId!==undefined){
   const source=Number(req.body.sourceMessageId);if(!Number.isSafeInteger(source)||source<1)throw fail(400,'Message invalide.');
   const message=(await db.query(`SELECT m.* FROM team_messages m JOIN team_message_recipients r ON r.message_id=m.id WHERE m.id=$1 AND r.user_id=$2 AND (r.archived OR ${newsDeadline()}>now())`,[source,req.auth.id])).rows[0];
   if(!message||!reminderTaskPreset(message))throw fail(404,'Rappel indisponible ou expiré.');
   const row=(await db.query(`INSERT INTO calendar_tasks(user_id,title,description,task_date,icon,source_message_id)
    SELECT $1,$2,$3,$4,$5,m.id FROM team_messages m JOIN team_message_recipients r ON r.message_id=m.id
    WHERE m.id=$6 AND r.user_id=$1 AND (r.archived OR ${newsDeadline()}>now())
    ON CONFLICT(user_id,source_message_id) WHERE source_message_id IS NOT NULL DO UPDATE SET source_message_id=EXCLUDED.source_message_id
    RETURNING id,(xmax<>0) AS already_exists`,[req.auth.id,v.title,v.description,v.date,v.icon,source])).rows[0];
   if(!row)throw fail(404,'Rappel indisponible ou expiré.');
   return res.status(row.already_exists?200:201).json({id:row.id,alreadyExists:row.already_exists});
  }
  const {rows}=await db.query('INSERT INTO calendar_tasks(user_id,title,description,task_date,icon) VALUES($1,$2,$3,$4,$5) RETURNING id',[req.auth.id,v.title,v.description,v.date,v.icon]);res.status(201).json({id:rows[0].id});
 });
 app.put('/api/calendar/tasks/:id',...guards,async(req,res)=>{
  if(!/^\d+$/.test(req.params.id))throw fail(400,'Tâche invalide.');const v=validateTask(req.body,fail);
  const {rows}=await db.query('UPDATE calendar_tasks SET title=$1,description=$2,task_date=$3,icon=$4 WHERE id=$5 AND user_id=$6 RETURNING id',[v.title,v.description,v.date,v.icon,req.params.id,req.auth.id]);if(!rows.length)throw fail(404,'Tâche introuvable.');res.json({ok:true});
 });
 app.delete('/api/calendar/tasks/:id',...guards,async(req,res)=>{
  if(!/^\d+$/.test(req.params.id))throw fail(400,'Tâche invalide.');
  const {rows}=await db.query('DELETE FROM calendar_tasks WHERE id=$1 AND user_id=$2 RETURNING id',[req.params.id,req.auth.id]);if(!rows.length)throw fail(404,'Tâche introuvable.');res.json({ok:true});
 });
}
