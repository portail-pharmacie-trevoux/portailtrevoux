// One-off staging cleanup. Run only with explicit --execute, after a verified DB backup.
// Never deploy as a scheduled job or invoke on Render.
import pg from 'pg';
const emails=['adjoint.demo@portailplus.invalid','preparateur.demo@portailplus.invalid','preparatrice.demo@portailplus.invalid','apprenti.demo@portailplus.invalid','rayonniste.demo@portailplus.invalid'];
const execute=process.argv.includes('--execute');
if(process.env.SCALINGO_PREVIEW_SAFE_MODE!=='true'||process.env.SCALINGO_REQUIRE_DB_TLS!=='true')throw Error('Staging environment required');
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL missing');
const url=new URL(process.env.DATABASE_URL);
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
const db=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true}});
await db.connect();
const q=(sql,args=[])=>db.query(sql,args);
try{
 await q('BEGIN');
 const info=(await q("SELECT current_database() AS db,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
 if(info.db!=='portailplus_7495'||!info.tls)throw Error('Not the expected TLS-protected Scalingo staging database');
 const admin=(await q("SELECT id FROM users WHERE email='admin-test@portailplus.invalid' AND role='admin' AND active=TRUE")).rows;
 if(admin.length!==1)throw Error('Staging administrator missing or duplicated');
 const users=(await q('SELECT id,email,role,first_name,last_name FROM users WHERE email=ANY($1::text[]) ORDER BY id',[emails])).rows;
 if(users.some(u=>u.role==='admin')||new Set(users.map(u=>u.email)).size!==users.length)throw Error('Unsafe demo identity');
 const ids=users.map(u=>u.id);
 const others=(await q('SELECT id,email,role FROM users WHERE id<>ALL($1::int[]) AND id<>$2',[ids,admin[0].id])).rows;
 if(others.length)throw Error('Unexpected non-demo staging users; stop to avoid deleting shared records');
 console.log(JSON.stringify({mode:execute?'EXECUTE':'DRY RUN',database:info.db,accounts:users,adminPreserved:admin[0].id}));
 if(!execute){await q('ROLLBACK');console.log('Dry run complete. No changes.');process.exit(0);}
 if(ids.length!==5)throw Error('Expected all five demo users; refusing partial cleanup');
 // Purge only the explicitly seeded template. No other templates should exist in this isolated preview.
 const templates=(await q('SELECT id,name FROM schedule_templates')).rows;
 if(templates.some(t=>t.name!=='semaine test'))throw Error('Unexpected schedule templates');
 await q("DELETE FROM schedule_templates WHERE name='semaine test'");
 // Remove demo schedule entries from both draft and published documents. Keep admin entries if present.
 const weeks=(await q('SELECT week::text AS week,draft,published FROM schedule_weeks FOR UPDATE')).rows;
 const hasDemoKey=key=>ids.some(id=>key===String(id)||key.startsWith(id+':')||key.startsWith(id+'-'));
 const scrub=value=>{
   if(value===null||value===undefined)return value;
   if(Array.isArray(value))return value.map(scrub);
   if(typeof value!=='object')return value;
   const out={};
   for(const [key,val] of Object.entries(value)){
     if(hasDemoKey(key))continue;
     out[key]=scrub(val);
   }
   return out;
 };
 for(const w of weeks){
   const draft=scrub(w.draft),published=scrub(w.published);
   if(JSON.stringify(draft)!==JSON.stringify(w.draft)||JSON.stringify(published)!==JSON.stringify(w.published))
     await q('UPDATE schedule_weeks SET draft=$2::jsonb,published=$3::jsonb WHERE week=$1::date',[w.week,JSON.stringify(draft),published===null?null:JSON.stringify(published)]);
 }
 // Remove messages authored by demo staff before FK SET NULL loses attribution.
 await q('DELETE FROM team_messages WHERE sender_id=ANY($1::int[])',[ids]);
 // Delete references with ON DELETE CASCADE; other FK rules are enforced by PostgreSQL.
 // A restrictive or unanticipated dependency aborts the entire transaction.
 await q('DELETE FROM users WHERE id=ANY($1::int[])',[ids]);
 const remaining=(await q('SELECT id FROM users WHERE email=ANY($1::text[])',[emails])).rows;
 if(remaining.length)throw Error('Demo users still present');
 const adminAfter=(await q('SELECT id FROM users WHERE id=$1 AND role=$2 AND active=TRUE',[admin[0].id,'admin'])).rows;
 if(adminAfter.length!==1)throw Error('Administrator verification failed');
 await q('COMMIT');
 console.log('Purge committed: five fictional users removed, administrator preserved.');
}catch(e){await q('ROLLBACK').catch(()=>{});console.error('Purge aborted without commit:',e.message);process.exitCode=1;}finally{await db.end();}
