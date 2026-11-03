// Operational audit: read-only; no schedules, names, messages or secrets printed.
import pg from 'pg';
import {validWeek} from '../schedule.mjs';
const week=validWeek(process.env.SCHEDULE_CHECK_WEEK||'2026-11-02');
if(process.env.SCALINGO_PREVIEW_SAFE_MODE!=='true'||process.env.SCALINGO_REQUIRE_DB_TLS!=='true'||process.env.APP_URL!=='https://portailplus-hds.osc-fr1.scalingo.io')throw Error('Scalingo safe preview required');
const url=new URL(process.env.DATABASE_URL);for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
const db=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try{
 await db.connect();await db.query('BEGIN READ ONLY');
 const identity=(await db.query('SELECT current_database() AS name,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls')).rows[0];
 if(identity.name!=='portailplus_7495'||identity.tls!==true)throw Error('Unexpected database or TLS');
 const state=(await db.query(`SELECT revision,published_revision,published_at,published IS NOT DISTINCT FROM draft AS versions_equal,
 (SELECT count(*)::int FROM jsonb_object_keys(draft)) AS draft_entries,
 (SELECT count(*)::int FROM jsonb_object_keys(COALESCE(published,'{}'::jsonb))) AS published_entries
 FROM schedule_weeks WHERE week=$1::date`,[week])).rows[0];
 const notices=(await db.query(`SELECT m.id,m.created_at,count(r.user_id)::int AS recipients,count(*) FILTER (WHERE r.seen)::int AS seen
 FROM team_messages m JOIN schedule_weeks w ON w.week=m.planning_week
 LEFT JOIN team_message_recipients r ON r.message_id=m.id
 WHERE w.week=$1::date AND m.created_at=w.published_at AND m.sender_name='Portail +' GROUP BY m.id ORDER BY m.id`,[week])).rows;
 const verified=!!state?.published_at&&state.published_revision===state.revision&&state.versions_equal===true&&notices.length===1;
 await db.query('ROLLBACK');
 console.log((verified?'SCHEDULE_PUBLICATION_VERIFIED ':'SCHEDULE_PUBLICATION_NOT_READY ')+JSON.stringify({week,state,notices,readOnly:true}));
 if(!verified)process.exitCode=1;
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.log('SCHEDULE_PUBLICATION_CHECK_ERROR '+JSON.stringify({code:e.code||'CHECK_FAILED'}));process.exitCode=1;}finally{await db.end();}
