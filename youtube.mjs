export function createYouTube({db,config,secret,getSetting,setSetting,fail,encrypt,decrypt,fetchImpl=fetch}){
  let refresh=null,writing=Promise.resolve();
  const scope='https://www.googleapis.com/auth/youtube.force-ssl';
  async function tokens(){
    const stored=await getSetting('youtube_tokens');if(!stored)throw fail(409,'Connectez YouTube dans les paramètres de Fun.');
    const old=decrypt(stored,secret);if(old.expires_at>Date.now()+60000)return old;
    if(refresh)return refresh;
    refresh=(async()=>{
      const response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:config.googleId,client_secret:config.googleSecret,refresh_token:old.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw fail(409,'Reconnectez YouTube : son autorisation a expiré.');
      const fresh=await response.json(),updated={...old,...fresh,expires_at:Date.now()+fresh.expires_in*1000};
      await setSetting('youtube_tokens',encrypt(updated,secret));return updated;
    })().finally(()=>{refresh=null;});return refresh;
  }
  async function request(path,params={},method='GET',body,accessToken){
    const access=accessToken||(await tokens()).access_token;
    const result=await fetchImpl('https://www.googleapis.com/youtube/v3/'+path+'?'+new URLSearchParams(params),{method,headers:{Authorization:'Bearer '+access,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    const data=await result.json();
    if(!result.ok){
      const reason=data.error?.errors?.[0]?.reason;
      if(['quotaExceeded','dailyLimitExceeded','rateLimitExceeded'].includes(reason))throw fail(429,'Le quota YouTube est atteint. Réessayez plus tard ; les morceaux déjà ajoutés sont conservés.');
      if(['accessNotConfigured','serviceDisabled'].includes(reason))throw fail(409,'Activez YouTube Data API v3 dans votre projet Google Cloud.');
      if(result.status===401||reason==='insufficientPermissions')throw fail(409,'Reconnectez YouTube et autorisez la gestion des playlists.');
      if(reason==='youtubeSignupRequired')throw fail(409,'Créez d’abord une chaîne YouTube avec ce compte Google.');
      throw fail(502,'YouTube a refusé cette opération. Vérifiez la vidéo, la playlist et les droits du compte connecté.');
    }return data;
  }
  async function connect(access){
    if(!(access.scope||'').split(' ').includes(scope)||!access.refresh_token)throw fail(400,'Autorisez la gestion YouTube pour permettre les prochains ajouts.');
    const channels=await request('channels',{part:'snippet',mine:'true'},'GET',undefined,access.access_token),channel=channels.items?.[0];
    if(!channel)throw fail(409,'Ce compte ne possède pas de chaîne YouTube. Créez-en une sur YouTube, puis reconnectez-le.');
    if(await getSetting('youtube_channel_id')!==channel.id){await setSetting('youtube_playlist_id','');await setSetting('youtube_playlist_name','');}
    access.expires_at=Date.now()+access.expires_in*1000;
    await setSetting('youtube_tokens',encrypt(access,secret));await setSetting('youtube_channel_id',channel.id);await setSetting('youtube_channel_name',channel.snippet.title);
  }
  async function status(){return {configured:!!(config.googleId&&config.googleSecret),connected:!!await getSetting('youtube_tokens'),channel:await getSetting('youtube_channel_name')||'',playlistId:await getSetting('youtube_playlist_id')||'',playlistName:await getSetting('youtube_playlist_name')||''};}
  async function playlists(){
    const all=[];let page;
    do{const d=await request('playlists',{part:'snippet',mine:'true',maxResults:'50',...(page?{pageToken:page}:{})});all.push(...(d.items||[]).map(p=>({id:p.id,name:p.snippet.title})));page=d.nextPageToken;if(all.length>2000)throw fail(400,'Trop de playlists sur ce compte.');}while(page);return all;
  }
  async function choosePlaylist(id){
    if(typeof id!=='string'||!/^[-\w]{10,100}$/.test(id))throw fail(400,'Playlist invalide.');
    const d=await request('playlists',{part:'snippet',id}),p=d.items?.[0];
    if(!p||p.snippet.channelId!==await getSetting('youtube_channel_id'))throw fail(403,'Choisissez une playlist appartenant à la chaîne YouTube connectée.');
    await setSetting('youtube_playlist_id',p.id);await setSetting('youtube_playlist_name',p.snippet.title);return {id:p.id,name:p.snippet.title};
  }
  async function createPlaylist(title){
    if(typeof title!=='string'||!title.trim()||title.trim().length>150)throw fail(400,'Indiquez un nom de playlist (150 caractères maximum).');
    const p=await request('playlists',{part:'snippet,status'},'POST',{snippet:{title:title.trim(),description:'Sélection musicale de l’équipe — PORTAIL +'},status:{privacyStatus:'private'}});
    await setSetting('youtube_playlist_id',p.id);await setSetting('youtube_playlist_name',p.snippet.title);return {id:p.id,name:p.snippet.title};
  }
  async function track(id){if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Morceau invalide.');const t=(await db.query('SELECT id,artist,title,track_key FROM music_tracks WHERE id=$1',[id])).rows[0];if(!t)throw fail(404,'Morceau introuvable.');return t;}
  async function candidates(id){
    const t=await track(id),key='youtube_candidates:'+id;
    const raw=await getSetting(key),cached=raw?JSON.parse(raw):null;
    if(cached?.trackKey===t.track_key&&Date.now()-cached.at<30*86400000)return {trackId:id,candidates:cached.items};
    const result=await request('search',{part:'snippet',type:'video',q:t.artist+' '+t.title,maxResults:'3',videoCategoryId:'10'});
    const items=(result.items||[]).filter(v=>/^[\w-]{11}$/.test(v.id?.videoId||'')).map(v=>({id:v.id.videoId,title:v.snippet.title,channel:v.snippet.channelTitle}));
    await setSetting(key,JSON.stringify({trackKey:t.track_key,at:Date.now(),items}));return {trackId:id,candidates:items};
  }
  async function add({trackId,videoId,playlistId}){
    const action=async()=>{
      const t=await track(trackId);
      if(!/^[\w-]{11}$/.test(videoId||''))throw fail(400,'Vidéo invalide.');
      if(!playlistId||playlistId!==await getSetting('youtube_playlist_id'))throw fail(409,'La playlist a changé. Relancez la préparation.');
      const raw=await getSetting('youtube_candidates:'+trackId),cached=raw?JSON.parse(raw):null;
      if(cached?.trackKey!==t.track_key||Date.now()-cached.at>=30*86400000||!cached.items.some(v=>v.id===videoId))throw fail(400,'Préparez les vidéos et choisissez une correspondance proposée.');
      let page,total=0;
      do{const d=await request('playlistItems',{part:'contentDetails',playlistId,maxResults:'50',...(page?{pageToken:page}:{})});if((d.items||[]).some(v=>v.contentDetails?.videoId===videoId))return {added:false,alreadyPresent:true};total+=(d.items||[]).length;if(total>10000)throw fail(400,'Cette playlist est trop volumineuse.');page=d.nextPageToken;}while(page);
      await request('playlistItems',{part:'snippet'},'POST',{snippet:{playlistId,resourceId:{kind:'youtube#video',videoId}}});return {added:true,alreadyPresent:false};
    };
    const run=writing.then(action);writing=run.catch(()=>{});return run;
  }
  return {scope,connect,status,playlists,choosePlaylist,createPlaylist,candidates,add};
}
