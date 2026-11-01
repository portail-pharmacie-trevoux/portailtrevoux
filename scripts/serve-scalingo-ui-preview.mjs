// Restricted staging UI entrypoint. Not enabled by the production start command.
// Explicit opt-in only after a security review; Render's server.mjs is unchanged.
import express from 'express';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {digest} from '../security.mjs';
const execFileAsync=promisify(execFile);
import pg from 'pg';
import {createApp} from '../server.mjs';
import {hashPassword,token} from '../security.mjs';
import {validateTemplateDay} from '../schedule-templates.mjs';
const env=process.env;
const origin='https://portailplus-hds.osc-fr1.scalingo.io';
if(env.SCALINGO_PREVIEW_SAFE_MODE!=='true'||env.SCALINGO_PREVIEW_UI_ENABLED!=='true')throw Error('Explicit safe UI preview opt-in required');
if(env.SCALINGO_REQUIRE_DB_TLS!=='true'||env.SCALINGO_ENABLE_BUSINESS_STARTUP==='true'||env.SCALINGO_ENABLE_SCHEDULED_JOBS==='true')throw Error('Unsafe staging configuration');
if(env.APP_URL!==origin||!env.APP_SECRET||env.APP_SECRET.length<32||!env.DATABASE_URL)throw Error('Staging URL, secret or DB missing');
const blockedIntegrations=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_ACCOUNT_EMAIL','MAIL_SENDER_EMAIL','YOUTRUST_API_KEY','OPENAI_API_KEY','SERPAPI_KEY','ADMIN_PASSWORD','PROCEDURES_IMPORT_JSON','PROCEDURE_FILES_IMPORT_JSON','LABORATORIES_IMPORT_JSON','LABORATORY_LOGOS_IMPORT_JSON'];
if(blockedIntegrations.some(name=>env[name]))throw Error('External integration configured; staging preview refused');
const url=new URL(env.DATABASE_URL);
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
const db=new pg.Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true},max:3});
try{
 const result=await db.query("SELECT current_database() AS name,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls");
 if(result.rows[0]?.name!=='portailplus_7495'||result.rows[0]?.tls!==true)throw Error('Unexpected database or insecure connection');
 // Staging accounts may now be imported from Render; never recreate demo identities.
 const demoEmails=['adjoint.demo@portailplus.invalid','preparateur.demo@portailplus.invalid','preparatrice.demo@portailplus.invalid','apprenti.demo@portailplus.invalid','rayonniste.demo@portailplus.invalid'];
 const users=await db.query('SELECT email,role,active FROM users');
 const admin=users.rows.filter(u=>u.email==='admin-test@portailplus.invalid'&&u.role==='admin'&&u.active===true);
 if(admin.length!==1)throw Error('Expected staging administrator missing');
 // The former demo-only roster and template seed have been permanently disabled.
 // Real collaborators remain unable to authenticate until separately configured.
 // Preview entrypoint bypasses server.mjs initialize(): apply only the audited, additive Communication title migration.
 await db.query('ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS title TEXT CHECK (title IS NULL OR char_length(title)<=120)');
 const {app}=createApp(db,{origin,secret:env.APP_SECRET,dummyHash:await hashPassword(token()),mailEmail:'',googleId:'',googleSecret:'',googleEmail:'',youtrustClient:{},mailFetch:async()=>{throw Error('Mail disabled');},employeeScanFetch:async()=>{throw Error('External calls disabled');}});
 const gate=express();
 gate.disable('x-powered-by');
 gate.use(express.json({limit:'64kb'}));
 // One-time cleanup control: restricted to the exact staging admin and origin.
 // The purge subprocess independently checks the database, account roster and TLS.
 const cleanupAuth=async(req,res,next)=>{
   try{
     const raw=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('trevoux_session='))?.slice(16);
     if(!raw||!/^[\w-]{43}$/.test(raw))return res.status(401).send('Connexion administrateur requise.');
     const row=(await db.query('SELECT u.id,u.email,u.role,u.active,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>now()',[digest(raw)])).rows[0];
     if(!row||row.email!=='admin-test@portailplus.invalid'||row.role!=='admin'||!row.active)return res.status(403).send('Administrateur TEST uniquement.');
     req.cleanupAdmin=row;next();
   }catch(e){next(e);}
 };
 gate.get('/staging-demo-cleanup',cleanupAuth,(req,res)=>{
   res.set('Cache-Control','no-store').type('html').send(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Nettoyage Scalingo</title><body style="font:16px system-ui;max-width:680px;margin:4rem auto;padding:1rem"><h1>Nettoyage des cinq comptes fictifs</h1><p>Environnement : Scalingo uniquement. Administrateur TEST conservé. Sauvegarde préalable obligatoire.</p><p>Effectuez d'abord la simulation, puis la purge après vérification.</p><form method="post" action="/api/staging-demo-cleanup"><input type="hidden" name="csrf" value="${req.cleanupAdmin.csrf}"><button name="mode" value="check" formnovalidate>1. Vérifier sans supprimer</button><hr><label><input type="checkbox" name="backup" value="confirmed" required> Je confirme que la sauvegarde manuelle Scalingo est réussie.</label><p><label>Saisir SUPPRIMER LES CINQ COMPTES : <input name="confirmation" autocomplete="off"></label></p><button name="mode" value="execute">2. Supprimer définitivement</button></form></body></html>`);
 });
 gate.post('/api/staging-demo-cleanup',express.urlencoded({extended:false,limit:'2kb'}),cleanupAuth,async(req,res)=>{
   if(req.get('origin')!==origin||req.body.csrf!==req.cleanupAdmin.csrf)return res.status(403).send('Origine ou session invalide.');
   const execute=req.body.mode==='execute';
   if(!execute&&req.body.mode!=='check')return res.status(400).send('Mode inconnu.');
   if(execute&&(req.body.backup!=='confirmed'||req.body.confirmation!=='SUPPRIMER LES CINQ COMPTES'))return res.status(400).send('Confirmation incomplète.');
   try{
     const args=['scripts/purge-scalingo-demo-users.mjs',...(execute?['--execute']:[])];
     const result=await execFileAsync(process.execPath,args,{cwd:process.cwd(),env:process.env,timeout:30000,maxBuffer:100000});
     res.set('Cache-Control','no-store').type('text/plain').send(result.stdout+'\\n'+result.stderr);
   }catch(e){res.status(409).type('text/plain').send('Opération refusée ou annulée : '+(e.stdout||'')+' '+(e.stderr||e.message));}
 });
 gate.use(async(req,res,next)=>{try{
   const api=req.path.startsWith('/api/')||req.path==='/api';
   const permittedApi=(req.method==='POST'&&['/api/login','/api/logout'].includes(req.path))||(req.method==='GET'&&['/api/me','/api/calendar','/api/google/status','/api/users','/api/schedule','/api/schedule-posts','/api/schedule-templates','/api/leave-requests','/api/news/recipients','/api/news','/api/news/sent','/api/procedures','/api/hr/documents','/api/hr/signatures','/api/laboratories','/api/laboratories/responsibles','/api/quality/services','/api/merchandising','/api/merchandising/plan','/api/merchandising/impact','/api/merchandising/promotions','/api/merchandising/documents','/api/challenges','/api/challenges/options','/api/quality/errors','/api/quality/temperatures','/api/quality/tiers-payant'].includes(req.path));
   if(req.method==='GET'&&/^\/api\/users\/\d+\/details$/.test(req.path)){
     const id=Number(req.path.split('/')[3]);
     const person=(await db.query('SELECT email,role FROM users WHERE id=$1',[id])).rows[0];
     if(!person||!demoEmails.includes(person.email)||person.role==='admin')return res.status(403).json({error:'Fiche non disponible dans la prévisualisation.'});
     return next();
   }
   if(req.method==='GET'&&/^\/api\/schedule-templates\/\d+$/.test(req.path))return next();
   if(req.method==='GET'&&/^\/api\/leave-requests\/\d+\/preview$/.test(req.path))return next();
   if(req.method==='POST'&&/^\/api\/leave-requests\/\d+\/review$/.test(req.path)){
     const id=Number(req.path.split('/')[3]);
     const row=(await db.query("SELECT l.id,u.email,l.start_date::text AS start_date,l.end_date::text AS end_date,l.comment FROM leave_requests l JOIN users u ON u.id=l.user_id WHERE l.id=$1",[id])).rows[0];
     if(!row||!demoEmails.includes(row.email)||row.start_date!=='2026-11-05'||row.end_date!=='2026-11-05'||!row.comment.includes('DEMANDE FICTIVE'))return res.status(403).json({error:'Validation réservée à la demande de congé fictive.'});
     return next();
   }
   // Staging-only: permit cancellation of the single approved fictional leave.
   if(req.method==='POST'&&/^\/api\/leave-requests\/\d+\/cancel-approved$/.test(req.path)){
     const id=Number(req.path.split('/')[3]);
     const row=(await db.query("SELECT l.id,l.status,u.email,l.start_date::text AS start_date,l.end_date::text AS end_date,l.comment FROM leave_requests l JOIN users u ON u.id=l.user_id WHERE l.id=$1",[id])).rows[0];
     if(!row||row.status!=='approved'||!demoEmails.includes(row.email)||row.start_date!=='2026-11-05'||row.end_date!=='2026-11-05'||!row.comment.includes('DEMANDE FICTIVE'))return res.status(403).json({error:'Annulation réservée au congé fictif validé.'});
     return next();
   }
   // Staging-only demo profession editing: never permit arbitrary user/profile writes.
   if(req.method==='PUT'&&/^\/api\/users\/\d+$/.test(req.path)){
     const id=Number(req.path.split('/').pop());
     const person=(await db.query('SELECT * FROM users WHERE id=$1',[id])).rows[0];
     if(!person||!demoEmails.includes(person.email)||person.role==='admin')return res.status(403).json({error:'Modification réservée aux collaborateurs fictifs.'});
     const body=req.body||{};
     const same=(key,current)=>body[key]===undefined||body[key]===current;
     if(!same('firstName',person.first_name)||!same('lastName',person.last_name)||!same('phone',person.phone||'')||!same('birthday',person.birthday instanceof Date?person.birthday.toISOString().slice(0,10):person.birthday||'')||!same('active',person.active)||!same('email',person.email)||body.details!==undefined||(body.password!==undefined&&body.password!=='')||body.administratorRights!==undefined||(body.rights!==undefined&&(!Array.isArray(body.rights)||JSON.stringify([...body.rights].sort())!==JSON.stringify([...(person.rights||[])].sort())))||body.editRights!==undefined||typeof body.job!=='string'||!['Pharmacien','Préparateur','Préparatrice','Apprenti','Apprentie','Rayonniste'].includes(body.job))return res.status(403).json({error:'Seule la fonction professionnelle fictive peut être modifiée sur cet environnement.'});
     return next();
   }
   // Allow administrators to create fictional work posts (e.g. Comptoir) in isolated staging.
   if(req.method==='POST'&&req.path==='/api/schedule-posts')return next();
   // Allow applying only the seeded demonstration template to the isolated 2026-11-02 draft.
   if(req.method==='POST'&&req.path==='/api/schedule/2026-11-02/apply-template'){
     const templateId=req.body?.templateId;
     const template=Number.isSafeInteger(templateId)?(await db.query('SELECT id,name FROM schedule_templates WHERE id=$1',[templateId])).rows[0]:null;
     if(!template||template.name!=='semaine test')return res.status(403).json({error:'Seule la semaine type fictive est autorisée.'});
     return next();
   }
   // Phase 2 schedule: allow editing and clearing a single fictional employee day only.
   // Publishing, copying, locking, templates and real employee management remain blocked.
   if(req.method==='PUT'&&/^\/api\/schedule\/\d{4}-\d{2}-\d{2}\/day$/.test(req.path))return next();
   if(req.method==='POST'&&/^\/api\/schedule\/\d{4}-\d{2}-\d{2}\/clear-day$/.test(req.path))return next();
   // Phase 2 laboratory edit: exact record endpoint only; app auth, CSRF and revision checks apply.
   if(req.method==='PUT'&&/^\/api\/laboratories\/\d+$/.test(req.path))return next();
   // Demo laboratory creation; emails and document operations remain blocked.
   if(req.method==='POST'&&req.path==='/api/laboratories')return next();
   // Phase 2 Communication: plain-text demo messages and recipient read/archive only.
   if(req.method==='POST'&&req.path==='/api/news'){
     if(req.body?.attachment||req.body?.replyTo!=null)return res.status(403).json({error:'Pièces jointes et réponses désactivées dans la prévisualisation.'});
     return next();
   }
   if(req.method==='PATCH'&&/^\/api\/news\/\d+$/.test(req.path))return next();
   // Phase 2 challenges: permit only creation and editing of demo challenge records.
   // PDF uploads, report confirmation, emailing and all other writes remain blocked.
   if((req.method==='POST'&&req.path==='/api/challenges')||(req.method==='PUT'&&/^\/api\/challenges\/\d+$/.test(req.path)))return next();
   // Phase 2: promotion records only. App role checks, CSRF, revisions and DB guards remain active.
   if((req.method==='POST'&&req.path==='/api/merchandising/promotions')||(['PUT','DELETE'].includes(req.method)&&/^\/api\/merchandising\/promotions\/\d+$/.test(req.path))||(req.method==='PUT'&&/^\/api\/merchandising\/promotions\/\d+\/assignment$/.test(req.path)))return next();
   // Phase 2 pilot: only local personal demo tasks; existing app auth and CSRF still apply.
   if(['POST','PUT','DELETE'].includes(req.method)&&(/^\/api\/calendar\/tasks$/.test(req.path)&&req.method==='POST'||/^\/api\/calendar\/tasks\/\d+$/.test(req.path)&&['PUT','DELETE'].includes(req.method)))return next();
   if(req.method==='GET'&&/^\/api\/merchandising\/promotions\/\d+\/documents$/.test(req.path))return next();
   if(api&&!permittedApi)return res.status(403).json({error:`Fonction désactivée dans la prévisualisation (${req.method} ${req.path}).`});
   if(!api&&!['GET','HEAD'].includes(req.method))return res.status(403).type('text/plain').send('Action non disponible.');
   next();
 }catch(error){next(error);}});

 gate.use(app);
 const server=gate.listen(Number(env.PORT)||3000,env.SCALINGO_PREVIEW_BIND_HOST==='127.0.0.1'?'127.0.0.1':'0.0.0.0',()=>console.log('Prévisualisation Portail+ restreinte active.'));
 process.on('SIGTERM',()=>server.close(()=>db.end()));
}catch(err){await db.end();throw err;}
