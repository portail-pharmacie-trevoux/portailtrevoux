const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const isTrainingProfession=job=>/^(?:pharmacien(?:ne)?|preparateur|preparatrice)(?:$| (?:cienne|ne|trice|en pharmacie|en officine|adjoint|titulaire)\b)/.test(normalize(String(job||'')));
export function parseTrainingAttestation(doc){
 const match=/^Attestation (DPC|de formation) — (.+) — (\d{2})\/(\d{2})\/(\d{4})$/.exec(doc.title||'');if(!match)return null;
 const [,kind,title,day,month,year]=match,date=`${year}-${month}-${day}`,parsed=new Date(date+'T12:00:00Z');
 if(!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==date)return null;
 return {title,date,kind:kind==='DPC'?'DPC':'Classique',ownerId:Number(doc.owner_id),key:normalize(title)};
}
export function trainingOverview(people,documents,year,today){
 const parsed=documents.map(parseTrainingAttestation).filter(Boolean),rows=people.map(person=>{
  // Group the same course's classic and DPC certificates within a quarter.
  // Classic completion dates take precedence over DPC administrative period end dates.
  const groups=new Map();for(const f of parsed.filter(f=>f.ownerId===person.id&&f.date.slice(0,4)===String(year)&&f.date<=today)){
   const key=Math.floor((Number(f.date.slice(5,7))-1)/3)+'|'+f.key;let group=groups.get(key);
   if(!group){group={title:f.title,date:f.date,kinds:new Set(),classicDate:null};groups.set(key,group);}group.kinds.add(f.kind);
   if(f.kind==='Classique'&&(!group.classicDate||f.date<group.classicDate))group.classicDate=f.date;
   if(f.date<group.date)group.date=f.date;
  }
  const courses=[...groups.values()].map(f=>({title:f.title,date:f.classicDate||f.date,kinds:[...f.kinds].sort()})).sort((a,b)=>a.date.localeCompare(b.date));
  const quarters=Array.from({length:4},(_,q)=>{const end=new Date(Date.UTC(year,q*3+3,0)).toISOString().slice(0,10),start=`${year}-${String(q*3+1).padStart(2,'0')}-01`,list=courses.filter(f=>f.date>=start&&f.date<=end);return {number:q+1,count:list.length,status:list.length?'done':start>today?'future':end<today?'missed':'pending',end};});
  return {id:person.id,name:person.name,quarters,courses,months:Array.from({length:12},(_,i)=>courses.filter(f=>Number(f.date.slice(5,7))===i+1))};
 });
 return {year,today,people:rows,unrecognized:documents.filter(d=>!parseTrainingAttestation(d)).length};
}
export function registerQualityTraining({app,db,auth,ready,viewUniverse,fail,now=()=>new Date()}){
 app.get('/api/quality/training',auth,ready,viewUniverse("Outils d'aide à la démarche qualité"),async(req,res)=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now()).map(p=>[p.type,p.value])),today=parts.year+'-'+parts.month+'-'+parts.day;
  const year=Number(req.query.year??parts.year);if(!Number.isInteger(year)||year<2026||year>Number(parts.year))throw fail(400,'Choisissez une année entre 2026 et l’année en cours.');
  const isAdmin=req.auth.role==='admin';
  const people=(await db.query('SELECT id,name,job FROM users WHERE active=TRUE AND ($1::boolean OR id=$2) ORDER BY lower(last_name),lower(first_name),id',[isAdmin,req.auth.id])).rows.filter(person=>isTrainingProfession(person.job));
  const documents=(await db.query("SELECT owner_id,title FROM hr_documents WHERE active=TRUE AND scope='personal' AND owner_id=ANY($1::int[]) AND title LIKE 'Attestation%'",[people.map(p=>p.id)])).rows;
  res.set('Cache-Control','no-store').json({...trainingOverview(people,documents,year,today),isAdmin});
 });
}
