let calendarDay='',calendarQuery='';
function parisDay(value=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;
}
function moveDay(day,offset){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
function eventDays(e){return {start:e.start?.date||parisDay(e.start.dateTime),end:e.end?.date?moveDay(e.end.date,-1):parisDay(new Date(new Date(e.end?.dateTime||e.start.dateTime).getTime()-1))};}
function normalizeSearch(value){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();}
function eventIcons(title){
  const text=normalizeSearch(title||'');
  return [text.includes('conge')?'🏝️':'',text.includes('formation')?'🎓':'',text.includes('rdv')?'📝':'',text.includes('livraison')?'📦':''].filter(Boolean).join(' ');
}
function eventCard(e){
  const card=node('article','','event'),heading=node('h3'),icons=eventIcons(e.title);
  if(icons){const icon=node('span',icons+' ');icon.setAttribute('aria-hidden','true');heading.append(icon);}
  heading.append(node('span',e.title));card.append(heading);let when;
  if(e.start?.date){const {start,end}=eventDays(e);when=start.split('-').reverse().join('/')+(start!==end?' — '+end.split('-').reverse().join('/'):'')+' · Toute la journée';}
  else {const format=d=>new Date(d).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'medium',timeStyle:'short'});when=format(e.start.dateTime)+' — '+format(e.end?.dateTime||e.start.dateTime);}
  card.append(node('p',when,'event-time'));if(e.location)card.append(node('p',e.location));if(e.description)card.append(node('p',e.description));
  const reminder=node('label','','event-reminder'),check=node('input'),bell=node('span','🔔','reminder-bell'),status=node('span','','reminder-status');
  check.type='checkbox';check.checked=!!e.remind;check.disabled=!e.id;bell.setAttribute('aria-hidden','true');reminder.classList.toggle('enabled',check.checked);
  reminder.append(check,bell,node('span','Me le rappeler'));status.setAttribute('role','status');
  check.onchange=async()=>{
    const userId=session?.user.id,enabled=check.checked;check.disabled=true;status.textContent='Enregistrement…';
    try{await api('/api/calendar/reminders','POST',{eventId:e.id,enabled});if(session?.user.id!==userId)return;e.remind=enabled;reminder.classList.toggle('enabled',enabled);status.textContent=enabled?'Visible sur votre accueil dès 7 jours avant sa date.':'Rappel retiré.';void refreshHomeExtras();}
    catch(error){if(session?.user.id!==userId)return;check.checked=!!e.remind;status.textContent=error.message;}
    finally{if(session?.user.id===userId)check.disabled=false;}
  };
  card.append(reminder,status);return card;
}
function renderCalendarResults(data,container){
  const today=parisDay();if(!calendarDay)calendarDay=today;
  const navigation=node('div','','agenda-navigation');
  const date=node('input');date.type='date';date.value=calendarDay;date.setAttribute('aria-label','Date à consulter');
  const redraw=()=>renderCalendarResults(data,container);
  date.onchange=()=>{if(date.value){calendarDay=date.value;calendarQuery='';redraw();}};
  const change=offset=>{calendarDay=moveDay(calendarDay,offset);calendarQuery='';redraw();};
  navigation.append(button('Jour précédent',()=>change(-1)),button('Aujourd’hui',()=>{calendarDay=parisDay();calendarQuery='';redraw();},'btn primary'),button('Jour suivant',()=>change(1)),date);
  const searchLabel=node('label','Rechercher un événement à venir');searchLabel.htmlFor='agenda-search';
  const search=node('input');search.type='search';search.id='agenda-search';search.placeholder='Mot-clé, lieu, titre…';search.value=calendarQuery;
  const searchBar=node('div','','agenda-search');searchBar.append(searchLabel,search,node('p','Recherche dans les titres, lieux et descriptions, jusqu’à six mois à venir.','status-line'));
  const results=node('div');results.setAttribute('aria-live','polite');
  const display=()=>{
    results.replaceChildren();const query=normalizeSearch(calendarQuery),terms=query.split(/\s+/).filter(Boolean),now=Date.now();
    const events=data.events.filter(e=>{
      if(!e.start?.date&&!e.start?.dateTime)return false;
      const days=eventDays(e);
      if(query){const future=e.end?.date?days.end>=today:new Date(e.end?.dateTime||e.start.dateTime).getTime()>now;return future&&terms.every(t=>normalizeSearch([e.title,e.location,e.description].join(' ')).includes(t));}
      return days.start<=calendarDay&&days.end>=calendarDay;
    }).sort((a,b)=>(a.start.date||a.start.dateTime).localeCompare(b.start.date||b.start.dateTime));
    const label=query?'Résultats à venir':(calendarDay===today?'Aujourd’hui · ':'')+new Date(calendarDay+'T12:00:00Z').toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long',year:'numeric'});
    results.append(node('h3',label,'agenda-day-title'),node('p',events.length+' événement'+(events.length!==1?'s':''),'status-line'));
    if(!events.length)results.append(node('div',!data.connected?'L’agenda n’est pas encore connecté.':query?'Aucun événement à venir ne correspond à votre recherche.':'Aucun événement pour cette journée.','empty'));
    events.forEach(e=>{
      if(query){const day=eventDays(e).start;const go=button('Voir cette journée',()=>{calendarDay=day<today?today:day;calendarQuery='';redraw();});const card=eventCard(e);card.append(go);results.append(card);}else results.append(eventCard(e));
    });
  };
  search.oninput=()=>{calendarQuery=search.value;display();};
  searchBar.append(button('Effacer la recherche',()=>{calendarQuery='';search.value='';display();search.focus();}));
  container.replaceChildren(navigation,searchBar,results);display();
}

