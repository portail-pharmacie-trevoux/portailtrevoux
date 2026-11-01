// Mounted only by the opt-in Scalingo preview, never by server.mjs.
import {digest, universes, canModify, canAccess} from '../security.mjs';
export const universalReads=['Agenda','Actualités','Fun','Emplois du temps','Collaborateurs','Laboratoires','Challenges','Formations','Contacts utiles','Ressources humaines','Procédures',"Outils d'aide au merchandising","Outils d'aide à la démarche qualité"];
export const universalEdits=['Agenda','Actualités','Fun'];
const protectedEdits=['Emplois du temps','Collaborateurs','Ressources humaines'];
const sorted=a=>[...new Set(a||[])].sort();
const equal=(a,b)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
const fail=(status,message)=>Object.assign(Error(message),{status});
export function scalingoTestAdminAuth(db){return async(req,res,next)=>{try{
 const raw=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('trevoux_session='))?.slice(16);
 if(!raw||! /^[\w-]{43}$/.test(raw))throw fail(401,'Connexion administrateur requise.');
 const row=(await db.query('SELECT u.id,u.email,u.role,u.active,u.must_change,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>now()',[digest(raw)])).rows[0];
 if(!row||row.email!=='admin-test@portailplus.invalid'||row.role!=='admin'||!row.active||row.must_change)throw fail(403,'Administrateur TEST uniquement, mot de passe personnel requis.');
 req.cleanupAdmin=row;next();
 }catch(e){next(e);}};}
