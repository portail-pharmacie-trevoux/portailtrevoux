// Restricted staging UI entrypoint. Not enabled by the production start command.
// Explicit opt-in only after a security review; Render's server.mjs is unchanged.
import express from 'express';
import pg from 'pg';
import {createApp} from '../server.mjs';
import {hashPassword,token} from '../security.mjs';
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
 if(users.rows.length!==1||users.rows[0].email!=='admin-test@portailplus.invalid'||users.rows[0].role!=='admin'||users.rows[0].active!==true)throw Error('Only fictitious admin is allowed');
 const {app}=createApp(db,{origin,secret:env.APP_SECRET,dummyHash:await hashPassword(token()),mailEmail:'',googleId:'',googleSecret:'',googleEmail:'',youtrustClient:{},mailFetch:async()=>{throw Error('Mail disabled');},employeeScanFetch:async()=>{throw Error('External calls disabled');}});
 const gate=express();
 gate.disable('x-powered-by');
 gate.use((req,res,next)=>{
   const api=req.path.startsWith('/api/')||req.path==='/api';
   const permittedApi=(req.method==='POST'&&['/api/login','/api/logout'].includes(req.path))||(req.method==='GET'&&req.path==='/api/me');
   if(api&&!permittedApi)return res.status(403).json({error:'Fonction désactivée dans la prévisualisation.'});
   if(!api&&!['GET','HEAD'].includes(req.method))return res.status(403).type('text/plain').send('Action non disponible.');
   next();
 });
 gate.use(app);
 const server=gate.listen(Number(env.PORT)||3000,env.SCALINGO_PREVIEW_BIND_HOST==='127.0.0.1'?'127.0.0.1':'0.0.0.0',()=>console.log('Prévisualisation Portail+ restreinte active.'));
 process.on('SIGTERM',()=>server.close(()=>db.end()));
}catch(err){await db.end();throw err;}
