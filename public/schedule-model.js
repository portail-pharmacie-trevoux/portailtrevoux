export const timedWorkKinds=['travail','formation','ecole_cfa'];
export const slotKind=(entry,index)=>entry.slotKinds?.[index]||entry.kind;
const minutes=value=>{const [h,m]=value.split(':').map(Number);return h*60+m;};
export function minutesByKind(entry){const result={};for(const [i,[start,end]]of (entry?.slots||[]).entries()){const kind=slotKind(entry,i);result[kind]=(result[kind]||0)+minutes(end)-minutes(start);}for(const item of entry?.durations||[])result[item.kind]=(result[item.kind]||0)+item.minutes;return result;}
export function workMinutes(entry){return Object.entries(minutesByKind(entry)).reduce((sum,[kind,value])=>sum+(timedWorkKinds.includes(kind)?value:0),0);}
export function hasSensitiveKinds(entry){return [entry?.kind,...(entry?.slotKinds||[]),...(entry?.durations||[]).map(d=>d.kind)].some(kind=>['maladie','absence_injustifiee'].includes(kind));}
export function redactScheduleEntry(entry,own){if(own||!hasSensitiveKinds(entry))return entry;const hide=k=>['maladie','absence_injustifiee'].includes(k)?'absence':k;return {...entry,kind:hide(entry.kind),...(entry.slotKinds?{slotKinds:entry.slotKinds.map(hide),comments:(entry.comments||[]).map((v,i)=>hide(slotKind(entry,i))==='absence'?'':v)}:{}),...(entry.durations?{durations:entry.durations.map(d=>({...d,kind:hide(d.kind),...(hide(d.kind)==='absence'?{comment:''}:{})}))}:{}),readOnly:true};}
