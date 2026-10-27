export const moneyRound=n=>Math.round((n+Number.EPSILON)*100)/100;
export function previousYearDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return '';const [y,m,d]=value.split('-').map(Number),last=new Date(Date.UTC(y-1,m,0)).getUTCDate();return String(y-1)+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(d,last)).padStart(2,'0');}
const number=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
export function impactFinancials(data,prefix){
 const units=number(data[prefix+'Units']),purchase=number(data[prefix+'PurchasePriceHT']),price=number(data[prefix+'SellingPriceTTC']);
 const auto=data[prefix+'RevenueMode']==='auto';const revenue=auto?(units!==null&&price!==null?moneyRound(units*price):null):number(data[prefix+'Revenue']);
 const vat=number(data[prefix+'VatRate']);const revenueHT=data[prefix+'VatMode']==='mixed'?number(data[prefix+'RevenueHT']):revenue!==null&&vat!==null?moneyRound(revenue/(1+vat/100)):null;
 const cost=units!==null&&purchase!==null?moneyRound(units*purchase):null;
 return{units,revenue,revenueHT,cost,margin:revenueHT!==null&&cost!==null?moneyRound(revenueHT-cost):null};
}
export function impactAnalysis(data){
 const before=impactFinancials(data,'reference'),after=impactFinancials(data,'promotion');
 const compare=(a,b,currency=false)=>{if(a===null||b===null)return null;const delta=currency?moneyRound(b-a):b-a;return{before:a,after:b,delta,percent:a===0?null:delta/Math.abs(a)*100,direction:delta===0?'equal':delta>0?'up':'down'};};
 return{reference:before,promotion:after,units:compare(before.units,after.units),revenue:compare(before.revenue,after.revenue,true),margin:compare(before.margin,after.margin,true)};
}

export function frenchPublicHolidays(year){
 if(!Number.isInteger(year)||year<2000||year>2099)return new Set();
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1,easter=Date.UTC(year,month-1,day);
 const fixed=['01-01','05-01','05-08','07-14','08-15','11-01','11-11','12-25'].map(x=>year+'-'+x);
 return new Set([...fixed,...[1,39,50].map(n=>new Date(easter+n*86400000).toISOString().slice(0,10))]);
}
export function frenchOpeningDays(start,end){
 const parse=s=>{if(!/^20\d{2}-\d{2}-\d{2}$/.test(s||''))return null;const t=Date.parse(s+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s?t:null;};
 const a=parse(start),b=parse(end);if(a===null||b===null||b<a||b-a>366*86400000)return null;let total=0;const years=new Map();for(let t=a;t<=b;t+=86400000){const d=new Date(t),year=d.getUTCFullYear();if(!years.has(year))years.set(year,frenchPublicHolidays(year));if(d.getUTCDay()!==0&&!years.get(year).has(d.toISOString().slice(0,10)))total++;}return total;
}
