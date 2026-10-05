import {employeeSections} from './employee-fields.js';
const el=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
const control=(text,click,cls='btn small')=>{const b=el('button',text,cls);b.type='button';b.onclick=click;return b;};
export async function renderEmployeeRecord({container,api,person,onClose,onSaved,onPayroll,universes,draft=null,isCurrent=()=>true}) {
  const loaded=person.id?await api('/api/users/'+person.id+'/details'):{person,details:{},detailsRevision:0};if(!isCurrent())return;
  const p={...loaded.person},details={...loaded.details},inputs=new Map(),basicInputs=new Map(),isAdministrator=p.role==='admin';
  if(draft){for(const [key,value] of Object.entries(draft.values)){if(['firstName','lastName','birthday','phone','job'].includes(key))p[key]=value;else details[key]=value;}}
  container.replaceChildren();const root=el('section','','employee-record'),form=el('form');form.id='employee-record-form';form.autocomplete='off';
  const heading=el('div','','employee-record-heading'),title=el('h3',p.id?[p.firstName,p.lastName.toLocaleUpperCase('fr-FR')].join(' '):'Nouveau collaborateur');
  heading.append(title,el('span','Fiche confidentielle · Administrateur','employee-confidential'));
  const tools=el('div','','employee-record-tools');tools.append(control('← Retour à l’annuaire',onClose));
  if(p.isSelf)tools.append(control('Mes bulletins mySilae',onPayroll));
  const jump=control('Droits des univers ↓',()=>permissions.scrollIntoView({behavior:'smooth',block:'center'}));tools.append(jump);
  root.append(heading,tools,el('p','Renseignez les champs utiles à votre situation. Les rubriques peuvent être complétées progressivement. Ces données ne sont pas affichées aux salariés.','field-note'));
  if(draft){const notice=el('div','','employee-import-review');notice.append(el('h4','Vérification de la fiche importée'),el('p','Les valeurs reconnues ont été préremplies. Vérifiez l’identité du salarié et chaque information avant d’enregistrer. Les champs absents du scan conservent leurs valeurs existantes.','field-note'));if(draft.sourceUrl){const source=el('a','Afficher la fiche importée ↗','btn');source.href=draft.sourceUrl;source.target='_blank';source.rel='noopener';notice.append(source);}for(const note of draft.notes)notice.append(el('p',note,'field-note'));for(const warning of draft.warnings)notice.append(el('p',warning.label+' : '+warning.message,'error'));root.append(notice);}
  const accordion=[];
  const expand=control('Tout déplier',()=>accordion.forEach(d=>d.open=true)),collapse=control('Tout replier',()=>accordion.forEach(d=>d.open=false));tools.append(expand,collapse);
  function tableRow(table,f,value,map){
    const row=el('tr'),labelCell=el('th'),valueCell=el('td'),label=el('label',f.label);labelCell.scope='row';
    const input=f.type==='textarea'?el('textarea'):f.type==='select'?el('select'):el('input');input.id='employee-'+f.key;label.htmlFor=input.id;
    if(f.type==='select'){const blank=el('option','À renseigner');blank.value='';input.append(blank);f.options.forEach(value=>{const o=el('option',value);o.value=value;input.append(o);});input.value=value||'';}
    else if(f.type==='checkbox'){input.type='checkbox';input.checked=value===true;}
    else {if(f.type!=='textarea')input.type=f.type==='number'?'text':f.type||'text';input.value=value||'';input.maxLength=f.maxLength||300;if(f.type==='number')input.inputMode='decimal';if(f.type==='textarea')input.rows=2;if(f.required)input.required=true;}
    if(f.key==='lastName')input.classList.add('uppercase-name');
    input.autocomplete='off';input.spellcheck=false;labelCell.append(label);valueCell.append(input);if(draft?.warnings.some(w=>w.key===f.key)){row.style.background='#fff7dc';input.setAttribute('aria-describedby','employee-import-warning-'+f.key);const warning=el('p',draft.warnings.find(w=>w.key===f.key).message,'field-note');warning.id='employee-import-warning-'+f.key;valueCell.append(warning);}row.append(labelCell,valueCell);table.append(row);map.set(f.key,{field:f,input});
  }
  function section(title,fields,values,map,open=false){
    const area=el('details','','employee-record-section');area.open=open;area.append(el('summary',title));const table=el('table','','employee-record-table'),body=el('tbody');fields.forEach(f=>tableRow(body,f,values[f.key],map));table.append(body);area.append(table);form.append(area);accordion.push(area);return area;
  }
  section('Fiche du collaborateur',[
    {key:'firstName',label:'Prénom',required:true},{key:'lastName',label:'Nom de famille',required:true},
    {key:'birthday',label:'Date de naissance',type:'date'},{key:'phone',label:'Téléphone affiché dans l’annuaire',type:'tel'},
    {key:'job',label:'Fonction / intitulé du poste'}
  ],p,basicInputs,true);
  employeeSections.forEach((s,index)=>section(s.title,s.fields,details,inputs,index===1));
  const account=section('Connexion personnelle au portail',[
    {key:'email',label:'Adresse e-mail de connexion',type:'email'},
    {key:'password',label:'Nouveau mot de passe provisoire (facultatif)',type:'password'}
  ],{email:p.email||'',password:''},basicInputs,false);
  basicInputs.get('password').input.minLength=12;basicInputs.get('password').input.autocomplete='new-password';
  account.append(el('p','Renseignez une adresse e-mail, puis utilisez « Envoyer demande de connexion » dans l’annuaire. Le salarié choisira lui-même son mot de passe. Le mot de passe provisoire reste facultatif (12 caractères minimum).','field-note'));
  if(isAdministrator){account.classList.add('hidden');basicInputs.get('email').input.disabled=true;basicInputs.get('password').input.disabled=true;}
  const permissions=el('section','','employee-permissions');permissions.id='employee-permissions';
  permissions.append(el('h3','Accès et modification des univers'),el('p','Consulter donne accès à l’univers. Modifier autorise les changements dans son contenu. Cocher Modifier active aussi Consulter.','field-note'));
  const wrap=el('div','','tablewrap'),table=el('table','','permission-matrix'),head=el('thead'),headRow=el('tr');
  ['Univers','Consulter / accéder','Modifier le contenu'].forEach(text=>{const th=el('th',text);th.scope='col';headRow.append(th);});head.append(headRow);table.append(head);
  const body=el('tbody'),rights=new Map(),editRights=new Map();
  const allowed=p.permissionsConfigured?p.rights||[]:[...new Set([...(p.rights||[]),'Collaborateurs','Fun','Outils de calculs rapides','Actualités'])];
  const modifiable=p.permissionsConfigured?p.editRights||[]:['Fun'];
  for(const universe of universes){
    const tr=el('tr'),name=el('th',universe);name.scope='row';tr.append(name);
    const read=el('input');read.type='checkbox';read.checked=isAdministrator||allowed.includes(universe);read.disabled=isAdministrator;read.setAttribute('aria-label','Consulter '+universe);
    const readCell=el('td');readCell.append(read);tr.append(readCell);rights.set(universe,read);
    const editCell=el('td');
    if(universe==='Collaborateurs'){editCell.append(el('span','Administrateur uniquement','permission-admin-only'));}
    else{const edit=el('input');edit.type='checkbox';edit.checked=isAdministrator||modifiable.includes(universe);edit.disabled=isAdministrator;edit.setAttribute('aria-label','Modifier '+universe);edit.onchange=()=>{if(edit.checked)read.checked=true;};read.onchange=()=>{if(!read.checked)edit.checked=false;};editCell.append(edit);editRights.set(universe,edit);}
    tr.append(editCell);body.append(tr);
  }
  table.append(body);wrap.append(table);permissions.append(wrap);
  const adminLabel=el('label'),adminRights=el('input');adminRights.type='checkbox';adminRights.checked=isAdministrator;adminRights.disabled=isAdministrator;adminRights.id='employee-administrator-rights';adminLabel.htmlFor=adminRights.id;adminLabel.append(adminRights,' Donner des droits administrateur');
  permissions.append(adminLabel,el('p','Donne les mêmes droits que l’administrateur : accès et modification de tous les univers, gestion des collaborateurs et consultation des fiches confidentielles. Un compte de connexion actif est nécessaire.','field-note'));
  const initialReads=new Map([...rights].map(([key,input])=>[key,input.checked])),initialEdits=new Map([...editRights].map(([key,input])=>[key,input.checked]));
  adminRights.onchange=()=>{for(const [key,input] of rights){input.checked=adminRights.checked||initialReads.get(key);input.disabled=adminRights.checked;}for(const [key,input] of editRights){input.checked=adminRights.checked||initialEdits.get(key);input.disabled=adminRights.checked;}};

  permissions.append(el('p',isAdministrator?'Ce compte administrateur conserve l’accès et la gestion de tous les univers.':'Les données des collaborateurs et les connexions Google restent gérées par l’administrateur. Les droits de modification s’appliquent aux outils de contenu disponibles ; les autres univers sont prêts à recevoir leurs futurs éditeurs.','field-note'));form.append(permissions);
  const status=el('p','','error');status.id='employee-record-status';status.setAttribute('role','alert');
  if(draft){const label=el('label'),confirmed=el('input');confirmed.type='checkbox';confirmed.required=true;label.append(confirmed,' J’ai vérifié l’identité du salarié et les informations importées sur le document original.');form.append(label);}
  const actions=el('div','','employee-record-save');const save=el('button','Enregistrer la fiche','btn primary');save.type='submit';actions.append(control('Annuler',onClose),save);form.append(status,actions);root.append(form);container.append(root);
  form.onsubmit=async e=>{
    e.preventDefault();status.textContent='';save.disabled=true;
    const value=({field,input})=>field.type==='checkbox'?input.checked:input.value;
    const data=Object.fromEntries([...basicInputs].filter(([,item])=>!item.input.disabled).map(([key,item])=>[key,value(item)]));
    data.administratorRights=adminRights.checked;data.active=p.active!==false;data.details=Object.fromEntries([...inputs].map(([key,item])=>[key,value(item)]));data.detailsRevision=loaded.detailsRevision;
    if(!isAdministrator){data.rights=[...rights].filter(([,check])=>check.checked).map(([key])=>key);data.editRights=[...editRights].filter(([,check])=>check.checked).map(([key])=>key);}
    try{const result=await api('/api/users'+(p.id?'/'+p.id:''),p.id?'PUT':'POST',data);await onSaved(result,'Fiche enregistrée. Les droits sont appliqués immédiatement.');}
    catch(error){status.textContent=error.message;status.scrollIntoView?.({block:'center'});save.disabled=false;}
  };
}

