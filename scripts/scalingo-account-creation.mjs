// New accounts only, mounted solely in the Scalingo preview before profile routes.
import {randomUUID} from 'node:crypto';
import {validatePerson,publicPerson,normalizeName,requestedEmployeeRole} from '../collaborateurs.mjs';
import {hashPassword,passwordValid,universes} from '../security.mjs';
import {emailValid} from '../invitations.mjs';
import {validateRights} from './scalingo-universal-rights.mjs';
import {validateEmployeeDetails,saveEmployeeDetails} from '../employee-details.mjs';
import {isScalingoOrigin} from './scalingo-origins-preview.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const fields=new Set(['firstName','lastName','phone','birthday','job','active','email','password','administratorRights','rights','editRights','details','detailsRevision']);
export function registerScalingoAccountCreation({gate,db,adminAuth,secret}){
 gate.post('/api/users',(req,res,next)=>{
  const b=req.body;
  if(!b||(!b.email&&!b.password&&b.administratorRights!==true))return next('route');
  next();
 },(req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});next();},adminAuth,(req,res,next)=>{
  if(!isScalingoOrigin(req.get('origin'))||req.get('x-csrf-token')!==req.cleanupAdmin.csrf)return next(fail(403,'Origine ou CSRF invalide.'));
  next();
 },async(req,res,next)=>{let client;try{
  const body=req.body;
  if(typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!fields.has(k)))throw fail(400,'Champs de création invalides.');
  const profile=validatePerson(body,fail),role=requestedEmployeeRole(body,null,fail);
  if(!profile.active)throw fail(400,'Un nouvel accès doit être actif.');
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  if(!emailValid(email))throw fail(400,'Renseignez une adresse e-mail valide.');
  if(!passwordValid(body.password))throw fail(400,'Le mot de passe provisoire doit comporter au moins 12 caractères (256 octets maximum).');
  if(body.detailsRevision!==undefined&&body.detailsRevision!==0)throw fail(400,'Une nouvelle fiche ne peut pas remplacer une fiche existante.');
  const details=body.details===undefined?undefined:validateEmployeeDetails(body.details,fail);
  if(!Array.isArray(body.rights??[])||!Array.isArray(body.editRights??[]))throw fail(400,'Droits invalides.');
  const baseline=validateRights({rights:[...new Set([...(body.rights??[]),'Agenda','Actualités'])],editRights:[...new Set([...(body.editRights??[]),'Actualités'])]});
  const rights=role==='admin'?universes:baseline.rights,editRights=role==='admin'?universes:baseline.editRights;
  const hash=await hashPassword(body.password);
  client=await db.connect();await client.query('BEGIN');
  // Serialize checks and insert with all other writers; no changes to existing rows.
  await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
  const existing=(await client.query('SELECT id,email,first_name,last_name,name FROM users')).rows;
  if(existing.some(p=>p.email?.trim().toLowerCase()===email))throw fail(409,'Un compte utilise déjà cette adresse e-mail.');
  const identity=normalizeName(profile.name);
  if(existing.some(p=>normalizeName(p.first_name&&p.last_name?p.first_name+' '+p.last_name:p.name)===identity))throw fail(409,'Une fiche existe déjà pour cette identité. Aucun compte créé.');
  const person=(await client.query(`INSERT INTO users(name,first_name,last_name,phone,birthday,job,active,email,password_hash,role,must_change,rights,edit_rights,permissions_configured,directory_key)
   VALUES($1,$2,$3,$4,$5::date,$6,TRUE,$7,$8,$9,TRUE,$10::jsonb,$11::jsonb,TRUE,$12) RETURNING *`,[profile.name,profile.firstName,profile.lastName,profile.phone,profile.birthday||null,profile.job,email,hash,role,JSON.stringify(rights),JSON.stringify(editRights),'scalingo-manual:'+randomUUID()])).rows[0];
  if(details!==undefined)await saveEmployeeDetails(client,person.id,details,0,secret,req.cleanupAdmin.id,fail);
  await client.query('COMMIT');res.status(201).json({...publicPerson(person,true,req.cleanupAdmin.id),temporaryPasswordRequired:true});
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});next(e.code==='23505'?fail(409,'Un compte existe déjà. Aucun doublon créé.'):e.status?e:fail(503,'Création indisponible. Aucun accès confirmé.'));}finally{client?.release();}});
}
// Delegate to existing password verification, session revocation and rotation.
export function registerScalingoPasswordChange(gate,app){gate.post('/api/password',(req,res,next)=>req.path==='/api/password'?app(req,res,next):next());}
