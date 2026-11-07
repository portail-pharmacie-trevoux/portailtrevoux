import {randomUUID} from 'node:crypto';
import {validateAutomation,automationOccurrence,automationContext,renderAutomationText,templateVariables,parisWall} from './message-automation-model.mjs';
export function registerMessageAutomationAdmin({app,db,auth,ready,admin,csrf,fail}){
 const read=[auth,ready,admin],write=[...read,csrf];
 app.get('/api/news/automations',...read,async(req,res)=>{
  const [jobs,people,services,history]=await Promise.all([
   db.query('SELECT id,kind,name,enabled,config,revision,activation_at,updated_at FROM message_automations WHERE deleted_at IS NULL ORDER BY created_at,id'),
   db.query('SELECT id,name FROM users WHERE active=TRUE ORDER BY last_name,first_name,id'),
   db.query('SELECT s.id,s.service,s.collaborator_id,u.name AS collaborator_name,u.active FROM quality_services s LEFT JOIN users u ON u.id=s.collaborator_id ORDER BY lower(s.service),s.id'),
   db.query('SELECT r.automation_id,r.occurrence,r.status,r.recipient_count,r.message_count,r.error,r.completed_at FROM message_automation_runs r JOIN message_automations a ON a.id=r.automation_id WHERE a.deleted_at IS NULL ORDER BY r.completed_at DESC,r.id DESC LIMIT 200')
  ]);
  const now=new Date();res.set('Cache-Control','no-store').json({jobs:jobs.rows.map(j=>({...j,next:j.enabled?automationOccurrence(j.config,now,true,history.rows.filter(r=>r.automation_id===j.id&&r.status!=='failed').map(r=>r.occurrence instanceof Date?r.occurrence.toISOString().slice(0,10):String(r.occurrence).slice(0,10)))?.wall||null:null})),people:people.rows,services:services.rows,history:history.rows,variables:templateVariables});
 });
 async function validateTargets(client,config){
  for(const [mode,ids,sql]of [['users',config.audience.userIds,'SELECT id FROM users WHERE active=TRUE AND id=ANY($1::int[])'],['services',config.audience.serviceIds,'SELECT id FROM quality_services WHERE id=ANY($1::int[])']])if(config.audience.mode===mode&&(await client.query(sql,[ids])).rows.length!==ids.length)throw fail(409,'Un destinataire ou un service n’est plus disponible. Actualisez la liste.');
 }
 async function save(req,res,creating){
  const data=validateAutomation(req.body,fail);if(!creating&&(!Number.isSafeInteger(req.body.revision)||req.body.revision<1))throw fail(400,'Version invalide. Actualisez la programmation.');
  if(data.enabled&&data.config.frequency==='once'&&data.config.startDate+'T'+data.config.time+':00'<=parisWall())throw fail(400,'Choisissez une date et une heure futures pour un envoi unique.');
  if(creating&&data.config.audience.mode==='default')throw fail(400,'Choisissez les destinataires de la nouvelle programmation.');
  const client=await db.connect();try{
   await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(78451025)');
   let before=null,id=creating?'custom-'+randomUUID():req.params.id;
   if(!creating){before=(await client.query('SELECT * FROM message_automations WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];if(!before)throw fail(404,'Programmation introuvable.');if(before.revision!==req.body.revision)throw fail(409,'Cette programmation a changé. Actualisez-la avant de l’enregistrer.');}
   else if(Number((await client.query('SELECT count(*) AS count FROM message_automations WHERE deleted_at IS NULL')).rows[0].count)>=100)throw fail(400,'Limite de 100 programmations atteinte.');
   await validateTargets(client,data.config);
   const row=(await client.query(creating?'INSERT INTO message_automations(id,kind,name,enabled,config,created_by,updated_by) VALUES($1,\'custom\',$2,$3,$4::jsonb,$5,$5) RETURNING id,revision':'UPDATE message_automations SET name=$2,enabled=$3,config=$4::jsonb,updated_by=$5,revision=revision+1,activation_at=now(),updated_at=now() WHERE id=$1 RETURNING id,revision',[id,data.name,data.enabled,JSON.stringify(data.config),req.auth.id])).rows[0];
   await client.query('INSERT INTO message_automation_changes(automation_id,actor_id,action,before_value,after_value) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',[id,req.auth.id,creating?'create':'update',before?JSON.stringify({name:before.name,config:before.config,enabled:before.enabled}):null,JSON.stringify(data)]);
   await client.query('COMMIT');res.status(creating?201:200).json(row);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 app.post('/api/news/automations',...write,(req,res)=>save(req,res,true));
 app.put('/api/news/automations/:id',...write,(req,res)=>save(req,res,false));
 app.post('/api/news/automations/preview',...write,(req,res)=>{
  const data=validateAutomation(req.body,fail),date=data.config.startDate,context=automationContext(date,{service:'Exemple de service',nombre_lignes:'3',emplacements:'• Têtes de gondole : TG1, TG2 (exemple)'});
  res.json({text:renderAutomationText(data.config.text,context),next:automationOccurrence(data.config,new Date(),true)?.wall||null});
 });
}
