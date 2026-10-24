import {randomUUID} from 'node:crypto';
import {token,digest,hashPassword,verifyPassword,passwordValid} from './security.mjs';
const emailValid=value=>typeof value==='string'&&value.length<=254&&/^[^\s<>"\r\n]+@[^\s<>"\r\n]+\.[^\s<>"\r\n]+$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function registerTesterAccess({app,db,auth,ready,admin,csrf,fail,secure}){
 const cookie='portail_demo_session',options={httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:8*60*60*1000};
 const clean=row=>({id:'tester:'+row.id,name:row.name,role:'tester',mustChange:row.must_change,rights:[],expiresAt:row.access_expires_at});
 const session=async(row,res)=>{const raw=token(),csrfToken=token();await db.query("INSERT INTO portal_tester_sessions(id,tester_id,csrf,expires_at) VALUES($1,$2,$3,LEAST(now()+interval '8 hours',$4::timestamptz))",[digest(raw),row.id,csrfToken,row.access_expires_at]);res.clearCookie('trevoux_session',{path:'/',httpOnly:true,secure,sameSite:'lax'});res.cookie(cookie,raw,options);return{user:clean(row),csrf:csrfToken};};
 app.use(async(req,res,next)=>{
  if(!req.auth){const raw=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookie+'='))?.slice(cookie.length+1);if(raw&&/^[\w-]{43}$/.test(raw)){const row=(await db.query('SELECT t.*,s.id AS demo_session_id,s.csrf FROM portal_tester_sessions s JOIN portal_testers t ON t.id=s.tester_id WHERE s.id=$1 AND s.expires_at>now() AND t.access_expires_at>now() AND t.active=TRUE',[digest(raw)])).rows[0];if(row)req.auth={...row,role:'tester'};}}
  if(req.auth?.role!=='tester')return next();
  const user=req.auth;
  if(req.path==='/api/me'&&req.method==='GET')return res.json({user:clean(user),csrf:user.csrf});
  if(req.path==='/api/login'&&req.method==='POST')return next();
  if(req.path==='/api/logout'&&req.method==='POST'){if(req.get('x-csrf-token')!==user.csrf)throw fail(403,'Session à actualiser.');await db.query('DELETE FROM portal_tester_sessions WHERE id=$1',[user.demo_session_id]);res.clearCookie(cookie,{...options,maxAge:undefined});return res.json({ok:true});}
  if(req.path==='/api/password'&&req.method==='POST'){if(req.get('x-csrf-token')!==user.csrf)throw fail(403,'Session à actualiser.');if(!passwordValid(req.body.password)||req.body.password===req.body.currentPassword)throw fail(400,'Choisissez un nouveau mot de passe de 12 caractères minimum.');if(!await verifyPassword(req.body.currentPassword,user.password_hash))throw fail(400,'Mot de passe actuel incorrect.');const passwordHash=await hashPassword(req.body.password);await db.query('UPDATE portal_testers SET password_hash=$2,must_change=FALSE WHERE id=$1',[user.id,passwordHash]);await db.query('DELETE FROM portal_tester_sessions WHERE tester_id=$1',[user.id]);return res.json(await session({...user,password_hash:passwordHash,must_change:false},res));}
  if(req.path.startsWith('/api')||req.path.startsWith('/auth'))throw fail(403,'Profil testeur : seules les données fictives de démonstration sont accessibles.');
  next();
 });
 app.get('/api/testers',auth,ready,admin,async(req,res)=>res.json({testers:(await db.query('SELECT id,name,email,active,access_expires_at,created_at FROM portal_testers ORDER BY created_at DESC')).rows}));
 app.post('/api/testers',auth,ready,admin,csrf,async(req,res)=>{
  const b=req.body,email=typeof b.email==='string'?b.email.trim().toLowerCase():'';if(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>120||!emailValid(email)||!Number.isInteger(b.days)||b.days<1||b.days>30)throw fail(400,'Renseignez un nom, une adresse e-mail et une durée de 1 à 30 jours.');
  if((await db.query('SELECT id FROM users WHERE lower(email)=$1',[email])).rows[0])throw fail(409,'Cette adresse correspond déjà à un collaborateur. Choisissez une adresse externe.');
  const password=token().slice(0,20)+'aA1!',hash=await hashPassword(password),id=randomUUID();
  const row=(await db.query("INSERT INTO portal_testers(id,name,email,password_hash,access_expires_at,created_by) VALUES($1,$2,$3,$4,now()+$5*interval '1 day',$6) RETURNING id,name,email,active,access_expires_at",[id,b.name.trim(),email,hash,b.days,req.auth.id])).rows[0];res.status(201).json({tester:row,temporaryPassword:password});
 });
 app.post('/api/testers/:id/revoke',auth,ready,admin,csrf,async(req,res)=>{if(!uuid(req.params.id))throw fail(400,'Profil invalide.');const row=(await db.query('UPDATE portal_testers SET active=FALSE WHERE id=$1 RETURNING id',[req.params.id])).rows[0];if(!row)throw fail(404,'Profil introuvable.');await db.query('DELETE FROM portal_tester_sessions WHERE tester_id=$1',[req.params.id]);res.json({ok:true});});
 app.post('/api/testers/:id/renew',auth,ready,admin,csrf,async(req,res)=>{if(!uuid(req.params.id)||!Number.isInteger(req.body.days)||req.body.days<1||req.body.days>30)throw fail(400,'Choisissez une durée de 1 à 30 jours.');const password=token().slice(0,20)+'aA1!',hash=await hashPassword(password);const row=(await db.query("UPDATE portal_testers SET active=TRUE,password_hash=$2,must_change=TRUE,access_expires_at=now()+$3*interval '1 day' WHERE id=$1 RETURNING id,name,email,active,access_expires_at",[req.params.id,hash,req.body.days])).rows[0];if(!row)throw fail(404,'Profil introuvable.');await db.query('DELETE FROM portal_tester_sessions WHERE tester_id=$1',[req.params.id]);res.json({tester:row,temporaryPassword:password});});
 return {login:async(email,password,res)=>{const row=(await db.query('SELECT * FROM portal_testers WHERE email=$1',[email])).rows[0];if(!row)return null;const valid=await verifyPassword(password,row.password_hash);if(!valid||!row.active||new Date(row.access_expires_at)<=new Date())return null;return session(row,res);}};
}
