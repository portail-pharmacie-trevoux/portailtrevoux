const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
export function renderQuality({container,api,isCurrent=()=>true}) {
 const grid=el('div','','quality-hub'),status=el('p','','field-note');status.setAttribute('role','status');
 for(const title of ['Recueil des erreurs de délivrance','Appels aux prescripteurs','Suivi des relevés de température','Référents services','Suivi des rejets tiers payant']) {
  const button=el('button',title,'btn primary quality-action');button.type='button';
  button.onclick=()=>{if(title==='Appels aux prescripteurs'){void import('./quality-prescriber-calls.js').then(m=>{if(isCurrent()&&container.contains(grid))m.renderPrescriberCalls({container,api,isCurrent,onBack:()=>renderQuality({container,api,isCurrent})});}).catch(e=>status.textContent=e.message);}else if(title==='Suivi des rejets tiers payant'){void import('./quality-tiers-payant.js').then(m=>{if(isCurrent()&&container.contains(grid))m.renderTiersPayant({container,api,isCurrent,onBack:()=>renderQuality({container,api,isCurrent})});}).catch(e=>status.textContent=e.message);}else if(title==='Suivi des relevés de température'){void import('./temperatures.js').then(m=>{if(isCurrent()&&container.contains(grid))m.renderTemperatures({container,api,isCurrent,onBack:()=>renderQuality({container,api,isCurrent})});}).catch(e=>status.textContent=e.message);}else if(title==='Recueil des erreurs de délivrance'){void import('./quality-errors.js').then(m=>{if(isCurrent()&&container.contains(grid))m.renderQualityErrors({container,api,isCurrent,onBack:()=>renderQuality({container,api,isCurrent})});}).catch(e=>status.textContent=e.message);}else if(title==='Référents services')void renderServices();else status.textContent=title+' : contenu à venir.';};grid.append(button);
 }
 container.replaceChildren(grid,status);
 async function renderServices(){
  const back=el('button','← Démarche qualité','btn');back.type='button';back.onclick=()=>renderQuality({container,api,isCurrent});
  const area=el('div'),error=el('p','','error');error.setAttribute('role','alert');container.replaceChildren(back,el('h3','Référents services'),area,error);
  const current=()=>isCurrent()&&container.contains(area);
  let data;
  const run=async fn=>{error.textContent='';try{await fn();}catch(e){if(current())error.textContent=e.message;}};
  const load=async()=>{data=await api('/api/quality/services');if(current())draw();};
  function draw(){
   area.replaceChildren();
   if(data.isAdmin){const add=el('button','Créer une fiche service','btn primary');add.type='button';add.onclick=()=>edit();area.append(add);}
   if(!data.services.length)area.append(el('p','Aucune fiche service pour le moment.','empty'));
   const list=el('div','','quality-services-list');area.append(list);
   for(const row of data.services){
    const card=el('article','','quality-service-card');if(row.has_icon){const image=el('img','','quality-service-icon');image.src='/api/quality/services/'+row.id+'/icon?v='+row.icon_version;image.alt='';image.onerror=()=>image.remove();card.append(image);}card.append(el('h4',row.service),el('p','Référent : '+row.collaborator_name),el('h5','Missions associées'),el('p',row.missions||'Non renseignées','quality-missions'));
    const date=row.evaluations[data.year]?new Date(row.evaluations[data.year]).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'}):null;
    card.append(el('p','Évaluation annuelle '+data.year+(date?' — réalisée le '+date:' — à réaliser'),'field-note'));
    const evaluate=el('button',data.isAdmin?(date?'Consulter / modifier l’évaluation annuelle':'Réaliser l’évaluation annuelle'):'Consulter l’évaluation annuelle','btn primary');evaluate.type='button';evaluate.disabled=!data.isAdmin&&!date;evaluate.onclick=()=>evaluation(row,data.year);card.append(evaluate);
    const history=Object.keys(row.evaluations).filter(y=>Number(y)!==data.year).sort().reverse();for(const year of history){const previous=el('button','Évaluation '+year+' — '+new Date(row.evaluations[year]).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'}),'btn small');previous.type='button';previous.onclick=()=>evaluation(row,Number(year));card.append(previous);}
    if(data.isAdmin){const actions=el('div','','universe-actions'),modify=el('button','Modifier','btn'),del=el('button','Supprimer','btn');modify.type=del.type='button';modify.onclick=()=>edit(row);del.onclick=()=>{if(confirm('Supprimer la fiche « '+row.service+' » et ses évaluations ?')){del.disabled=true;void run(async()=>{try{await api('/api/quality/services/'+row.id,'DELETE',{revision:row.revision});await load();}catch(e){del.disabled=false;throw e;}});}};actions.append(modify,del);card.append(actions);}
    list.append(card);
   }
  }
  function evaluation(row,year){
   const dialog=el('dialog','','service-evaluation-dialog'),form=el('form'),status=el('p','','status-line');status.setAttribute('role','status');
   const editable=data.isAdmin&&year===data.year,saved=row.evaluation_details?.[year]?.missions||[],lines=editable?row.missions.split(/\r?\n/).map(x=>x.trim()).filter(Boolean):saved.map(x=>x.mission);
   dialog.append(el('h3','Évaluation '+year+' — '+row.service),el('p','Référent : '+row.collaborator_name));
   if(row.evaluations[year])dialog.append(el('p','Dernier enregistrement : '+new Date(row.evaluations[year]).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}),'field-note'));
   if(!lines.length)form.append(el('p',editable?'Ajoutez des missions à la fiche, à raison d’une mission par ligne.':'Cette ancienne évaluation ne contient pas de détail par mission.','field-note'));
   const scores=[];lines.forEach((mission,index)=>{
    const label=el('label','','service-mission-score'),heading=el('span',mission),range=el('input'),value=el('output');range.type='range';range.min='0';range.max='100';range.step='1';range.disabled=!editable;range.id='service-mission-'+index;value.htmlFor=range.id;
    range.value=String((saved[index]?.mission===mission?saved[index]:saved.find(x=>x.mission===mission))?.percent??0);
    const update=()=>{value.textContent=range.value+' %';range.setAttribute('aria-valuetext',range.value+' %');};range.oninput=update;update();label.append(heading,value,range);form.append(label);scores.push({mission,range});
   });
   const actions=el('div','','dialog-actions'),close=el('button','Fermer','btn');close.type='button';close.onclick=()=>dialog.close();actions.append(close);
   if(editable&&lines.length){const save=el('button','Enregistrer l’évaluation','btn primary');save.type='submit';actions.append(save);form.onsubmit=async e=>{e.preventDefault();save.disabled=true;status.textContent='Enregistrement…';try{await api('/api/quality/services/'+row.id+'/evaluation','PUT',{year,revision:row.revision,scores:scores.map(x=>({mission:x.mission,percent:Number(x.range.value)}))});dialog.close();await run(load);}catch(error){status.textContent=error.message;save.disabled=false;}};}
   form.append(status,actions);dialog.append(form);dialog.addEventListener('close',()=>dialog.remove());area.append(dialog);dialog.showModal();
  }
  function edit(row){
   const form=el('form','','quality-service-form'),select=el('select'),service=el('input'),missions=el('textarea');select.required=true;select.append(new Option('Choisir un collaborateur',''));
   const people=[...data.people];if(row?.collaborator_id&&!people.some(p=>p.id===row.collaborator_id))people.push({id:row.collaborator_id,name:row.collaborator_name+' (inactif)'});
   people.forEach(p=>select.append(new Option(p.name,String(p.id))));select.value=row?.collaborator_id?String(row.collaborator_id):'';service.value=row?.service||'';service.required=true;service.maxLength=200;missions.value=row?.missions||'';missions.maxLength=5000;missions.rows=5;missions.placeholder='Une mission par ligne (une barre d’objectif par mission).';
   for(const [title,input]of [['Nom du collaborateur',select],['Type de service',service],['Missions associées',missions]]){const label=el('label',title);label.append(input);form.append(label);}
   const iconLabel=el('label','Petite icône du service'),iconFile=el('input');iconFile.type='file';iconFile.accept='.png,.jpg,.jpeg,.webp';iconLabel.append(iconFile);const search=el('a','Rechercher une icône sur Internet','btn');search.target='_blank';search.rel='noopener noreferrer';const updateSearch=()=>search.href='https://www.google.com/search?tbm=isch&q='+encodeURIComponent((service.value||'service pharmacie')+' icône');service.addEventListener('input',updateSearch);updateSearch();const help=el('p','Recherchez une icône, enregistrez l’image choisie puis importez-la ici. PNG, JPEG ou WebP, 2 Mo maximum.','field-note');const preview=el('img','','quality-service-icon');preview.alt='Aperçu de l’icône';preview.hidden=!row?.has_icon;if(row?.has_icon)preview.src='/api/quality/services/'+row.id+'/icon?v='+row.icon_version;iconFile.onchange=()=>{const file=iconFile.files[0];if(!file)return;if(file.size>2*1024*1024){error.textContent='Image de 2 Mo maximum.';iconFile.value='';return;}const reader=new FileReader();reader.onload=()=>{preview.src=reader.result;preview.hidden=false;};reader.readAsDataURL(file);};form.append(iconLabel,search,help,preview);let removeIcon;if(row?.has_icon){removeIcon=el('input');removeIcon.type='checkbox';const label=el('label',' Retirer l’icône actuelle');label.prepend(removeIcon);form.append(label);}
   const save=el('button','Enregistrer' ,'btn primary'),cancel=el('button','Annuler','btn');save.type='submit';cancel.type='button';cancel.onclick=draw;const actions=el('div','','universe-actions');actions.append(cancel,save);form.append(actions);
   form.onsubmit=e=>{e.preventDefault();save.disabled=true;void run(async()=>{try{let fileData=null;const file=iconFile.files[0];if(file){if(file.size>2*1024*1024)throw Error('Image de 2 Mo maximum.');fileData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Image illisible.'));reader.readAsDataURL(file);});}const saved=await api('/api/quality/services'+(row?'/'+row.id:''),row?'PUT':'POST',{collaboratorId:Number(select.value),service:service.value,missions:missions.value,...(row?{revision:row.revision}:{})});if(fileData||removeIcon?.checked){try{await api('/api/quality/services/'+saved.id+'/icon',fileData?'POST':'DELETE',fileData?{fileData,revision:saved.revision}:{revision:saved.revision});}catch(e){await load();throw Error('Fiche enregistrée, mais icône non modifiée : '+e.message);}}await load();}finally{save.disabled=false;}});};area.replaceChildren(form);service.focus();
  }
  await run(load);
 }
}
