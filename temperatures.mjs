import {parseTemperatureWorkbook} from './temperature-xlsx.mjs';
import {excursions,monthlySummary,parisStamp,stampMs} from './temperature-analysis.mjs';
const universe="Outils d'aide à la démarche qualité";
const today=()=>parisStamp(new Date().toISOString().slice(0,19).replace('T',' ')).slice(0,10);
export function registerTemperatures({app,db,auth,ready,admin,csrf,viewUniverse,fail,uploadParser}){
 const read=[auth,ready,viewUniverse(universe)],write=[...read,csrf];
 const validMonth=m=>{if(typeof m!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(m))throw fail(400,'Mois invalide.');return m;};
 const asStamp="to_char(recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')";
 app.get('/api/quality/temperatures',...read,async(req,res)=>{
  const month=validMonth(req.query.month),sensors=(await db.query('SELECT * FROM temperature_sensors ORDER BY name,id')).rows;
  const readings=(await db.query(`SELECT sensor_id,${asStamp} AS time,value FROM temperature_readings WHERE recorded_at>=now()-interval '3 years' AND recorded_at>=($1||'-01')::date::timestamp AT TIME ZONE 'Europe/Paris' AND recorded_at<((($1||'-01')::date+interval '1 month')::timestamp AT TIME ZONE 'Europe/Paris') ORDER BY sensor_id,recorded_at`,[month])).rows;
  const summaries=sensors.map(s=>{const list=readings.filter(r=>r.sensor_id===s.id).map(r=>[r.time,r.value]);return {...s,...monthlySummary(list,month,s.low_threshold,s.high_threshold,today()),excursionCount:excursions(list,s.low_threshold,s.high_threshold).length};});
  const imports=(await db.query('SELECT id,file_name,imported_at,operator_name,added,ignored,first_reading,last_reading FROM temperature_imports ORDER BY imported_at DESC LIMIT 8')).rows;
  const references=(await db.query("SELECT s.collaborator_name,u.name,u.active FROM quality_services s LEFT JOIN users u ON u.id=s.collaborator_id WHERE regexp_replace(lower(translate(s.service,'âàäéèêëîïôöùûüç','aaaeeeeiioouuuc')),'[^a-z]','','g')='chainedufroid'")).rows;
  res.json({month,today:today(),isAdmin:req.auth.role==='admin',sensors:summaries,imports,references});
 });
 app.get('/api/quality/temperatures/:sensor',...read,async(req,res)=>{
  const month=validMonth(req.query.month),sensor=(await db.query('SELECT * FROM temperature_sensors WHERE id=$1',[req.params.sensor])).rows[0];if(!sensor)throw fail(404,'Sonde introuvable.');
  const all=(await db.query(`SELECT ${asStamp} AS time,value FROM temperature_readings WHERE sensor_id=$1 AND recorded_at>=now()-interval '3 years' ORDER BY recorded_at`,[sensor.id])).rows.map(r=>[r.time,r.value]);
  const events=excursions(all,sensor.low_threshold,sensor.high_threshold).filter(e=>parisStamp(e.start).slice(0,7)<=month&&parisStamp(e.last).slice(0,7)>=month);
  const comments=(await db.query("SELECT id,to_char(happened_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') AS happened_at,text,created_at,operator_name FROM temperature_comments WHERE sensor_id=$1 AND happened_at>=now()-interval '3 years' ORDER BY created_at,id",[sensor.id])).rows;
  events.forEach(e=>e.comments=comments.filter(c=>c.happened_at>=e.start&&c.happened_at<=e.last));
  const readings=all.filter(r=>parisStamp(r[0]).slice(0,7)===month);const gaps=[];for(let i=1;i<all.length;i++){const seconds=(stampMs(all[i][0])-stampMs(all[i-1][0]))/1000;if(seconds>900&&parisStamp(all[i][0]).slice(0,7)>=month&&parisStamp(all[i-1][0]).slice(0,7)<=month)gaps.push({start:all[i-1][0],end:all[i][0],seconds});}
  res.json({sensor,month,readings,events,gaps});
 });
 app.post('/api/quality/temperatures/import',...write,uploadParser,async(req,res)=>{
  const b=req.body;if(typeof b.fileName!=='string'||! /\.xlsx$/i.test(b.fileName)||b.fileName.length>200||typeof b.fileData!=='string'||b.fileData.length>21*1024*1024||! /^[A-Za-z0-9+/]+={0,2}$/.test(b.fileData))throw fail(400,'Choisissez un fichier .xlsx de 15 Mo maximum.');
  let parsed;try{parsed=parseTemperatureWorkbook(Buffer.from(b.fileData,'base64'));}catch(e){throw fail(400,e.status===400?e.message:'Fichier Excel illisible ou trop volumineux.');}const cutoff=new Date();cutoff.setUTCFullYear(cutoff.getUTCFullYear()-3);const now=Date.now(),rows=[];let expired=0;
  for(const s of parsed.sensors)for(const [time,value]of s.readings){const ms=stampMs(time);if(ms<cutoff.getTime()){expired++;continue;}if(ms>now+600000)throw fail(400,'L’export contient un relevé futur : '+parisStamp(time));rows.push({sensor:s.id,time:time.replace(' ','T')+'Z',value});}
  if(!rows.length)throw fail(400,'Aucun relevé dans les trois dernières années.');
  const client=await db.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(783410)');
   for(const s of parsed.sensors)await client.query('INSERT INTO temperature_sensors(id,name) VALUES($1,$1) ON CONFLICT DO NOTHING',[s.id]);
   let added=0,ignored=parsed.duplicates+expired;
   for(let i=0;i<rows.length;i+=5000){const batch=JSON.stringify(rows.slice(i,i+5000));const conflicts=await client.query(`SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS r(sensor text,time timestamptz,value double precision) JOIN temperature_readings t ON t.sensor_id=r.sensor AND t.recorded_at=r.time WHERE t.value<>r.value LIMIT 1`,[batch]);if(conflicts.rows.length)throw fail(409,'Une température diffère d’un relevé déjà enregistré au même horaire. Aucun relevé n’a été modifié.');const inserted=await client.query(`INSERT INTO temperature_readings(sensor_id,recorded_at,value) SELECT sensor,time,value FROM jsonb_to_recordset($1::jsonb) AS r(sensor text,time timestamptz,value double precision) ON CONFLICT DO NOTHING`,[batch]);added+=inserted.rowCount;ignored+=rows.slice(i,i+5000).length-inserted.rowCount;}
   const times=rows.map(r=>r.time).sort();await client.query('INSERT INTO temperature_imports(file_name,operator_name,imported_by,added,ignored,first_reading,last_reading) VALUES($1,$2,$3,$4,$5,$6,$7)',[b.fileName,req.auth.name,req.auth.id,added,ignored,times[0],times.at(-1)]);await client.query('COMMIT');res.json({added,ignored,expired,sensors:parsed.sensors.length,lastMonth:parisStamp(times.at(-1).slice(0,19)).slice(0,7)});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 });
 app.put('/api/quality/temperatures/:sensor',...read,admin,csrf,async(req,res)=>{const b=req.body;if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100||typeof b.low!=='number'||typeof b.high!=='number'||!Number.isFinite(b.low)||!Number.isFinite(b.high)||b.low<-100||b.high>100||b.low>=b.high||!Number.isSafeInteger(b.revision))throw fail(400,'Nom et seuils invalides.');const result=await db.query('UPDATE temperature_sensors SET name=$2,low_threshold=$3,high_threshold=$4,revision=revision+1 WHERE id=$1 AND revision=$5 RETURNING *',[req.params.sensor,b.name.trim(),b.low,b.high,b.revision]);if(!result.rows.length)throw fail(409,'Cette sonde a changé. Rechargez la page.');res.json(result.rows[0]);});
 app.post('/api/quality/temperatures/:sensor/comments',...write,async(req,res)=>{const b=req.body;if(typeof b.time!=='string'||!/^20\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(b.time)||typeof b.text!=='string'||!b.text.trim()||b.text.length>3000)throw fail(400,'Commentaire de 1 à 3 000 caractères attendu.');const row=(await db.query(`INSERT INTO temperature_comments(sensor_id,happened_at,text,operator_name,created_by) SELECT r.sensor_id,r.recorded_at,$3,$4,$5 FROM temperature_readings r JOIN temperature_sensors s ON s.id=r.sensor_id WHERE r.sensor_id=$1 AND r.recorded_at=($2::timestamp AT TIME ZONE 'UTC') AND r.recorded_at>=now()-interval '3 years' AND (r.value<s.low_threshold OR r.value>s.high_threshold) RETURNING id`,[req.params.sensor,b.time,b.text.trim(),req.auth.name,req.auth.id])).rows[0];if(!row)throw fail(409,'Ce relevé hors seuil n’est plus disponible.');res.json({ok:true});});
}
