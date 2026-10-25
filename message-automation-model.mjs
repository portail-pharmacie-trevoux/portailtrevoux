export const automationKinds=['custom','rh','temperature','tierspayant','merch-validation','merch-free','challenges','training','annual','orders'];
export const normalizeService=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
export function parisWall(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(v=>[v.type,v.value]));
 return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
const realDate=s=>typeof s==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const ids=v=>Array.isArray(v)&&v.length<=200&&v.every(n=>Number.isSafeInteger(n)&&n>0);
export const templateVariables=['date','date_fin','mois','mois_precedent','mois_suivant','service','trimestre','annee','fin_trimestre','nombre_lignes','emplacements'];
export function validateAutomation(body,fail){
 if(!body||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>120||typeof body.enabled!=='boolean')throw fail(400,'Renseignez un nom (120 caractères maximum) et l’état de la programmation.');
 const c=body.config;
 if(!c||!['once','daily','weekly','monthly','quarterly','yearly'].includes(c.frequency)||!realDate(c.startDate)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.time||'')||typeof c.monthEnd!=='boolean')throw fail(400,'Choisissez une date, une heure et une fréquence valides.');
 if(typeof c.text!=='string'||!c.text.trim()||c.text.length>500||!['normal','important'].includes(c.priority)||typeof c.canArchive!=='boolean')throw fail(400,'Renseignez un texte de 1 à 500 caractères et une priorité valide.');
 for(const token of c.text.match(/\{[^{}]+\}/g)||[])if(!templateVariables.includes(token.slice(1,-1)))throw fail(400,'Variable inconnue : '+token);
 const a=c.audience;
 if(!a||!['default','all','users','services'].includes(a.mode)||!ids(a.userIds)||!ids(a.serviceIds)||a.mode==='users'&&!a.userIds.length||a.mode==='services'&&!a.serviceIds.length)throw fail(400,'Sélectionnez les destinataires de la programmation.');
 return {name:body.name.trim(),enabled:body.enabled,config:{frequency:c.frequency,startDate:c.startDate,time:c.time,monthEnd:c.monthEnd,text:c.text.trim(),priority:c.priority,canArchive:c.canArchive,audience:{mode:a.mode,userIds:[...new Set(a.userIds)],serviceIds:[...new Set(a.serviceIds)]}}};
}
const dayValue=date=>Math.floor(Date.parse(date+'T12:00:00Z')/86400000);
const shift=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
function nth(config,n){
 const [year,month,day]=config.startDate.split('-').map(Number);
 if(config.frequency==='once')return n?null:config.startDate;
 if(config.frequency==='daily'||config.frequency==='weekly')return shift(config.startDate,n*(config.frequency==='daily'?1:7));
 const step={monthly:1,quarterly:3,yearly:12}[config.frequency],d=new Date(Date.UTC(year,month-1+n*step,1)),last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
 d.setUTCDate(config.monthEnd?last:Math.min(day,last));return d.toISOString().slice(0,10);
}
function nearIndex(config,day){
 if(config.frequency==='once')return 0;
 if(config.frequency==='daily'||config.frequency==='weekly')return Math.max(0,Math.floor((dayValue(day)-dayValue(config.startDate))/(config.frequency==='daily'?1:7)));
 const [y,m]=day.split('-').map(Number),[sy,sm]=config.startDate.split('-').map(Number);return Math.max(0,Math.floor(((y-sy)*12+m-sm)/({monthly:1,quarterly:3,yearly:12}[config.frequency])));
}
export function automationOccurrence(config,now=new Date(),next=false,completedDates=[]){
 const wall=parisWall(now),day=wall.slice(0,10);let n=nearIndex(config,day),date=nth(config,n);
 if(next){const completed=new Set(completedDates);while(date&&(date+'T'+config.time+':00'<=wall||completed.has(date)))date=nth(config,++n);}
 else {while(date&&date+'T'+config.time+':00'>wall){if(n===0)return null;date=nth(config,--n);}}
 return date?{date,wall:date+'T'+config.time+':00'}:null;
}
export function automationContext(date,extra={}){
 const [year,month]=date.split('-').map(Number),quarter=Math.floor((month-1)/3)+1;
 const label=d=>new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',month:'long',year:'numeric'}).format(d),human=d=>d.split('-').reverse().join('/');
 return {date:human(date),date_fin:human(shift(date,7)),mois:label(new Date(date+'T12:00:00Z')),mois_precedent:label(new Date(Date.UTC(year,month-2,1))),mois_suivant:label(new Date(Date.UTC(year,month,1))),service:'',trimestre:String(quarter),annee:String(year),fin_trimestre:human(new Date(Date.UTC(year,quarter*3,0)).toISOString().slice(0,10)),nombre_lignes:'0',emplacements:'',...extra};
}
export const renderAutomationText=(template,context)=>template.replace(/\{([^{}]+)\}/g,(_,key)=>String(context[key]??''));
