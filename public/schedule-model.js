export const timedWorkKinds=['travail','formation','ecole_cfa','reunion'];
export const slotKind=(entry,index)=>entry.slotKinds?.[index]||entry.kind;
const minutes=value=>{const [h,m]=value.split(':').map(Number);return h*60+m;};
export function minutesByKind(entry){const result={};for(const [i,[start,end]]of (entry?.slots||[]).entries()){const kind=slotKind(entry,i);result[kind]=(result[kind]||0)+minutes(end)-minutes(start);}for(const item of entry?.durations||[])result[item.kind]=(result[item.kind]||0)+item.minutes;return result;}
export function workMinutes(entry){return Object.entries(minutesByKind(entry)).reduce((sum,[kind,value])=>sum+(timedWorkKinds.includes(kind)?value:0),0);}
export function hasSensitiveKinds(entry){return [entry?.kind,...(entry?.slotKinds||[]),...(entry?.durations||[]).map(d=>d.kind)].some(kind=>['maladie','absence_injustifiee'].includes(kind));}
export function redactScheduleEntry(entry,own){if(own||!hasSensitiveKinds(entry))return entry;const hide=k=>['maladie','absence_injustifiee'].includes(k)?'absence':k;return {...entry,kind:hide(entry.kind),...(entry.slotKinds?{slotKinds:entry.slotKinds.map(hide),comments:(entry.comments||[]).map((v,i)=>hide(slotKind(entry,i))==='absence'?'':v)}:{}),...(entry.durations?{durations:entry.durations.map(d=>({...d,kind:hide(d.kind),...(hide(d.kind)==='absence'?{comment:''}:{})}))}:{}),readOnly:true};}

// Shared by live entry validation and tests; adjacent slots are allowed.
export function scheduleTimeIssues(items){
 const issues=[],timed=[];let total=0;
 const parse=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v)?minutes(v):null;
 items.forEach((item,i)=>{const n=i+1;if(item.times){const a=parse(item.times[0]),b=parse(item.times[1]);if(a===null||b===null){issues.push({indices:[i],message:'Créneau '+n+' : renseignez le début et la fin.'});return;}if(b<=a){issues.push({indices:[i],message:'Créneau '+n+' : la fin doit être après le début.'});return;}if(a<450||b>1290)issues.push({indices:[i],message:'Créneau '+n+' : horaires autorisés de 7 h 30 à 21 h 30.'});timed.push({a,b,i});total+=b-a;}else{const value=parse(item.duration);if(value===null||(value===0&&item.kind!=='repos')||value>840)issues.push({indices:[i],message:'Créneau '+n+' : renseignez une durée valide (14 heures maximum).'});else total+=value;}});
 for(let a=0;a<timed.length;a++)for(let b=a+1;b<timed.length;b++){const x=timed[a],y=timed[b];if(x.a<y.b&&y.a<x.b)issues.push({indices:[x.i,y.i],message:'Les créneaux '+(x.i+1)+' et '+(y.i+1)+' se chevauchent.'});}
 if(total>840)issues.push({indices:items.map((_,i)=>i),message:'Le total de la journée dépasse 14 heures.'});return issues;
}
