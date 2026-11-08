// Scalingo-only profile editing. Never dispatch writes to the general account
// management endpoint: credentials, role and invitations stay locked.
import {deleteScalingoEmployee} from './scalingo-employee-deletion.mjs';
import {randomUUID} from 'node:crypto';
import {publicPerson,validatePerson} from '../collaborateurs.mjs';
import {readEmployeeDetails,saveEmployeeDetails,validateEmployeeDetails} from '../employee-details.mjs';
import {validateRights} from './scalingo-universal-rights.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const fields=new Set(['firstName','lastName','phone','birthday','job','active','email','password','administratorRights','rights','editRights','details','detailsRevision']);
const equal=(a,b)=>JSON.stringify([...new Set(a||[])].sort())===JSON.stringify([...new Set(b||[])].sort());
const idOf=req=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1||id>2147483647)throw fail(400,'Profil invalide.');return id;};
export function registerScalingoEmployeeRecords({gate,db,adminAuth,origin,secret,isAllowedOrigin=value=>value===origin}){
 const privacy=(req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});next();};
 const write=(req,res,next)=>isAllowedOrigin(req.get('origin'))&&req.get('x-csrf-token')===req.cleanupAdmin.csrf?next():next(fail(403,'Origine ou CSRF invalide.'));
 gate.post('/api/users',privacy,adminAuth,write,async(req,res,next)=>{let client;try{
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!fields.has(k)))throw fail(400,'Champs de fiche invalides.');
  const profile=validatePerson(body,fail),details=body.details===undefined?undefined:validateEmployeeDetails(body.details,fail);
  if(body.email!==undefined&&body.email!==''||body.password!==undefined&&body.password!==''||body.administratorRights!==undefined&&body.administratorRights!==false||body.active!==undefined&&body.active!==true)throw fail(403,'Une fiche salariée sans accès personnel uniquement peut être créée ici.');
  if(body.detailsRevision!==undefined&&body.detailsRevision!==0)throw fail(400,'Une nouvelle fiche ne peut pas remplacer une fiche existante.');
  const reads=body.rights??[],edits=body.editRights??[];
  if(!Array.isArray(reads)||!Array.isArray(edits))throw fail(400,'Droits invalides.');
  const rights=validateRights({rights:[...new Set([...reads,'Agenda','Actualités'])],editRights:[...new Set([...edits,'Actualités'])]});
  client=await db.connect();await client.query('BEGIN');
  const person=(await client.query(`INSERT INTO users(name,first_name,last_name,phone,birthday,job,active,email,password_hash,role,must_change,rights,edit_rights,permissions_configured,directory_key)
   VALUES($1,$2,$3,$4,$5::date,$6,TRUE,NULL,NULL,'employee',TRUE,$7::jsonb,$8::jsonb,$9,$10) RETURNING *`,[profile.name,profile.firstName,profile.lastName,profile.phone,profile.birthday||null,profile.job,JSON.stringify(rights.rights),JSON.stringify(rights.editRights),body.editRights!==undefined,'scalingo-manual:'+randomUUID()])).rows[0];
  if(details!==undefined)await saveEmployeeDetails(client,person.id,details,0,secret,req.cleanupAdmin.id,fail);
  await client.query('COMMIT');res.status(201).json(publicPerson(person,true,req.cleanupAdmin.id));
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});next(e);}finally{client?.release();}});
 const lifecycle=active=>async(req,res,next)=>{let client;try{
  const id=idOf(req);client=await db.connect();await client.query('BEGIN');
  const existing=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!existing)throw fail(404,'Collaborateur introuvable.');
  if(existing.role!=='employee'||existing.id===req.cleanupAdmin.id)throw fail(403,'Compte administrateur protégé.');
  const person=(await client.query("UPDATE users SET active=$2 WHERE id=$1 AND role='employee' RETURNING *",[id,active])).rows[0];
  await client.query('DELETE FROM sessions WHERE user_id=$1',[id]);
  await client.query('COMMIT');res.json(active?publicPerson(person,true,req.cleanupAdmin.id):{ok:true});
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});next(e);}finally{client?.release();}};
 gate.delete('/api/users/:id/permanent',privacy,adminAuth,write,async(req,res,next)=>{try{
  const id=idOf(req),body=req.body;
  if(!body||Object.keys(body).some(k=>!['confirmation','confirmationText'].includes(k))||body.confirmation!==id||body.confirmationText!=='SUPPRIMER')throw fail(400,'Confirmez le collaborateur et saisissez exactement SUPPRIMER.');
  res.json(await deleteScalingoEmployee({db,id,actorId:req.cleanupAdmin.id}));
 }catch(e){next(e);}});
 gate.delete('/api/users/:id',privacy,adminAuth,write,lifecycle(false));
 gate.post('/api/users/:id/restore',privacy,adminAuth,write,lifecycle(true));
 gate.get('/api/users/:id/details',privacy,adminAuth,async(req,res,next)=>{try{
  const id=idOf(req),person=(await db.query('SELECT * FROM users WHERE id=$1',[id])).rows[0];if(!person)throw fail(404,'Collaborateur introuvable.');
  res.json({person:publicPerson(person,true,req.cleanupAdmin.id),...await readEmployeeDetails(db,id,secret),previewRestrictions:{accountReadOnly:true,profileReadOnly:person.role==='admin',lifecycleAllowed:person.role==='employee'}});
 }catch(e){next(e);}});
 gate.put('/api/users/:id',privacy,(req,res,next)=>{
  // Retain the existing backup-gated permission-only interface for its callers.
  if(req.body&&Object.keys(req.body).every(k=>['rights','editRights'].includes(k)))return next('route');
  next();
 },adminAuth,write,async(req,res,next)=>{let client;try{
  const id=idOf(req),body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!fields.has(k)))throw fail(400,'Champs de fiche invalides.');
  const profile=validatePerson(body,fail),details=body.details===undefined?undefined:validateEmployeeDetails(body.details,fail);
  if(body.password!==undefined&&body.password!==''||body.administratorRights!==undefined&&body.administratorRights!==false)throw fail(403,'La connexion personnelle et les droits administrateur restent protégés.');
  const rights=body.rights===undefined&&body.editRights===undefined?null:validateRights({rights:body.rights,editRights:body.editRights});
  client=await db.connect();await client.query('BEGIN');
  const existing=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!existing)throw fail(404,'Collaborateur introuvable.');
  if(existing.role!=='employee')throw fail(403,'Compte administrateur protégé.');
  if(body.active!==undefined&&body.active!==existing.active||body.email!==undefined&&(typeof body.email!=='string'||body.email!==(existing.email||'')))throw fail(403,'Les accès de connexion et le statut du compte ne peuvent pas être modifiés ici.');
  if(details!==undefined){const old=await readEmployeeDetails(client,id,secret);await saveEmployeeDetails(client,id,{...old.details,...details},body.detailsRevision,secret,req.cleanupAdmin.id,fail);}
  let person=(await client.query('UPDATE users SET name=$1,first_name=$2,last_name=$3,phone=$4,birthday=$5::date,job=$6 WHERE id=$7 RETURNING *',[profile.name,profile.firstName,profile.lastName,profile.phone,profile.birthday||null,profile.job,id])).rows[0];
  if(rights){
   person=(await client.query("UPDATE users SET rights=$2::jsonb,edit_rights=$3::jsonb,permissions_configured=TRUE WHERE id=$1 AND role='employee' RETURNING *",[id,JSON.stringify(rights.rights),JSON.stringify(rights.editRights)])).rows[0];
   if(!equal(existing.rights,rights.rights)||!equal(existing.edit_rights,rights.editRights)||!existing.permissions_configured)await client.query('DELETE FROM sessions WHERE user_id=$1',[id]);
  }
  await client.query('COMMIT');res.json(publicPerson(person,true,req.cleanupAdmin.id));
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});next(e);}finally{client?.release();}});
}
