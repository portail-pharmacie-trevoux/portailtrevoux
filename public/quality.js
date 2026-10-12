const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
export function renderQuality({container,api,isCurrent=()=>true}) {
 const grid=el('div','','quality-hub'),status=el('p','','field-note');status.setAttribute('role','status');
 for(const title of ['Recueil des erreurs de délivrance','Appels aux prescripteurs','Suivi des relevés de température','Référents services']) {
  const button=el('button',title,'btn primary quality-action');button.type='button';
  button.onclick=()=>{if(title==='Référents services')void renderServices();else status.textContent=title+' : contenu à venir.';};grid.append(button);
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
    const card=el('article','','quality-service-card');card.append(el('h4',row.service),el('p','Référent : '+row.collaborator_name),el('h5','Missions associées'),el('p',row.missions||'Non renseignées','quality-missions'));
    const label=el('label','','quality-evaluation'),check=el('input');check.type='checkbox';check.checked=!!row.evaluations[data.year];check.disabled=!data.isAdmin;
    const date=row.evaluations[data.year]?new Date(row.evaluations[data.year]).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'}):null;
    label.append(check,document.createTextNode(' Évaluation annuelle '+data.year+(date?' — validée le '+date:'')));card.append(label);
    check.onchange=()=>{check.disabled=true;void run(async()=>{try{await api('/api/quality/services/'+row.id+'/evaluation','PUT',{year:data.year,checked:check.checked});await load();}catch(e){check.checked=!!row.evaluations[data.year];check.disabled=false;throw e;}});};
    const history=Object.keys(row.evaluations).filter(y=>Number(y)!==data.year).sort().reverse();if(history.length)card.append(el('p','Évaluations précédentes : '+history.map(y=>y+' — '+new Date(row.evaluations[y]).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'})).join(' · '),'field-note'));
    if(data.isAdmin){const actions=el('div','','universe-actions'),modify=el('button','Modifier','btn'),del=el('button','Supprimer','btn');modify.type=del.type='button';modify.onclick=()=>edit(row);del.onclick=()=>{if(confirm('Supprimer la fiche « '+row.service+' » et ses évaluations ?')){del.disabled=true;void run(async()=>{try{await api('/api/quality/services/'+row.id,'DELETE',{revision:row.revision});await load();}catch(e){del.disabled=false;throw e;}});}};actions.append(modify,del);card.append(actions);}
    list.append(card);
   }
  }
  function edit(row){
   const form=el('form','','quality-service-form'),select=el('select'),service=el('input'),missions=el('textarea');select.required=true;select.append(new Option('Choisir un collaborateur',''));
   const people=[...data.people];if(row?.collaborator_id&&!people.some(p=>p.id===row.collaborator_id))people.push({id:row.collaborator_id,name:row.collaborator_name+' (inactif)'});
   people.forEach(p=>select.append(new Option(p.name,String(p.id))));select.value=row?.collaborator_id?String(row.collaborator_id):'';service.value=row?.service||'';service.required=true;service.maxLength=200;missions.value=row?.missions||'';missions.maxLength=5000;missions.rows=5;
   for(const [title,input]of [['Nom du collaborateur',select],['Type de service',service],['Missions associées',missions]]){const label=el('label',title);label.append(input);form.append(label);}
   const save=el('button','Enregistrer','btn primary'),cancel=el('button','Annuler','btn');save.type='submit';cancel.type='button';cancel.onclick=draw;const actions=el('div','','universe-actions');actions.append(cancel,save);form.append(actions);
   form.onsubmit=e=>{e.preventDefault();save.disabled=true;void run(async()=>{try{await api('/api/quality/services'+(row?'/'+row.id:''),row?'PUT':'POST',{collaboratorId:Number(select.value),service:service.value,missions:missions.value,...(row?{revision:row.revision}:{})});await load();}finally{save.disabled=false;}});};area.replaceChildren(form);service.focus();
  }
  await run(load);
 }
}
