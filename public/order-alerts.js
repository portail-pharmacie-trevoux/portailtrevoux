export const orderAlertTypes={late:'Commande en retard',soon:'À commander sous 7 jours',waiting:'Commande passée, non délivrée',unplanned:'Sans échéance programmée',incomplete:'Informations manquantes',unreadable:'Données illisibles'};
const date=value=>String(value).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3-$2-$1');
export function orderAlerts(r,day,due=r.nextOrder??r.initialNextOrder??''){
 if(r.suspended)return [];
 const last=new Date(day+'T12:00:00Z');last.setUTCDate(last.getUTCDate()+7);const end=last.toISOString().slice(0,10),waiting=!!r.confirmation&&(!r.delivery||Date.parse(r.confirmation.at)>Date.parse(r.delivery.at)),alerts=[];
 if(!due)alerts.push({code:'unplanned',text:'Sans date de prochaine commande.'});
 if(waiting)alerts.push({code:'waiting',text:'Commande passée le '+date(r.confirmation.date||'date inconnue')+' mais non délivrée.'});
 if(due&&!waiting&&due<day)alerts.push({code:'late',text:'Commande en retard depuis le '+date(due)+'.'});
 if(due&&!waiting&&due>=day&&due<=end)alerts.push({code:'soon',text:'Commande à passer pour le '+date(due)+'.'});
 const missing=[];if(!r.frequency)missing.push('fréquence');if(!r.treatment?.trim())missing.push('traitement');if(!r.mode?.trim())missing.push('mode de commande');if(missing.length)alerts.push({code:'incomplete',text:'À compléter : '+missing.join(', ')+'.'});
 return alerts;
}
export function legacyOrderAlerts(entry){return entry.alerts||entry.issues.map(text=>({text,code:text.startsWith('Sans date')?'unplanned':text.startsWith('Commande passée')?'waiting':text.startsWith('Commande en retard')?'late':text.startsWith('Commande à passer')?'soon':text.startsWith('À compléter')?'incomplete':'unreadable'}));}
export function orderAlertIcon(code,text=orderAlertTypes[code]){
 const icon=document.createElement('span');icon.className='order-alert-icon order-alert-'+(Object.hasOwn(orderAlertTypes,code)?code:'unreadable');icon.title=text;icon.setAttribute('role','img');icon.setAttribute('aria-label',text);
 icon.innerHTML='<svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true" fill="none"><path d="M10.3 4a2 2 0 0 1 3.4 0l8 14a2 2 0 0 1-1.7 3H4a2 2 0 0 1-1.7-3Z" fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-width="1.8"/><path d="M12 9v5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><circle cx="12" cy="17.5" r="1.2" fill="currentColor"/></svg>';return icon;
}
