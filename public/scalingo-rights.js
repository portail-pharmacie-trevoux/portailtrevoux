// This page is served only after the Scalingo TEST administrator check.
const status=document.querySelector('#status'),preview=document.querySelector('#preview'),apply=document.querySelector('#apply');
const label=u=>({'Actualités':'Communication',"Outils d'aide au merchandising":'Merchandising',"Outils d'aide à la démarche qualité":'Qualité'}[u]||u);
let state;
async function request(path,method='GET',body){
 const response=await fetch(path,{method,headers:{'Content-Type':'application/json','x-csrf-token':state?.csrf||''},body:body?JSON.stringify(body):undefined});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Opération refusée.');return result;
}
function text(tag,value,parent){const e=document.createElement(tag);e.textContent=value;parent.append(e);return e;}
async function load(){
 state=await request('/api/staging-universal-rights');preview.replaceChildren();
 status.textContent=state.backupReady?'Sauvegarde récente attestée dans la configuration Scalingo.':'Application bloquée : sauvegarde récente non attestée dans la configuration Scalingo.';
 for(const p of state.people){
  const section=document.createElement('section');preview.append(section);text('h2',p.name+' — '+p.status,section);
  text('p','Actuellement : consultation '+p.current.rights.map(label).join(', ')+' ; modification '+p.current.editRights.map(label).join(', ')+'. Configuration explicite : '+(p.configured?'oui':'non')+'.',section);
  text('p','Après application groupée : consultation '+p.proposed.rights.map(label).join(', ')+' ; modification '+p.proposed.editRights.map(label).join(', ')+'.',section);
  if(p.status==='droits spécifiques conservés')text('p','Cette fiche sera ignorée par l’application groupée. Vérifiez individuellement ses permissions, notamment celles de référent.',section);
  const details=document.createElement('details');section.append(details);text('summary','Configurer individuellement les droits',details);
  const reads=new Map(),edits=new Map();
  for(const u of state.universes){
   const row=document.createElement('p');details.append(row);text('span',label(u)+' : ',row);
   for(const [map,current,title] of [[reads,p.current.rights,'Consulter'],[edits,p.current.editRights,'Modifier']]){
    if(map===edits&&['Emplois du temps','Collaborateurs','Ressources humaines'].includes(u)){text('span',' Modification réservée aux administrateurs',row);continue;}
    const l=document.createElement('label'),c=document.createElement('input');c.type='checkbox';c.checked=current.includes(u);
    if((map===reads&&['Actualités','Agenda',"Outils d'aide à la démarche qualité"].includes(u))||(map===edits&&u==='Actualités')){c.checked=true;c.disabled=true;}
    if(map===edits)c.onchange=()=>{if(c.checked)reads.get(u).checked=true;};
    if(map===reads)c.onchange=()=>{if(!c.checked&&edits.get(u))edits.get(u).checked=false;};
    l.append(c,document.createTextNode(title+' '));row.append(l);map.set(u,c);
   }
  }
  const save=text('button','Enregistrer les droits de cette personne',details);save.disabled=!state.backupReady;
  save.onclick=async()=>{
   const body={rights:[...reads].filter(([,c])=>c.checked).map(([u])=>u),editRights:[...edits].filter(([,c])=>c.checked).map(([u])=>u)};
   if(!confirm('Confirmer le remplacement des permissions de '+p.name+' ? Les droits spécifiques cochés dans cette fiche seront remplacés par votre sélection.'))return;
   save.disabled=true;
   try{await request('/api/users/'+p.id,'PUT',body);await load();status.textContent='Droits enregistrés. Les sessions de cette personne ont été fermées.';}catch(e){status.textContent=e.message;save.disabled=!state.backupReady;}
  };
 }
 apply.disabled=!state.backupReady;
}
apply.onclick=async()=>{
 if(document.querySelector('#confirmation').value!=='APPLIQUER LES DROITS UNIVERSELS'){status.textContent='Saisissez la phrase de confirmation.';return;}
 if(!confirm('Appliquer les changements affichés aux fiches « à appliquer » uniquement ? Les droits spécifiques seront conservés.'))return;
 apply.disabled=true;
 try{const result=await request('/api/staging-universal-rights','POST',{fingerprint:state.fingerprint,confirmation:document.querySelector('#confirmation').value});await load();status.textContent=result.updated+' fiches mises à jour ; '+result.preserved.length+' fiches spécifiques conservées.';}catch(e){status.textContent=e.message;apply.disabled=!state.backupReady;}
};
load().catch(e=>status.textContent=e.message);
