export function parisDate(date=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function safeJoke(data) {
  const flags=['nsfw','religious','political','racist','sexist','explicit'];
  if(data?.error!==false||data.lang!=='fr'||data.safe!==true||flags.some(f=>data.flags?.[f]!==false))return null;
  const text=data.type==='single'?data.joke:data.type==='twopart'&&typeof data.setup==='string'&&typeof data.delivery==='string'?data.setup+'\n'+data.delivery:null;
  return typeof text==='string'&&text.trim()&&text.length<=500?{id:data.id,text:text.trim()}:null;
}
export function createDailyJoke({getSetting,setSetting,publish,fetchImpl=fetch,now=()=>new Date()}) {
  let pending=null,retryAt=0;
  async function refresh() {
    const day=parisDate(now());
    let saved;try{saved=JSON.parse(await getSetting('daily_joke')||'null');}catch{}
    if(saved?.day===day)return saved;
    if(now().getTime()<retryAt)return saved?{...saved,stale:true}:null;
    try {
      for(let attempt=0;attempt<3;attempt++) {
        const response=await fetchImpl('https://v2.jokeapi.dev/joke/Any?lang=fr&blacklistFlags=nsfw,religious,political,racist,sexist,explicit&safe-mode',{signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw Error('Source indisponible');
        const joke=safeJoke(await response.json());
        if(!joke||joke.id===saved?.id)continue;
        const result={...joke,day,source:'JokeAPI'};
        await setSetting('daily_joke',JSON.stringify(result));
        await publish('Fun','La blague du jour est arrivée','joke:'+day);
        return result;
      }
    }catch{}
    retryAt=now().getTime()+15*60000;
    return saved?{...saved,stale:true}:null;
  }
  return ()=>{if(!pending)pending=refresh().finally(()=>{pending=null;});return pending;};
}
