// Coverage describes data availability, independently from temperature thresholds.
const sunday=(year,month)=>{const d=new Date(Date.UTC(year,month,0));d.setUTCDate(d.getUTCDate()-d.getUTCDay());return d.toISOString().slice(0,10);};
export function temperatureCoverage(sensors,daily,today){
 const cutoff=new Date(today+'T12:00:00Z');cutoff.setUTCFullYear(cutoff.getUTCFullYear()-3);const since=cutoff.toISOString().slice(0,10),current=today.slice(0,7);
 const rows=sensors.map(s=>{const entries=daily.filter(d=>d.sensor_id===s.id&&d.day>=since&&d.day<=today),first=entries.map(d=>d.day).sort()[0];return{sensorId:s.id,name:s.name,first,entries};});
 const first=rows.map(r=>r.first?.slice(0,7)).filter(Boolean).sort()[0];if(!first)return{months:[],sensors:rows.map(({entries,...r})=>({...r,periods:[]}))};
 const months=[];let cursor=first;while(cursor<=current&&months.length<37){months.push(cursor);const d=new Date(cursor+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);cursor=d.toISOString().slice(0,7);}
 return{months,sensors:rows.map(({entries,...r})=>({...r,periods:months.map(month=>{
  if(!r.first||month<r.first.slice(0,7))return{month,state:'not_started',days:0,expected:0,incomplete:0};
  const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10),from=[month+'-01',since,r.first].sort().at(-1),to=[end,today].sort()[0],expected=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;
  const present=entries.filter(d=>d.day>=from&&d.day<=to),incomplete=present.filter(d=>{const min=d.day===sunday(Number(d.day.slice(0,4)),3)?137:d.day===sunday(Number(d.day.slice(0,4)),10)?149:143;return Number(d.count)<min||Number(d.max_gap)>900||Number(d.first_seconds)>900||Number(d.last_seconds)<23*3600+44*60+59;}).length;
  return{month,state:!present.length?'missing':present.length<expected||incomplete?'partial':'present',days:present.length,expected,incomplete,ongoing:month===current};
 })}))};
}