export function validateRights(body){
 if(!body||Object.keys(body).some(k=>!['rights','editRights'].includes(k)))throw fail(400,'Seuls les droits peuvent être modifiés ici. Utilisez Administration des droits Scalingo.');
 const {rights,editRights}=body;
 if(!Array.isArray(rights)||!Array.isArray(editRights)||rights.length>universes.length||editRights.length>universes.length||rights.some(x=>!universes.includes(x))||editRights.some(x=>!universes.includes(x)||!rights.includes(x)||protectedEdits.includes(x)))throw fail(400,'Droits invalides : consultation requise, planning, collaborateurs et documents RH réservés aux administrateurs.');
 return {rights:sorted(rights),editRights:sorted(editRights)};
}
export function rightsPreview(rows){
 const employees=rows.filter(p=>p.role==='employee');
 if(employees.length!==16||employees.some(p=>!p.active))throw fail(409,'Les 16 collaborateurs actifs attendus doivent être présents. Aucun changement effectué.');
 const people=employees.map(p=>{
  const current={rights:sorted(p.rights),editRights:sorted(p.edit_rights)};
  const unchanged=p.permissions_configured&&equal(p.rights,universalReads)&&equal(p.edit_rights,universalEdits);
  // Any explicit configuration or non-baseline grant needs individual review.
  const specific=!unchanged&&(p.permissions_configured||current.editRights.some(x=>!universalEdits.includes(x))||current.rights.some(x=>!universalReads.includes(x)));
  return {id:p.id,name:p.name,current,configured:!!p.permissions_configured,status:unchanged?'inchangé':specific?'droits spécifiques conservés':'à appliquer',proposed:specific?current:{rights:universalReads,editRights:universalEdits}};
 }).sort((a,b)=>a.id-b.id);
 return {people,fingerprint:digest(JSON.stringify(people))};
}
export function backupReady(env,now=Date.now()){
 const at=Date.parse(env.SCALINGO_RIGHTS_BACKUP_VERIFIED_AT||'');
 return !!env.SCALINGO_RIGHTS_BACKUP_REFERENCE?.trim()&&Number.isFinite(at)&&at<=now&&now-at<24*3600000;
}
// Extra boundary for modules whose historic write guards only checked consultation.
export function scalingoUniverseBoundary(db){
 const prefixes=[['/api/calendar','Agenda'],['/api/schedule','Emplois du temps'],['/api/schedule-posts','Emplois du temps'],['/api/schedule-templates','Emplois du temps'],['/api/laboratories','Laboratoires'],['/api/merchandising',"Outils d'aide au merchandising"],['/api/challenges','Challenges'],['/api/procedures','Procédures'],['/api/training','Formations'],['/api/contacts','Contacts utiles'],['/api/quality',"Outils d'aide à la démarche qualité"],['/api/music','Fun']];
 return async(req,res,next)=>{try{
  const universe=prefixes.find(([prefix])=>req.path===prefix||req.path.startsWith(prefix+'/'))?.[1];
  if(!universe)return next();
  const raw=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('trevoux_session='))?.slice(16);
  if(!raw||! /^[\w-]{43}$/.test(raw))throw fail(401,'Connectez-vous pour continuer.');
  const user=(await db.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>now() AND u.active=TRUE',[digest(raw)])).rows[0];
  if(!user)throw fail(401,'Connectez-vous pour continuer.');
  if(user.must_change)throw fail(403,'Changez votre mot de passe provisoire.');
  if(!canAccess(user,universe)||(!['GET','HEAD'].includes(req.method)&&!canModify(user,universe)))throw fail(403,'Cet univers est en consultation seule ou inaccessible.');
  next();
 }catch(e){next(e);}};
}
export function registerScalingoRights({gate,db,adminAuth,origin,env}){
 const write=(req,res,next)=>{
  if(req.get('origin')!==origin||req.get('x-csrf-token')!==req.cleanupAdmin.csrf)return next(fail(403,'Origine ou CSRF invalide.'));
  if(!backupReady(env))return next(fail(409,'Sauvegarde Scalingo récente non vérifiée : renseignez sa référence et la date de vérification après contrôle de sa réussite.'));
  next();
 };
 const roster=client=>client.query('SELECT id,name,role,active,rights,edit_rights,permissions_configured FROM users ORDER BY id FOR UPDATE');
 async function transaction(work){const client=await db.connect();try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
 async function save(client,id,rights,editRights){
  await client.query("UPDATE users SET rights=$2::jsonb,edit_rights=$3::jsonb,permissions_configured=TRUE WHERE id=$1 AND role='employee'",[id,JSON.stringify(rights),JSON.stringify(editRights)]);
  await client.query('DELETE FROM sessions WHERE user_id=$1',[id]);
 }
 gate.get('/api/staging-universal-rights',adminAuth,async(req,res,next)=>{try{
  const rows=(await db.query('SELECT id,name,role,active,rights,edit_rights,permissions_configured FROM users ORDER BY id')).rows;
  res.set('Cache-Control','no-store').json({...rightsPreview(rows),csrf:req.cleanupAdmin.csrf,universes,universalReads,universalEdits,backupReady:backupReady(env)});
 }catch(e){next(e);}});
 gate.post('/api/staging-universal-rights',adminAuth,write,async(req,res,next)=>{try{
  if(req.body?.confirmation!=='APPLIQUER LES DROITS UNIVERSELS')throw fail(400,'Confirmation requise.');
  const result=await transaction(async client=>{
   const preview=rightsPreview((await roster(client)).rows);
   if(req.body.fingerprint!==preview.fingerprint)throw fail(409,'Les droits ont changé. Rechargez l’aperçu avant confirmation.');
   const changed=preview.people.filter(p=>p.status==='à appliquer');
   for(const p of changed)await save(client,p.id,universalReads,universalEdits);
   return {updated:changed.length,preserved:preview.people.filter(p=>p.status==='droits spécifiques conservés').map(p=>p.id)};
  });res.json(result);
 }catch(e){next(e);}});
 // Handle permission-only PUTs here. No profile, role, password, invitation or email writes.
 gate.put('/api/users/:id',adminAuth,write,async(req,res,next)=>{try{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Profil invalide.');
  const rights=validateRights(req.body);
  await transaction(async client=>{
   const person=(await client.query('SELECT id,role FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!person||person.role!=='employee')throw fail(403,'Compte administrateur protégé ou collaborateur introuvable.');
   await save(client,id,rights.rights,rights.editRights);
  });res.json({ok:true});
 }catch(e){next(e);}});
 gate.get('/staging-universal-rights',adminAuth,(req,res)=>res.set({'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'X-Content-Type-Options':'nosniff'}).type('html').send(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Droits universels Scalingo</title><body><h1>Administration des droits Scalingo</h1><p>Consultation des 13 univers ; modification Agenda, Communication et Fun. Les permissions spécifiques sont signalées et conservées. Les documents RH restent privés. La proposition d’opérations merchandising sera une permission distincte ultérieure.</p><p>Une sauvegarde réussie vérifiée depuis moins de 24 heures est obligatoire. Aucun envoi de courriel ou d’invitation.</p><p id="status" role="status"></p><div id="preview"></div><label>Saisir APPLIQUER LES DROITS UNIVERSELS <input id="confirmation" autocomplete="off"></label><button id="apply" disabled>Appliquer les droits universels</button><p><a href="/">Retour au portail</a></p><script src="/scalingo-rights.js" defer></script></body></html>`));
}
