import { readFile } from 'node:fs/promises';
import { readEmployeeDetails, saveEmployeeDetails, validateEmployeeDetails } from './employee-details.mjs';
import { hashPassword, passwordValid, universes, digest, canAccess } from './security.mjs';

export const normalizeName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export function parisDate(now=new Date()) {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const dateText=d=>d instanceof Date?d.toISOString().slice(0,10):String(d||'').slice(0,10);
export function publicPerson(p,isAdmin,selfId) {
  const base={id:p.id,firstName:p.first_name,lastName:p.last_name,phone:p.phone,active:p.active,isSelf:p.id===selfId};
  // Keep the full name for administrator pages opened before the directory update.
  return isAdmin?{...base,name:p.first_name&&p.last_name?p.first_name+' '+p.last_name.toLocaleUpperCase('fr-FR'):p.name,job:p.job,birthday:dateText(p.birthday),email:p.email||'',rights:p.rights,editRights:p.edit_rights||[],permissionsConfigured:!!p.permissions_configured,role:p.role}:base;
}
export function validatePerson(data,fail) {
  const text=(key,max=100)=>{const v=data[key]??'';if(typeof v!=='string'||v.length>max)throw fail(400,'Champ invalide : '+key);return v.trim();};
  const firstName=text('firstName'),lastName=text('lastName');
  if(!firstName||!lastName)throw fail(400,'Renseignez le prénom et le nom.');
  const phone=text('phone',30),birthday=text('birthday',10),job=text('job');
  if(phone&&!/^[+\d().\s-]{7,30}$/.test(phone))throw fail(400,'Numéro de téléphone invalide.');
  if(birthday&&(!/^\d{4}-\d{2}-\d{2}$/.test(birthday)||!Number.isFinite(Date.parse(birthday))||new Date(birthday).toISOString().slice(0,10)!==birthday||birthday<'1900-01-01'||birthday>parisDate()))throw fail(400,'Date de naissance invalide.');
  if(data.active!==undefined&&typeof data.active!=='boolean')throw fail(400,'Statut invalide.');
  return {firstName,lastName,phone,birthday,job,active:data.active!==false,name:firstName+' '+lastName};
}
export function createFeastCalendar({fetchImpl=fetch,now=()=>new Date()}={}) {
  let cache=null,pending=null;
  return async()=>{
    const day=parisDate(now());if(cache?.day===day&&cache.until>Date.now())return cache;
    if(pending)return pending;
    pending=(async()=>{
      const [year,month,date]=day.split('-');
      try{
        const response=await fetchImpl('https://nominis.cef.fr/json/nominis.php?'+new URLSearchParams({jour:date,mois:month,annee:year}),{signal:AbortSignal.timeout(8000),redirect:'error'});
        if(!response.ok)throw Error('Fête indisponible');
        const data=await response.json(),prenoms=data.response?.prenoms;
        const majors=Object.keys(prenoms?.majeurs||prenoms?.majeur||{});
        const names=[...new Set([...majors,...Object.keys(prenoms?.derives||{})])];
        if(!majors.length||names.some(n=>n.length>100))throw Error('Réponse invalide');
        cache={day,feasts:majors,names,available:true,until:Date.now()+86400000};
      }catch{cache={day,feasts:[],names:[],available:false,until:Date.now()+5*60000};}
      return cache;
    })().finally(()=>{pending=null;});return pending;
  };
}
export function registerCollaborateurs({app,db,auth,ready,admin,csrf,fail,secret,feastCalendar=createFeastCalendar()}) {
  app.get('/api/collaborateurs/registration-form',auth,ready,admin,async(req,res)=>{
    const pdf=await readFile(new URL('./assets/fiche-inscription-salarie.pdf',import.meta.url));
    res.type('application/pdf').attachment('fiche-inscription-salarie.pdf').send(pdf);
  });
  const all=async()=>(await db.query('SELECT * FROM users ORDER BY active DESC,last_name,first_name')).rows;
  const view=(person,req)=>publicPerson(person,req.auth.role==='admin',req.auth.id);
  const directoryAccess=(req,res,next)=>canAccess(req.auth,'Collaborateurs')?next():next(fail(403,'Accès à l’annuaire refusé.'));
  app.get('/api/users',auth,ready,directoryAccess,async(req,res)=>res.json((await all()).map(p=>view(p,req))));
  app.get('/api/collaborateurs/celebrations',auth,ready,directoryAccess,async(req,res)=>{
    const calendar=await feastCalendar(),day=calendar.day,people=(await all()).filter(p=>p.active);
    res.json({day,feasts:calendar.feasts,feastsAvailable:calendar.available,
      birthdays:people.filter(p=>dateText(p.birthday).slice(5)===day.slice(5)).map(p=>p.first_name+' '+p.last_name.toLocaleUpperCase('fr-FR')),
      nameDays:calendar.available?people.filter(p=>calendar.names.some(name=>normalizeName(p.first_name)===normalizeName(name))).map(p=>p.first_name+' '+p.last_name.toLocaleUpperCase('fr-FR')):[]});
  });
  // The employee session decides whose payroll access this is. No arbitrary person ID or document is accepted.
  app.get('/api/collaborateurs/me/payroll',auth,ready,(req,res)=>res.json({name:req.auth.name,url:'https://my.silae.fr/',mode:'external',integrated:false}));
  async function account(data,existing=null) {
    const email=data.email===undefined?(existing?.email||''):data.email;
    const rights=data.rights===undefined?(existing?.rights||[]):data.rights;
    const editRights=data.editRights===undefined?(existing?.edit_rights||[]):data.editRights;
    const configured=data.editRights!==undefined||existing?.permissions_configured===true;
    if(typeof email!=='string'||email.length>254||(email&&!/^\S+@\S+\.\S+$/.test(email.trim())))throw fail(400,'Adresse e-mail invalide.');
    if(!Array.isArray(rights)||rights.some(r=>!universes.includes(r)))throw fail(400,'Droits invalides.');
    if(!Array.isArray(editRights)||editRights.some(r=>!universes.includes(r)||r==='Collaborateurs'||!rights.includes(r)))throw fail(400,'La modification nécessite un droit de consultation. La gestion des collaborateurs reste réservée à l’administrateur.');
    if(existing?.email&&!email)throw fail(400,'Archivez le collaborateur pour désactiver son accès.');
    if((email&&!existing?.password_hash)||data.password){if(!passwordValid(data.password))throw fail(400,'Le mot de passe provisoire doit comporter au moins 12 caractères.');}
    if(!email&&data.password)throw fail(400,'Renseignez une adresse e-mail pour créer un accès.');
    return {email:email.trim().toLowerCase()||null,rights:[...new Set(rights)],editRights:[...new Set(editRights)],configured,hash:data.password?await hashPassword(data.password):existing?.password_hash||null};
  }
  app.get('/api/users/:id/details',auth,ready,admin,async(req,res)=>{
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Profil invalide.');
    const person=(await db.query('SELECT * FROM users WHERE id=$1',[id])).rows[0];if(!person)throw fail(404,'Collaborateur introuvable.');
    res.json({person:view(person,req),...await readEmployeeDetails(db,id,secret)});
  });
  async function transaction(work){
    const client=db.connect?await db.connect():db;
    try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}
    catch(e){await client.query('ROLLBACK');throw e;}finally{client.release?.();}
  }
  app.post('/api/users',auth,ready,admin,csrf,async(req,res)=>{
    const d=validatePerson(req.body,fail),a=await account(req.body),details=req.body.details===undefined?undefined:validateEmployeeDetails(req.body.details,fail);
    const person=await transaction(async client=>{
      const {rows}=await client.query(`INSERT INTO users(name,first_name,last_name,phone,birthday,job,active,email,password_hash,rights,edit_rights,permissions_configured)
        VALUES($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12) RETURNING *`,[d.name,d.firstName,d.lastName,d.phone,d.birthday||null,d.job,d.active,a.email,a.hash,JSON.stringify(a.rights),JSON.stringify(a.editRights),a.configured]);
      if(details!==undefined)await saveEmployeeDetails(client,rows[0].id,details,0,secret,req.auth.id,fail);
      return rows[0];
    });res.status(201).json(view(person,req));
  });
  app.put('/api/users/:id',auth,ready,admin,csrf,async(req,res)=>{
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Profil invalide.');
    const d=validatePerson(req.body,fail),details=req.body.details===undefined?undefined:validateEmployeeDetails(req.body.details,fail);
    const person=await transaction(async client=>{
      const existing=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!existing)throw fail(404,'Collaborateur introuvable.');
      // Save the private record and public contact fields atomically, with conflict protection.
      if(details!==undefined)await saveEmployeeDetails(client,id,details,req.body.detailsRevision,secret,req.auth.id,fail);
      if(existing.role==='admin'){
        return (await client.query('UPDATE users SET name=$1,first_name=$2,last_name=$3,phone=$4,birthday=$5::date,job=$6 WHERE id=$7 RETURNING *',[d.name,d.firstName,d.lastName,d.phone,d.birthday||null,d.job,id])).rows[0];
      }
      const a=await account(req.body,existing);
      const {rows}=await client.query(`UPDATE users SET name=$1,first_name=$2,last_name=$3,phone=$4,birthday=$5::date,job=$6,active=$7,email=$8,password_hash=$9,rights=$10::jsonb,
        edit_rights=$11::jsonb,permissions_configured=$12,must_change=CASE WHEN $13 THEN TRUE ELSE must_change END WHERE id=$14 RETURNING *`,[d.name,d.firstName,d.lastName,d.phone,d.birthday||null,d.job,d.active,a.email,a.hash,JSON.stringify(a.rights),JSON.stringify(a.editRights),a.configured,!!req.body.password,id]);
      if(!d.active||a.email!==existing.email||a.hash!==existing.password_hash||JSON.stringify(a.rights)!==JSON.stringify(existing.rights)||JSON.stringify(a.editRights)!==JSON.stringify(existing.edit_rights)||a.configured!==existing.permissions_configured)await client.query('DELETE FROM sessions WHERE user_id=$1',[id]);
      return rows[0];
    });res.json(view(person,req));
  });
  app.delete('/api/users/:id',auth,ready,admin,csrf,async(req,res)=>{
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Profil invalide.');
    const {rows}=await db.query("UPDATE users SET active=FALSE WHERE id=$1 AND role='employee' RETURNING id",[id]);
    if(!rows[0])throw fail(404,'Collaborateur introuvable ou compte administrateur protégé.');
    await db.query('DELETE FROM sessions WHERE user_id=$1',[id]);res.json({ok:true});
  });
  app.post('/api/users/:id/restore',auth,ready,admin,csrf,async(req,res)=>{
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Profil invalide.');
    const {rows}=await db.query("UPDATE users SET active=TRUE WHERE id=$1 AND role='employee' RETURNING *",[id]);
    if(!rows[0])throw fail(404,'Collaborateur introuvable.');res.json(view(rows[0],req));
  });
  app.post('/api/collaborateurs/import',auth,ready,admin,csrf,async(req,res)=>{
    if(!Array.isArray(req.body.people)||!req.body.people.length||req.body.people.length>100)throw fail(400,'Liste invalide (1 à 100 personnes).');
    const people=req.body.people.map(p=>validatePerson(p,fail)),keys=new Set();
    for(const p of people){p.key=digest(normalizeName(p.name));if(keys.has(p.key))throw fail(400,'Un collaborateur apparaît plusieurs fois dans le fichier.');keys.add(p.key);}
    const client=db.connect?await db.connect():db;
    try{
      await client.query('BEGIN');
      const existing=(await client.query('SELECT id,name,role FROM users')).rows;
      for(const p of people){
        const matches=existing.filter(u=>normalizeName(u.name)===normalizeName(p.name));
        if(matches.length>1)throw fail(409,'Plusieurs fiches correspondent à '+p.name+'. Import annulé.');
        if(matches.length){
          await client.query(`UPDATE users SET first_name=$1,last_name=$2,birthday=$3::date,
            active=CASE WHEN role='admin' THEN TRUE ELSE $4 END,directory_key=$5,
            job=CASE WHEN $6='' THEN job ELSE $6 END,phone=CASE WHEN $8='' THEN phone ELSE $8 END WHERE id=$7`,[p.firstName,p.lastName,p.birthday||null,p.active,p.key,p.job,matches[0].id,p.phone]);
        }else{
          await client.query(`INSERT INTO users(name,first_name,last_name,birthday,job,active,directory_key,phone)
            VALUES($1,$2,$3,$4::date,$5,$6,$7,$8) ON CONFLICT(directory_key) DO UPDATE SET
            first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,birthday=EXCLUDED.birthday,active=EXCLUDED.active`,[p.name,p.firstName,p.lastName,p.birthday||null,p.job,p.active,p.key,p.phone]);
        }
      }
      await client.query('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE active=FALSE)');
      await client.query('COMMIT');res.json({count:people.length,active:people.filter(p=>p.active).length,inactive:people.filter(p=>!p.active).length});
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release?.();}
  });
}

