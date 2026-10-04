export const scheduleKinds=['travail','formation','conge','absence','repos'];
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
  if(!scheduleKinds.includes(kind)||!Array.isArray(slots)||slots.length>2)throw invalid('Journée invalide.');
  const timed=kind==='travail'||kind==='formation';
  if(timed&&!slots.length)throw invalid('Renseignez au moins un créneau horaire.');
  if(!timed&&slots.length)throw invalid('Un congé, une absence ou un repos ne comporte pas de créneau.');
  let lastEnd=-1;
  for(const slot of slots){
    if(!Array.isArray(slot)||slot.length!==2||slot.some(t=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw invalid('Horaires invalides.');
    const start=minutes(slot[0]),end=minutes(slot[1]);
    if(end<=start)throw invalid('L’heure de fin doit être après l’heure de début.');
    if(start<lastEnd)throw invalid('Les créneaux doivent être dans l’ordre et ne pas se chevaucher.');
    lastEnd=end;
  }
  return {userId,day,kind,slots};
}
function minutes(t){const [h,m]=t.split(':').map(Number);return h*60+m;}
export function plannedMinutes(entry){return (entry?.slots||[]).reduce((sum,[start,end])=>sum+minutes(end)-minutes(start),0);}
export function copySchedule(source,sourceWeek,targetWeek,allowedIds){
  validWeek(sourceWeek);validWeek(targetWeek);const result={};
  for(const entry of Object.values(source||{})){
    if(!allowedIds.includes(entry.userId))continue;
    const offset=Math.round((new Date(entry.day+'T12:00:00Z')-new Date(sourceWeek+'T12:00:00Z'))/86400000);
    if(offset<0||offset>6)continue;
    const copied=validateDay({...entry,day:shiftDate(targetWeek,offset)},targetWeek);result[copied.userId+':'+copied.day]=copied;
  }
  return result;
}
export function registerSchedule({app,db,auth,ready,admin,csrf,canAccess,fail}){
  const access=(req,res,next)=>canAccess(req.auth,'Emplois du temps')?next():next(fail(403,'Accès refusé.'));
  const conflict=()=>fail(409,'Le planning a été modifié entre-temps. Rechargez la semaine avant de continuer.');
  const roster=async()=>(await db.query('SELECT id,name FROM users ORDER BY name')).rows;
  async function weekRow(week){return (await db.query('SELECT * FROM schedule_weeks WHERE week=$1::date',[week])).rows[0];}
  async function ensureWeek(week){await db.query('INSERT INTO schedule_weeks(week) VALUES($1::date) ON CONFLICT(week) DO NOTHING',[week]);}
  app.get('/api/schedule',auth,ready,access,async(req,res)=>{
    const week=validWeek(req.query.week),scope=req.query.scope||'team';if(!['mine','team'].includes(scope))throw fail(400,'Vue invalide.');
    const [row,all]=await Promise.all([weekRow(week),roster()]);const isAdmin=req.auth.role==='admin';
    const people=scope==='mine'?all.filter(p=>p.id===req.auth.id):all,ids=new Set(people.map(p=>p.id));
    const entries=Object.values(isAdmin?row?.draft||{}:row?.published||{}).filter(e=>ids.has(e.userId));
    res.json({week,people,entries,draftEntryCount:isAdmin?Object.keys(row?.draft||{}).length:undefined,revision:isAdmin?row?.revision||0:undefined,publishedAt:row?.published_at||null,
      unpublishedChanges:isAdmin?!!row&&row.revision!==row.published_revision:undefined});
  });
  app.put('/api/schedule/:week/day',auth,ready,admin,csrf,async(req,res)=>{
    const week=validWeek(req.params.week),revision=validRevision(req.body.revision),entry=validateDay(req.body,week);
    if(!(await roster()).some(p=>p.id===entry.userId))throw fail(404,'Collaborateur introuvable.');
    await ensureWeek(week);
    const {rows}=await db.query(`UPDATE schedule_weeks SET draft=jsonb_set(draft,ARRAY[$1::text],$2::jsonb),revision=revision+1
      WHERE week=$3::date AND revision=$4 RETURNING revision`,[entry.userId+':'+entry.day,JSON.stringify(entry),week,revision]);
    if(!rows.length)throw conflict();res.json(rows[0]);
  });
  app.post('/api/schedule/:week/clear-day',auth,ready,admin,csrf,async(req,res)=>{
    const week=validWeek(req.params.week),revision=validRevision(req.body.revision),{userId,day}=req.body;
    validateDay({userId,day,kind:'repos',slots:[]},week);await ensureWeek(week);
    const {rows}=await db.query(`UPDATE schedule_weeks SET draft=draft-$1::text,revision=revision+1
      WHERE week=$2::date AND revision=$3 RETURNING revision`,[userId+':'+day,week,revision]);
    if(!rows.length)throw conflict();res.json(rows[0]);
  });
  app.post('/api/schedule/:week/copy',auth,ready,admin,csrf,async(req,res)=>{
    const week=validWeek(req.params.week),from=validWeek(req.body.from),revision=validRevision(req.body.revision);
    if(from===week)throw fail(400,'Choisissez une autre semaine à copier.');
    const source=await weekRow(from);if(!source||!Object.keys(source.draft).length)throw fail(400,'La semaine à copier est vide.');
    const copied=copySchedule(source.draft,from,week,(await roster()).map(p=>p.id));await ensureWeek(week);
    const {rows}=await db.query(`UPDATE schedule_weeks SET draft=$1::jsonb,revision=revision+1
      WHERE week=$2::date AND revision=$3 RETURNING revision`,[JSON.stringify(copied),week,revision]);
    if(!rows.length)throw conflict();res.json(rows[0]);
  });
  app.post('/api/schedule/:week/publish',auth,ready,admin,csrf,async(req,res)=>{
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
