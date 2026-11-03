const yearOf=value=>{const n=Number(value);return Number.isInteger(n)&&n>=2000&&n<=2100?n:null;};
const text=value=>typeof value==='string'?value:'';
const populated=period=>!!(period.conditions.trim()||period.franco.trim());
// Calendar-year validity is evaluated in pharmacy time, independent of save order.
// Projection only: neither the stored fields nor the historical records are changed.
export function laboratoryConditions(details,now=new Date()){
 const year=Number(new Intl.DateTimeFormat('en',{timeZone:'Europe/Paris',year:'numeric'}).format(new Date(now))),periods=new Map();
 for(const [key,value]of Object.entries(details.conditionsHistory||{})){
  if(!value||typeof value!=='object'||Array.isArray(value))continue;
  const periodYear=yearOf(value.year??key);
  periods.set(key,{...value,key,year:periodYear,conditions:text(value.conditions),franco:text(value.franco)});
 }
 if(text(details.conditions).trim()||text(details.franco).trim()){
  const periodYear=yearOf(details.conditionsYear),key=periodYear===null?'non-datees':String(periodYear);
  periods.set(key,{...periods.get(key),key,year:periodYear,conditions:text(details.conditions),franco:text(details.franco)});
 }
 const entries=[...periods.values()],current=entries.find(p=>p.key===String(year)&&p.year===year&&populated(p))||entries.find(p=>p.year===year&&populated(p))||null;
 return {year,current,history:entries.filter(p=>p!==current).sort((a,b)=>(b.year??0)-(a.year??0)||b.key.localeCompare(a.key))};
}
