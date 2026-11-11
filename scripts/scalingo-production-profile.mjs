// Opt-in production preparation. No initialize(), DDL, import, purge, timer or account creation.
import express from 'express';
import {createApp} from '../server.mjs';
import {hashPassword,token} from '../security.mjs';
import {scalingoAllowedOrigins} from './scalingo-origins-preview.mjs';
import {scalingoHomepage,registerScalingoRetiredCalculations} from './scalingo-retired-calculations-preview.mjs';
import {registerScalingoWwwRedirect} from './scalingo-www-redirect.mjs';
import {registerScalingoTrevouxEntry} from './scalingo-trevoux-entry-preview.mjs';
import {scalingoAdminAuth,scalingoUniverseBoundary} from './scalingo-universal-rights.mjs';
import {registerScalingoEmployeeRecords} from './scalingo-employee-records-preview.mjs';
import {registerScalingoAccountManagement} from './scalingo-accounts-preview.mjs';
import {createWebProductSearch} from '../merchandising-web-identity.mjs';
const refusal=(code,message=code)=>Object.assign(Error(message),{status:409,code});
export function productionCapabilities(env){
 const approved=env.SCALINGO_EXTERNAL_SERVICES_APPROVED==='true',flag=name=>approved&&env[name]==='true';
 return Object.freeze({calendar:env.SCALINGO_ENABLE_GOOGLE_CALENDAR==='true',mailOAuth:flag('SCALINGO_ENABLE_MAIL_OAUTH'),mailDelivery:flag('SCALINGO_ENABLE_MAIL_DELIVERY'),youtube:flag('SCALINGO_ENABLE_YOUTUBE'),signatures:flag('SCALINGO_ENABLE_SIGNATURES'),analysis:flag('SCALINGO_ENABLE_AI_ANALYSIS'),productWeb:flag('SCALINGO_ENABLE_PRODUCT_WEB')});
}
export function productionConfig(env,adapters={}){
 const origin=env.APP_URL;if(!scalingoAllowedOrigins.includes(origin)||origin==='https://portailplus-officine.fr')throw refusal('APPROVED_CANONICAL_ORIGIN_REQUIRED');
 if(!env.APP_SECRET||env.APP_SECRET.length<32)throw refusal('SCALINGO_APP_SECRET_REQUIRED');
 if(env.SCALINGO_ENABLE_BUSINESS_STARTUP==='true')throw refusal('BUSINESS_STARTUP_SEED_FORBIDDEN');
 if(env.SCALINGO_ENABLE_SCHEDULED_JOBS==='true')throw refusal('PRODUCTION_SCHEDULER_NOT_RELEASED');
 const capabilities=productionCapabilities(env),transport=adapters.fetch||fetch;
 const permit=(enabled,allowed)=>async(url,options={})=>{
  const u=new URL(String(url)),method=options.method||'GET';
  if(!enabled||u.protocol!=='https:'||u.username||u.password||!allowed(u,method))throw refusal('EXTERNAL_SERVICE_NOT_APPROVED','Service externe non autorisé sur Scalingo.');
  return transport(url,{...options,redirect:'error'});
 };
 const oauthDomain=u=>['oauth2.googleapis.com','openidconnect.googleapis.com'].includes(u.hostname);
 const calendarFetch=permit(capabilities.calendar,(u,method)=>oauthDomain(u)||u.hostname==='www.googleapis.com'&&u.pathname.startsWith('/calendar/v3/')&&method==='GET');
 const oauthFetch=permit(capabilities.calendar||capabilities.mailOAuth||capabilities.youtube,oauthDomain);
 const mailFetch=permit(capabilities.mailOAuth||capabilities.mailDelivery,(u,method)=>oauthDomain(u)||capabilities.mailDelivery&&u.hostname==='gmail.googleapis.com'&&u.pathname==='/gmail/v1/users/me/messages/send'&&method==='POST');
 const youtubeFetch=permit(capabilities.youtube,(u,method)=>oauthDomain(u)||u.hostname==='www.googleapis.com'&&u.pathname.startsWith('/youtube/v3/'));
 const analysisFetch=permit(capabilities.analysis||capabilities.productWeb,u=>u.hostname==='api.openai.com');
 const youtrustFetch=permit(capabilities.signatures,u=>['api.yousign.app','api-sandbox.yousign.app'].includes(u.hostname));
 const config={origin,allowedOrigins:scalingoAllowedOrigins,secret:env.APP_SECRET,homepageHTML:scalingoHomepage(),scalingoChallengeDeletion:true,procedureAdminManagement:true,employeeAccountsReadOnly:true,scalingoEmployeeLifecycle:true,scalingoAccountCreation:true,scalingoAccountManagement:true,employeeImportConsentRequired:true,invitationSendingEnabled:capabilities.mailDelivery,messageAutomationAdminEnabled:true,trainingAttestationsEnabled:true,temperatureAssessmentCompatibility:true,purgeNewsOnRead:false,calendarReadThrough:false,enforceOAuthCanonicalOrigin:true,mailEmail:env.MAIL_SENDER_EMAIL||'',googleId:env.GOOGLE_CLIENT_ID||'',googleSecret:env.GOOGLE_CLIENT_SECRET||'',googleEmail:env.GOOGLE_ACCOUNT_EMAIL||'',openaiKey:capabilities.analysis?env.OPENAI_API_KEY:'',youtrustKey:capabilities.signatures?env.YOUTRUST_API_KEY:'',youtrustEnvironment:env.YOUTRUST_ENVIRONMENT,mailFetch,calendarFetch,oauthFetch,youtubeFetch,employeeScanFetch:analysisFetch,employeeImportFetch:analysisFetch,youtrustFetch,feastCalendar:async()=>({day:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),feasts:[],names:[],available:false}),capabilities};
 if(capabilities.calendar||capabilities.mailOAuth||capabilities.youtube)for(const key of ['googleId','googleSecret','googleEmail'])if(!config[key])throw refusal('GOOGLE_CONFIGURATION_REQUIRED');
 if(capabilities.mailDelivery&&(!capabilities.mailOAuth||!env.MAIL_SENDER_EMAIL))throw refusal('APPROVED_MAIL_SENDER_AND_OAUTH_REQUIRED');
 if(capabilities.productWeb)config.merchandisingSearch=createWebProductSearch({readKey:async()=>env.OPENAI_API_KEY||'',fetchImpl:analysisFetch,...(adapters.readProductPage?{readPage:adapters.readProductPage}:{})});
 return config;
}
export async function checkProductionPrerequisites(db){
 const c=await db.connect();try{
  await c.query('BEGIN READ ONLY');
  const context=(await c.query("SELECT current_database() AS name,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,current_setting('cluster_name') AS cluster")).rows[0];
  const synthetic=db.options?.host==='127.0.0.1'&&context.cluster==='portailplus-grouped-synthetic';
  if(!context.tls||context.name!=='portailplus_7495'&&!synthetic)throw refusal('SCALINGO_DATABASE_TLS_REQUIRED');
  const columns=(await c.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'")).rows;
  const required=['calendar_tasks.source_message_id','team_messages.reminder_kind','team_messages.automation_text','hr_documents.training_date','hr_documents.training_kind','hr_documents.training_title','temperature_comments.assessment','temperature_comments.validation','quality_errors.correction_note_history','training_documents.removed_at','message_automations.revision','message_automation_runs.occurrence','message_automation_changes.action','training_attestation_imports.proposal','training_attestation_reads.requested_at','merchandising_promotions.prices','merchandising_promotions.stocks','merchandising_promotion_documents.file_content','scalingo_employee_deletion_audit.deleted_user_id'];
  const missing=required.filter(k=>!columns.some(r=>r.table_name+'.'+r.column_name===k));if(missing.length)throw Object.assign(refusal('ADDITIVE_SCHEMA_REVIEW_REQUIRED'),{missing});
  const index=(await c.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='calendar_tasks'")).rows;if(!index.some(r=>/UNIQUE/.test(r.indexdef)&&/user_id, source_message_id/.test(r.indexdef)&&/IS NOT NULL/.test(r.indexdef)))throw refusal('MESSAGE_TASK_UNIQUE_INDEX_REQUIRED');
  const admins=(await c.query("SELECT id,email,role,active,must_change FROM users WHERE role='admin' AND active=TRUE AND must_change=FALSE")).rows;
  if(!admins.some(u=>u.email&&u.email!=='admin-test@portailplus.invalid'))throw refusal('PERSONAL_READY_ADMINISTRATOR_REQUIRED');
  return {ready:true,personalAdministrators:admins.filter(u=>u.email!=='admin-test@portailplus.invalid').length,dataWrites:0,jobsStarted:0};
 }finally{await c.query('ROLLBACK');c.release();}
}
export async function createScalingoProductionApp(db,env,adapters={}){
 const config=productionConfig(env,adapters);await checkProductionPrerequisites(db);config.dummyHash=await hashPassword(token());
 const {app,mailer,sync,connectionHealth}=createApp(db,config),gate=express();gate.disable('x-powered-by');
 registerScalingoWwwRedirect(gate);
 gate.use((req,res,next)=>{
  if(env.SCALINGO_MAINTENANCE_MODE==='true'&&req.path!=='/health')return res.status(503).set('Retry-After','300').json({error:'Portail temporairement en maintenance.'});
  if(req.path.startsWith('/staging-')||req.path.startsWith('/api/staging-')||req.path==='/api/collaborateurs/import')return res.status(403).json({error:'Outil de préparation indisponible en production.'});
  const p=req.path,cap=config.capabilities;
  const denied=(p==='/auth/google/callback'?(String(req.query.state||'').startsWith('mail_')?!cap.mailOAuth:String(req.query.state||'').startsWith('youtube_')?!cap.youtube:!cap.calendar):/^\/api\/google\/(?!status$)/.test(p)?!cap.calendar:/^\/api\/mail\/(connect|disconnect)$/.test(p)?!cap.mailOAuth:/^\/api\/youtube/.test(p)?!cap.youtube:/^\/api\/youtrust/.test(p)||/^\/api\/hr\/(?:documents\/[^/]+\/signatures|signatures\/[^/]+\/(?:refresh|file))$/.test(p)?!cap.signatures:/^\/api\/challenges\/[^/]+\/reports\/[^/]+\/send$/.test(p)||/^\/api\/laboratories\/[^/]+\/email$/.test(p)?!cap.mailDelivery:false);
  if(denied)return res.status(409).json({error:'Service externe non autorisé sur Scalingo.',code:'EXTERNAL_SERVICE_NOT_APPROVED'});
  next();
 });
 gate.get('/api/google/status',(req,res,next)=>{const json=res.json;res.json=function(data){return json.call(this,{...data,configured:config.capabilities.calendar&&data.configured,calendarEnabled:config.capabilities.calendar,environment:'scalingo'});};app(req,res,next);});
 gate.get('/api/mail/status',(req,res,next)=>{const json=res.json;res.json=function(data){return json.call(this,{...data,configured:config.capabilities.mailOAuth&&data.configured,deliveryEnabled:config.capabilities.mailDelivery});};app(req,res,next);});
 registerScalingoTrevouxEntry(gate,app);registerScalingoRetiredCalculations(gate);
 const universeBoundary=scalingoUniverseBoundary(db);
 // Personal attestation uploads retain their own authenticated owner/admin ACL,
 // rather than requiring administrative edit rights on the whole Quality module.
 gate.use((req,res,next)=>req.method==='POST'&&(req.path==='/api/quality/training/imports/analyze'||/^\/api\/quality\/training\/imports\/[a-f0-9-]{36}\/confirm$/i.test(req.path))?next():universeBoundary(req,res,next));
 registerScalingoAccountManagement(gate,app);
 registerScalingoEmployeeRecords({gate,db,adminAuth:scalingoAdminAuth(db),origin:config.origin,secret:config.secret,isAllowedOrigin:o=>scalingoAllowedOrigins.includes(o),accountManagement:true});
 gate.use(app);gate.use((e,req,res,next)=>res.status(e.status||500).json({error:e.status?e.message:'Opération Scalingo impossible.',...(e.code?{code:e.code}:{})}));
 return {app:gate,config,mailer,sync,connectionHealth,jobsStarted:0};
}
