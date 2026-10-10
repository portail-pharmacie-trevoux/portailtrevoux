import {registerScheduleMonth} from './schedule-month.mjs';
import {registerScheduleTemplates} from './schedule-templates.mjs';
import {registerScheduleTools} from './schedule-tools.mjs';
export const scheduleKinds=['travail','formation','ecole_cfa','conge','maladie','recuperation','absence_injustifiee','absence','repos'];
const invalid=message=>Object.assign(new Error(message),{status:400});
export function validDate(value){
  if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))throw invalid('Date invalide.');
  const d=new Date(value+'T12:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw invalid('Date invalide.');
  return value;
}
export function shiftDate(value,offset){const d=new Date(validDate(value)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
export function validWeek(value){validDate(value);if(new Date(value+'T12:00:00Z').getUTCDay()!==1)throw invalid('Choisissez une semaine commençant un lundi.');return value;}
export function validRevision(value){if(!Number.isSafeInteger(value)||value<0)throw invalid('Version du planning invalide.');return value;}
export function validateDay(body,week){
  validWeek(week);const {userId,day,kind,slots}=body||{};
  if(!Number.isSafeInteger(userId)||userId<1)throw invalid('Collaborateur invalide.');
  validDate(day);if(day<week||day>shiftDate(week,6))throw invalid('Ce jour ne fait pas partie de la semaine.');
  if(!scheduleKinds.includes(kind)||!Array.isArray(slots)||slots.length>10)throw invalid('Journée invalide.');
  const timed=['travail','formation','ecole_cfa'].includes(kind);
  if(timed&&!slots.length)throw invalid('Renseignez au moins un créneau horaire.');
  if(!timed&&slots.length)throw invalid('Un congé, une absence ou un repos ne comporte pas de créneau.');
  let lastEnd=-1;
  for(const slot of slots){
    if(!Array.isArray(slot)||slot.length!==2||slot.some(t=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw invalid('Horaires invalides.');
    const start=minutes(slot[0]),end=minutes(slot[1]);
    if(start<450||end>1290)throw invalid('Les créneaux doivent être compris entre 7 h 30 et 21 h 30.');
    if(end<=start)throw invalid('L’heure de fin doit être après l’heure de début.');
    if(start<lastEnd)throw invalid('Les créneaux doivent être dans l’ordre et ne pas se chevaucher.');
    lastEnd=end;
  }
  const postIds=body.postIds;if(postIds!==undefined&&(!Array.isArray(postIds)||postIds.length!==slots.length||postIds.some(id=>id!==null&&(!Number.isSafeInteger(id)||id<1))))throw invalid('Choisissez un poste valide pour chaque créneau.');
  if(body.mealTicket!==undefined&&typeof body.mealTicket!=='boolean')throw invalid('Attribution de ticket restaurant invalide.');
  if(body.actualMinutes!==undefined&&body.actualMinutes!==null&&(!Number.isInteger(body.actualMinutes)||body.actualMinutes<0||body.actualMinutes>840||(!timed&&body.actualMinutes>0)))throw invalid('Renseignez une durée réalisée entre 0 et 14 heures, uniquement pour le travail, la formation ou l’école CFA.');
  return {userId,day,kind,slots,...(body.actualMinutes!==undefined?{actualMinutes:body.actualMinutes}:{}),...(postIds!==undefined?{postIds}: {}),...(body.mealTicket!==undefined?{mealTicket:body.mealTicket}: {})};
}
function minutes(t){const [h,m]=t.split(':').map(Number);return h*60+m;}
export function plannedMinutes(entry){return (entry?.slots||[]).reduce((sum,[start,end])=>sum+minutes(end)-minutes(start),0);}
export function copySchedule(source,sourceWeek,targetWeek,allowedIds){
  validWeek(sourceWeek);validWeek(targetWeek);const result={};
  for(const entry of Object.values(source||{})){
    if(!allowedIds.includes(entry.userId))continue;
    const offset=Math.round((new Date(entry.day+'T12:00:00Z')-new Date(sourceWeek+'T12:00:00Z'))/86400000);
    if(offset<0||offset>6)continue;
    const copied=validateDay({...entry,day:shiftDate(targetWeek,offset)},targetWeek);delete copied.mealTicket;delete copied.actualMinutes;result[copied.userId+':'+copied.day]=copied;
  }
  return result;
}
export function registerSchedule({app,db,auth,ready,admin,csrf,canAccess,canModify,fail}){
  const tools=registerScheduleTools({app,db,auth,ready,admin,csrf,canAccess,fail});
  const access=(req,res,next)=>canAccess(req.auth,'Emplois du temps')?next():next(fail(403,'Accès refusé.'));
  const editor=(req,res,next)=>canModify(req.auth,'Emplois du temps')?next():next(fail(403,'Vous pouvez uniquement consulter le planning.'));
  const conflict=()=>fail(409,'Le planning a été modifié entre-temps. Rechargez la semaine avant de continuer.');
  const roster=async()=>(await db.query('SELECT id,name FROM users WHERE active=TRUE ORDER BY schedule_position NULLS LAST,name,id')).rows;
  async function weekRow(week){return (await db.query('SELECT * FROM schedule_weeks WHERE week=$1::date',[week])).rows[0];}
  async function ensureWeek(week){await db.query('INSERT INTO schedule_weeks(week) VALUES($1::date) ON CONFLICT(week) DO NOTHING',[week]);}
  async function unlocked(req,res,next){try{const week=validWeek(req.params.week),row=await weekRow(week),locks=row?.locked_days||{};if(req.body?.day?locks[req.body.day]:Object.keys(locks).length)throw fail(409,'Journée validée : dévalidez-la avec le cadenas avant de modifier le planning.');next();}catch(e){next(e);}}
  app.post('/api/schedule/:week/day-lock',auth,ready,access,admin,csrf,async(req,res)=>{const week=validWeek(req.params.week),revision=validRevision(req.body.revision),{day,locked}=req.body;validateDay({userId:req.auth.id,day,kind:'repos',slots:[]},week);if(typeof locked!=='boolean')throw fail(400,'Validation invalide.');await ensureWeek(week);const value={by:req.auth.id,at:new Date().toISOString()};const row=(await db.query(locked?'UPDATE schedule_weeks SET locked_days=jsonb_set(locked_days,ARRAY[$1::text],$2::jsonb),revision=revision+1 WHERE week=$3::date AND revision=$4 RETURNING revision':'UPDATE schedule_weeks SET locked_days=locked_days-$1::text,revision=revision+1 WHERE week=$3::date AND revision=$4 AND $2::jsonb IS NOT NULL RETURNING revision',[day,JSON.stringify(value),week,revision])).rows[0];if(!row)throw conflict();res.json(row);});
  app.use(['/api/schedule/:week/day','/api/schedule/:week/clear-day','/api/schedule/:week/meal-ticket','/api/schedule/:week/copy','/api/schedule/:week/apply-template'],auth,ready,access,unlocked);
  registerScheduleTemplates({app,db,auth,ready,admin,csrf,access,roster,ensureWeek,tools,fail});
  registerScheduleMonth({app,db,auth,ready,admin,csrf,access,roster,fail});
  const sensitive=entry=>['maladie','absence_injustifiee'].includes(entry?.kind);
  app.post('/api/schedule/people-order',auth,ready,access,admin,csrf,async(req,res)=>{
    const {userId,neighborId,direction}=req.body||{};if(!Number.isSafeInteger(userId)||!Number.isSafeInteger(neighborId)||!['up','down'].includes(direction))throw fail(400,'Déplacement invalide.');
    const client=await db.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(78451023)');const rows=(await client.query('SELECT id,name FROM users WHERE active=TRUE ORDER BY schedule_position NULLS LAST,name,id FOR UPDATE')).rows,ids=rows.map(p=>p.id),index=ids.indexOf(userId),next=index+(direction==='up'?-1:1);if(index<0||next<0||next>=ids.length||ids[next]!==neighborId)throw fail(409,'L’ordre des collaborateurs a changé. Rechargez le planning.');[ids[index],ids[next]]=[ids[next],ids[index]];await client.query('UPDATE users u SET schedule_position=o.position FROM unnest($1::int[]) WITH ORDINALITY AS o(id,position) WHERE u.id=o.id',[ids]);await client.query('COMMIT');res.json({ok:true});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  });
  app.get('/api/schedule/today',auth,ready,access,async(req,res)=>{
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),offset=(new Date(day+'T12:00:00Z').getUTCDay()+6)%7;
    const row=await weekRow(shiftDate(day,-offset)),entry=row?.published?.[req.auth.id+':'+day];
    const ids=[...new Set((entry?.postIds||[]).filter(Number.isSafeInteger))];
    const posts=ids.length?(await db.query('SELECT id,name FROM schedule_posts WHERE id=ANY($1::int[])',[ids])).rows:[];
    res.json({day,kind:entry?.kind||null,slots:(entry?.slots||[]).map(([start,end],i)=>({start,end,post:posts.find(p=>p.id===entry.postIds?.[i])?.name||null}))});
  });
  app.get('/api/schedule',auth,ready,access,async(req,res)=>{
    const week=validWeek(req.query.week),scope=req.query.scope||'team';if(!['mine','team'].includes(scope))throw fail(400,'Vue invalide.');
    const [row,all]=await Promise.all([weekRow(week),roster()]);const isAdmin=canModify(req.auth,'Emplois du temps');
    const people=scope==='mine'?all.filter(p=>p.id===req.auth.id):all,ids=new Set(people.map(p=>p.id));
    const entries=Object.values(isAdmin?row?.draft||{}:row?.published||{}).filter(e=>ids.has(e.userId)).map(entry=>{if(req.auth.role==='admin')return entry;const {mealTicket,actualMinutes,...e}=entry;return {...e,...(entry.userId===req.auth.id&&mealTicket!==undefined?{mealTicket}:{}),...(entry.userId===req.auth.id&&actualMinutes!==undefined?{actualMinutes}:{}),...(sensitive(entry)?{kind:entry.userId===req.auth.id?entry.kind:'absence',readOnly:true}: {})};});
    res.json({week,people,entries,lockedDays:row?.locked_days||{},canEdit:isAdmin,draftEntryCount:isAdmin?Object.keys(row?.draft||{}).length:undefined,revision:isAdmin?row?.revision||0:undefined,publishedAt:row?.published_at||null,
      unpublishedChanges:isAdmin?!!row&&row.revision!==row.published_revision:undefined});
  });
  app.put('/api/schedule/:week/day',auth,ready,editor,csrf,async(req,res)=>{
    const week=validWeek(req.params.week),revision=validRevision(req.body.revision),entry=validateDay(req.body,week);
    if(!(await roster()).some(p=>p.id===entry.userId))throw fail(404,'Collaborateur introuvable.');
    const previous=(await weekRow(week))?.draft?.[entry.userId+':'+entry.day]||{};if(req.auth.role!=='admin'&&(sensitive(entry)||sensitive(previous)||(entry.mealTicket!==undefined&&entry.mealTicket!==!!previous.mealTicket)||(entry.actualMinutes!==undefined&&entry.actualMinutes!==(previous.actualMinutes??null))))throw fail(403,'Ces absences, les heures réalisées et les tickets restaurant sont réservés à l’administrateur.');if(entry.mealTicket===undefined&&previous.mealTicket!==undefined)entry.mealTicket=previous.mealTicket;if(entry.actualMinutes===undefined&&previous.actualMinutes!==undefined)entry.actualMinutes=previous.actualMinutes;if(entry.postIds?.some(id=>id!==null))await tools.validatePostIds(entry,previous);await ensureWeek(week);
    const {rows}=await db.query(`UPDATE schedule_weeks SET draft=jsonb_set(draft,ARRAY[$1::text],$2::jsonb),revision=revision+1
      WHERE week=$3::date AND revision=$4 RETURNING revision`,[entry.userId+':'+entry.day,JSON.stringify(entry),week,revision]);
    if(!rows.length)throw conflict();res.json(rows[0]);
  });
  app.post('/api/schedule/:week/meal-ticket',auth,ready,access,admin,csrf,async(req,res)=>{
    const week=validWeek(req.params.week),revision=validRevision(req.body.revision),{userId,day,enabled}=req.body;if(typeof enabled!=='boolean')throw fail(400,'Attribution invalide.');validateDay({userId,day,kind:'repos',slots:[]},week);if(!(await roster()).some(p=>p.id===userId))throw fail(404,'Collaborateur introuvable.');const previous=(await weekRow(week))?.draft?.[userId+':'+day]||{userId,day,kind:'repos',slots:[]};const entry={...previous,mealTicket:enabled};await ensureWeek(week);const result=(await db.query('UPDATE schedule_weeks SET draft=jsonb_set(draft,ARRAY[$1::text],$2::jsonb),revision=revision+1 WHERE week=$3::date AND revision=$4 RETURNING revision',[userId+':'+day,JSON.stringify(entry),week,revision])).rows[0];if(!result)throw conflict();res.json(result);
  });
  app.post('/api/schedule/:week/clear-day',auth,ready,editor,csrf,async(req,res)=>{
    const week=validWeek(req.params.week),revision=validRevision(req.body.revision),{userId,day}=req.body;
    validateDay({userId,day,kind:'repos',slots:[]},week);const previous=(await weekRow(week))?.draft?.[userId+':'+day];if(req.auth.role!=='admin'&&(sensitive(previous)||previous?.mealTicket||previous?.actualMinutes!==undefined&&previous?.actualMinutes!==null))throw fail(403,'Cette journée doit être modifiée par un administrateur.');await ensureWeek(week);
    const {rows}=await db.query(`UPDATE schedule_weeks SET draft=draft-$1::text,revision=revision+1
      WHERE week=$2::date AND revision=$3 RETURNING revision`,[userId+':'+day,week,revision]);
    if(!rows.length)throw conflict();res.json(rows[0]);
  });
  app.post('/api/schedule/:week/copy',auth,ready,editor,csrf,async(req,res)=>{
    const week=validWeek(req.params.week),from=validWeek(req.body.from),revision=validRevision(req.body.revision);
    if(from===week)throw fail(400,'Choisissez une autre semaine à copier.');
    const source=await weekRow(from);if(!source||!Object.keys(source.draft).length)throw fail(400,'La semaine à copier est vide.');
    if(req.auth.role!=='admin'){const target=await weekRow(week);if(Object.values(source.draft).some(sensitive)||Object.values(target?.draft||{}).some(e=>sensitive(e)||e.mealTicket||e.actualMinutes!==undefined&&e.actualMinutes!==null))throw fail(403,'Un administrateur doit copier cette semaine.');}const copied=copySchedule(source.draft,from,week,(await roster()).map(p=>p.id));await ensureWeek(week);
    const {rows}=await db.query(`UPDATE schedule_weeks SET draft=$1::jsonb,revision=revision+1
      WHERE week=$2::date AND revision=$3 RETURNING revision`,[JSON.stringify(copied),week,revision]);
    if(!rows.length)throw conflict();res.json(rows[0]);
  });
  app.post('/api/schedule/:week/publish',auth,ready,editor,csrf,async(req,res)=>{
    const week=validWeek(req.params.week),revision=validRevision(req.body.revision);await ensureWeek(week);
    const {rows}=await db.query(`WITH changed AS (
      UPDATE schedule_weeks SET published=draft,published_revision=revision,published_at=now()
      WHERE week=$1::date AND revision=$2 AND (published_at IS NULL OR published_revision<>revision)
      RETURNING published_at
    ) INSERT INTO publications(universe,title) SELECT 'Emplois du temps',$3 FROM changed RETURNING id`,[week,revision,'Planning de la semaine du '+week.split('-').reverse().join('/')+' publié']);
    if(!rows.length){const row=await weekRow(week);if(row?.revision!==revision)throw conflict();return res.json({ok:true,alreadyPublished:true});}
    res.json({ok:true});
  });
}

