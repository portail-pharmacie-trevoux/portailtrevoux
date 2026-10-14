import {errorTypes} from './quality-error-types.js';
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
const date=v=>v?new Date(v).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'}):'—';
const datetime=v=>new Date(v).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'});
export async function renderQualityErrors({container,api,isCurrent=()=>true,onBack}){
 const back=el('button','← Démarche qualité','btn');back.type='button';back.onclick=onBack;
 const area=el('div'),error=el('p','','error');error.setAttribute('role','alert');container.replaceChildren(back,el('h3','Recueil des erreurs de délivrance'),area,error);
 const current=()=>isCurrent()&&container.contains(area);let data,query='';
 const run=async fn=>{error.textContent='';try{await fn();}catch(e){if(current())error.textContent=e.message;}};
 const load=async()=>{data=await api('/api/quality/errors');if(current())draw();};
 function draw(){
  const add=el('button','Déclarer une erreur','btn primary');add.type='button';add.onclick=()=>edit();const tools=el('div','','universe-toolbar');const search=el('input');search.type='search';search.id='quality-error-search';search.placeholder='Type, détail, collaborateur, action, date…';search.value=query;const searchLabel=el('label','Rechercher une erreur');searchLabel.htmlFor=search.id;const searchBox=el('div','','universe-search');searchBox.append(searchLabel,search);const exportLink=el('a','Exporter le listing complet en Excel','btn');exportLink.href='/api/quality/errors/export.xlsx';exportLink.download='erreurs-delivrance.xlsx';const actionButtons=el('div','','universe-actions');actionButtons.append(add,exportLink);tools.append(searchBox,actionButtons);area.replaceChildren(tools);
  if(!data.errors.length){area.append(el('p','Aucune erreur enregistrée.','empty'));return;}
  const scroll=el('div','','quality-errors-scroll'),table=el('table','','quality-errors-table'),head=el('thead'),tr=el('tr');
  for(const text of ['Date d’identification','Opérateur déclarant','Type d’erreur','Détail de l’erreur','Responsable de l’erreur','Date de l’erreur','Actions correctives et information','Gravité','Gestion']){const th=el('th',text);th.scope='col';tr.append(th);}head.append(tr);table.append(head);const body=el('tbody');table.append(body);
  for(const row of data.errors){
   const line=el('tr');for(const text of [date(row.identified_date),row.operator_name,row.error_type,row.details,row.responsible_name,date(row.error_date)])line.append(el('td',text));
   const actions=el('td');actions.append(el('p',row.actions||'Non renseignées'));
   for(const [target,label,field]of [['operator','Opérateur prévenu','operator_notified'],['patient','Patient prévenu','patient_notified'],['doctor','Médecin prévenu','doctor_notified']]){
    const block=el('div','','quality-notification'),lab=el('label',label),check=el('input');check.type='checkbox';check.checked=!!row[field+'_at'];lab.prepend(check);block.append(lab);
    if(row[field+'_at'])block.append(el('small',datetime(row[field+'_at'])+' — '+(row[field+'_name']||'Opérateur')));
    if(target==='doctor'&&row.doctor_notified_at){const link=el('button','Déclarer l’appel au prescripteur','btn small');link.type='button';link.onclick=()=>void run(async()=>{const m=await import('./quality-prescriber-calls.js');if(current())await m.renderPrescriberCalls({container,api,isCurrent,onBack:()=>renderQualityErrors({container,api,isCurrent,onBack}),initialError:row});});block.append(link);}
    check.onchange=()=>{check.disabled=true;void run(async()=>{try{await api('/api/quality/errors/'+row.id+'/notification','PUT',{target,checked:check.checked,revision:row.revision});await load();}catch(e){check.checked=!!row[field+'_at'];await load();throw e;}});};actions.append(block);
   }
   line.append(actions);const severity=el('td'),bar=el('div','','quality-severity-bar level-'+row.severity);bar.setAttribute('aria-label','Gravité '+row.severity+' sur 4');for(let i=1;i<=4;i++){const part=el('span',String(i),i<=row.severity?'filled':'');part.setAttribute('aria-hidden','true');bar.append(part);}severity.append(bar,el('small',row.severity+' / 4'));line.append(severity);const management=el('td');if(data.isAdmin){const b=el('button','Modifier','btn');b.type='button';b.onclick=()=>edit(row);management.append(b);}if(data.isAdmin){const del=el('button','Supprimer','btn quality-error-delete');del.type='button';del.onclick=()=>{if(!confirm('Supprimer définitivement cette erreur de délivrance identifiée le '+date(row.identified_date)+' ?'))return;del.disabled=true;void run(async()=>{try{await api('/api/quality/errors/'+row.id,'DELETE',{revision:row.revision});await load();}catch(e){del.disabled=false;throw e;}});};management.append(del);}line.append(management);line.dataset.search=[date(row.identified_date),row.operator_name,row.error_type,row.details,row.responsible_name,date(row.error_date),row.actions,String(row.severity)].join(' ');body.append(line);
  }
  const count=el('p','','status-line'),empty=el('p','Aucune erreur ne correspond à la recherche.','empty');const norm=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();function filter(){const terms=norm(query).trim().split(/\s+/).filter(Boolean);let visible=0;for(const line of body.children){line.hidden=!terms.every(term=>norm(line.dataset.search).includes(term));if(!line.hidden)visible++;}count.textContent=visible+' / '+data.errors.length+' erreur(s)';empty.hidden=visible!==0;}search.oninput=()=>{query=search.value;filter();};filter();scroll.append(table);area.append(count,scroll,empty);
 }
 function edit(row){
  const form=el('form','','quality-error-form'),fields={};
  const input=(name,label,type,value,required=false)=>{const n=el('input');n.type=type;n.value=value||'';n.required=required;fields[name]=n;const lab=el('label',label);lab.append(n);form.append(lab);return n;};
  const identified=input('identifiedDate','1. Date d’identification','date',row?.identified_date?.slice(0,10)||data.today,true);identified.max=data.today;
  form.append(el('p','2. Opérateur déclarant : '+(row?.operator_name||data.operatorName),'field-note'));
  const select=el('select');select.required=true;select.append(new Option('Choisir le type d’erreur',''));errorTypes.forEach(t=>select.append(new Option(t,t)));select.value=row?.error_type||'';fields.type=select;const typeLabel=el('label','3. Type d’erreur');typeLabel.append(select);form.append(typeLabel);
  const textarea=(name,label,value,required=false)=>{const n=el('textarea');n.rows=3;n.maxLength=5000;n.value=value||'';n.required=required;fields[name]=n;const lab=el('label',label);lab.append(n);form.append(lab);};
  textarea('details','4. Détail de l’erreur',row?.details,true);
  const responsible=el('select');responsible.required=true;responsible.append(new Option('Choisir le collaborateur',''));data.people.forEach(p=>responsible.append(new Option(p.name+(p.active?'':' (inactif)'),String(p.id))));responsible.value=row?.responsible_id?String(row.responsible_id):'';fields.responsibleId=responsible;const responsibleLabel=el('label','5. Responsable de l’erreur');responsibleLabel.append(responsible);form.append(responsibleLabel);
  const errorDate=input('errorDate','6. Date de l’erreur','date',row?.error_date?.slice(0,10),true);errorDate.max=identified.value;identified.onchange=()=>errorDate.max=identified.value;
  textarea('actions','7. Actions correctives',row?.actions);
  const range=input('severity','8. Gravité de l’erreur','range',String(row?.severity||1));range.min='1';range.max='4';range.step='1';const value=el('output'),bar=el('div');bar.setAttribute('aria-hidden','true');const update=()=>{value.textContent='Niveau '+range.value+' / 4';bar.className='quality-severity-bar level-'+range.value;bar.replaceChildren(...[1,2,3,4].map(i=>el('span',String(i),i<=Number(range.value)?'filled':'')));};range.oninput=update;update();form.append(value,bar,el('p','1 : orange · 4 : rouge vif. Les coches d’information sont disponibles sur la ligne après enregistrement.','field-note'));
  const save=el('button','Enregistrer','btn primary'),cancel=el('button','Annuler','btn');save.type='submit';cancel.type='button';cancel.onclick=draw;const actions=el('div','','universe-actions');actions.append(cancel,save);form.append(actions);
  form.onsubmit=e=>{e.preventDefault();save.disabled=true;void run(async()=>{try{const b=Object.fromEntries(Object.entries(fields).map(([key,n])=>[key,['severity','responsibleId'].includes(key)?Number(n.value):n.value]));if(row)b.revision=row.revision;await api('/api/quality/errors'+(row?'/'+row.id:''),row?'PUT':'POST',b);await load();}finally{save.disabled=false;}});};area.replaceChildren(form);
 }
 await run(load);
}
