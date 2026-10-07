const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
const button=(text,action,cls='btn')=>{const b=node('button',text,cls);b.type='button';b.onclick=action;return b;};
const fields=[['conditions','Conditions commerciales','textarea',4000],['franco','Franco : montant et conditions','textarea',1000],['commercialName','Nom et prénom du commercial','text',160],['commercialRole','Fonction du commercial','text',160],['commercialEmail','E-mail du commercial','email',254],['commercialPhone','Téléphone du commercial','tel',50],['commercialMobile','Mobile du commercial','tel',50],['labAddress','Adresse du laboratoire','textarea',500],['labPhone','Téléphone du laboratoire','tel',50],['labEmail','E-mail du laboratoire','email',254],['labWebsite','Site internet du laboratoire','url',500],['orderEmail','E-mail du service commandes','email',254],['customerNumber','Numéro de compte client','text',100],['notes','Informations complémentaires','textarea',4000]];
export async function renderLaboratories({container,api,isCurrent=()=>true}){
 let [labs,people]=await Promise.all([api('/api/laboratories'),api('/api/laboratories/responsibles')]);if(!isCurrent())return;
 const status=node('p','','status-line');status.setAttribute('role','status');let query='';
 const sorted=()=>labs.slice().sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'}));
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 function directory(){
  if(!isCurrent())return;const top=node('div','','lab-toolbar'),label=node('label','Rechercher un laboratoire');label.htmlFor='lab-search';const search=node('input');search.id='lab-search';search.type='search';search.value=query;search.placeholder='Nom, commercial, responsable…';
  top.append(button('Ajouter un laboratoire',()=>edit(),'btn primary'));const grid=node('div','','lab-grid');
  const draw=()=>{grid.replaceChildren();const matches=sorted().filter(l=>normalize([l.name,l.commercialName,l.responsibleName].join(' ')).includes(normalize(query)));if(!matches.length)grid.append(node('p',labs.length?'Aucun laboratoire ne correspond à la recherche.':'Aucun laboratoire ajouté. Créez la première fiche fournisseur.','empty'));
   matches.forEach(l=>{const b=button('',()=>detail(l),'lab-card');b.append(node('strong',l.name),node('span','Commande : '+(l.orderMode==='pharmacie'?'Pharmacie':'Groupement')),node('span',l.orderMode==='pharmacie'?'Responsable : '+(l.responsibleName||'À désigner'):'Commande via le groupement'));grid.append(b);});};
  search.oninput=()=>{query=search.value;draw();};container.replaceChildren(top,label,search,status,grid);draw();
 }
 function detail(l){
  if(!isCurrent())return;const top=node('div','','lab-toolbar');top.append(button('Retour au répertoire',directory),button('Modifier la fiche',()=>edit(l),'btn primary'));
  const sheet=node('article','','lab-sheet');sheet.append(node('h3',l.name),node('p','Commande : '+(l.orderMode==='pharmacie'?'Pharmacie':'Groupement')));if(l.orderMode==='pharmacie')sheet.append(node('p','Responsable : '+(l.responsibleName||'À désigner')));
  fields.forEach(([key,label])=>{const block=node('div','','lab-value');block.append(node('h4',label),node('p',l[key]||'Non renseigné'));sheet.append(block);});
  if(l.commercialEmail){const mail=node('a','Envoyer un e-mail au commercial','btn primary');mail.href='mailto:'+encodeURIComponent(l.commercialEmail)+'?subject='+encodeURIComponent('Pharmacie de Trévoux — '+l.name);sheet.prepend(mail,node('p','Le bouton ouvre votre messagerie. Vous pouvez rédiger puis envoyer votre message au commercial.','field-note'));}
  else sheet.append(node('p','Renseignez l’e-mail du commercial pour lui écrire.','field-note'));container.replaceChildren(top,sheet);
 }
 function edit(l=null){
  if(!isCurrent())return;const form=node('form','','lab-form'),inputs={};form.append(node('h3',l?'Modifier '+l.name:'Ajouter un laboratoire'));
  function field(key,label,type,max){const labelNode=node('label',label),input=node(type==='textarea'?'textarea':'input');input.id='lab-'+key;labelNode.htmlFor=input.id;if(type!=='textarea')input.type=type;else input.rows=3;input.maxLength=max;input.value=l?.[key]||'';inputs[key]=input;form.append(labelNode,input);return input;}
  field('name','Nom du laboratoire','text',160).required=true;
  const modeLabel=node('label','Commande');modeLabel.htmlFor='lab-order-mode';const mode=node('select');mode.id='lab-order-mode';for(const [value,text] of [['pharmacie','Pharmacie'],['groupement','Groupement']]){const o=node('option',text);o.value=value;mode.append(o);}mode.value=l?.orderMode||'pharmacie';
  const responsibleBox=node('div'),responsibleLabel=node('label','Collaborateur responsable');responsibleLabel.htmlFor='lab-responsible';const responsible=node('select');responsible.id='lab-responsible';const empty=node('option','Choisir le responsable');empty.value='';responsible.append(empty);people.forEach(p=>{const o=node('option',p.name);o.value=p.id;responsible.append(o);});responsible.value=l?.responsibleId||'';responsibleBox.append(responsibleLabel,responsible);form.append(modeLabel,mode,responsibleBox);
  const toggle=()=>{responsibleBox.hidden=mode.value!=='pharmacie';responsible.required=mode.value==='pharmacie';responsible.disabled=mode.value!=='pharmacie';};mode.onchange=toggle;toggle();
  fields.forEach(([key,label,type,max])=>field(key,label,type,max));const error=node('p','','error');error.setAttribute('role','alert');const actions=node('div','','dialog-actions'),save=node('button','Enregistrer la fiche','btn primary');save.type='submit';const cancel=button('Annuler',()=>l?detail(l):directory());actions.append(cancel,save);form.append(error,actions);container.replaceChildren(form);
  form.onsubmit=async e=>{e.preventDefault();if(save.disabled||!isCurrent())return;error.textContent='';save.disabled=true;cancel.disabled=true;
   const body={...Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value])),orderMode:mode.value,responsibleId:mode.value==='pharmacie'?Number(responsible.value):null,...(l?{revision:l.revision}:{})};
   try{await api('/api/laboratories'+(l?'/'+l.id:''),l?'PUT':'POST',body);const fresh=await api('/api/laboratories');if(!isCurrent())return;labs=fresh;status.textContent='Fiche enregistrée.';directory();}catch(e){if(isCurrent())error.textContent=e.message;}finally{save.disabled=false;cancel.disabled=false;}
  };inputs.name.focus();
 }
 directory();
}
