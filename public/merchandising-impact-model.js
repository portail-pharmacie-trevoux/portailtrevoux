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
