// Operational read-only check. Never print notes, error details, names or secrets.
import pg from 'pg';
const url=new URL(process.env.DATABASE_URL);for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(k);
const db=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true}});let server;
const fields=['corrected_at','corrected_by','corrected_name','error_corrected','correction_note','correction_note_history'];
async function snapshot(){return (await db.query(`SELECT count(*)::int AS count,
 md5(string_agg((to_jsonb(e)-ARRAY['status','status_history','revision','corrected_at','corrected_by','corrected_name','error_corrected','correction_note','correction_note_history'])::text,E'\n' ORDER BY id)) AS protected_fingerprint,
 md5(string_agg(COALESCE(to_jsonb(e)->>'correction_note',''),E'\n' ORDER BY id)) AS note_fingerprint
 FROM quality_errors e`)).rows[0];}
try{
 await db.connect();await db.query('BEGIN READ ONLY');
 const identity=(await db.query("SELECT current_database() AS name,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
 if(identity.name!=='portailplus_7495'||identity.tls!==true)throw Error('Unexpected database or missing TLS');
 if(process.env.QUALITY_FOLLOWUP_WATCH==='true'){
  const before=await snapshot();await db.query('COMMIT');let ready=false;
  for(let i=0;i<60;i++){
   const columns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='quality_errors'")).rows.map(r=>r.column_name);
   if(fields.every(f=>columns.includes(f))){ready=true;break;}
   await new Promise(resolve=>setTimeout(resolve,5000));
  }
  if(!ready)throw Error('Schema preparation not observed within five minutes');
  await db.query('BEGIN READ ONLY');const after=await snapshot();await db.query('COMMIT');
  const unchanged=JSON.stringify(before)===JSON.stringify(after);
  console.log('QUALITY_FOLLOWUP_PRESERVATION '+JSON.stringify({before,after,unchanged}));if(!unchanged)process.exitCode=1;
 }else{
  const columns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='quality_errors'")).rows.map(r=>r.column_name);if(!fields.every(f=>columns.includes(f)))throw Error('Missing followup columns');
  const inconsistent=(await db.query("SELECT count(*)::int AS count FROM quality_errors WHERE status IS DISTINCT FROM CASE WHEN error_corrected THEN 'closed' WHEN patient_notified_at IS NOT NULL OR doctor_notified_at IS NOT NULL THEN 'in_progress' ELSE 'declared' END")).rows[0].count;if(inconsistent)throw Error('Inconsistent automatic statuses');
  const admin=(await db.query("SELECT id,name,role,job,active,must_change,rights,edit_rights,permissions_configured FROM users WHERE email='admin-test@portailplus.invalid' AND role='admin' AND active=TRUE")).rows[0];if(!admin)throw Error('TEST administrator unavailable');admin.csrf='local-readonly-diagnostic';
  const {default:express}=await import('express'),{createApp}=await import('../server.mjs'),{isScalingoQualityErrorRoute}=await import('./scalingo-quality-errors-preview.mjs');
  const {app}=createApp(db,{origin:process.env.APP_URL,secret:process.env.APP_SECRET,dummyHash:'unused',googleId:'',googleSecret:'',googleEmail:'',mailEmail:''});
  const local=express();local.use((req,res,next)=>{req.auth=admin;next();});local.use((req,res,next)=>isScalingoQualityErrorRoute(req)?next():res.status(403).json({error:'Blocked'}));local.use(app);
  server=local.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/api/quality/errors');if(response.status!==200)throw Error('Registry HTTP '+response.status);const registry=await response.json();
  if(registry.errors.some(e=>!Array.isArray(e.correction_note_history)||typeof e.correction_note!=='string'||typeof e.error_corrected!=='boolean'))throw Error('Incomplete API representation');
  const id=registry.errors[0]?.id||1,headers={'content-type':'application/json',origin:process.env.APP_URL,'x-csrf-token':admin.csrf};
  const note=await fetch(base+'/api/quality/errors/'+id+'/correction-note',{method:'PUT',headers,body:JSON.stringify({note:'',revision:0})});if(note.status!==400)throw Error('Correction route validation HTTP '+note.status);
  const csrf=await fetch(base+'/api/quality/errors/'+id+'/correction-note',{method:'PUT',headers:{...headers,'x-csrf-token':'invalid'},body:JSON.stringify({note:'',revision:0})});if(csrf.status!==403)throw Error('CSRF HTTP '+csrf.status);
  const manual=await fetch(base+'/api/quality/errors/'+id+'/status',{method:'PUT',headers,body:JSON.stringify({status:'closed',revision:0})});if(manual.status!==409)throw Error('Manual status HTTP '+manual.status);
  const preserved=await snapshot();await db.query('COMMIT');
  console.log('QUALITY_FOLLOWUP_VERIFIED '+JSON.stringify({columns_ready:true,errors:registry.errors.length,automatic_statuses_consistent:true,registry_http:response.status,correction_validation_http:note.status,csrf_http:csrf.status,manual_status_http:manual.status,...preserved}));
 }
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.log('QUALITY_FOLLOWUP_CHECK_ERROR '+JSON.stringify({code:e.code||'CHECK_FAILED',message:e.code?undefined:e.message}));process.exitCode=1;}finally{if(server)await new Promise(resolve=>server.close(resolve));await db.end();}
