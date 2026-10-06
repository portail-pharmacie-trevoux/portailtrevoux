const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,action,cls='btn small')=>{const b=el('button',text,cls);b.type='button';b.onclick=action;return b;};
const link=(text,url,cls='btn small')=>{const a=el('a',text,cls);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
const date=value=>new Date(value).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'});
const statuses={creating:'Envoi en cours',created:'Préparée',sent:'À signer',delivered:'Consulté',completed:'Signé',declined:'Refusé',voided:'Annulé',uncertain:'Envoi à vérifier',error:'Envoi refusé',paused:'En pause',expired:'Expirée'};
const emailValid=value=>typeof value==='string'&&/^[^\s<>"\r\n]+@[^\s<>"\r\n]+\.[^\s<>"\r\n]+$/.test(value);
const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
export async function renderHRDocuments({container,heading,api,isAdmin,isCurrent=()=>true}){
 let [documents,requests]=await Promise.all([api('/api/hr/documents'),api('/api/hr/signatures')]);if(!isCurrent())return;
 let connection=null,saving=false,listRequest=0,refreshProvider=()=>{};
 const note=el('p','Les documents de cet espace sont consultables par l’ensemble de l’équipe. L’import, la suppression et l’envoi pour signature sont réservés aux administrateurs.','field-note');
 const editor=el('div'),feedback=el('p','','status-line');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const list=el('div','','hr-document-list'),history=el('section','','hr-signature-history');
 container.replaceChildren(note,editor,feedback,list,history);
 if(isAdmin){const add=button('Importer un document',()=>importDocument(),'btn primary');add.id='hr-import-action';heading.append(add);}
 const settings=isAdmin?el('details','','hr-settings'):null;
 if(settings){settings.append(el('summary','Connexion Youtrust'),el('p','Youtrust envoie les invitations de signature par e-mail. Connectez le compte de la pharmacie pour utiliser « Envoyer pour signature ».','field-note'));container.append(settings);void loadConnection();}
 async function reload(message=''){
  const request=++listRequest,[freshDocuments,freshRequests]=await Promise.all([api('/api/hr/documents'),api('/api/hr/signatures')]);
  if(!isCurrent()||request!==listRequest)return;documents=freshDocuments;requests=freshRequests;display();displayHistory();if(message)feedback.textContent=message;
 }
 function display(){
  list.replaceChildren();if(!documents.length){list.append(el('p','Aucun document importé. Les règlements, chartes et accords internes apparaîtront ici.','empty'));return;}
  const wrap=el('div','','tablewrap'),table=el('table','','hr-table'),head=el('thead'),titles=el('tr');
  ['Document','Ajouté le','Actions'].forEach(title=>{const th=el('th',title);th.scope='col';titles.append(th);});head.append(titles);table.append(head);const body=el('tbody');
  documents.forEach(doc=>{
   const row=el('tr');row.dataset.documentId=doc.id;const name=el('td'),when=el('td',date(doc.created_at)),actions=el('td','','hr-actions');
   name.append(el('strong',doc.title),el('small',doc.file_name,'field-note'));
   actions.append(link(doc.file_type==='application/pdf'?'Consulter':'Télécharger le Word','/api/hr/documents/'+doc.id+'/file'+(doc.file_type==='application/pdf'?'?view=1':'')));
   if(doc.file_type==='application/pdf')actions.append(link('Télécharger','/api/hr/documents/'+doc.id+'/file'));
   if(isAdmin){
    actions.append(button('Supprimer',async()=>{
     if(!confirm('Supprimer « '+doc.title+' » de la liste des documents RH ? Les demandes déjà envoyées dans Youtrust seront conservées.'))return;
     try{await api('/api/hr/documents/'+doc.id,'DELETE',{});await reload('Document supprimé de la liste.');}catch(e){if(isCurrent())feedback.textContent=e.message;}
    },'btn small danger'),button('Envoyer pour signature',()=>signatureForm(doc),'btn small primary'));
   }
   row.append(name,when,actions);body.append(row);
  });table.append(body);wrap.append(table);list.append(wrap);
 }
 function importDocument(){
  if(!isCurrent())return;editor.replaceChildren();const form=el('form','','hr-form'),title=el('h3','Importer un document RH');
  const label=el('label','Titre du document');label.htmlFor='hr-title';const input=el('input');input.id='hr-title';input.type='text';input.required=true;input.maxLength=200;
  const fileLabel=el('label','Document PDF ou Word (.docx)');fileLabel.htmlFor='hr-file';const file=el('input');file.id='hr-file';file.type='file';file.accept='.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';file.required=true;
  file.onchange=()=>{if(file.files[0]&&!input.value)input.value=file.files[0].name.replace(/\.(pdf|docx)$/i,'').slice(0,200);};
  const error=el('p','','error');error.setAttribute('role','alert');const actions=el('div','','dialog-actions'),cancel=button('Annuler',()=>editor.replaceChildren()),submit=el('button','Importer le document','btn primary');submit.type='submit';actions.append(cancel,submit);
  form.append(title,label,input,fileLabel,file,el('p','10 Mo maximum. Le document sera accessible à toute l’équipe.','field-note'),error,actions);editor.append(form);input.focus();
  form.onsubmit=async e=>{
   e.preventDefault();if(saving||!isCurrent())return;saving=true;submit.disabled=true;cancel.disabled=true;error.textContent='';
   try{const selected=file.files[0];if(!selected||! /\.(pdf|docx)$/i.test(selected.name)||!selected.size||selected.size>10*1024*1024)throw Error('Choisissez un document PDF ou Word contenant des données, de 10 Mo maximum.');
    const fileData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Le fichier n’a pas pu être lu.'));reader.readAsDataURL(selected);});
    await api('/api/hr/documents/import','POST',{title:input.value,fileName:selected.name,fileData});if(!isCurrent())return;editor.replaceChildren();await reload('Document importé.');
   }catch(e){if(isCurrent())error.textContent=e.message;}finally{saving=false;submit.disabled=false;cancel.disabled=false;}
  };
 }
 async function signatureForm(doc){
  editor.replaceChildren(el('p','Chargement des signataires…','field-note'));
  let people;try{people=await api('/api/hr/signatories');}catch(e){if(isCurrent())editor.replaceChildren(el('p',e.message,'error'));return;}if(!isCurrent())return;
  const form=el('form','','hr-form hr-signature-form'),selected=new Map(),requestKey=crypto.randomUUID();form.append(el('h3','Envoyer pour signature : '+doc.title),el('p','Youtrust enverra un e-mail à chaque signataire sélectionné. Le document sera accompagné d’une feuille avec un emplacement de signature pour chacun.','field-note'));
  const provider=el('p','','hr-provider-status');const providerState=()=>{provider.textContent=connection?.connected?(connection.environment==='demo'?'Compte Youtrust de démonstration : les demandes sont des essais.':'Compte Youtrust connecté : '+connection.accountName):'Connectez Youtrust dans les paramètres de cette page avant l’envoi.';};refreshProvider=providerState;providerState();
  form.append(provider,button('Ouvrir les paramètres Youtrust',()=>{settings.open=true;settings.scrollIntoView?.({behavior:'smooth',block:'center'});}));
  const label=el('label','Rechercher un collaborateur actif');label.htmlFor='hr-signatory-search';const search=el('input');search.type='search';search.id='hr-signatory-search';
  const choices=el('div','','hr-signatory-list'),count=el('p','Aucun signataire sélectionné.','field-note'),boxes=[];
  const updateCount=()=>{count.textContent=selected.size+' signataire'+(selected.size>1?'s':'')+' sélectionné'+(selected.size>1?'s':'');};
  people.forEach(person=>{
   const choice=el('label'),check=el('input');check.type='checkbox';check.disabled=!emailValid(person.email);
   choice.append(check,el('span',person.name+' · '+(person.email||'E-mail à renseigner dans la fiche')));choices.append(choice);
   check.onchange=()=>{check.checked?selected.set(person.id,person.email):selected.delete(person.id);updateCount();};boxes.push({person,choice,check});
  });
  search.oninput=()=>boxes.forEach(({person,choice})=>choice.hidden=!normalize(person.name+' '+person.email).includes(normalize(search.value.trim())));
  const selection=el('div','','news-selection-actions');selection.append(button('Sélectionner toute l’équipe avec e-mail',()=>{boxes.forEach(({person,check})=>{if(!check.disabled){check.checked=true;selected.set(person.id,person.email);}});updateCount();}),button('Tout désélectionner',()=>{boxes.forEach(({check})=>check.checked=false);selected.clear();updateCount();}));
  const error=el('p','','error');error.setAttribute('role','alert');const actions=el('div','','dialog-actions'),cancel=button('Annuler',()=>editor.replaceChildren()),send=el('button','Envoyer avec Youtrust','btn primary');send.type='submit';actions.append(cancel,send);
  form.append(label,search,selection,choices,count,error,actions);editor.replaceChildren(form);
  form.onsubmit=async e=>{
   e.preventDefault();if(saving||!isCurrent())return;error.textContent='';
   if(!connection?.connected){providerState();settings.open=true;error.textContent='Connectez d’abord votre compte Youtrust.';return;}
   if(!selected.size){error.textContent='Sélectionnez au moins un signataire.';return;}
   saving=true;send.disabled=true;cancel.disabled=true;
   try{const result=await api('/api/hr/documents/'+doc.id+'/signatures','POST',{requestKey,recipients:[...selected].map(([id,email])=>({id,email}))});if(!isCurrent())return;
    editor.replaceChildren();await reload(result.existing?'Cette demande existe déjà. Consultez son état dans le suivi.':(result.environment==='demo'?'Demande de démonstration envoyée':'Demande envoyée')+' à '+result.sent+' signataire'+(result.sent>1?'s':'')+' via Youtrust.');
   }catch(e){if(isCurrent()){error.textContent=e.message;try{await reload();}catch{}}}finally{saving=false;send.disabled=false;cancel.disabled=false;}
  };
 }
 function displayHistory(){
  history.replaceChildren();history.append(el('h3',isAdmin?'Suivi des demandes de signature':'Mes demandes de signature'));
  if(!requests.length){history.append(el('p','Aucune demande de signature pour le moment.','field-note'));return;}
  requests.forEach(request=>{
   const card=el('article','','hr-signature-card'),top=el('div','','hr-signature-heading');top.append(el('strong',request.title),el('span',statuses[request.status]||request.status,'badge'));card.append(top,el('p',date(request.created_at)+(request.environment==='demo'?' · Démonstration Youtrust':''),'field-note'));
   if(isAdmin){
    const names=el('ul');request.recipients.forEach(person=>names.append(el('li',person.name+' · '+person.email+' · '+(statuses[person.status]||person.status))));card.append(names);
    if(request.error)card.append(el('p',request.error,'error'));
    const refresh=button('Actualiser le suivi',async()=>{refresh.disabled=true;try{const result=await api('/api/hr/signatures/'+request.id+'/refresh','POST',{});await reload(result.cached?'Ce suivi a déjà été actualisé récemment. Les vérifications sont espacées de 15 minutes.':'Suivi actualisé.');}catch(e){if(isCurrent())feedback.textContent=e.message;}finally{refresh.disabled=false;}});
    card.append(refresh);if(request.status==='completed')card.append(link('Télécharger le document signé','/api/hr/signatures/'+request.id+'/file'));
    if(request.last_checked_at)card.append(el('p','Dernière vérification : '+date(request.last_checked_at),'field-note'));
   }else card.append(el('p',['creating','uncertain','error','created'].includes(request.envelope_status)?'Cette demande est en préparation ou doit être vérifiée par un administrateur.':request.status==='completed'?'Votre signature a été enregistrée par Youtrust.':'Utilisez le lien reçu par e-mail de Youtrust pour consulter la demande et signer en ligne.','field-note'));
   history.append(card);
  });
 }
 async function loadConnection(){
  try{connection=await api('/api/youtrust/status');if(!isCurrent())return;settings.open=!connection.connected;drawConnection();refreshProvider();}catch(e){if(isCurrent())settings.append(el('p',e.message,'error'));}
 }
 function drawConnection(){
  settings.replaceChildren(el('summary','Connexion Youtrust'),el('p',connection.connected?(connection.environment==='demo'?'Clé Youtrust vérifiée · Essais sandbox':'Clé Youtrust vérifiée · Envois réels'):'Renseignez votre clé API Youtrust pour activer les signatures.','field-note'));
  settings.append(el('p','Votre offre Youtrust doit inclure l’accès à l’API. Les invitations sont envoyées par Youtrust. La clé est conservée chiffrée et ne sera pas affichée.','field-note'),link('Comment créer ma clé API Youtrust','https://developers.youtrust.com/docs/set-up-your-account'));
  const form=el('form','','hr-form'),typeLabel=el('label','Environnement de la clé API');typeLabel.htmlFor='youtrust-environment';
  const environment=el('select');environment.id='youtrust-environment';[['production','Production : signatures réelles'],['demo','Sandbox : essais uniquement']].forEach(([value,title])=>{const option=el('option',title);option.value=value;environment.append(option);});environment.value=connection.environment;
  const keyLabel=el('label','Clé API Youtrust');keyLabel.htmlFor='youtrust-api-key';const key=el('input');key.type='password';key.id='youtrust-api-key';key.autocomplete='new-password';key.maxLength=1000;key.required=!connection.configured;key.placeholder=connection.configured?'Laisser vide pour conserver la clé actuelle':'';
  const error=el('p','','error');error.setAttribute('role','alert');const save=el('button','Enregistrer et vérifier la connexion','btn primary');save.type='submit';
  form.append(typeLabel,environment,keyLabel,key,error,save);form.onsubmit=async e=>{e.preventDefault();save.disabled=true;error.textContent='';try{await api('/api/youtrust/config','POST',{apiKey:key.value,environment:environment.value});key.value='';await loadConnection();feedback.textContent='Connexion Youtrust vérifiée. Vous pouvez envoyer les documents pour signature.';}catch(e){error.textContent=e.message;}finally{save.disabled=false;}};settings.append(form);
  if(connection.configured)settings.append(button('Retirer la clé Youtrust',async()=>{if(!confirm('Retirer la connexion Youtrust du portail ? Les demandes déjà envoyées seront conservées.'))return;try{await api('/api/youtrust/disconnect','POST',{});await loadConnection();}catch(e){feedback.textContent=e.message;}},'btn small danger'));
 }
 display();displayHistory();
}
