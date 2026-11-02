// Scalingo-only profile editing. Never dispatch writes to the general account
// management endpoint: credentials, activation, role and invitations stay locked.
import {publicPerson,validatePerson} from '../collaborateurs.mjs';
import {readEmployeeDetails,saveEmployeeDetails,validateEmployeeDetails} from '../employee-details.mjs';
import {validateRights} from './scalingo-universal-rights.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const fields=new Set(['firstName','lastName','phone','birthday','job','active','email','password','administratorRights','rights','editRights','details','detailsRevision']);
const equal=(a,b)=>JSON.stringify([...new Set(a||[])].sort())===JSON.stringify([...new Set(b||[])].sort());
const idOf=req=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1||id>2147483647)throw fail(400,'Profil invalide.');return id;};
export function registerScalingoEmployeeRecords({gate,db,adminAuth,origin,secret}){
 const privacy=(req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});next();};
 const write=(req,res,next)=>req.get('origin')===origin&&req.get('x-csrf-token')===req.cleanupAdmin.csrf?next():next(fail(403,'Origine ou CSRF invalide.'));
 gate.get('/api/users/:id/details',privacy,adminAuth,async(req,res,next)=>{try{
  const id=idOf(req),person=(await db.query('SELECT * FROM users WHERE id=$1',[id])).rows[0];if(!person)throw fail(404,'Collaborateur introuvable.');
  res.json({person:publicPerson(person,true,req.cleanupAdmin.id),...await readEmployeeDetails(db,id,secret),previewRestrictions:{accountReadOnly:true,profileReadOnly:person.role==='admin'}});
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
