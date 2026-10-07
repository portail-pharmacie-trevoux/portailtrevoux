const columns=[['lastOrder','DATE DERNIÈRE COMMANDE','date'],['frequency','FRÉQUENCE (jours)','number'],['nextOrder','DATE PROCHAINE COMMANDE','date'],['lastName','NOM','text'],['firstName','PRÉNOM','text'],['treatment','TRAITEMENT','textarea'],['mode','MODE DE COMMANDE','select'],['comments','COMMENTAIRES','textarea']];
const modes=['grossiste','direct labo','prep rosiers'];
const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
export async function renderOrderPlanning({container,api,canEdit,isCurrent}){
 const rows=await api('/api/order-planning');if(!isCurrent())return;
 const root=node('div','','order-planning'),toolbar=node('div','','order-plan-toolbar'),wrap=node('div','','order-plan-scroll'),table=node('table','','order-plan-table'),head=node('thead'),header=node('tr'),body=node('tbody');
 wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Commandes programmées, tableau à défilement horizontal');
 columns.forEach(([,title])=>{const th=node('th',title);th.scope='col';header.append(th);});if(canEdit){const th=node('th','GESTION');th.scope='col';header.append(th);}head.append(header);table.append(head,body);wrap.append(table);
 const notice=node('p',canEdit?'Une ligne par personne. La prochaine commande se calcule à partir de la dernière date et de la fréquence en jours. Enregistrez chaque ligne après modification.':'Tableau des commandes programmées.','field-note');
 const empty=node('p','Aucune commande programmée.','empty');
 function updateEmpty(){empty.classList.toggle('hidden',!!body.children.length);}
 function addRow(record={mode:'grossiste'}){
  const row=node('tr'),inputs={},actions=node('td','','order-plan-actions'),status=node('span','','order-plan-status');status.setAttribute('role','status');let saved={...record};
  for(const [key,title,type] of columns){
   const cell=node('td'),input=node(type==='textarea'?'textarea':type==='select'?'select':'input');
   if(type==='select')modes.forEach(mode=>{const option=node('option',mode);option.value=mode;input.append(option);});
   else if(type!=='textarea')input.type=type;
   if(type==='textarea'){input.rows=2;input.maxLength=4000;}if(type==='text')input.maxLength=100;
   if(key==='nextOrder'){input.readOnly=true;input.title='Calcul automatique : dernière commande + fréquence en jours';}
   if(type==='number'){input.min=1;input.max=3650;input.step=1;input.placeholder='Ex. 28';}
   input.value=record[key]??'';input.setAttribute('aria-label',title+' · '+([record.lastName,record.firstName].filter(Boolean).join(' ')||'Nouvelle ligne'));input.disabled=!canEdit;
   if(['lastName','firstName'].includes(key))input.required=true;
   inputs[key]=input;cell.append(input);row.append(cell);
  }
  const calculate=()=>{const frequency=Number(inputs.frequency.value);if(inputs.lastOrder.value&&Number.isInteger(frequency)&&frequency>0&&frequency<=3650){const date=new Date(inputs.lastOrder.value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+frequency);inputs.nextOrder.value=date.toISOString().slice(0,10);}else inputs.nextOrder.value='';dirty();};
  const save=node('button','Enregistrer','btn small primary'),remove=node('button',saved.id?'Supprimer':'Retirer','btn small');save.type=remove.type='button';save.disabled=!!saved.id;
  function dirty(){if(canEdit){save.disabled=false;status.textContent='À enregistrer';}}
  for(const input of Object.values(inputs))input.addEventListener('input',dirty);
  inputs.lastOrder.addEventListener('change',calculate);inputs.frequency.addEventListener('change',calculate);
  function busy(value){Object.values(inputs).forEach(i=>i.disabled=value||!canEdit);save.disabled=remove.disabled=value;}
  save.onclick=async()=>{
   for(const input of Object.values(inputs))if(!input.reportValidity())return;
   const values=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,key==='frequency'?(input.value?Number(input.value):null):input.value]));busy(true);status.textContent='Enregistrement…';
   try{const result=await api('/api/order-planning'+(saved.id?'/'+saved.id:''),saved.id?'PUT':'POST',{...values,revision:saved.revision});if(!isCurrent())return;saved=result;for(const [key,input]of Object.entries(inputs))input.value=result[key]??'';remove.textContent='Supprimer';status.textContent='Enregistré';busy(false);save.disabled=true;}
   catch(error){if(!isCurrent())return;status.textContent=error.message;busy(false);}
  };
  remove.onclick=()=>{
   if(!saved.id){row.remove();updateEmpty();return;}
   const dialog=node('dialog'),title=node('h2','Supprimer cette ligne ?'),text=node('p',[saved.lastName,saved.firstName].filter(Boolean).join(' ')),buttons=node('div','','dialog-actions'),cancel=node('button','Annuler','btn'),confirm=node('button','Supprimer','btn danger'),error=node('p','','error');
   cancel.type=confirm.type='button';cancel.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
   confirm.onclick=async()=>{confirm.disabled=true;try{await api('/api/order-planning/'+saved.id,'DELETE',{revision:saved.revision});dialog.close();if(isCurrent()){row.remove();updateEmpty();}}catch(e){error.textContent=e.message;confirm.disabled=false;}};
   buttons.append(cancel,confirm);dialog.append(title,text,error,buttons);document.body.append(dialog);dialog.showModal();
  };
  if(canEdit){actions.append(save,remove,status);row.append(actions);}body.append(row);updateEmpty();return row;
 }
 if(canEdit){const add=node('button','Ajouter une ligne','btn primary');add.type='button';add.onclick=()=>{const row=addRow();row.querySelector('[aria-label^="NOM"]').focus();};toolbar.append(add);}
 rows.forEach(addRow);root.append(toolbar,notice,empty,wrap);container.replaceChildren(root);updateEmpty();
}
