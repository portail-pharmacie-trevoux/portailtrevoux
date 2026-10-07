import {protectOrderSpace} from './order-mfa.js';
import {openOrderImport} from './order-import.js';
const columns=[['frequency','FRÉQUENCE (jours)','number'],['nextOrder','DATE PROCHAINE COMMANDE','date'],['lastName','NOM','text'],['firstName','PRÉNOM','text'],['treatment','TRAITEMENT','textarea'],['mode','MODE DE COMMANDE','select'],['comments','COMMENTAIRES','textarea']];
const modes=['grossiste','direct labo','prep rosiers'];
const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
export async function renderOrderPlanning(options){return protectOrderSpace({...options,render:({api,isCurrent})=>renderOrderTable({...options,api,isCurrent})});}
async function renderOrderTable({container,api,canEdit,isCurrent}){
 const rows=await api('/api/order-planning');if(!isCurrent())return;
 const root=node('div','','order-planning'),toolbar=node('div','','order-plan-toolbar'),wrap=node('div','','order-plan-scroll'),table=node('table','','order-plan-table'),head=node('thead'),header=node('tr'),body=node('tbody');
 wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Commandes programmées, tableau à défilement horizontal');
 for(const title of ['COMMANDE PASSÉE','COMMANDE DÉLIVRÉE']){const th=node('th',title);th.scope='col';header.append(th);}
 columns.forEach(([,title])=>{const th=node('th',title);th.scope='col';header.append(th);});if(canEdit){const th=node('th','GESTION');th.scope='col';header.append(th);}head.append(header);table.append(head,body);wrap.append(table);
 const notice=node('p',canEdit?'Une ligne par personne. Saisissez une première échéance pour démarrer le cycle. La fréquence reste modifiable. Ensuite, la prochaine commande se calcule à partir de la date de délivrance et de la fréquence en jours. Enregistrez chaque ligne après modification. Le panneau rouge indique une commande prévue dans les 7 jours. Les cases « Commande passée » et « Commande délivrée » enregistrent la date et vos initiales. La délivrance recalcule la prochaine échéance ; décocher retire la validation.':'Tableau des commandes programmées.','field-note');
 const searchBox=node('label','Rechercher un nom ou un traitement','order-plan-search'),search=node('input');search.type='search';search.placeholder='Nom, prénom ou traitement…';search.setAttribute('aria-label','Rechercher un nom, un prénom ou un traitement');searchBox.append(search);const stateFilter=node('select');stateFilter.setAttribute('aria-label','Filtrer les commandes par état');for(const [value,label]of [['all','Toutes les commandes'],['late','En retard'],['due','À commander'],['waiting','En attente de délivrance'],['suspended','Suspendues']]){const option=node('option',label);option.value=value;stateFilter.append(option);}searchBox.append(stateFilter);
 const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
 function filterRows(){const todayParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));const today=todayParts.year+'-'+todayParts.month+'-'+todayParts.day,limit=new Date(today+'T12:00:00Z');limit.setUTCDate(limit.getUTCDate()+7);const end=limit.toISOString().slice(0,10);const terms=normalize(search.value).trim().split(/\s+/).filter(Boolean);for(const row of body.children){const text=normalize(['NOM','PRÉNOM','TRAITEMENT'].map(key=>row.querySelector('[aria-label^="'+key+' ·"]')?.value||'').join(' '));const suspended=row.dataset.suspended==='true',due=row.querySelector('[aria-label^="DATE PROCHAINE"]')?.value,waiting=row.dataset.waiting==='true',matches=stateFilter.value==='all'||(stateFilter.value==='suspended'?suspended:!suspended&&(stateFilter.value==='waiting'?waiting:stateFilter.value==='late'?!!due&&due<today&&!waiting:!!due&&due>=today&&due<=end&&!waiting));row.classList.toggle('hidden',!matches||!terms.every(term=>text.includes(term)));}updateEmpty();}
 stateFilter.addEventListener('change',filterRows);search.addEventListener('input',filterRows);search.addEventListener('search',filterRows);
 const empty=node('p','Aucune commande programmée.','empty');
 function sortRows(){const items=[...body.children];items.sort((a,b)=>Number(a.dataset.suspended==='true')-Number(b.dataset.suspended==='true')||(a.querySelector('[aria-label^="DATE PROCHAINE"]')?.value||'9999').localeCompare(b.querySelector('[aria-label^="DATE PROCHAINE"]')?.value||'9999'));items.forEach(r=>body.append(r));}
 function updateEmpty(){const visible=[...body.children].some(row=>!row.classList.contains('hidden'));empty.textContent=body.children.length?'Aucune commande ne correspond à votre recherche.':'Aucune commande programmée.';empty.classList.toggle('hidden',visible);}
 function addRow(record={mode:'grossiste'}){
  const row=node('tr','',''+(record.id?'':'order-plan-dirty')),inputs={},actions=node('td','','order-plan-actions'),status=node('span','','order-plan-status');status.setAttribute('role','status');let saved={...record},changed=false;
  const tracking=node('td','','order-plan-tracking'),warning=node('span','⚠\uFE0E','order-plan-warning'),checked=node('input'),checkLabel=node('label',''),stamp=node('span','','order-plan-stamp');
  checked.type='checkbox';checked.setAttribute('aria-label','Commande passée · '+([record.lastName,record.firstName].filter(Boolean).join(' ')||'Nouvelle ligne'));checkLabel.append(checked,node('span','Commande passée'));warning.title='Prochaine commande dans les 7 jours';warning.setAttribute('aria-label',warning.title);tracking.append(warning,checkLabel,stamp);row.append(tracking);
  const deliveryCell=node('td','','order-plan-tracking'),delivered=node('input'),deliveryLabel=node('label'),deliveryStamp=node('span','','order-plan-stamp');delivered.type='checkbox';delivered.setAttribute('aria-label','Commande délivrée · '+([record.lastName,record.firstName].filter(Boolean).join(' ')||'Nouvelle ligne'));deliveryLabel.append(delivered,node('span','Commande délivrée'));deliveryCell.append(deliveryLabel,deliveryStamp);row.append(deliveryCell);
  const day=value=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value).map(p=>[p.type,p.value]));return parts.year+'-'+parts.month+'-'+parts.day;};
  function trackingState(){row.dataset.suspended=String(!!saved.suspended);row.dataset.waiting=String(!!saved.confirmation&&(!saved.delivery||Date.parse(saved.confirmation.at)>Date.parse(saved.delivery.at)));row.classList.toggle('order-plan-suspended',!!saved.suspended);inputs.nextOrder.readOnly=!!saved.delivery;inputs.nextOrder.title=saved.delivery?'Calcul : date de délivrance + fréquence':'Première échéance, saisie manuelle';suspend.textContent=saved.suspended?'Reprendre':'Suspendre';suspend.disabled=!canEdit||!saved.id||changed;const today=day(new Date()),limit=new Date(today+'T12:00:00Z');limit.setUTCDate(limit.getUTCDate()+7);const due=inputs.nextOrder?.value;warning.classList.toggle('hidden',saved.suspended||!due||due<today||due>limit.toISOString().slice(0,10));checked.checked=!!saved.confirmation;checked.disabled=!canEdit||!saved.id||changed;delivered.checked=!!saved.delivery;delivered.disabled=!canEdit||!saved.id||changed;deliveryStamp.textContent=saved.delivery?saved.delivery.date.split('-').reverse().join('/')+' · '+saved.delivery.initials:'';deliveryStamp.title=saved.delivery?'Délivré le '+new Date(saved.delivery.at).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}):'';stamp.textContent=saved.confirmation?saved.confirmation.date.split('-').reverse().join('/')+' · '+saved.confirmation.initials:'';stamp.title=saved.confirmation?'Validé le '+new Date(saved.confirmation.at).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}):'';}
  for(const [key,title,type] of columns){
   const cell=node('td'),input=node(type==='textarea'?'textarea':type==='select'?'select':'input');
   if(type==='select')modes.forEach(mode=>{const option=node('option',mode);option.value=mode;input.append(option);});
   else if(type!=='textarea')input.type=type;
   if(type==='textarea'){input.rows=2;input.maxLength=4000;}if(type==='text')input.maxLength=100;
   if(key==='nextOrder'){input.readOnly=!!record.delivery;input.title='Calcul automatique : date de délivrance + fréquence en jours';}
   if(type==='number'){input.min=1;input.max=3650;input.step=1;input.placeholder='Ex. 28';}
   input.value=record[key]??'';input.setAttribute('aria-label',title+' · '+([record.lastName,record.firstName].filter(Boolean).join(' ')||'Nouvelle ligne'));input.disabled=!canEdit;
   if(['lastName','firstName'].includes(key))input.required=true;
   inputs[key]=input;cell.append(input);row.append(cell);
  }
  const calculate=()=>{const frequency=Number(inputs.frequency.value);if(saved.delivery?.date&&Number.isInteger(frequency)&&frequency>0&&frequency<=3650){const date=new Date(saved.delivery.date+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+frequency);inputs.nextOrder.value=date.toISOString().slice(0,10);}else if(saved.delivery)inputs.nextOrder.value='';trackingState();dirty();};
  const suspend=node('button','Suspendre','btn small');suspend.type='button';
  const save=node('button','Enregistrer','btn small primary'),remove=node('button',saved.id?'Supprimer':'Retirer','btn small');save.type=remove.type='button';save.disabled=!!saved.id;
  function dirty(){if(canEdit){changed=true;row.classList.add('order-plan-dirty');save.disabled=false;checked.disabled=true;delivered.disabled=true;suspend.disabled=true;status.textContent='À enregistrer';}}
  for(const input of Object.values(inputs))input.addEventListener('input',()=>{dirty();filterRows();});
  inputs.frequency.addEventListener('input',calculate);
  function busy(value){Object.values(inputs).forEach(i=>i.disabled=value||!canEdit);save.disabled=remove.disabled=value;suspend.disabled=value||!saved.id||changed;checked.disabled=delivered.disabled=value||!canEdit||!saved.id||changed;}
  save.onclick=async()=>{
   for(const input of Object.values(inputs))if(!input.reportValidity())return;
   const values=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,key==='frequency'?(input.value?Number(input.value):null):input.value]));busy(true);status.textContent='Enregistrement…';
   try{const result=await api('/api/order-planning'+(saved.id?'/'+saved.id:''),saved.id?'PUT':'POST',{...values,revision:saved.revision});if(!isCurrent())return;saved=result;changed=false;row.classList.remove('order-plan-dirty');for(const [key,input]of Object.entries(inputs))input.value=result[key]??'';remove.textContent='Supprimer';status.textContent='Enregistré';busy(false);save.disabled=true;trackingState();sortRows();filterRows();}
   catch(error){if(!isCurrent())return;status.textContent=error.message;busy(false);checked.disabled=delivered.disabled=true;}
  };
  checked.onchange=async()=>{
   const enabled=checked.checked;busy(true);status.textContent='Validation…';
   try{const result=await api('/api/order-planning/'+saved.id+'/confirmation','POST',{enabled,revision:saved.revision});if(!isCurrent())return;saved=result;changed=false;row.classList.remove('order-plan-dirty');for(const [key,input]of Object.entries(inputs))input.value=result[key]??'';status.textContent=enabled?'Commande passée':'Validation retirée';busy(false);save.disabled=true;trackingState();sortRows();filterRows();}
   catch(error){if(!isCurrent())return;status.textContent=error.message;busy(false);trackingState();save.disabled=true;}
  };
  delivered.onchange=async()=>{
   const enabled=delivered.checked;busy(true);status.textContent='Validation…';
   try{const result=await api('/api/order-planning/'+saved.id+'/delivery','POST',{enabled,revision:saved.revision});if(!isCurrent())return;saved=result;changed=false;row.classList.remove('order-plan-dirty');for(const [key,input]of Object.entries(inputs))input.value=result[key]??'';status.textContent=enabled?'Commande délivrée':'Délivrance retirée';busy(false);save.disabled=true;trackingState();sortRows();filterRows();}
   catch(error){if(!isCurrent())return;status.textContent=error.message;busy(false);trackingState();save.disabled=true;}
  };
  suspend.onclick=async()=>{busy(true);status.textContent='Enregistrement…';try{saved=await api('/api/order-planning/'+saved.id+'/suspension','POST',{enabled:!saved.suspended,revision:saved.revision});if(!isCurrent())return;status.textContent=saved.suspended?'Commande suspendue':'Commande reprise';busy(false);save.disabled=true;trackingState();sortRows();filterRows();}catch(e){status.textContent=e.message;busy(false);trackingState();save.disabled=!changed;}};
  trackingState();
  remove.onclick=()=>{
   if(!saved.id){row.remove();updateEmpty();return;}
   const dialog=node('dialog','','order-plan-dialog'),title=node('h2','Supprimer cette ligne ?'),text=node('p',[saved.lastName,saved.firstName].filter(Boolean).join(' ')),buttons=node('div','','dialog-actions'),cancel=node('button','Annuler','btn'),confirm=node('button','Supprimer','btn danger'),error=node('p','','error');
   cancel.type=confirm.type='button';cancel.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
   confirm.onclick=async()=>{confirm.disabled=true;try{await api('/api/order-planning/'+saved.id,'DELETE',{revision:saved.revision});dialog.close();if(isCurrent()){row.remove();updateEmpty();}}catch(e){error.textContent=e.message;confirm.disabled=false;}};
   buttons.append(cancel,confirm);dialog.append(title,text,error,buttons);document.body.append(dialog);dialog.showModal();
  };
  if(canEdit){actions.append(save,suspend,remove,status);row.append(actions);}body.append(row);sortRows();filterRows();return row;
 }
 if(canEdit){const add=node('button','Ajouter une ligne','btn primary');add.type='button';add.onclick=()=>{search.value='';stateFilter.value='all';filterRows();const row=addRow();row.querySelector('[aria-label^="NOM"]').focus();};const importButton=node('button','Importer un fichier Excel','btn primary');importButton.type='button';importButton.onclick=()=>openOrderImport({api,isCurrent,onImported:record=>addRow(record)});toolbar.append(add,importButton);}
 const exportButton=node('button','Exporter en Excel','btn primary'),exportStatus=node('span','','order-plan-status');exportButton.type='button';exportStatus.setAttribute('role','status');
 exportButton.onclick=async()=>{
  if(body.querySelector('.order-plan-dirty')){exportStatus.textContent='Enregistrez les lignes modifiées avant d’exporter.';return;}
  exportButton.disabled=true;exportStatus.textContent='Préparation du fichier…';
  try{const response=await fetch('/api/order-planning/export.xlsx',{credentials:'same-origin'});if(!response.ok){const error=await response.json().catch(()=>({}));if(error.code==='MFA_REQUIRED')await api('/api/order-mfa/touch','POST',{});throw Error(error.error||'Impossible d’exporter le tableau.');}const blob=await response.blob();if(!isCurrent())return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=response.headers.get('content-disposition')?.match(/filename=([^;]+)/)?.[1]||'commandes-programmees.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);exportStatus.textContent='Fichier Excel téléchargé.';}catch(error){if(isCurrent())exportStatus.textContent=error.message;}finally{exportButton.disabled=false;}
 };toolbar.append(exportButton,exportStatus);
 rows.forEach(addRow);root.append(toolbar,searchBox,notice,empty,wrap);container.replaceChildren(root);updateEmpty();
}
