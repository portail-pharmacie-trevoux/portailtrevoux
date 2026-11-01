// Restricted staging UI entrypoint. Not enabled by the production start command.
// Explicit opt-in only after a security review; Render's server.mjs is unchanged.
import express from 'express';
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
 const users=await db.query('SELECT email,role,active FROM users');
 const demoEmails=['adjoint.demo@portailplus.invalid','preparateur.demo@portailplus.invalid','preparatrice.demo@portailplus.invalid','apprenti.demo@portailplus.invalid','rayonniste.demo@portailplus.invalid'];
 const admin=users.rows.filter(u=>u.email==='admin-test@portailplus.invalid'&&u.role==='admin'&&u.active===true);
 const others=users.rows.filter(u=>u.email!=='admin-test@portailplus.invalid');
 if(admin.length!==1||users.rows.length!==admin.length+others.length||others.length>demoEmails.length||others.some(u=>!demoEmails.includes(u.email)||u.role==='admin'||u.active!==true)||new Set(others.map(u=>u.email)).size!==others.length)throw Error('Unexpected staging accounts');
 // One-time, staging-only assignment of fictional staff roles for schedule counter tests.
 // Match both displayed identity and allowlisted demo email; never change administrator or real users.
 const demoRoles=[
   {first:'Claire',last:'DEMO',job:'Pharmacien'},
   {first:'Lucas',last:'ESSAI',job:'Pharmacien'},
   {first:'Noah',last:'EXEMPLE',job:'Préparateur'},
   {first:'Emma',last:'FICTIVE',job:'Préparatrice'},
   {first:'Léa',last:'SIMULATION',job:'Rayonniste'}
 ];
 const demoRoster=await db.query('SELECT id,email,first_name,last_name,role FROM users WHERE role<>$1',['admin']);
 if(demoRoster.rows.length!==demoRoles.length||demoRoster.rows.some(row=>!demoEmails.includes(row.email)||!demoRoles.some(p=>p.first===row.first_name&&p.last===row.last_name)))throw Error('Unexpected demo roster; no profession assignment performed');
 await db.query('CREATE TABLE IF NOT EXISTS staging_preview_setup (key TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 const setup=await db.connect();
 try{
   await setup.query('BEGIN');
   const marker=await setup.query('INSERT INTO staging_preview_setup(key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING key',['demo-professions-2026-11-01']);
   if(marker.rowCount){
     for(const p of demoRoles)await setup.query('UPDATE users SET job=$1 WHERE first_name=$2 AND last_name=$3 AND email=ANY($4::text[]) AND role<>$5',[p.job,p.first,p.last,demoEmails,'admin']);
   }
   await setup.query('COMMIT');
 }catch(error){await setup.query('ROLLBACK');throw error;}finally{setup.release();}
 // Seed one isolated demonstration template and one pending leave request, once.
 const demoSeed=await db.connect();
 try{
   await demoSeed.query('BEGIN');
   const marker=await demoSeed.query("INSERT INTO staging_preview_setup(key) VALUES ('demo-week-and-leave-2026-11-02') ON CONFLICT DO NOTHING RETURNING key");
   if(marker.rowCount){
     const roster=(await demoSeed.query('SELECT id,first_name,last_name,email FROM users WHERE role<>$1',['admin'])).rows;
     if(roster.length!==5||roster.some(p=>!demoEmails.includes(p.email)))throw Error('Unexpected demo roster');
     const content={};
     for(const p of roster){
       const weekdayPlan=p.first_name==='Claire'?[[0,'09:00','12:00'],[1,'09:00','12:00'],[2,'09:00','12:00'],[3,'09:00','12:00'],[4,'09:00','12:00']]:p.first_name==='Lucas'?[[0,'10:00','13:00'],[1,'10:00','13:00'],[2,'10:00','13:00'],[3,'10:00','13:00'],[4,'10:00','13:00']]:[[0,'09:00','12:00'],[1,'09:00','12:00'],[2,'09:00','12:00'],[3,'09:00','12:00'],[4,'09:00','12:00']];
       for(const [weekday,start,end] of weekdayPlan){
         const entry=validateTemplateDay({userId:p.id,weekday,kind:'travail',slots:[[start,end]],comments:['Semaine test fictive']});
         content[p.id+':'+weekday]=entry;
       }
     }
     await demoSeed.query('INSERT INTO schedule_templates(name,content) VALUES($1,$2::jsonb)',['semaine test',JSON.stringify(content)]);
     const requester=roster.find(p=>p.first_name==='Emma'&&p.last_name==='FICTIVE');
     if(!requester)throw Error('Missing fictional leave requester');
     await demoSeed.query("INSERT INTO leave_requests(user_id,leave_type,start_date,end_date,start_part,end_part,comment) VALUES($1,'Congés payés','2026-11-05','2026-11-05','full','full',$2)",[requester.id,'DEMANDE FICTIVE — semaine test du 2 au 8 novembre 2026. À valider par administrateur.']);
   }
   await demoSeed.query('COMMIT');
 }catch(error){await demoSeed.query('ROLLBACK');throw error;}finally{demoSeed.release();}
 // Preview entrypoint bypasses server.mjs initialize(): apply only the audited, additive Communication title migration.
 await db.query('ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS title TEXT CHECK (title IS NULL OR char_length(title)<=120)');
 const {app}=createApp(db,{origin,secret:env.APP_SECRET,dummyHash:await hashPassword(token()),mailEmail:'',googleId:'',googleSecret:'',googleEmail:'',youtrustClient:{},mailFetch:async()=>{throw Error('Mail disabled');},employeeScanFetch:async()=>{throw Error('External calls disabled');}});
 const gate=express();
 gate.disable('x-powered-by');
 gate.use(express.json({limit:'64kb'}));
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