const q=s=>document.querySelector(s);
let session=null,people=[],editId=null,removeId=null,currentUniverse=null,universeViewRequest=0;
function node(tag,text='',cls=''){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;}
async function api(path,method='GET',data){
  const options={method,headers:{}};
  if(method!=='GET'){options.headers['Content-Type']='application/json';if(session)options.headers['X-CSRF-Token']=session.csrf;if(data!==undefined)options.body=JSON.stringify(data);}
  const response=await fetch(path,options);let body;try{body=await response.json();}catch{throw Error('Le service ne répond pas. Réessayez.');}
  if(!response.ok){if(response.status===401&&path!=='/api/login')showLogin();throw Error(body.error||'Demande impossible.');}return body;
}
function error(e){q('#global-message').textContent=e.message;}
function showLogin(){scheduleWeek='';scheduleScope='';scheduleData=null;scheduleRequest++;document.querySelectorAll('.tile-news,.tile-agenda,.daily-joke,.tile-celebrations,#universe-publications').forEach(e=>e.remove());q('#welcome-name').textContent='';session=null;currentUniverse=null;q('#home').classList.add('hidden');q('#detail').classList.add('hidden');q('#login').classList.remove('hidden');q('#logout').classList.add('hidden');q('#account').classList.add('hidden');q('#session-name').textContent='Espace sécurisé';document.querySelectorAll('dialog[open]').forEach(d=>d.close());q('#content').replaceChildren();people=[];}
function showHome(){
  currentUniverse=null;q('#welcome-name').textContent=session.user.name;applyTileOrder();q('#login').classList.add('hidden');q('#detail').classList.add('hidden');q('#global-message').textContent='';q('#home').classList.remove('hidden');q('#logout').classList.remove('hidden');q('#account').classList.remove('hidden');
  q('#session-name').textContent=session.user.name+(session.user.role==='admin'?' · Administrateur':'');
  applyTileVisibility();
  void refreshHomeExtras();
  q('.section-label>span').textContent=[...document.querySelectorAll('.grid .tile')].some(b=>!b.classList.contains('hidden'))?'Vos espaces autorisés':'Vos tuiles sont masquées. Utilisez « Organiser mes tuiles » pour les réafficher.';
}
function afterLogin(){if(session.user.mustChange){q('#login').classList.add('hidden');q('#logout').classList.remove('hidden');openPassword();}else showHome();}
q('#login-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;q('#login-error').textContent='';try{session=await api('/api/login','POST',{email:q('#login-email').value,password:q('#login-password').value});q('#login-password').value='';afterLogin();}catch(e){q('#login-error').textContent=e.message;}finally{btn.disabled=false;}};
q('#logout').onclick=async()=>{try{await api('/api/logout','POST');showLogin();}catch(e){error(e);}};
q('#account').onclick=()=>openPassword();
function openPassword(){q('#password-form').reset();q('#password-error').textContent='';q('#password-intro').textContent=session.user.mustChange?'Remplacez votre mot de passe provisoire pour accéder au portail.':'Choisissez un mot de passe personnel de 12 caractères minimum.';q('#password-cancel').classList.toggle('hidden',session.user.mustChange);q('#password-dialog').showModal();}
q('#password-dialog').addEventListener('cancel',e=>{if(session?.user.mustChange)e.preventDefault();});
q('#password-cancel').onclick=()=>q('#password-dialog').close();
q('#password-form').onsubmit=async e=>{e.preventDefault();if(q('#new-password').value!==q('#confirm-password').value){q('#password-error').textContent='Les nouveaux mots de passe ne correspondent pas.';return;}const btn=e.submitter;btn.disabled=true;try{session=await api('/api/password','POST',{currentPassword:q('#current-password').value,password:q('#new-password').value});q('#password-form').reset();q('#password-dialog').close();showHome();}catch(e){q('#password-error').textContent=e.message;}finally{btn.disabled=false;}};
const descriptions={'Outils de calculs rapides':'Trousse de secours en cas de panique.','Fun':'La sélection musicale de l’équipe pour l’espace de vente.','Passerelle groupement':'Accès direct Pharmascope.','Collaborateurs':'L’annuaire de l’équipe et votre accès personnel aux bulletins de paie.','Emplois du temps':'Les horaires de votre équipe.','Agenda':'Votre agenda équipe, synchronisé avec Google.','Procédures':'Les consignes et documents de référence.','Laboratoires':'Les contacts et ressources de vos partenaires.','Challenges':'Les objectifs et défis collectifs de la pharmacie.','Actualités':'Les messages courts de l’équipe, envoyés et reçus.','Formations':'Les ressources pour apprendre et se former.','Contacts utiles':'Les coordonnées utiles au quotidien.','Ressources humaines':'Les documents internes de la pharmacie et leur signature en ligne.'};
descriptions["Outils d'aide aux commandes"]='commandes programmées';
document.querySelectorAll('[data-universe]').forEach(b=>b.onclick=()=>openUniverse(b.dataset.universe));
q('#back').onclick=()=>showHome();
q('#portal-home').onclick=e=>{if(session&&!session.user.mustChange){e.preventDefault();showHome();}};
function setUniverseHeading(name){
  const heading=q('#title');
  const tile=[...document.querySelectorAll('.grid [data-universe]')].find(b=>b.dataset.universe===name);
  const symbol=tile?.querySelector('.symbol');
  heading.replaceChildren();
  if(symbol){
    const icon=symbol.cloneNode(true),colors=getComputedStyle(tile);
    icon.classList.add('section-symbol');
    icon.style.setProperty('--accent',colors.getPropertyValue('--accent'));
    icon.style.setProperty('--tint',colors.getPropertyValue('--tint'));
    heading.append(icon);
  }
  heading.append(node('span',name));
}
async function openUniverse(name){
  const viewRequest=++universeViewRequest;
  q('#hr-import-action')?.remove();
  q('#universe-publications')?.remove();
  currentUniverse=name;q('#home').classList.add('hidden');q('#detail').classList.remove('hidden');q('#global-message').textContent='';setUniverseHeading(name);q('#description').textContent=descriptions[name];q('#feedback').textContent='';setPeopleAddActions(name==='Collaborateurs'&&session.user.role==='admin');q('#content').replaceChildren(node('div','Chargement…','empty'));
  try{if(name==='Collaborateurs'){people=await api('/api/users');if(currentUniverse===name)renderPeople();}else if(name==='Actualités'){const userId=session.user.id,module=await import('/news.js');if(currentUniverse===name)await module.renderNews({container:q('#content'),api,isCurrent:()=>viewRequest===universeViewRequest&&currentUniverse===name&&session?.user.id===userId,onChanged:()=>void refreshHomeExtras()});}else if(name==='Laboratoires'){const userId=session.user.id,module=await import('/laboratories.js');if(currentUniverse===name)await module.renderLaboratories({container:q('#content'),api,isCurrent:()=>viewRequest===universeViewRequest&&currentUniverse===name&&session?.user.id===userId});}else if(name==='Ressources humaines'){const userId=session.user.id,module=await import('/hr-documents.js');if(currentUniverse===name)await module.renderHRDocuments({container:q('#content'),heading:q('#detail .top'),api,isAdmin:session.user.role==='admin',isCurrent:()=>viewRequest===universeViewRequest&&currentUniverse===name&&session?.user.id===userId});}else if(name==="Outils d'aide aux commandes"){const userId=session.user.id,module=await import('/order-planning.js');if(currentUniverse===name)await module.renderOrderPlanning({container:q('#content'),api,canEdit:canEditUniverse(name),isCurrent:()=>viewRequest===universeViewRequest&&currentUniverse===name&&session?.user.id===userId});}else if(name==='Outils de calculs rapides'){const module=await import('/promoflash.js');if(currentUniverse===name)module.renderPromoFlash({container:q('#content'),api,isAdmin:session.user.role==='admin'});}else if(name==='Procédures'){const module=await import('/procedures.js');if(currentUniverse===name)await module.renderProcedures({container:q('#content'),api,canEdit:canEditUniverse('Procédures')});}else if(name==='Contacts utiles'){const module=await import('/contacts.js');if(currentUniverse===name)await module.renderContacts({container:q('#content'),api,isAdmin:session.user.role==='admin'});}else if(name==='Emplois du temps')await renderSchedule();else if(name==='Fun')await renderMusic();else if(name==='Agenda'){calendarDay=parisDay();calendarQuery='';await renderCalendar();}else{await api('/api/universes/'+encodeURIComponent(name));if(currentUniverse===name)q('#content').replaceChildren(node('div','Cet espace est prêt à accueillir vos informations. Aucun contenu ajouté pour le moment.','empty'));}}catch(e){if(currentUniverse===name)q('#content').replaceChildren(node('div',e.message,'empty'));}
  if(currentUniverse===name)void renderPublications(name);
}
function button(label,action,cls='btn small'){const b=node('button',label,cls);b.type='button';b.onclick=action;return b;}
function personName(p){return [p.firstName,p.lastName?.toLocaleUpperCase('fr-FR')].filter(Boolean).join(' ');}
async function reloadPeople(message=''){people=await api('/api/users');if(currentUniverse==='Collaborateurs'){renderPeople();q('#feedback').textContent=message;}}
function setPeopleAddActions(show){q('#people-add-actions').classList.toggle('hidden',!show);}
function renderPeople(){
  employeeRecordRequest++;setPeopleAddActions(session.user.role==='admin');
  const content=q('#content'),isAdmin=session.user.role==='admin';content.replaceChildren();
  content.append(node('p','Cliquez sur votre propre fiche pour accéder à vos bulletins de paie sur mySilae.','field-note'));
  if(isAdmin)content.append(node('p','Complétez les téléphones et, si besoin, créez les accès personnels depuis « Modifier ». Retirer un collaborateur le place dans les inactifs et désactive sa connexion.','field-note'));
  if(isAdmin){renderEmployeeScan(content);renderPeopleImport(content);renderEmployeeDocument(content);renderInvitationMail(content);}
  for(const active of [true,false]){
    const list=people.filter(p=>p.active===active),section=node('section','','people-section'+(!active?' inactive-people':''));
    section.append(node('h3',(active?'Collaborateurs actifs':'Collaborateurs inactifs')+' · '+list.length));
    if(!list.length){section.append(node('p',active?'Aucun collaborateur actif.':'Aucun collaborateur inactif.','empty'));content.append(section);continue;}
    const wrap=node('div','','tablewrap'),table=node('table','','people-table'),head=node('thead'),header=node('tr');
    ['Prénom','Nom','Téléphone',...(isAdmin?['Gestion']:[])].forEach(text=>{const th=node('th',text);th.scope='col';header.append(th);});head.append(header);table.append(head);
    const body=node('tbody');
    for(const p of list){
      const tr=node('tr','','person-row'+(p.isSelf?' own-person':''));tr.dataset.personId=p.id;
      const first=node('td'),last=node('td',p.lastName.toLocaleUpperCase('fr-FR')),phone=node('td',p.phone||'À renseigner','person-phone');
      if(isAdmin){const open=button(p.firstName,()=>openEmployeeRecord(p),'person-open');open.setAttribute('aria-label','Ouvrir la fiche de '+personName(p));first.append(open);const surname=button(p.lastName.toLocaleUpperCase('fr-FR'),()=>openEmployeeRecord(p),'person-open');surname.setAttribute('aria-label','Consulter la fiche de '+personName(p));last.replaceChildren(surname);}
      else if(p.isSelf){const mine=button(p.firstName+' · Ma fiche',()=>openMyPayroll(),'person-self');mine.setAttribute('aria-label','Ouvrir ma fiche, '+personName(p));first.append(mine);}else first.textContent=p.firstName;
      tr.append(first,last,phone);
      if(isAdmin){
        const actions=node('td','','actions');const edit=button('Modifier',()=>openEmployeeRecord(p));edit.setAttribute('aria-label','Modifier '+personName(p));actions.append(edit);
        if(active&&!p.passwordConfigured){
          const sendStatus=node('small','','invitation-status');sendStatus.setAttribute('role','status');sendStatus.setAttribute('aria-live','polite');
          const invite=button('Envoyer demande de connexion',async()=>{
            if(!confirm('Envoyer le mail de bienvenue à '+personName(p)+' sur '+p.invitationEmail+' ? Le salarié choisira lui-même son mot de passe.'))return;
            invite.disabled=true;invite.textContent='Envoi en cours…';sendStatus.className='invitation-status';sendStatus.textContent='Envoi de l’invitation…';q('#feedback').textContent=sendStatus.textContent;
            try{
              const result=await api('/api/users/'+p.id+'/invitation','POST',{email:p.invitationEmail});
              const message='Invitation envoyée à '+result.email+'. Le lien est valable 72 heures.';
              invite.textContent='Invitation envoyée';sendStatus.textContent=message;
              try{await reloadPeople(message);const refreshed=document.querySelector('[data-invitation-user="'+p.id+'"] .invitation-status');if(refreshed)refreshed.textContent=message;}catch{q('#feedback').textContent=message;}
            }
            catch(e){if(currentUniverse==='Collaborateurs'){q('#feedback').textContent=e.message;sendStatus.className='invitation-status error';sendStatus.textContent=e.message;const panel=q('#invitation-mail');if(panel)panel.open=true;invite.disabled=false;invite.textContent='Envoyer demande de connexion';}}
          },'btn small primary');
          invite.setAttribute('aria-label','Envoyer demande de connexion à '+personName(p));
          invite.disabled=!p.invitationEmail;invite.title=p.invitationEmail?'Envoyer à '+p.invitationEmail:'Renseignez une adresse e-mail dans la fiche du collaborateur.';
          const invitation=node('div','','person-invitation');invitation.dataset.invitationUser=p.id;invitation.append(invite,node('small',p.invitationEmail||'E-mail à renseigner','field-note'),sendStatus);
          if(p.invitationSentAt)invitation.append(node('small','Dernière invitation : '+new Date(p.invitationSentAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'}),'field-note'));
          actions.append(invitation);
        }
        if(p.role!=='admin'){
          if(active){const remove=button('Retirer',()=>{removeId=p.id;q('#removeText').textContent=personName(p)+' sera déplacé dans les collaborateurs inactifs. Son accès au portail sera désactivé. Vous pourrez le réactiver.';q('#removeDialog').showModal();},'btn small danger');remove.setAttribute('aria-label','Retirer '+personName(p));actions.append(remove);}
          else {const restore=button('Réactiver',async()=>{restore.disabled=true;try{await api('/api/users/'+p.id+'/restore','POST');await reloadPeople('Collaborateur réactivé.');}catch(e){error(e);restore.disabled=false;}});restore.setAttribute('aria-label','Réactiver '+personName(p));actions.append(restore);const permanent=button('Supprimer définitivement',async()=>{
            if(!confirm('Supprimer définitivement '+personName(p)+' ? Sa fiche confidentielle, ses accès et ses entrées de planning seront effacés du portail. Cette action est irréversible.'))return;
            permanent.disabled=true;restore.disabled=true;try{await api('/api/users/'+p.id+'/permanent','DELETE',{confirmation:p.id});await reloadPeople('Collaborateur supprimé définitivement.');}catch(e){error(e);permanent.disabled=false;restore.disabled=false;}
          },'btn small danger');permanent.setAttribute('aria-label','Supprimer définitivement '+personName(p));actions.append(permanent);}
        }
        tr.append(actions);
      }
      body.append(tr);
    }
    table.append(body);wrap.append(table);section.append(wrap);content.append(section);
  }
}

function renderInvitationMail(content){
  const panel=node('details','','invitation-mail');panel.id='invitation-mail';panel.append(node('summary','Messagerie des invitations'),node('p','Expéditeur : pharmacie.trevoux@gmail.com','field-note'));
  const state=node('p','Vérification de la connexion Gmail…','field-note'),controls=node('div','','news-selection-actions');panel.append(state,controls);content.append(panel);
  const userId=session.user.id;
  api('/api/mail/status').then(status=>{
    if(session?.user.id!==userId||!panel.isConnected)return;
    panel.open=!status.connected;state.textContent=status.connected?'Gmail est connecté. Vous pouvez envoyer les invitations depuis la ligne de chaque collaborateur.':'Connectez le compte Gmail de la pharmacie et autorisez l’envoi des mails pour activer les invitations.';
    if(!status.configured){state.textContent='La configuration Google du portail doit être complétée avant de connecter Gmail.';return;}
    const connect=button(status.connected?'Renouveler l’autorisation Gmail':'Connecter Gmail pour les invitations',async()=>{
      connect.disabled=true;try{const result=await api('/api/mail/connect','POST',{});window.location.assign(result.url);}catch(e){state.textContent=e.message;connect.disabled=false;}
    },'btn primary');controls.append(connect);
    if(status.connected)controls.append(button('Déconnecter cette messagerie',async()=>{
      if(!confirm('Désactiver l’envoi des invitations par Gmail ?'))return;
      try{await api('/api/mail/disconnect','POST',{});await reloadPeople('Messagerie des invitations déconnectée.');}catch(e){state.textContent=e.message;}
    },'btn small danger'));
  }).catch(e=>{if(panel.isConnected)state.textContent=e.message;});
}

let employeeRecordRequest=0;
async function openEmployeeRecord(person){
  if(session?.user.role!=='admin')return;
  const request=++employeeRecordRequest,userId=session.user.id;const valid=()=>request===employeeRecordRequest&&currentUniverse==='Collaborateurs'&&session?.user.id===userId;
  setPeopleAddActions(false);q('#feedback').textContent='';q('#content').replaceChildren(node('p','Chargement de la fiche…','field-note'));
  try{const module=await import('/employee-record.js');if(!valid())return;await module.renderEmployeeRecord({container:q('#content'),api,person,onClose:()=>reloadPeople(),onSaved:async(result,message)=>{await reloadPeople(message);},onPayroll:openMyPayroll,universes:initialTileOrder,isCurrent:valid});}
  catch(e){if(valid()){q('#content').replaceChildren(node('p',e.message,'error'),button('Retour à l’annuaire',()=>reloadPeople()));}}
}
async function openMyPayroll(){
  q('#my-payroll-dialog')?.remove();const dialog=node('dialog');dialog.id='my-payroll-dialog';dialog.setAttribute('aria-labelledby','my-payroll-title');
  const title=node('h2','Mes bulletins de paie');title.id='my-payroll-title';dialog.append(title);const text=node('p','Chargement…');dialog.append(text,button('Fermer',()=>dialog.close()));document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
  try{const data=await api('/api/collaborateurs/me/payroll');if(!dialog.open)return;text.textContent=data.name+' · Connectez-vous à mySilae avec vos identifiants personnels pour consulter vos bulletins.';
    const link=node('a','Accéder à mes bulletins sur mySilae','btn primary payroll-link');link.href=data.url;link.target='_blank';link.rel='noopener noreferrer';text.after(link,node('p','La consultation des bulletins dans le portail pourra être activée avec votre prestataire de paie.','field-note'));
  }catch(e){text.textContent=e.message;}
}
function openEditor(id=null){
  if(session.user.role!=='admin')return;editId=id;q('#form').reset();q('#editor-error').textContent='';q('#dialogtitle').textContent=id===null?'Ajouter un collaborateur':'Modifier le collaborateur';
  const p=people.find(p=>p.id===id);q('#first-name').value=p?.firstName||'';q('#last-name').value=p?.lastName||'';q('#phone').value=p?.phone||'';q('#birthday').value=p?.birthday||'';q('#job').value=p?.job||'';q('#email').value=p?.email||'';
  q('#account-options').classList.toggle('hidden',p?.role==='admin');q('#account-options').open=!!p?.email&&p?.role!=='admin';
  q('#email').required=false;q('#temporary-password').required=false;
  q('#password-help').textContent=p?.email?'Laissez vide pour conserver le mot de passe actuel. Un nouveau mot de passe provisoire doit comporter 12 caractères minimum.':'Renseignez un e-mail, puis envoyez une demande de connexion depuis l’annuaire. Le salarié choisira son mot de passe. Le mot de passe provisoire est facultatif.';
  document.querySelectorAll('[name=right]').forEach(c=>c.checked=p?.rights?.includes(c.value)||false);
  q('#editor').showModal();q('#first-name').focus();
}
q('#add').onclick=()=>openEditor();q('#cancel').onclick=()=>q('#editor').close();q('#editor').addEventListener('close',()=>q('#temporary-password').value='');
q('#form').onsubmit=async e=>{
  e.preventDefault();const btn=e.submitter;btn.disabled=true;
  const existing=people.find(p=>p.id===editId),data={firstName:q('#first-name').value,lastName:q('#last-name').value,phone:q('#phone').value,birthday:q('#birthday').value,job:q('#job').value,active:existing?.active!==false};
  if(existing?.role!=='admin')Object.assign(data,{email:q('#email').value,password:q('#temporary-password').value,rights:[...document.querySelectorAll('[name=right]:checked')].map(c=>c.value)});
  try{await api('/api/users'+(editId===null?'':'/'+editId),editId===null?'POST':'PUT',data);q('#form').reset();q('#editor').close();await reloadPeople('Fiche enregistrée.');}
  catch(e){q('#editor-error').textContent=e.message;}finally{btn.disabled=false;}
};
q('#keep').onclick=()=>q('#removeDialog').close();q('#confirmRemove').onclick=async()=>{
  const btn=q('#confirmRemove');btn.disabled=true;try{await api('/api/users/'+removeId,'DELETE');q('#removeDialog').close();await reloadPeople('Collaborateur déplacé dans les inactifs.');}catch(e){q('#removeDialog').close();q('#feedback').textContent=e.message;}finally{btn.disabled=false;}
};
function parsePeopleCSV(text){
  const rows=[];let row=[],field='',quoted=false;text=text.replace(/^\uFEFF/,'');const delimiter=text.split(/\r?\n/)[0].includes(';')?';':',';
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(!quoted&&c===delimiter){row.push(field);field='';}else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';}else field+=c;}
  if(quoted)throw Error('Guillemets incomplets dans le CSV.');row.push(field);if(row.some(v=>v.trim()))rows.push(row);
  const headers=(rows.shift()||[]).map(normalizeSearch),column=name=>headers.indexOf(name);if(column('prenom')<0||column('nom')<0)throw Error('Le CSV doit contenir les colonnes Prénom et Nom.');
  const people=rows.map(r=>{const value=n=>(r[column(n)]||'').trim();const status=normalizeSearch(value('actif'));if(status&&!['oui','non','true','false','1','0'].includes(status))throw Error('La colonne Actif doit contenir Oui ou Non.');return {firstName:value('prenom'),lastName:value('nom'),phone:value('telephone'),birthday:value('date de naissance'),job:value('fonction'),active:!['non','false','0'].includes(status)};});
  if(!people.length||people.length>100||people.some(p=>!p.firstName||!p.lastName))throw Error('Le fichier doit contenir de 1 à 100 personnes avec prénom et nom complets.');return people;
}
function renderEmployeeScan(content){
  const area=node('section','','people-import hidden'),body=node('div');area.id='employee-scan-panel';area.append(node('h3','Ajouter un collaborateur à partir d’une fiche de renseignements'),button('Fermer',()=>area.classList.add('hidden')),body);content.append(area);let loaded=false;
  q('#add-from-sheet').onclick=async()=>{area.classList.remove('hidden');if(loaded)return;loaded=true;const userId=session.user.id;const valid=()=>currentUniverse==='Collaborateurs'&&session?.user.id===userId&&area.isConnected;
    try{const module=await import('/employee-import.js');if(!valid())return;await module.renderEmployeeImport({container:body,api,people,isCurrent:valid,onReview:async(person,draft)=>{
      const record=await import('/employee-record.js');if(!valid())return;
      const request=++employeeRecordRequest;const reviewValid=()=>request===employeeRecordRequest&&currentUniverse==='Collaborateurs'&&session?.user.id===userId;
      const cleanup=()=>URL.revokeObjectURL(draft.sourceUrl);setPeopleAddActions(false);
      await record.renderEmployeeRecord({container:q('#content'),api,person,draft,universes:initialTileOrder,isCurrent:reviewValid,onPayroll:openMyPayroll,onClose:()=>{cleanup();reloadPeople();},onSaved:async(result,message)=>{cleanup();await reloadPeople(message);}});
    }});}catch(e){loaded=false;body.replaceChildren(node('p',e.message,'error'));}
  };
}
function renderEmployeeDocument(content){
  const area=node('details','','people-import');
  const download=node('a','Télécharger le PDF vierge','btn primary');download.href='/api/collaborateurs/registration-form';download.download='fiche-inscription-salarie.pdf';
  area.append(node('summary','Générer une fiche de renseignements'),node('p','Fiche à imprimer et à remplir à la main par le salarié : informations d’inscription et liste des justificatifs à transmettre selon sa situation.','field-note'),download);content.append(area);
}
function renderPeopleImport(content){
  const area=node('details','','people-import');area.append(node('summary','Importer une liste de collaborateurs'),node('p','CSV : Prénom, Nom, Téléphone, Date de naissance (AAAA-MM-JJ), Fonction, Actif (Oui / Non). Les informations de connexion existantes sont conservées.','field-note'));
  const label=node('label','Choisir le fichier CSV','field'),file=node('input');file.type='file';file.id='people-csv';file.accept='.csv,text/csv';label.htmlFor=file.id;
  const status=node('p','','field-note');status.setAttribute('role','status');let pending=[];
  const submit=button('Importer ces collaborateurs',async()=>{submit.disabled=true;file.disabled=true;try{const result=await api('/api/collaborateurs/import','POST',{people:pending});await reloadPeople(result.count+' fiches importées : '+result.active+' actives, '+result.inactive+' inactives.');}catch(e){status.textContent=e.message;file.disabled=false;submit.disabled=false;}},'btn primary');submit.disabled=true;
  file.onchange=async()=>{pending=[];submit.disabled=true;status.textContent='';try{const selected=file.files[0];if(!selected)return;if(selected.size>15000)throw Error('Le fichier est trop volumineux.');pending=parsePeopleCSV(await selected.text());status.textContent=pending.length+' fiches prêtes : '+pending.filter(p=>p.active).length+' actives, '+pending.filter(p=>!p.active).length+' inactives.';submit.disabled=false;}catch(e){status.textContent=e.message;}};
  area.append(label,file,status,submit);content.append(area);
}
async function runCalendarAction(action){try{q('#feedback').textContent='Veuillez patienter…';await action();q('#feedback').textContent='';if(currentUniverse==='Agenda')await renderCalendar();}catch(e){q('#feedback').textContent=e.message;}}
async function renderCalendar(){
  const data=await api('/api/calendar');if(currentUniverse!=='Agenda')return;const content=q('#content');content.replaceChildren();
  if(session.user.role==='admin'){
    const status=await api('/api/google/status');if(currentUniverse!=='Agenda')return;
    const tools=node('details','','calendar-tools');tools.open=!status.connected;tools.append(node('summary','Paramètres de l’agenda'));
    if(!status.configured){tools.append(node('p','Ajoutez les identifiants Google dans les paramètres Render pour activer la connexion.','admin-hint'),node('p','Adresse de retour à renseigner dans Google : '+status.callback,'admin-hint'));}
    else tools.append(button(status.connected?'Renouveler l’autorisation Google':'Connecter Google Agenda',()=>runCalendarAction(async()=>{const result=await api('/api/google/connect','POST');window.location.assign(result.url);}),'btn primary'));
    if(status.connected){
      try{const calendars=await api('/api/google/calendars');if(currentUniverse!=='Agenda')return;const label=node('label','Agenda à afficher');label.htmlFor='calendar-choice';const select=node('select','','calendar-select');select.id='calendar-choice';select.append(new Option('Choisir un agenda',''));calendars.forEach(c=>select.append(new Option(c.name,c.id)));select.value=status.calendarId;tools.append(label,select,button('Enregistrer cet agenda',()=>runCalendarAction(async()=>{if(!select.value)throw Error('Choisissez un agenda.');await api('/api/google/calendar','POST',{id:select.value});})));}
      catch(e){tools.append(node('p',e.message,'calendar-warning'));}
      tools.append(button('Actualiser maintenant',()=>runCalendarAction(()=>api('/api/google/sync','POST'))),button('Déconnecter Google',()=>{if(confirm('Déconnecter Google et retirer les événements du portail ?'))runCalendarAction(()=>api('/api/google/disconnect','POST'));},'btn small danger'));
    }
    content.append(tools);
  }
  content.append(node('h3',data.name));
  if(data.syncedAt)content.append(node('p','Dernière synchronisation : '+new Date(data.syncedAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})+' · Actualisation toutes les 15 minutes.','status-line'));
  if(data.error)content.append(node('p',data.error+' Les événements affichés peuvent ne pas être à jour.','calendar-warning'));
  const results=node('section','','agenda-results');content.append(results);renderCalendarResults(data,results);
}
setInterval(()=>{if(session&&!session.user.mustChange&&currentUniverse==='Agenda')renderCalendar().catch(error);},15*60000);
(async()=>{
 const invitation=location.hash.match(/^#invitation=([-\w]{43})$/)?.[1];
 if(invitation){history.replaceState(null,'',location.pathname);await Promise.resolve();showLogin();try{const module=await import('/invitation.js');await module.renderInvitation({container:q('#login'),token:invitation,api,onComplete:result=>{session=result;afterLogin();}});}catch(e){q('#global-message').textContent=e.message;}return;}
 try{session=await api('/api/me');afterLogin();if(!session.user.mustChange&&location.search.includes('google=')){await openUniverse('Agenda');if(location.search.includes('refused'))q('#feedback').textContent='Autorisation Google annulée.';history.replaceState(null,'','/');}else if(!session.user.mustChange&&location.search.includes('mail=')){await openUniverse('Collaborateurs');q('#feedback').textContent=location.search.includes('refused')?'Autorisation Gmail annulée.':'Gmail connecté. Vous pouvez envoyer les demandes de connexion.';history.replaceState(null,'','/');}else if(!session.user.mustChange&&location.search.includes('youtube=')){await openUniverse('Fun');if(location.search.includes('refused'))q('#feedback').textContent='Autorisation YouTube annulée.';else q('#feedback').textContent='YouTube connecté. Cliquez sur son logo pour choisir votre playlist.';history.replaceState(null,'','/');}}catch{showLogin();}})();

const initialTileOrder=[...document.querySelectorAll('.grid [data-universe]')].map(b=>b.dataset.universe);
let draftTileOrder=[],draftHiddenTiles=new Set();
function tileOrderKey(){return 'portail-plus:tile-order:'+session.user.id;}
function tileAllowed(name){return session.user.role==='admin'||(session.user.permissionsConfigured?session.user.rights.includes(name):(['Fun','Outils de calculs rapides','Collaborateurs','Actualités','Ressources humaines','Laboratoires'].includes(name)||session.user.rights.includes(name)));}
function canEditUniverse(name){if(['Laboratoires',"Outils d'aide aux commandes"].includes(name))return tileAllowed(name);if(name==='Ressources humaines')return session.user.role==='admin';return session.user.role==='admin'||(tileAllowed(name)&&(session.user.permissionsConfigured?session.user.editRights?.includes(name):name==='Fun'));}
function tilePreferences(){
  let saved;try{saved=JSON.parse(localStorage.getItem(tileOrderKey())||'null');}catch{}
  let order=Array.isArray(saved)?saved:Array.isArray(saved?.order)?saved.order:[];
  // Migrate the former first row once, while preserving custom orders and hidden tiles.
  if((saved?.version||0)<2&&order.indexOf('Procédures')===3&&order.indexOf('Actualités')>3){const index=order.indexOf('Actualités');[order[3],order[index]]=[order[index],order[3]];}
  if((saved?.version||0)<3){
    const bottom=['Fun','Passerelle groupement','Outils de calculs rapides',"Outils d'aide aux commandes"];
    order=[...order.filter(name=>!bottom.includes(name)),...initialTileOrder.filter(name=>!order.includes(name)&&!bottom.includes(name)),...bottom];
  }
  return {order,hidden:Array.isArray(saved?.hidden)?saved.hidden:[]};
}
function applyTileVisibility(){
  const hidden=new Set(tilePreferences().hidden);
  document.querySelectorAll('.grid [data-universe]').forEach(tile=>tile.classList.toggle('hidden',!tileAllowed(tile.dataset.universe)||hidden.has(tile.dataset.universe)));
}
function applyTileOrder(){
  const saved=tilePreferences().order;
  const order=[...new Set([...saved.filter(n=>initialTileOrder.includes(n)),...initialTileOrder])];
  const grid=q('.grid');order.forEach(name=>{const tile=[...grid.children].find(b=>b.dataset.universe===name);if(tile)grid.append(tile);});applyTileVisibility();
}
function renderTileOrder(focusName,focusDirection){
  const list=q('#tile-order-list');list.replaceChildren();
  draftTileOrder.forEach((name,index)=>{
    const row=node('div','','tile-order-row'),label=node('span',name),actions=node('div','','tile-order-actions');
    const visibility=node('label','','tile-visibility'),check=node('input');check.type='checkbox';check.checked=!draftHiddenTiles.has(name);check.setAttribute('aria-label','Afficher '+name);
    check.onchange=()=>{if(check.checked)draftHiddenTiles.delete(name);else draftHiddenTiles.add(name);q('#tile-order-status').textContent=name+(check.checked?' sera affiché.':' sera masqué.');};
    visibility.append(check,node('span','Afficher'));actions.append(visibility);
    ['up','down'].forEach(direction=>{
      const offset=direction==='up'?-1:1;
      const control=button(direction==='up'?'↑':'↓',()=>{
        const target=index+offset;[draftTileOrder[index],draftTileOrder[target]]=[draftTileOrder[target],draftTileOrder[index]];
        renderTileOrder(name,direction);q('#tile-order-status').textContent=name+' : position '+(target+1);
      });
      control.setAttribute('aria-label',(direction==='up'?'Monter ':'Descendre ')+name);
      control.dataset.name=name;control.dataset.direction=direction;control.disabled=index+offset<0||index+offset>=draftTileOrder.length;actions.append(control);
    });row.append(label,actions);list.append(row);
  });
  if(focusName){const controls=[...list.querySelectorAll('button')];const focused=controls.find(b=>b.dataset.name===focusName&&b.dataset.direction===focusDirection&&!b.disabled)||controls.find(b=>b.dataset.name===focusName&&!b.disabled);focused?.focus();}
}
q('#organize-tiles').onclick=()=>{
  draftTileOrder=[...document.querySelectorAll('.grid [data-universe]')].filter(b=>tileAllowed(b.dataset.universe)).map(b=>b.dataset.universe);
  draftHiddenTiles=new Set(tilePreferences().hidden.filter(name=>initialTileOrder.includes(name)));
  q('#tile-order-status').textContent='';renderTileOrder();q('#tile-order-dialog').showModal();
};
q('#tile-order-cancel').onclick=()=>q('#tile-order-dialog').close();
q('#tile-order-reset').onclick=()=>{draftTileOrder=initialTileOrder.filter(tileAllowed);draftHiddenTiles.clear();renderTileOrder();q('#tile-order-status').textContent='Ordre initial et toutes vos tuiles affichées.';};
q('#tile-order-save').onclick=()=>{
  try{localStorage.setItem(tileOrderKey(),JSON.stringify({version:3,order:[...draftTileOrder,...initialTileOrder.filter(n=>!draftTileOrder.includes(n))],hidden:[...draftHiddenTiles]}));showHome();q('#tile-order-dialog').close();}
  catch{q('#tile-order-status').textContent='Ce navigateur ne permet pas de mémoriser votre ordre.';}
};

async function renderMusic(){
  let tracks=await api('/api/music');if(currentUniverse!=='Fun')return;
  const selectedTracks=new Set();
  const editable=canEditUniverse('Fun'),content=q('#content');content.replaceChildren();
  const intro=node('div','','music-intro');intro.append(node('h3','La musique de toute l’équipe'),node('p','Ajoutez vos morceaux préférés à la sélection partagée de la pharmacie.'));
  const form=node('form','','music-form');
  const artistLabel=node('label','Artiste'),artist=node('input');artist.type='text';artist.id='music-artist';artist.maxLength=200;artist.required=true;artist.placeholder='Ex. : Adele';artistLabel.htmlFor=artist.id;
  const titleLabel=node('label','Titre'),title=node('input');title.type='text';title.id='music-title';title.maxLength=200;title.required=true;title.placeholder='Ex. : Hometown Glory';titleLabel.htmlFor=title.id;
  const artistField=node('div'),titleField=node('div');artistField.append(artistLabel,artist);titleField.append(titleLabel,title);
  const submit=node('button','Ajouter à la sélection','btn primary');submit.type='submit';
  const message=node('p','','music-feedback');message.setAttribute('role','status');
  form.append(artistField,titleField,submit);content.append(intro);if(editable)content.append(form);else content.append(node('p','Vous consultez la sélection musicale. L’ajout et la suppression de titres nécessitent un droit de modification.','field-note'));content.append(message);
  content.append(node('p','Cette liste rassemble les choix de l’équipe. Cochez vos titres puis choisissez une plateforme. Deezer télécharge le CSV et ouvre Tune My Music : chargez-y le fichier téléchargé. YouTube permet de vérifier les vidéos puis de les ajouter directement à la playlist connectée.','status-line'));
  const toolbar=node('div','','music-toolbar'),searchLabel=node('label','Retrouver un morceau'),search=node('input');search.type='search';search.id='music-search';search.placeholder='Artiste ou titre…';searchLabel.htmlFor=search.id;toolbar.append(searchLabel,search);
  const list=node('div','','music-list');list.setAttribute('role','list');const count=node('p','','status-line'),more=button('Afficher davantage',()=>{limit+=40;display();});let limit=40;

  const exportButton=button('',()=>{
    const chosen=tracks.filter(t=>selectedTracks.has(t.id));if(!chosen.length)return;
    window.open('https://www.tunemymusic.com/transfer/file-to-deezer','_blank','noopener,noreferrer');
    const csvCell=value=>'"'+String(value).replace(/"/g,'""')+'"';
    const csv='\uFEFF'+[['Artist','Title'],...chosen.map(t=>[t.artist,t.title])].map(row=>row.map(csvCell).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=node('a');a.href=url;a.download='Playlist_PORTAIL_PLUS.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  exportButton.className='btn small music-platform-button deezer-button';exportButton.innerHTML="<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path fill=\"currentColor\" d=\"M.693 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807C.312 4.41 0 5.666 0 7.217s.312 2.808.693 2.808ZM21.038 1.56c-.364 0-.684.805-.91 2.096C19.765 1.446 19.184 0 18.526 0c-.78 0-1.464 2.036-1.784 5-.312-2.158-.788-3.536-1.325-3.536-.745 0-1.386 2.704-1.62 6.472-.442-1.932-1.083-3.145-1.793-3.145s-1.35 1.213-1.793 3.145c-.242-3.76-.874-6.463-1.628-6.463-.537 0-1.013 1.378-1.325 3.535C6.938 2.036 6.262 0 5.474 0c-.658 0-1.247 1.447-1.602 3.665-.217-1.291-.546-2.105-.91-2.105-.675 0-1.221 2.807-1.221 6.272 0 3.466.546 6.273 1.221 6.273.277 0 .537-.476.736-1.273.32 2.928.996 4.938 1.776 4.938.606 0 1.143-1.204 1.507-3.11.251 3.622.875 6.195 1.602 6.195.46 0 .875-1.023 1.187-2.677C10.142 21.6 11 24 12.004 24c1.005 0 1.863-2.4 2.235-5.822.312 1.654.727 2.677 1.186 2.677.728 0 1.352-2.573 1.603-6.195.364 1.906.9 3.11 1.507 3.11.78 0 1.455-2.01 1.775-4.938.208.797.46 1.273.737 1.273.675 0 1.22-2.807 1.22-6.273-.008-3.457-.553-6.272-1.23-6.272ZM23.307 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807-.381 0-.693 1.256-.693 2.807s.312 2.808.693 2.808Z\"/></svg>";
  exportButton.title='Deezer : créer le CSV des titres cochés et ouvrir Tune My Music';exportButton.setAttribute('aria-label',exportButton.title);
  const youtubePanel=node('section','','youtube-panel hidden');
  const youtubeTransfer=button('',async()=>{await renderYouTubePanel(youtubePanel,tracks.filter(t=>selectedTracks.has(t.id)));},'btn small music-platform-button youtube-button');
  youtubeTransfer.innerHTML="<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path fill=\"currentColor\" d=\"M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z\"/></svg>";
  youtubeTransfer.title='Ajouter directement les titres cochés à YouTube';youtubeTransfer.setAttribute('aria-label',youtubeTransfer.title);
  const selectionCount=node('span','','status-line');selectionCount.setAttribute('role','status');
  function updateSelection(){
    const total=tracks.filter(t=>selectedTracks.has(t.id)).length;
    selectionCount.textContent=total+' titre'+(total!==1?'s':'')+' coché'+(total!==1?'s':'');
    exportButton.disabled=!total;
  }
  function filteredTracks(){
    const terms=normalizeSearch(search.value).split(/\s+/).filter(Boolean);
    return tracks.filter(t=>terms.every(term=>normalizeSearch(t.artist+' '+t.title).includes(term)));
  }
  const selectAll=button('Tout cocher',()=>{filteredTracks().forEach(t=>selectedTracks.add(t.id));display();});
  const selectNone=button('Tout décocher',()=>{selectedTracks.clear();display();});
  const selectionTools=node('div','','music-selection-tools');selectionTools.append(selectAll,selectNone,node('span','« Tout cocher » sélectionne tous les résultats de la recherche, y compris les lignes non affichées.','field-note'));
  toolbar.append(selectionTools);
  const actions=node('div','','agenda-navigation');actions.append(exportButton,youtubeTransfer,selectionCount);
  if(!editable){youtubeTransfer.classList.add('hidden');}content.append(actions,youtubePanel,toolbar,count,list,more);
  if(session.user.role==='admin'){
    const importPanel=node('details','','calendar-tools');importPanel.open=!tracks.length;importPanel.append(node('summary','Importer des morceaux (CSV)'),node('p','Choisissez votre CSV, puis cliquez sur « Importer dans le portail ». Les morceaux déjà présents sont ignorés.','field-note'));
    const label=node('label','Fichier CSV avec les colonnes Artist et Title'),file=node('input');file.type='file';file.accept='.csv,text/csv';file.id='music-csv-import';label.htmlFor=file.id;
    const state=node('p','','status-line');state.setAttribute('role','status');
    let pending=[];
    const importButton=button('Importer dans le portail',async()=>{
      importButton.disabled=true;file.disabled=true;let added=0,duplicates=0,done=0;
      try{
        for(let i=0;i<pending.length;i+=25){
          const batch=pending.slice(i,i+25);const result=await api('/api/music/import','POST',{tracks:batch});added+=result.added;duplicates+=result.duplicates;done+=batch.length;state.textContent=done+' / '+pending.length+' morceaux traités…';
        }
        tracks=await api('/api/music');if(currentUniverse!=='Fun')return;display();state.textContent=added+' morceaux importés, '+duplicates+' doublons déjà présents.';pending=[];file.value='';
      }catch(e){state.textContent=e.message+' '+done+' morceaux traités. Vous pouvez relancer : les doublons sont ignorés.';}finally{file.disabled=false;importButton.disabled=!pending.length;}
    });importButton.disabled=true;
    file.onchange=async()=>{
      pending=[];importButton.disabled=true;state.textContent='';
      try{const selected=file.files[0];if(!selected)return;if(selected.size>2000000)throw Error('Le fichier CSV est trop volumineux.');pending=parseMusicCSV(await selected.text());state.textContent=pending.length+' morceaux prêts à être importés.';importButton.disabled=false;}catch(e){state.textContent=e.message;}
    };
    importPanel.append(label,file,state,importButton);content.insertBefore(importPanel,toolbar);
  }

  function display(){
    const terms=normalizeSearch(search.value).split(/\s+/).filter(Boolean);
    const visible=filteredTracks();updateSelection();
    count.textContent=visible.length+' morceau'+(visible.length!==1?'x':'')+(terms.length?' trouvé'+(visible.length!==1?'s':''):' dans la sélection');
    list.replaceChildren();
    visible.slice(0,limit).forEach(t=>{
      const row=node('div','','music-row');row.setAttribute('role','listitem');
      const check=node('input','','music-row-check');check.type='checkbox';check.checked=selectedTracks.has(t.id);check.setAttribute('aria-label','Exporter '+t.title+' de '+t.artist);
      check.onchange=()=>{if(check.checked)selectedTracks.add(t.id);else selectedTracks.delete(t.id);updateSelection();};
      const song=node('span',t.title,'music-row-title'),artistName=node('span',t.artist,'music-row-artist');
      const added=node('time','','music-row-date'),addedDate=new Date(t.created_at);
      if(t.created_at&&!Number.isNaN(addedDate.getTime())){added.dateTime=addedDate.toISOString();added.textContent='Ajouté le '+addedDate.toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'});}else added.textContent='Date inconnue';
      const actions=node('div','','music-row-actions');
      const link=node('a','Deezer','btn small');link.href='https://www.deezer.com/search/'+encodeURIComponent(t.artist+' '+t.title);link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','Rechercher '+t.title+' de '+t.artist+' sur Deezer');
      const remove=button('Supprimer',async()=>{
        if(!confirm('Retirer « '+t.title+' » de '+t.artist+' de la sélection partagée de l’équipe ?'))return;
        remove.disabled=true;message.textContent='';
        try{
          await api('/api/music/'+t.id,'DELETE');
          if(currentUniverse!=='Fun')return;
          tracks=tracks.filter(track=>track.id!==t.id);selectedTracks.delete(t.id);display();message.textContent='« '+t.title+' » a été retiré de la sélection.';
        }catch(e){message.textContent=e.message;}finally{remove.disabled=false;}
      },'btn small danger');
      remove.setAttribute('aria-label','Supprimer '+t.title+' de '+t.artist+' de la sélection');
      actions.append(link);if(editable)actions.append(remove);row.append(check,song,artistName,added,actions);list.append(row);
    });
    if(!visible.length)list.append(node('div','Aucun morceau ne correspond à votre recherche.','empty'));
    more.classList.toggle('hidden',visible.length<=limit);
  }
  search.oninput=()=>{limit=40;display();};
  form.onsubmit=async event=>{
    event.preventDefault();submit.disabled=true;message.textContent='';
    try{
      const track=await api('/api/music','POST',{artist:artist.value,title:title.value});
      if(currentUniverse!=='Fun')return;
      tracks.unshift(track);form.reset();search.value='';limit=40;display();message.textContent='Votre morceau a été ajouté à la sélection partagée.';artist.focus();
    }catch(e){message.textContent=e.message;}finally{submit.disabled=false;}
  };
  display();
}

function parseMusicCSV(text){
  const rows=[];let row=[],field='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;
    }else if(!quoted&&c===','){row.push(field);field='';}
    else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw Error('Le fichier CSV contient des guillemets incomplets.');
  row.push(field);if(row.some(v=>v.trim()))rows.push(row);
  const headers=(rows.shift()||[]).map(v=>v.trim().toLowerCase());
  const ai=headers.findIndex(v=>['artist','artiste','artist name'].includes(v)),ti=headers.findIndex(v=>['title','titre','track name'].includes(v));
  if(ai<0||ti<0)throw Error('Choisissez un CSV contenant les colonnes Artist et Title.');
  const tracks=rows.map(r=>({artist:(r[ai]||'').trim(),title:(r[ti]||'').trim()}));
  if(!tracks.length||tracks.length>2000||tracks.some(t=>!t.artist||!t.title||t.artist.length>200||t.title.length>200))throw Error('Le fichier doit contenir de 1 à 2 000 morceaux avec artiste et titre complets.');
  return tracks;
}

async function renderYouTubePanel(panel,chosen){
  panel.classList.remove('hidden');panel.replaceChildren(node('p','Chargement de YouTube…','status-line'));
  try{
    const status=await api('/api/youtube/status');if(currentUniverse!=='Fun')return;
    panel.replaceChildren(node('h3','Ajouter les titres cochés à YouTube'));
    const state=node('p','','status-line');state.setAttribute('role','status');
    panel.append(node('p',status.connected?'Chaîne connectée : '+status.channel:'YouTube n’est pas encore connecté.'));
    if(session.user.role==='admin'){
      const settings=node('details','','calendar-tools');settings.open=!status.connected||!status.playlistId;settings.append(node('summary','Compte et playlist YouTube'));
      settings.append(node('p','Activez YouTube Data API v3 dans le projet Google Cloud de l’agenda. La connexion réutilise vos identifiants Google et l’adresse de retour déjà configurée.','field-note'));
      const connect=button(status.connected?'Reconnecter YouTube':'Connecter YouTube',async()=>{
        connect.disabled=true;
        try{const result=await api('/api/youtube/connect','POST');window.location.assign(result.url);}catch(e){state.textContent=e.message;connect.disabled=false;}
      });connect.disabled=!status.configured;settings.append(connect);
      if(!status.configured)settings.append(node('p','Ajoutez les identifiants Google dans Render.','field-note'));
      if(status.connected){
        try{
          const playlists=await api('/api/youtube/playlists');if(currentUniverse!=='Fun')return;
          const label=node('label','Playlist à alimenter'),select=node('select','','calendar-select');select.id='youtube-playlist-choice';label.htmlFor=select.id;select.append(new Option('Choisir une playlist',''));playlists.forEach(p=>select.append(new Option(p.name,p.id)));select.value=status.playlistId;
          const save=button('Utiliser cette playlist',async()=>{save.disabled=true;try{if(!select.value)throw Error('Choisissez une playlist.');await api('/api/youtube/playlist','POST',{id:select.value});await renderYouTubePanel(panel,chosen);}catch(e){state.textContent=e.message;save.disabled=false;}});settings.append(label,select,save);
        }catch(e){settings.append(node('p',e.message,'error'));}
        const newLabel=node('label','Ou créer une playlist privée'),newName=node('input');newName.type='text';newName.maxLength=150;newName.id='youtube-new-playlist';newName.value='PORTAIL + — Pharmacie de Trévoux';newLabel.htmlFor=newName.id;
        const create=button('Créer cette playlist privée',async()=>{create.disabled=true;try{await api('/api/youtube/playlists','POST',{title:newName.value});await renderYouTubePanel(panel,chosen);}catch(e){state.textContent=e.message;create.disabled=false;}});settings.append(newLabel,newName,create);
        const disconnect=button('Déconnecter YouTube du portail',async()=>{disconnect.disabled=true;try{await api('/api/youtube/disconnect','POST');await renderYouTubePanel(panel,chosen);}catch(e){state.textContent=e.message;disconnect.disabled=false;}});settings.append(disconnect);
      }panel.append(settings);
    }
    panel.append(state);
    if(!status.connected||!status.playlistId){if(session.user.role!=='admin')panel.append(node('p','Demandez à l’administrateur de connecter YouTube et de choisir la playlist.'));return;}
    const playlist=node('a',status.playlistName,'btn small');playlist.href='https://www.youtube.com/playlist?list='+encodeURIComponent(status.playlistId);playlist.target='_blank';playlist.rel='noopener noreferrer';panel.append(node('p','Playlist choisie :'),playlist);
    if(!chosen.length){panel.append(node('p','Cochez les titres dans la liste puis cliquez à nouveau sur le logo YouTube.'));return;}
    panel.append(node('p',chosen.length+' titres sélectionnés. Recherchez les vidéos, vérifiez les versions proposées puis validez leur ajout. Les vidéos déjà présentes seront ignorées.'));
    const results=node('div','','youtube-matches'),choices=[];
    const add=button('Ajouter les vidéos vérifiées à la playlist',async()=>{
      const pending=choices.filter(c=>c.select.value&&!c.done);if(!pending.length)return;
      add.disabled=true;prepare.disabled=true;let added=0,duplicates=0;
      choices.forEach(c=>c.select.disabled=true);
      try{
        for(const c of pending){
          const result=await api('/api/youtube/add','POST',{trackId:c.track.id,videoId:c.select.value,playlistId:status.playlistId});
          c.done=true;if(result.added){added++;c.note.textContent='Ajouté';}else{duplicates++;c.note.textContent='Déjà présent';}
          state.textContent=added+' ajouté(s), '+duplicates+' déjà présent(s)…';if(currentUniverse!=='Fun')return;
        }
        state.textContent='Terminé : '+added+' vidéo(s) ajoutée(s), '+duplicates+' déjà présente(s).';
      }catch(e){state.textContent=e.message+' '+added+' vidéo(s) ajoutée(s). Vous pouvez relancer les ajouts restants.';}
      finally{choices.forEach(c=>c.select.disabled=c.done);updateAdd();prepare.disabled=false;}
    },'btn primary');add.disabled=true;
    const updateAdd=()=>{add.disabled=!choices.some(c=>c.select.value&&!c.done);};
    const prepare=button('Rechercher les vidéos sur YouTube',async()=>{
      prepare.disabled=true;add.disabled=true;
      try{
        for(const track of chosen){
          if(choices.some(c=>c.track.id===track.id))continue;
          state.textContent='Recherche : '+track.artist+' — '+track.title+' ('+(choices.length+1)+' / '+chosen.length+')';
          const result=await api('/api/youtube/candidates','POST',{trackId:track.id});if(currentUniverse!=='Fun')return;
          const row=node('div','','youtube-match'),label=node('label',track.artist+' — '+track.title),select=node('select');select.id='youtube-match-'+track.id;label.htmlFor=select.id;
          select.append(new Option('Ne pas ajouter ce titre',''));result.candidates.forEach(v=>select.append(new Option(v.title+' · '+v.channel,v.id)));
          select.value=result.candidates[0]?.id||'';
          const link=node('a','Voir la vidéo','btn small');link.target='_blank';link.rel='noopener noreferrer';
          const note=node('span',result.candidates.length?'Version à vérifier':'Aucune vidéo trouvée','status-line');
          const c={track,select,note,done:false};choices.push(c);
          const updateLink=()=>{link.classList.toggle('hidden',!select.value);if(select.value)link.href='https://www.youtube.com/watch?v='+encodeURIComponent(select.value);updateAdd();};select.onchange=updateLink;updateLink();
          row.append(label,select,link,note);results.append(row);
        }state.textContent='Vérifiez les versions proposées. Vous pouvez changer la vidéo ou choisir « Ne pas ajouter ». Google limite le nombre de recherches et d’ajouts par jour.';
      }catch(e){state.textContent=e.message+' Les résultats déjà trouvés restent disponibles.';}
      finally{prepare.disabled=false;updateAdd();}
    });panel.append(prepare,results,add);
  }catch(e){panel.replaceChildren(node('p',e.message,'error'));}
}
let homeExtrasPending=false;
async function refreshHomeExtras(){
  if(!session||session.user.mustChange||homeExtrasPending)return;
  const userId=session.user.id;homeExtrasPending=true;
  try{
    const results=await Promise.allSettled([api('/api/fun/joke'),api('/api/publications'),api('/api/collaborateurs/celebrations'),tileAllowed('Agenda')?api('/api/calendar'):Promise.resolve(null)]);
    const joke=results[0].status==='fulfilled'?results[0].value:null,news=results[1].status==='fulfilled'?results[1].value:[],celebrations=results[2].status==='fulfilled'?results[2].value:null;
    if(session?.user.id!==userId)return;
    document.querySelectorAll('.grid .tile').forEach(tile=>{
      tile.querySelector('.tile-news')?.remove();
      if(['Collaborateurs','Contacts utiles','Agenda'].includes(tile.dataset.universe))return;
      const count=news.find(n=>n.universe===tile.dataset.universe)?.unread||0;
      const badge=node('span','','tile-news'+(count?' has-news':''));
      const label=tile.dataset.universe==='Actualités'?(count?count+' message'+(count>1?'s':'')+' non vu'+(count>1?'s':''):'Aucun message non vu'):(count?count+' nouveauté'+(count>1?'s':'')+' non lue'+(count>1?'s':''):'Aucune nouveauté non lue');
      badge.append(node('span',count?'●':'○','news-dot'),node('span',label));
      tile.append(badge);
    });
    renderHomeAgenda(results[3].status==='fulfilled'?results[3].value:null);
    renderCelebrations(celebrations);
    const fun=q('.grid [data-universe="Fun"]');fun.querySelector('.daily-joke')?.remove();
    const block=node('span','','daily-joke');block.append(node('strong','😄 La blague du jour'));
    block.append(node('span',joke?.text||'La blague du jour arrive bientôt.'));
    if(joke)block.append(node('small',(joke.stale?'Dernière blague disponible · ':'')+joke.day.split('-').reverse().join('/')+' · '+joke.source));
    fun.insertBefore(block,fun.querySelector('.tile-news'));
  }catch{}finally{homeExtrasPending=false;}
}
async function renderPublications(name){
  if(!session||['Collaborateurs','Actualités'].includes(name))return;const userId=session.user.id;
  try{
    const items=await api('/api/publications/'+encodeURIComponent(name));
    if(session?.user.id!==userId||currentUniverse!==name)return;
    q('#universe-publications')?.remove();
    const area=node('section','','publications');area.id='universe-publications';area.setAttribute('aria-label','Nouvelles parutions');
    const top=node('div','','publications-heading');top.append(node('h3','✉ Nouvelles parutions'));
    if(items.some(i=>i.unread)){
      const read=button('Marquer comme lu',async()=>{
        read.disabled=true;try{await api('/api/publications/'+encodeURIComponent(name)+'/read','POST',{id:items[0].id});await renderPublications(name);void refreshHomeExtras();}catch(e){read.disabled=false;error(e);}
      });top.append(read);
    }
    area.append(top);
    if(!items.length)area.append(node('p','Les nouvelles publications de cet univers apparaîtront ici.','field-note'));
    else{
      const list=node('ul','','publication-list');
      items.forEach(item=>{
        const li=node('li','','publication'+(item.unread?' unread':''));
        li.append(node('span',item.unread?'●':'○','news-dot'),node('span',item.title),node('time',new Date(item.created_at).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'})));
        li.querySelector('time').dateTime=item.created_at;list.append(li);
      });area.append(list);
    }
    q('#content').after(area);
  }catch(e){
    if(session?.user.id===userId&&currentUniverse===name){
      q('#universe-publications')?.remove();const area=node('section','Nouvelles parutions momentanément indisponibles.','publications');area.id='universe-publications';q('#content').after(area);
    }
  }
}
setInterval(()=>{
  if(!session||session.user.mustChange||document.hidden)return;
  if(currentUniverse)void renderPublications(currentUniverse);else void refreshHomeExtras();
},60000);

let scheduleWeek='',scheduleScope='',scheduleData=null,scheduleRequest=0;
const scheduleLabels={travail:'Travail',formation:'🎓 Formation',conge:'🏝️ Congé',absence:'Absence',repos:'Repos'};
function mondayOf(day){const date=new Date(day+'T12:00:00Z');return moveDay(day,-((date.getUTCDay()+6)%7));}
function formatHours(minutes){return Math.floor(minutes/60)+' h'+(minutes%60?' '+String(minutes%60).padStart(2,'0'):'');}
function scheduleMinutes(entry){return (entry?.slots||[]).reduce((sum,[a,b])=>{const parse=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};return sum+parse(b)-parse(a);},0);}
function scheduleDate(day,options={day:'numeric',month:'long'}){return new Date(day+'T12:00:00Z').toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',...options});}
function schedulePreference(){try{return localStorage.getItem('portail-plus:schedule-scope:'+session.user.id);}catch{return null;}}
async function renderSchedule(){
  if(!session)return;const userId=session.user.id,request=++scheduleRequest;
  if(!scheduleWeek)scheduleWeek=mondayOf(parisDay());
  if(!scheduleScope)scheduleScope=schedulePreference()||(session.user.role==='admin'?'team':'mine');
  const data=await api('/api/schedule?week='+scheduleWeek+'&scope='+scheduleScope);
  if(currentUniverse!=='Emplois du temps'||session?.user.id!==userId||request!==scheduleRequest)return;
  scheduleData=data;const isAdmin=data.canEdit??(session.user.role==='admin'),content=q('#content');
  const root=node('div','','schedule'),toolbar=node('div','','schedule-toolbar');
  const navigate=async offset=>{scheduleWeek=moveDay(scheduleWeek,offset);try{await renderSchedule();}catch(e){error(e);}};
  const weekInput=node('input');weekInput.type='date';weekInput.value=scheduleWeek;weekInput.setAttribute('aria-label','Semaine à consulter');
  weekInput.onchange=async()=>{if(weekInput.value){scheduleWeek=mondayOf(weekInput.value);try{await renderSchedule();}catch(e){error(e);}}};
  toolbar.append(button('← Semaine précédente',()=>navigate(-7)),button('Cette semaine',async()=>{scheduleWeek=mondayOf(parisDay());try{await renderSchedule();}catch(e){error(e);}}),button('Semaine suivante →',()=>navigate(7)),weekInput);
  const scope=node('div','','schedule-scope');scope.setAttribute('role','group');scope.setAttribute('aria-label','Choisir le planning à afficher');
  [['mine','Mon planning'],['team','Toute l’équipe']].forEach(([value,label])=>{
    const b=button(label,async()=>{scheduleScope=value;try{localStorage.setItem('portail-plus:schedule-scope:'+session.user.id,value);}catch{}try{await renderSchedule();}catch(e){error(e);}},'btn small'+(scheduleScope===value?' primary':''));
    b.setAttribute('aria-pressed',String(scheduleScope===value));scope.append(b);
  });
  toolbar.append(scope,button('Imprimer',()=>window.print()));root.append(toolbar);
  const title=node('h3','Semaine du '+scheduleDate(scheduleWeek)+' au '+scheduleDate(moveDay(scheduleWeek,6),{day:'numeric',month:'long',year:'numeric'}),'schedule-week-title');
  const status=node('p',data.publishedAt?(isAdmin&&data.unpublishedChanges?'Brouillon modifié · la dernière version publiée reste visible pour l’équipe.':'Publié le '+new Date(data.publishedAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'})):(isAdmin?'Brouillon · cette semaine n’est pas encore publiée.':'Cette semaine n’a pas encore été publiée.'),'schedule-status');
  root.append(title,status);
  if(isAdmin){
    const actions=node('div','','schedule-admin');
    const sourceLabel=node('label','Copier une semaine :');sourceLabel.htmlFor='schedule-copy-week';const source=node('input');source.id='schedule-copy-week';source.type='date';source.value=moveDay(scheduleWeek,-7);
    const copy=button('Copier pour toute l’équipe',async()=>{
      if(!source.value)return;
      if(data.draftEntryCount){openScheduleCopy(source.value,data);return;}
      copy.disabled=true;try{await copyScheduleWeek(source.value,data);}catch(e){error(e);}finally{copy.disabled=false;}
    });
    const publish=button(data.publishedAt?'Republier le planning de l’équipe':'Publier le planning de l’équipe',async()=>{
      publish.disabled=true;try{await api('/api/schedule/'+data.week+'/publish','POST',{revision:data.revision});await renderSchedule();q('#feedback').textContent='Planning publié : l’équipe peut le consulter.';void renderPublications('Emplois du temps');}catch(e){error(e);publish.disabled=false;}
    },'btn primary');publish.disabled=!!data.publishedAt&&!data.unpublishedChanges;
    actions.append(sourceLabel,source,copy,publish,button('Recharger la semaine',async()=>{try{await renderSchedule();}catch(e){error(e);}}));root.append(actions,node('p','Cliquez sur une journée pour saisir les horaires. La copie et la publication portent sur toute l’équipe. Les congés, absences et repos s’appliquent à toute la journée.','field-note'));
  }
  const legend=node('div','','schedule-legend');Object.entries(scheduleLabels).forEach(([kind,label])=>legend.append(node('span',label,'schedule-kind '+kind)));root.append(legend);
  const wrap=node('div','','schedule-scroll');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Planning hebdomadaire, défilement horizontal');
  const table=node('table','','schedule-table'),head=node('thead'),headRow=node('tr');headRow.append(node('th','Collaborateur'));
  const days=Array.from({length:7},(_,i)=>moveDay(scheduleWeek,i));days.forEach(day=>headRow.append(node('th',scheduleDate(day,{weekday:'short',day:'2-digit',month:'2-digit'}))));headRow.append(node('th','Total prévu'));headRow.querySelectorAll('th').forEach(th=>th.scope='col');head.append(headRow);table.append(head);
  const entries=new Map(data.entries.map(e=>[e.userId+':'+e.day,e])),body=node('tbody');
  data.people.forEach(person=>{
    const tr=node('tr'),name=node('th',person.name);name.scope='row';tr.append(name);let total=0;
    days.forEach(day=>{
      const entry=entries.get(person.id+':'+day),td=node('td'),cell=node(isAdmin?'button':'div','','schedule-day '+(entry?.kind||'empty-day'));
      if(isAdmin){cell.type='button';cell.setAttribute('aria-label','Modifier '+person.name+', '+scheduleDate(day,{weekday:'long',day:'numeric',month:'long'}));cell.onclick=()=>editScheduleDay(person,day,entry,data);}
      if(entry){cell.append(node('span',scheduleLabels[entry.kind],'schedule-day-kind'));entry.slots.forEach(([start,end])=>cell.append(node('span',start+' – '+end,'schedule-slot')));total+=scheduleMinutes(entry);}
      else cell.append(node('span',isAdmin?'+':'—'));
      td.append(cell);tr.append(td);
    });tr.append(node('td',formatHours(total),'schedule-total'));body.append(tr);
  });table.append(body);wrap.append(table);root.append(wrap);
  if(!data.people.length)root.append(node('p','Aucun collaborateur dans cette vue.','empty'));
  if(!isAdmin&&!data.publishedAt)root.append(node('p','Vous serez averti dans les nouveautés lorsque le planning sera publié.','field-note'));
  root.append(node('p','Total des créneaux de travail et de formation, hors congés, absences et repos.','field-note'));
  content.replaceChildren(root);
}
async function copyScheduleWeek(from,data){
  await api('/api/schedule/'+data.week+'/copy','POST',{from:mondayOf(from),revision:data.revision});await renderSchedule();q('#feedback').textContent='Semaine copiée dans le brouillon. Vérifiez les horaires, puis publiez le planning.';
}
function scheduleDialog(title){
  q('#schedule-dialog')?.remove();const dialog=node('dialog');dialog.id='schedule-dialog';dialog.setAttribute('aria-labelledby','schedule-dialog-title');const h=node('h2',title);h.id='schedule-dialog-title';dialog.append(h);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());return dialog;
}
function openScheduleCopy(from,data){
  const dialog=scheduleDialog('Remplacer le brouillon de cette semaine ?');dialog.append(node('p','La copie remplacera les journées préparées. La version publiée restera visible jusqu’à votre prochaine publication.'));
  const status=node('p','','error'),actions=node('div','','dialog-actions');const confirm=button('Remplacer le brouillon',async()=>{confirm.disabled=true;try{await copyScheduleWeek(from,data);dialog.close();}catch(e){status.textContent=e.message;confirm.disabled=false;}},'btn primary');actions.append(button('Annuler',()=>dialog.close()),confirm);dialog.append(status,actions);dialog.showModal();
}
function editScheduleDay(person,day,entry,data){
  const dialog=scheduleDialog(person.name+' · '+scheduleDate(day,{weekday:'long',day:'numeric',month:'long'})),form=node('form'),typeLabel=node('label','Type de journée','field');typeLabel.htmlFor='schedule-kind';
  const kind=node('select');kind.id='schedule-kind';Object.entries(scheduleLabels).forEach(([value,label])=>{const option=node('option',label);option.value=value;kind.append(option);});kind.value=entry?.kind||'travail';
  const slots=node('div','','schedule-slot-editor'),inputs=[];
  for(let i=0;i<2;i++){
    const row=node('div'),label=node('p',i===0?'Créneau 1':'Créneau 2 (facultatif)'),pair=[];row.append(label);
    for(const [j,text] of [[0,'Début'],[1,'Fin']]){const l=node('label',text),input=node('input');input.type='time';input.id='schedule-slot-'+i+'-'+j;l.htmlFor=input.id;input.value=entry?.slots?.[i]?.[j]||'';row.append(l,input);pair.push(input);}inputs.push(pair);slots.append(row);
  }
  const total=node('p','','field-note'),update=()=>{
    const timed=['travail','formation'].includes(kind.value);slots.classList.toggle('hidden',!timed);inputs.flat().forEach(input=>{input.disabled=!timed;input.required=timed&&inputs[0].includes(input);});
    const valid=inputs.filter(pair=>pair.every(input=>input.value)).map(pair=>pair.map(input=>input.value));total.textContent=timed?'Durée saisie : '+formatHours(Math.max(0,scheduleMinutes({slots:valid}))):'Journée entière · hors total des heures.';
  };kind.onchange=update;inputs.flat().forEach(input=>input.oninput=update);update();
  const status=node('p','','error');status.setAttribute('role','alert');const actions=node('div','','dialog-actions');
  const save=node('button','Enregistrer le brouillon','btn primary');save.type='submit';
  const clear=button('Vider cette journée',async()=>{
    clear.disabled=true;try{await api('/api/schedule/'+data.week+'/clear-day','POST',{userId:person.id,day,revision:data.revision});dialog.close();await renderSchedule();q('#feedback').textContent='Journée retirée du brouillon.';}catch(e){status.textContent=e.message;clear.disabled=false;}
  });clear.disabled=!entry;
  actions.append(clear,button('Annuler',()=>dialog.close()),save);form.append(typeLabel,kind,slots,total,status,actions);dialog.append(form);
  form.onsubmit=async e=>{
    e.preventDefault();status.textContent='';const pairs=['travail','formation'].includes(kind.value)?inputs.map(pair=>pair.map(input=>input.value)).filter(pair=>pair.some(Boolean)):[];
    if(pairs.some(pair=>pair.some(value=>!value))){status.textContent='Renseignez le début et la fin de chaque créneau.';return;}
    save.disabled=true;clear.disabled=true;try{await api('/api/schedule/'+data.week+'/day','PUT',{userId:person.id,day,kind:kind.value,slots:pairs,revision:data.revision});dialog.close();await renderSchedule();q('#feedback').textContent='Journée enregistrée dans le brouillon.';}catch(e){status.textContent=e.message;save.disabled=false;clear.disabled=!entry;}
  };dialog.showModal();kind.focus();
}

function renderCelebrations(data){
  const tile=q('.grid [data-universe="Collaborateurs"]');tile.querySelector('.tile-celebrations')?.remove();
  const block=node('span','','tile-celebrations');block.append(node('strong','🎉 Fêtes et anniversaires du jour'));
  if(!data)block.append(node('span','Les célébrations sont momentanément indisponibles.'));
  else{
    block.append(node('span',data.feastsAvailable?(data.nameDays.length?'🌷 Bonne fête : '+data.nameDays.join(', '):'🌷 Aucune fête dans l’équipe aujourd’hui.'):'Fêtes momentanément indisponibles.'));
    block.append(node('span',data.birthdays.length?'🎂 '+data.birthdays.join(', '):'🎂 Aucun anniversaire dans l’équipe aujourd’hui.'));
    block.append(node('small',data.day.split('-').reverse().join('/')+' · Calendrier Nominis'));
  }
  tile.append(block);
}


function homeAgendaEvents(events,today){
  const last=moveDay(today,7);
  const order=(a,b)=>eventDays(a).start.localeCompare(eventDays(b).start)||Number(!a.start.date)-Number(!b.start.date)||new Date(a.start.dateTime||a.start.date+'T00:00:00Z')-new Date(b.start.dateTime||b.start.date+'T00:00:00Z');
  const valid=events.filter(e=>e.start?.date||e.start?.dateTime);
  const reminders=valid.filter(e=>e.remind&&eventDays(e).start>today&&eventDays(e).start<=last).sort(order);
  const todayEvents=valid.filter(e=>{
    const title=normalizeSearch(e.title||''),days=eventDays(e);
    return (e.remind||/\brdv\b|\brendez[ -]+vous\b|\bformations?\b/.test(title))&&days.start<=today&&days.end>=today;
  }).sort(order);
  return [...todayEvents,...reminders];
}
function renderHomeAgenda(data){
  const tile=q('.grid [data-universe="Agenda"]');if(!tile)return;tile.querySelector('.tile-agenda')?.remove();
  if(!session||!tileAllowed('Agenda'))return;
  const today=parisDay(),block=node('span','','tile-agenda'),events=homeAgendaEvents(data?.events||[],today);
  const label=e=>{
    const day=eventDays(e).start,when=e.start.date?'Journée':day<today?'En cours':new Date(e.start.dateTime).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
    return (day>today?day.split('-').slice(1).reverse().join('/')+' · ':'')+when+' · '+(e.title||'Événement');
  };
  if(!data||data.error)block.append(node('span','Agenda momentanément indisponible'));
  else if(!data.connected)block.append(node('span','Agenda à connecter'));
  else {
    const daily=events.filter(e=>eventDays(e).start<=today),reminders=events.filter(e=>eventDays(e).start>today);
    const daySection=node('span','','agenda-today'),reminderSection=node('span','','agenda-reminders');
    daySection.append(node('span','Aujourd’hui','agenda-group-title'));
    reminderSection.append(node('span',reminders.length?'🔔 Rappels · 7 prochains jours':'🔔 Aucun rappel à venir','agenda-group-title'));
    const addRows=(section,list,limit,isReminder)=>{
      list.slice(0,limit).forEach((e,i)=>{const icon=isReminder?'🔔 ':normalizeSearch(e.title||'').includes('formation')?'🎓 ':'📅 ';const text=icon+label(e)+(i===limit-1&&list.length>limit?' · +'+(list.length-limit):'');const row=node('span',text,'agenda-event-line'+(isReminder?' personal-reminder':''));row.title=label(e);section.append(row);});
    };
    if(!daily.length)daySection.append(node('span','Aucun rendez-vous ni formation','agenda-event-line'));
    addRows(daySection,daily,reminders.length?3:5,false);addRows(reminderSection,reminders,2,true);
    daySection.title=daily.map(label).join('\n');reminderSection.title=reminders.map(label).join('\n');
    block.append(daySection,reminderSection);
  }
  block.setAttribute('aria-label','Agenda du jour et rappels personnels : '+events.map(label).join('; '));tile.append(block);
}
