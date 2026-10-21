const interval=15*60*1000;
export function calendarConnectionHealth({configured,tokens,error='',syncedAt,calendarId},now=Date.now()){
 const stale=syncedAt&&now-new Date(syncedAt).getTime()>45*60*1000;
 const reconnect=!!tokens&&/autorisation|reconnect|renouvel/i.test(error);
 return {configured,connected:!!tokens&&!reconnect,state:!configured?'configuration':!tokens?'disconnected':reconnect?'reconnect':error?'temporary':!calendarId?'selection':!syncedAt||stale?'stale':'ok',error:error||(!tokens?'Google Agenda n’est pas connecté.':!calendarId?'Sélectionnez l’agenda de la pharmacie.':!syncedAt||stale?'La synchronisation de Google Agenda n’est pas à jour.':''),lastSuccessAt:syncedAt||null};
}
export function createGoogleConnectionHealth({getSetting,setSetting,mailer,configured,readCalendar,now=()=>Date.now()}){
 let checking=null;
 async function checkMail(){
  const status=await mailer.status();if(!status.connected)return {...status,state:status.configured?'disconnected':'configuration',error:'Gmail n’est pas connecté.'};
  let cached;try{cached=JSON.parse(await getSetting('mail_connection_health')||'null');}catch{}
  if(cached?.checkedAt&&now()-Date.parse(cached.checkedAt)>=0&&now()-Date.parse(cached.checkedAt)<interval)return {...status,...cached};
  if(!checking)checking=(async()=>{const checkedAt=new Date(now()).toISOString();let result;
   try{await mailer.checkConnection();result={state:'ok',connected:true,error:'',checkedAt,lastSuccessAt:checkedAt};}
   catch(e){const reconnect=e.status===409;result={state:reconnect?'reconnect':'temporary',connected:!reconnect,error:reconnect?'L’autorisation Gmail doit être renouvelée. Reconnectez le compte de la pharmacie.':'La vérification Gmail est momentanément indisponible. Nouvelle tentative automatique.',checkedAt,lastSuccessAt:cached?.lastSuccessAt||null};}
   await setSetting('mail_connection_health',JSON.stringify(result));return {...status,...result};
  })().finally(()=>{checking=null;});return checking;
 }
 return {checkMail,status:async()=>{const [calendar,mail]=await Promise.all([readCalendar(),checkMail()]);return {calendar:calendarConnectionHealth({configured,...calendar},now()),mail};}};
}
