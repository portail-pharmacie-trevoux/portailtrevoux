import {registerEmployeeImport} from './employee-import.mjs';
import express from 'express';
import { importProcedureDocuments } from './procedure-import.mjs';
import { registerProcedures } from './procedures.mjs';
import { registerContacts } from './contacts.mjs';
import { registerCollaborateurs } from './collaborateurs.mjs';
import { createProductSources } from './product-sources.mjs';
import { registerSchedule } from './schedule.mjs';
import { createDailyJoke } from './updates.mjs';
import { createYouTube } from './youtube.mjs';
import { validateMusic, musicKey } from './music.mjs';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword, passwordValid, token, digest, encrypt, decrypt, universes, canAccess, canModify } from './security.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const cleanUser=u=>({id:u.id,name:u.name,job:u.job,email:u.email,role:u.role,rights:u.rights,editRights:u.edit_rights||[],permissionsConfigured:!!u.permissions_configured,mustChange:u.must_change});
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createApp(db,config) {
  const app=express(), secret=config.secret, origin=new URL(config.origin).origin;
  const secure=origin.startsWith('https:');
  app.set('trust proxy',1); app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.openfoodfacts.org https://images.openbeautyfacts.org; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'Permissions-Policy':'camera=(), microphone=(), geolocation=()'});
    if(secure)res.set('Strict-Transport-Security','max-age=31536000');
    next();
  });
  const jsonBody=express.json({limit:'16kb'});
  // Parse larger file uploads only after checking their session and edit rights.
  app.use((req,res,next)=>req.method==='POST'&&['/api/procedures/import','/api/collaborateurs/scan'].includes(req.path)?next():jsonBody(req,res,next));
  app.use((req,res,next)=>{
    if(['POST','PUT','PATCH','DELETE'].includes(req.method) && req.get('origin')!==origin)return next(fail(403,'Origine de la demande refusée.'));
    next();
  });
  app.use(async(req,res,next)=>{
    const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('trevoux_session='))?.slice(16);
    if(cookie && /^[\w-]{43}$/.test(cookie)){
      const {rows}=await db.query('SELECT s.id AS session_id,s.csrf,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>now() AND u.active=TRUE',[digest(cookie)]);
      if(rows[0])req.auth=rows[0];
    }
    next();
  });
  const auth=(req,res,next)=>req.auth?next():next(fail(401,'Connectez-vous pour continuer.'));
  const ready=(req,res,next)=>req.auth?.must_change?next(fail(403,'Changez votre mot de passe provisoire.')):next();
  const admin=(req,res,next)=>req.auth?.role==='admin'?next():next(fail(403,'Accès réservé à l’administrateur.'));
  const csrf=(req,res,next)=>req.get('x-csrf-token')===req.auth?.csrf?next():next(fail(403,'Session à actualiser.'));
  const viewUniverse=name=>(req,res,next)=>canAccess(req.auth,name)?next():next(fail(403,'Accès refusé.'));
  const editUniverse=name=>(req,res,next)=>canModify(req.auth,name)?next():next(fail(403,'Cet univers est en consultation seule pour votre compte.'));
  const getSetting=async key=>(await db.query('SELECT value FROM settings WHERE key=$1',[key])).rows[0]?.value;
  const setSetting=async(key,value)=>db.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[key,value]);
  async function publish(universe,title,key=null) {
    await db.query('INSERT INTO publications(universe,title,source_key) VALUES($1,$2,$3) ON CONFLICT(source_key) DO NOTHING',[universe,title,key]);
  }
  registerProcedures({app,db,auth,ready,csrf,viewUniverse,editUniverse,fail,publish,uploadParser:express.json({limit:'15mb'})});
  registerContacts({app,db,auth,ready,admin,csrf,viewUniverse,fail,publish});
  const dailyJoke=createDailyJoke({getSetting,setSetting,publish});
  const allowedPublications=user=>universes.filter(name=>name!=='Collaborateurs'&&canAccess(user,name));
  app.get('/api/publications',auth,ready,async(req,res)=>{
    const allowed=allowedPublications(req.auth);
    const {rows}=await db.query(`SELECT p.universe,COUNT(*) FILTER(WHERE p.id>COALESCE(r.last_id,0))::int AS unread,
      MAX(p.id)::text AS latest FROM publications p LEFT JOIN publication_reads r ON r.user_id=$1 AND r.universe=p.universe
      WHERE p.universe=ANY($2::text[]) GROUP BY p.universe`,[req.auth.id,allowed]);
    res.json(rows);
  });
  app.get('/api/publications/:name',auth,ready,async(req,res)=>{
    if(!allowedPublications(req.auth).includes(req.params.name))throw fail(403,'Accès refusé.');
    const {rows}=await db.query(`SELECT p.id::text,p.title,p.created_at,p.id>COALESCE(r.last_id,0) AS unread
      FROM publications p LEFT JOIN publication_reads r ON r.user_id=$1 AND r.universe=p.universe
      WHERE p.universe=$2 ORDER BY p.id DESC LIMIT 20`,[req.auth.id,req.params.name]);
    res.json(rows);
  });
  app.post('/api/publications/:name/read',auth,ready,csrf,async(req,res)=>{
    const name=req.params.name,id=req.body.id;
    if(!allowedPublications(req.auth).includes(name))throw fail(403,'Accès refusé.');
    if(typeof id!=='string'||!/^\d{1,18}$/.test(id))throw fail(400,'Parution invalide.');
    await db.query(`INSERT INTO publication_reads(user_id,universe,last_id)
      SELECT $1,$2,COALESCE(MAX(id),0) FROM publications WHERE universe=$2 AND id<=$3::bigint
      ON CONFLICT(user_id,universe) DO UPDATE SET last_id=GREATEST(publication_reads.last_id,EXCLUDED.last_id)`,[req.auth.id,name,id]);
    res.json({ok:true});
  });
  app.get('/api/fun/joke',auth,ready,viewUniverse('Fun'),async(req,res)=>res.json(await dailyJoke()));
  registerSchedule({app,db,auth,ready,admin,csrf,canAccess,canModify,fail});
  const callback=origin+'/auth/google/callback';
  const cookieOptions={httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:8*60*60*1000};
  async function newSession(user,res){
    const raw=token(),session=digest(raw),csrfToken=token();
    await db.query("INSERT INTO sessions(id,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",[session,user.id,csrfToken]);
    res.cookie('trevoux_session',raw,cookieOptions);
    return {user:cleanUser(user),csrf:csrfToken};
  }
  app.get('/health',async(req,res)=>{await db.query('SELECT 1');res.json({ok:true});});
  app.post('/api/login',async(req,res)=>{
    const email=typeof req.body.email==='string'?req.body.email.trim().toLowerCase():'';
    if(!email||email.length>254||typeof req.body.password!=='string'||Buffer.byteLength(req.body.password)>256)throw fail(400,'Adresse ou mot de passe invalide.');
    const keys=[digest('ip:'+req.ip),digest('email:'+email)];
    for(const key of keys){
      const {rows}=await db.query("INSERT INTO login_attempts(key,count,until_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_attempts.until_at<now() THEN 1 ELSE login_attempts.count+1 END,until_at=CASE WHEN login_attempts.until_at<now() THEN EXCLUDED.until_at ELSE login_attempts.until_at END RETURNING count",[key]);
      if(rows[0].count>20)throw fail(429,'Trop de tentatives. Réessayez dans 15 minutes.');
    }
    const user=(await db.query('SELECT * FROM users WHERE email=$1',[email])).rows[0];
    const valid=await verifyPassword(req.body.password,user?.password_hash||config.dummyHash);
    if(!user||!valid||!user.active)throw fail(401,'Adresse ou mot de passe incorrect.');
    if(req.auth)await db.query('DELETE FROM sessions WHERE id=$1',[req.auth.session_id]);
    res.json(await newSession(user,res));
  });
  app.get('/api/me',auth,(req,res)=>res.json({user:cleanUser(req.auth),csrf:req.auth.csrf}));
  app.post('/api/logout',auth,csrf,async(req,res)=>{await db.query('DELETE FROM sessions WHERE id=$1',[req.auth.session_id]);res.clearCookie('trevoux_session',{...cookieOptions,maxAge:undefined});res.json({ok:true});});
  app.post('/api/password',auth,csrf,async(req,res)=>{
    if(!passwordValid(req.body.password))throw fail(400,'Choisissez un mot de passe de 12 caractères minimum (256 octets maximum).');
    if(!await verifyPassword(req.body.currentPassword,req.auth.password_hash))throw fail(400,'Mot de passe actuel incorrect.');
    if(req.body.password===req.body.currentPassword)throw fail(400,'Choisissez un nouveau mot de passe.');
    const hash=await hashPassword(req.body.password);
    await db.query('UPDATE users SET password_hash=$1,must_change=FALSE WHERE id=$2',[hash,req.auth.id]);
    await db.query('DELETE FROM sessions WHERE user_id=$1',[req.auth.id]);
    res.json(await newSession({...req.auth,password_hash:hash,must_change:false},res));
  });
  registerEmployeeImport({app,db,auth,ready,admin,csrf,fail,secret,apiKey:config.openaiKey,model:config.employeeScanModel,fetchImpl:config.employeeScanFetch,uploadParser:express.json({limit:'15mb'})});
  registerCollaborateurs({app,db,auth,ready,admin,csrf,fail,secret,feastCalendar:config.feastCalendar});
  async function googleTokens(){
    const stored=await getSetting('google_tokens');if(!stored)throw fail(409,'Google Agenda n’est pas connecté.');
    let tokens=decrypt(stored,secret);
    if(tokens.expires_at>Date.now()+60000)return tokens;
    if(!tokens.refresh_token)throw fail(409,'Reconnectez Google Agenda.');
    const result=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:config.googleId,client_secret:config.googleSecret,refresh_token:tokens.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(20000)});
    if(!result.ok)throw fail(409,'L’autorisation Google doit être renouvelée.');
    const fresh=await result.json();tokens={...tokens,...fresh,expires_at:Date.now()+fresh.expires_in*1000};
    await setSetting('google_tokens',encrypt(tokens,secret));return tokens;
  }
  async function googleGet(path){
    const tokens=await googleTokens();const result=await fetch('https://www.googleapis.com/calendar/v3/'+path,{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(20000)});
    if(!result.ok)throw fail(502,'Google Agenda est momentanément indisponible, ou cet agenda n’est pas accessible.');
    return result.json();
  }
  let syncing=null;
  async function sync(){
    if(syncing)return syncing;
    syncing=(async()=>{
      const calendar=await getSetting('calendar_id');if(!calendar)return;
      const now=Date.now(),events=[];let page;
      do {
        const params=new URLSearchParams({singleEvents:'true',orderBy:'startTime',maxResults:'2500',timeMin:new Date(now-30*86400000).toISOString(),timeMax:new Date(now+180*86400000).toISOString()});if(page)params.set('pageToken',page);
        const data=await googleGet('calendars/'+encodeURIComponent(calendar)+'/events?'+params);
        events.push(...(data.items||[]).filter(e=>e.status!=='cancelled').map(e=>({id:e.id,title:e.summary||'Événement',start:e.start,end:e.end,location:e.location||'',description:e.description||''})));page=data.nextPageToken;
        if(events.length>20000)throw fail(502,'Agenda trop volumineux pour la période sélectionnée.');
      }while(page);
      const previous=(await db.query('SELECT events FROM calendar_cache WHERE singleton=TRUE')).rows[0]?.events;
      if(previous){
        const ids=new Set(previous.map(e=>e.id));
        const fresh=events.filter(e=>!ids.has(e.id)&&(e.end?.date||e.end?.dateTime||e.start?.date||e.start?.dateTime)>=new Date(now).toISOString().slice(0,10));
        for(const event of fresh)await publish('Agenda',event.title,'calendar:'+calendar+':'+event.id);
      }
      await db.query('INSERT INTO calendar_cache(singleton,events,synced_at) VALUES(TRUE,$1::jsonb,now()) ON CONFLICT(singleton) DO UPDATE SET events=EXCLUDED.events,synced_at=EXCLUDED.synced_at',[JSON.stringify(events)]);
      await setSetting('sync_error','');
    })().catch(async error=>{await setSetting('sync_error',error.status?error.message:'Échec de la synchronisation. Réessayez plus tard.');throw error;}).finally(()=>{syncing=null;});return syncing;
  }
  const youtube=createYouTube({db,config,secret,getSetting,setSetting,fail,encrypt,decrypt});
  app.get('/api/youtube/status',auth,ready,viewUniverse('Fun'),async(req,res)=>res.json(await youtube.status()));
  app.post('/api/youtube/connect',auth,ready,admin,csrf,async(req,res)=>{
    if(!config.googleId||!config.googleSecret)throw fail(409,'La configuration Google doit être ajoutée dans Render.');
    const state='youtube_'+token(),verifier=token();
    await db.query("UPDATE sessions SET oauth_state=$1,oauth_expires=now()+interval '10 minutes',oauth_verifier=$2 WHERE id=$3",[digest(state),verifier,req.auth.session_id]);
    const params=new URLSearchParams({client_id:config.googleId,redirect_uri:callback,response_type:'code',scope:youtube.scope,access_type:'offline',prompt:'select_account consent',state,code_challenge:Buffer.from(digest(verifier),'hex').toString('base64url'),code_challenge_method:'S256'});
    res.json({url:'https://accounts.google.com/o/oauth2/v2/auth?'+params});
  });
  app.get('/api/youtube/playlists',auth,ready,admin,async(req,res)=>res.json(await youtube.playlists()));
  app.post('/api/youtube/playlist',auth,ready,admin,csrf,async(req,res)=>res.json(await youtube.choosePlaylist(req.body.id)));
  app.post('/api/youtube/playlists',auth,ready,admin,csrf,async(req,res)=>res.status(201).json(await youtube.createPlaylist(req.body.title)));
  app.post('/api/youtube/candidates',auth,ready,editUniverse('Fun'),csrf,async(req,res)=>res.json(await youtube.candidates(req.body.trackId)));
  app.post('/api/youtube/add',auth,ready,editUniverse('Fun'),csrf,async(req,res)=>res.json(await youtube.add(req.body)));
  app.post('/api/youtube/disconnect',auth,ready,admin,csrf,async(req,res)=>{
    await db.query("DELETE FROM settings WHERE key IN ('youtube_tokens','youtube_channel_id','youtube_channel_name','youtube_playlist_id','youtube_playlist_name')");
    res.json({ok:true});
  });
  app.post('/api/google/connect',auth,ready,admin,csrf,async(req,res)=>{
    if(!config.googleId||!config.googleSecret)throw fail(409,'La configuration Google doit être ajoutée dans Render.');
    const state=token(),verifier=token();
    await db.query("UPDATE sessions SET oauth_state=$1,oauth_expires=now()+interval '10 minutes',oauth_verifier=$2 WHERE id=$3",[digest(state),verifier,req.auth.session_id]);
    const params=new URLSearchParams({client_id:config.googleId,redirect_uri:callback,response_type:'code',scope:'openid email https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly',access_type:'offline',prompt:'consent',login_hint:config.googleEmail,state,code_challenge:Buffer.from(digest(verifier),'hex').toString('base64url'),code_challenge_method:'S256'});
    res.json({url:'https://accounts.google.com/o/oauth2/v2/auth?'+params});
  });
  app.get('/auth/google/callback',auth,ready,admin,async(req,res)=>{
    const state=typeof req.query.state==='string'?req.query.state:'';
    const {rows}=await db.query('UPDATE sessions SET oauth_state=NULL,oauth_expires=NULL,oauth_verifier=NULL WHERE id=$1 AND oauth_state=$2 AND oauth_expires>now() RETURNING $3::text AS verifier',[req.auth.session_id,digest(state),(await db.query('SELECT oauth_verifier FROM sessions WHERE id=$1',[req.auth.session_id])).rows[0]?.oauth_verifier]);
    if(!state||!rows[0])throw fail(400,'Autorisation expirée. Relancez la connexion Google.');
    const forYouTube=state.startsWith('youtube_');
    if(req.query.error)return res.redirect(forYouTube?'/?youtube=refused':'/?google=refused');
    if(typeof req.query.code!=='string')throw fail(400,'Autorisation Google invalide.');
    const result=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:config.googleId,client_secret:config.googleSecret,code:req.query.code,grant_type:'authorization_code',redirect_uri:callback,code_verifier:rows[0].verifier}),signal:AbortSignal.timeout(20000)});
    if(!result.ok)throw fail(400,'Connexion Google impossible. Vérifiez les réglages puis réessayez.');
    const tokens=await result.json();
    if(forYouTube){await youtube.connect(tokens);return res.redirect('/?youtube=connected');}
    const identity=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(20000)});
    const profile=identity.ok?await identity.json():{};
    if(!profile.email_verified||profile.email?.toLowerCase()!==config.googleEmail.toLowerCase())throw fail(403,'Connectez le compte Google de la pharmacie.');
    const scopes=new Set((tokens.scope||'').split(' '));
    if(!scopes.has('https://www.googleapis.com/auth/calendar.events.readonly')||!scopes.has('https://www.googleapis.com/auth/calendar.calendarlist.readonly'))throw fail(400,'Autorisez la lecture des agendas et des événements.');
    if(!tokens.refresh_token)throw fail(400,'Autorisation automatique absente. Relancez la connexion Google.');
    tokens.expires_at=Date.now()+tokens.expires_in*1000;
    await setSetting('google_tokens',encrypt(tokens,secret));res.redirect('/?google=connected');
  });
  app.get('/api/google/status',auth,ready,admin,async(req,res)=>res.json({configured:!!(config.googleId&&config.googleSecret),connected:!!await getSetting('google_tokens'),calendarId:await getSetting('calendar_id')||'',calendarName:await getSetting('calendar_name')||'',error:await getSetting('sync_error')||'',callback}));
  app.get('/api/google/calendars',auth,ready,admin,async(req,res)=>{
    const items=[];let page;
    do{const d=await googleGet('users/me/calendarList?maxResults=250'+(page?'&pageToken='+encodeURIComponent(page):''));items.push(...(d.items||[]).map(c=>({id:c.id,name:c.summary})));page=d.nextPageToken;}while(page);
    res.json(items);
  });
  app.post('/api/google/calendar',auth,ready,admin,csrf,async(req,res)=>{
    if(typeof req.body.id!=='string'||req.body.id.length>500)throw fail(400,'Agenda invalide.');
    const calendar=await googleGet('users/me/calendarList/'+encodeURIComponent(req.body.id));
    if(syncing){try{await syncing;}catch{}}
    await setSetting('calendar_id',calendar.id);await setSetting('calendar_name',calendar.summary||'Agenda équipe');
    await db.query('DELETE FROM calendar_cache');await sync();res.json({ok:true});
  });
  app.post('/api/google/disconnect',auth,ready,admin,csrf,async(req,res)=>{
    // Remove the local authorization and cached events, even if Google is unavailable.
    if(syncing){try{await syncing;}catch{}}
    const stored=await getSetting('google_tokens');
    await db.query("DELETE FROM settings WHERE key IN ('google_tokens','calendar_id','calendar_name','sync_error')");await db.query('DELETE FROM calendar_cache');
    if(stored){const t=decrypt(stored,secret);try{await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',body:new URLSearchParams({token:t.refresh_token||t.access_token}),signal:AbortSignal.timeout(10000)});}catch{}}
    res.json({ok:true});
  });
  app.post('/api/google/sync',auth,ready,admin,csrf,async(req,res)=>{await sync();res.json({ok:true});});
  app.get('/api/calendar',auth,ready,async(req,res)=>{
    if(!canAccess(req.auth,'Agenda'))throw fail(403,'Vous n’avez pas accès à l’agenda.');
    const cached=(await db.query('SELECT * FROM calendar_cache WHERE singleton=TRUE')).rows[0];
    if(!cached||Date.now()-new Date(cached.synced_at).getTime()>15*60000){try{await sync();}catch{}}
    const current=(await db.query('SELECT * FROM calendar_cache WHERE singleton=TRUE')).rows[0];
    res.json({name:await getSetting('calendar_name')||'Agenda équipe',events:current?.events||[],syncedAt:current?.synced_at||null,error:await getSetting('sync_error')||'',connected:!!await getSetting('google_tokens')});
  });


  app.post('/api/music/import',auth,ready,admin,csrf,async(req,res)=>{
    if(!Array.isArray(req.body.tracks)||!req.body.tracks.length||req.body.tracks.length>25)throw fail(400,'Importez de 1 à 25 morceaux par lot.');
    const tracks=req.body.tracks.map(validateMusic);
    const {rows}=await db.query(`INSERT INTO music_tracks(artist,title,track_key,contributor,source)
      SELECT item->>'artist',item->>'title',item->>'trackKey','','import'
      FROM jsonb_array_elements($1::jsonb) item
      ON CONFLICT(track_key) DO NOTHING RETURNING id`,[JSON.stringify(tracks)]);
    if(rows.length)await publish('Fun',rows.length+' nouveau'+(rows.length>1?'x titres importés':' titre importé'));
    res.json({added:rows.length,duplicates:tracks.length-rows.length});
  });
  app.get('/api/music',auth,ready,viewUniverse('Fun'),async(req,res)=>{
    res.json((await db.query('SELECT id,artist,title,contributor,source,created_at FROM music_tracks ORDER BY created_at DESC,id DESC')).rows);
  });
  app.post('/api/music',auth,ready,editUniverse('Fun'),csrf,async(req,res)=>{
    const {artist,title,trackKey}=validateMusic(req.body);
    const {rows}=await db.query("INSERT INTO music_tracks(artist,title,track_key,contributor,added_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(track_key) DO NOTHING RETURNING id,artist,title,contributor,source,created_at",[artist,title,trackKey,req.auth.name,req.auth.id]);
    if(!rows[0])throw fail(409,'Ce morceau figure déjà dans la liste partagée.');
    await publish('Fun',title+' — '+artist,'music:'+rows[0].id);
    res.status(201).json(rows[0]);
  });
  app.delete('/api/music/:id',auth,ready,editUniverse('Fun'),csrf,async(req,res)=>{
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Morceau invalide.');
    const {rowCount}=await db.query('DELETE FROM music_tracks WHERE id=$1',[id]);
    if(!rowCount)throw fail(404,'Ce morceau ne figure plus dans la sélection.');
    res.json({ok:true});
  });
  const products=createProductSources({origin,serpKey:config.serpKey});
  app.get('/api/promoflash/product/:ean',auth,ready,viewUniverse('Outils de calculs rapides'),async(req,res)=>{const result=await products.product(req.params.ean);res.json({...result,image:result.image?'/api/promoflash/image/'+req.params.ean:''});});
  app.get('/api/promoflash/image/:ean',auth,ready,viewUniverse('Outils de calculs rapides'),async(req,res)=>{const result=await products.image(req.params.ean);res.type(result.type).send(Buffer.from(result.bytes));});
  app.get('/api/promoflash/prices/:ean',auth,ready,viewUniverse('Outils de calculs rapides'),async(req,res)=>res.json(await products.prices(req.params.ean)));
  app.get('/api/universes/:name',auth,ready,(req,res)=>{if(!canAccess(req.auth,req.params.name))throw fail(403,'Accès refusé.');res.json({items:[]});});
  app.use(express.static(root+'public',{index:'index.html',etag:false}));
  app.use((error,req,res,next)=>{
    if(error.code==='23505')return res.status(409).json({error:'Cette adresse e-mail est déjà utilisée.'});
    const status=error.status||500;
    if(status===413)return res.status(413).json({error:'Le fichier dépasse la limite de 10 Mo.'});
    if(status>=500)console.error('Erreur du portail:',error.code||error.name); // Do not log tokens or request bodies.
    res.status(status).json({error:status===500?'Le service est momentanément indisponible.':error.message});
  });
  return {app,sync,dailyJoke};
}

export async function initialize(db,config){
  await db.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
  await importProcedureDocuments(db,config.procedureImport);
  const initialMusic=JSON.parse(await readFile(new URL('./music-seed.json',import.meta.url),'utf8'));
  const seed=initialMusic.map(t=>({...t,trackKey:musicKey(t.artist,t.title)}));
  await db.query(`INSERT INTO music_tracks(artist,title,track_key,contributor,source)
    SELECT item->>'artist',item->>'title',item->>'trackKey',item->>'contributor','import'
    FROM jsonb_array_elements($1::jsonb) item ON CONFLICT(track_key) DO NOTHING`,[JSON.stringify(seed)]);
  await db.query("UPDATE users SET name='Nicolas Marchand',first_name='Nicolas',last_name='Marchand' WHERE role='admin' AND lower(email)='pharmaciedetrevoux@gmail.com'");
  const count=(await db.query("SELECT COUNT(*) AS count FROM users WHERE role='admin'")).rows[0].count;
  if(Number(count)===0){
    if(!passwordValid(config.adminPassword))throw new Error('ADMIN_PASSWORD doit contenir au moins 12 caractères.');
    await db.query("INSERT INTO users(name,first_name,last_name,job,email,password_hash,role,rights,must_change) VALUES($1,'Nicolas','Marchand',$2,$3,$4,'admin',$5::jsonb,TRUE)",['Nicolas Marchand','Titulaire',config.adminEmail.toLowerCase(),await hashPassword(config.adminPassword),JSON.stringify(universes)]);
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const env=process.env,config={openaiKey:env.OPENAI_API_KEY,employeeScanModel:env.EMPLOYEE_SCAN_MODEL,procedureImport:env.PROCEDURES_IMPORT_JSON,serpKey:env.SERPAPI_KEY,origin:env.APP_URL||env.RENDER_EXTERNAL_URL,secret:env.APP_SECRET,adminEmail:env.ADMIN_EMAIL||'pharmacie.trevoux@gmail.com',adminPassword:env.ADMIN_PASSWORD,googleId:env.GOOGLE_CLIENT_ID,googleSecret:env.GOOGLE_CLIENT_SECRET,googleEmail:env.GOOGLE_ACCOUNT_EMAIL||'pharmacie.trevoux@gmail.com'};
  if(!env.DATABASE_URL||!config.origin||!config.secret||config.secret.length<32)throw new Error('Renseignez DATABASE_URL, APP_URL (ou RENDER_EXTERNAL_URL) et APP_SECRET (32 caractères minimum).');
  if(env.NODE_ENV==='production'&&!config.origin.startsWith('https://'))throw new Error('HTTPS requis en production.');
  const db=new pg.Pool({connectionString:env.DATABASE_URL,max:10});
  await initialize(db,config);config.dummyHash=await hashPassword(token());
  const {app,sync,dailyJoke}=createApp(db,config);
  const server=app.listen(Number(env.PORT)||3000,'0.0.0.0',()=>console.log('Portail démarré.'));
  const tick=async()=>{try{await dailyJoke();}catch{console.error('Blague du jour à actualiser.');}try{await sync();await db.query('DELETE FROM sessions WHERE expires_at<now()');await db.query('DELETE FROM login_attempts WHERE until_at<now()');}catch{console.error('Synchronisation à vérifier dans le portail.');}};
  const timer=setInterval(tick,15*60000);void tick();
  process.on('SIGTERM',()=>{clearInterval(timer);server.close(()=>db.end());});
}
