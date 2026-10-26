function mealIcon(cls=''){const icon=document.createElement('span');icon.className='meal-plate-icon '+cls;icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 32 32" width="22" height="22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#fff" stroke="#84949e" stroke-width="1.5"/><circle cx="16" cy="16" r="10.5" fill="#f5f7f8" stroke="#d6dfe3"/><path d="M9 19 C8 9 24 9 23 19" fill="none" stroke="#873d20" stroke-width="7" stroke-linecap="round"/><path d="M9 19 C8 9 24 9 23 19" fill="none" stroke="#cb7339" stroke-width="5" stroke-linecap="round"/><path d="M11 12l2 3m3-5v3m5-1l-2 3" fill="none" stroke="#8b421f" stroke-width="1.4" stroke-linecap="round"/></svg>';return icon;}
let calendarDay='',calendarQuery='',merchandisingReminderMonth=null;
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
function meetingIcon(title){
  if(!normalizeSearch(title||'').includes('reunion'))return null;
  const icon=node('span','','agenda-meeting-icon');icon.setAttribute('role','img');icon.setAttribute('aria-label','Réunion');icon.title='Réunion';
  icon.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h18v5H3zM5 13v7M19 13v7M8 3h3v3H8zM14 3h3v3h-3zM1 16h2M21 16h2"/></svg>';
  return icon;
}
function loungeIcon(title){
  if(!/\bl['’\s]+etage\b/.test(normalizeSearch(title||'')))return null;
  const icon=node('span','','agenda-meeting-icon');icon.setAttribute('role','img');icon.setAttribute('aria-label','Salon de l’étage');icon.title='Salon de l’étage';
  icon.innerHTML='<svg viewBox="0 0 32 24" width="26" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12V8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v4M4 11h2v4h13v-4h2v8H4zM6 19v2M19 19v2M12 7v7M24 8h6l-2-5h-2zM27 8v12M24 21h6M23 15h7M24 15v3M29 15v3"/><path d="M2 22h29"/></svg>';
  return icon;
}
function personalTaskForm(task=null){
  const box=node('details','','calendar-tools');box.open=!!task;box.append(node('summary',task?'Modifier ma tâche':'Ajouter une tâche personnelle'));
  box.append(node('p','Visible uniquement par vous dans Portail+, sans synchronisation Google. Rappel automatique sur l’accueil de J−7 au jour prévu.','field-note'));
  const form=node('form'),title=node('input'),date=node('input'),icon=node('select'),description=node('textarea'),status=node('p','','status-line');
  title.required=true;title.maxLength=150;title.value=task?.title||'';date.type='date';date.required=true;date.value=task?.start.date||calendarDay||parisDay();description.maxLength=1000;description.value=task?.description||'';
  ['✅','📌','📞','✉️','📦','📝','💊','🗣️','🎓','⭐'].forEach(x=>icon.append(new Option(x,x)));icon.value=task?.icon||'✅';
  for(const [text,input] of [['Titre',title],['Date',date],['Icône',icon],['Détails (facultatifs)',description]]){const label=node('label',text,'field');label.append(input);form.append(label);}
  const save=node('button',task?'Enregistrer les modifications':'Créer ma tâche','btn primary');save.type='submit';
  form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await api('/api/calendar/tasks'+(task?'/'+task.taskId:''),task?'PUT':'POST',{title:title.value,date:date.value,icon:icon.value,description:description.value});await renderCalendar();void refreshHomeExtras();}catch(error){status.textContent=error.message;save.disabled=false;}};
  form.append(save,status);box.append(form);return box;
}
function eventCard(e){
  const card=node('article','','event'),heading=node('h3'),icons=eventIcons(e.title);
  const meeting=meetingIcon(e.title);if(meeting)heading.append(meeting);const lounge=loungeIcon(e.title);if(lounge)heading.append(lounge);
  if(icons){const icon=node('span',icons+' ');icon.setAttribute('aria-hidden','true');heading.append(icon);}
  heading.append(node('span',(e.personalTask?e.icon+' ':'')+e.title));card.append(heading);let when;
  if(e.start?.date){const {start,end}=eventDays(e);when=start.split('-').reverse().join('/')+(start!==end?' — '+end.split('-').reverse().join('/'):'')+' · Toute la journée';}
  else {const format=d=>new Date(d).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'medium',timeStyle:'short'});when=format(e.start.dateTime)+' — '+format(e.end?.dateTime||e.start.dateTime);}
  card.append(node('p',when,'event-time'));if(e.location)card.append(node('p',e.location));if(e.description)card.append(node('p',e.description));
  if(e.personalTask){card.append(node('p','Tâche personnelle · Portail+ uniquement','field-note'),personalTaskForm(e));const status=node('p','','status-line'),remove=button('Supprimer ma tâche',async()=>{if(!confirm('Supprimer cette tâche personnelle ?'))return;remove.disabled=true;try{await api('/api/calendar/tasks/'+e.taskId,'DELETE');await renderCalendar();void refreshHomeExtras();}catch(error){status.textContent=error.message;remove.disabled=false;}},'btn small danger');card.append(remove,status);return card;}
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
    if(!events.length)results.append(node('div',query?'Aucun événement à venir ne correspond à votre recherche.':'Aucun événement pour cette journée.','empty'));
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
  const operation=window.PortalUX?.beginRequest(path,method);
  try{
  const options={method,headers:{}};
  if(method!=='GET'){options.headers['Content-Type']='application/json';if(session)options.headers['X-CSRF-Token']=session.csrf;if(data!==undefined)options.body=JSON.stringify(data);}
  const response=await fetch(path,options);let body;try{body=await response.json();}catch{throw Error('Le service ne répond pas. Réessayez.');}
  if(!response.ok){if(response.status===401&&path!=='/api/login')showLogin();throw Object.assign(Error(body.error||'Demande impossible.'),{code:body.code,status:response.status});}operation?.success();return body;
  }catch(error){operation?.failure(error);throw error;}
}
function error(e){q('#global-message').textContent=e.message;}
function showLogin(){q('#portal-quick-links')?.remove();q('#google-connection-alert')?.remove();q('#whatsapp-button').disabled=true;q('#whatsapp-button').onclick=null;q('#whatsapp-status').textContent='';scheduleWeek='';scheduleScope='';scheduleData=null;scheduleRequest++;document.querySelectorAll('.tile-news,.tile-schedule,.tile-agenda,.daily-joke,.tile-celebrations,#universe-publications').forEach(e=>e.remove());q('#welcome-name').textContent='';session=null;currentUniverse=null;q('#home').classList.add('hidden');q('#detail').classList.add('hidden');q('#login').classList.remove('hidden');q('#logout').classList.add('hidden');q('#account').classList.add('hidden');q('#session-name').textContent='Espace sécurisé';document.querySelectorAll('dialog[open]').forEach(d=>d.close());q('#content').replaceChildren();people=[];}
function showHome(){
  if(session.user.role==='tester'){showTesterHome();return;}

  const linksUserId=session.user.id;void import('/portal-quick-links.js').then(module=>{if(session?.user.id===linksUserId&&!session.user.mustChange)void module.setupQuickLinks({api,userId:linksUserId,isAdmin:session.user.role==='admin',isCurrent:()=>session?.user.id===linksUserId&&!session.user.mustChange});}).catch(error);
  const whatsappUserId=session.user.id;void import('/whatsapp.js').then(module=>{if(session?.user.id===whatsappUserId)module.setupWhatsApp({button:q('#whatsapp-button'),status:q('#whatsapp-status'),api,getUser:()=>session?.user});}).catch(error);
  currentUniverse=null;q('#welcome-name').textContent=session.user.name;applyTileOrder();q('#login').classList.add('hidden');q('#detail').classList.add('hidden');q('#global-message').textContent='';q('#home').classList.remove('hidden');q('#logout').classList.remove('hidden');q('#account').classList.remove('hidden');
  q('#session-name').textContent=session.user.name+(session.user.role==='admin'?' · Administrateur':'');
  applyTileVisibility();
  void refreshHomeExtras();void refreshGoogleConnections();
  q('.section-label>span').textContent=[...document.querySelectorAll('.grid .tile')].some(b=>!b.classList.contains('hidden'))?'Vos espaces autorisés':'Vos tuiles sont masquées. Utilisez « Organiser mes tuiles » pour les réafficher.';
}

let googleConnectionsPending=false;
async function refreshGoogleConnections(){
 if(!session||session.user.role!=='admin'||session.user.mustChange||googleConnectionsPending)return;googleConnectionsPending=true;const userId=session.user.id;
 try{const [data,module]=await Promise.all([api('/api/integrations/google-health'),import('/google-connection-alert.js')]);if(session?.user.id!==userId||session.user.role!=='admin')return;let banner=q('#google-connection-alert');if(!banner){banner=node('aside');banner.id='google-connection-alert';q('body>header').after(banner);}module.renderGoogleConnectionAlert({container:banner,data,onOpenAgenda:()=>void openUniverse('Agenda'),onReconnect:async kind=>{const result=await api(kind==='mail'?'/api/mail/connect':'/api/google/connect','POST',{});window.location.assign(result.url);}});
 }catch(e){if(session?.user.id===userId&&session.user.role==='admin'){let banner=q('#google-connection-alert');if(!banner){banner=node('aside');banner.id='google-connection-alert';q('body>header').after(banner);}banner.hidden=false;banner.className='google-connection-alert';banner.setAttribute('role','status');banner.textContent='⚠ Suivi des connexions Google momentanément indisponible. Nouvelle vérification automatique.';}}
 finally{googleConnectionsPending=false;}
}
function showTesterHome(){
 setPeopleAddActions(false);q('#hr-import-action')?.remove();
 q('#portal-quick-links')?.remove();q('#google-connection-alert')?.remove();q('#home').classList.add('hidden');q('#login').classList.add('hidden');q('#detail').classList.remove('hidden');q('#logout').classList.remove('hidden');q('#account').classList.remove('hidden');q('#session-name').textContent=session.user.name+' · Testeur';setUniverseHeading('Découverte de Portail+');q('#description').textContent='Espace de démonstration';q('#global-message').textContent='';q('#feedback').textContent='';currentUniverse=null;const testerId=session.user.id;void import('/tester-demo.js').then(m=>{if(session?.user.id===testerId)m.renderTesterDemo({container:q('#content'),user:session.user});}).catch(error);
}
function afterLogin(){if(session.user.mustChange){q('#login').classList.add('hidden');q('#logout').classList.remove('hidden');openPassword();}else showHome();}
q('#login-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;q('#login-error').textContent='';try{session=await api('/api/login','POST',{email:q('#login-email').value,password:q('#login-password').value});q('#login-password').value='';afterLogin();}catch(e){q('#login-error').textContent=e.message;}finally{btn.disabled=false;}};
q('#logout').onclick=async()=>{try{await api('/api/logout','POST');showLogin();}catch(e){error(e);}};
q('#account').onclick=()=>openPassword();
function openPassword(){q('#password-form').reset();q('#password-error').textContent='';q('#password-intro').textContent=session.user.mustChange?'Remplacez votre mot de passe provisoire pour accéder au portail.':'Choisissez un mot de passe personnel de 12 caractères minimum.';q('#password-cancel').classList.toggle('hidden',session.user.mustChange);q('#password-dialog').showModal();}
q('#password-dialog').addEventListener('cancel',e=>{if(session?.user.mustChange)e.preventDefault();});
q('#password-cancel').onclick=()=>q('#password-dialog').close();
q('#password-form').onsubmit=async e=>{e.preventDefault();if(q('#new-password').value!==q('#confirm-password').value){q('#password-error').textContent='Les nouveaux mots de passe ne correspondent pas.';return;}const btn=e.submitter;btn.disabled=true;try{session=await api('/api/password','POST',{currentPassword:q('#current-password').value,password:q('#new-password').value});q('#password-form').reset();q('#password-dialog').close();showHome();}catch(e){q('#password-error').textContent=e.message;}finally{btn.disabled=false;}};
function displayUniverse(name){const titles={"Outils d'aide au merchandising":"Merchandising","Outils d'aide à la démarche qualité":"Démarche qualité","Outils d'aide aux commandes":"Commandes"};if(titles[name])return titles[name];return name==='Formations'?'Documents de référence':name==='Actualités'?'Messagerie':name==='Outils de calculs rapides'?"Outils d’aide au calcul":name;}
const descriptions={'Outils de calculs rapides':'Les calculs utiles au quotidien.','Fun':'La sélection musicale de l’équipe pour l’espace de vente.','Passerelle groupement':'Accès direct Pharmascope.','Collaborateurs':'L’annuaire de l’équipe et votre accès personnel aux bulletins de paie.','Emplois du temps':'Les horaires de votre équipe.','Agenda':'Votre agenda équipe, synchronisé avec Google.','Procédures':'Les consignes et documents de référence.','Laboratoires':'Les contacts et ressources de vos partenaires.','Challenges':'Les objectifs et défis collectifs de la pharmacie.','Actualités':'échanges internes & informations','Formations':'Documents de référence, formations et supports à imprimer.','Contacts utiles':'Les coordonnées utiles au quotidien.','Ressources humaines':'Les documents internes de la pharmacie et leur signature en ligne.'};
descriptions["Outils d'aide aux commandes"]='commandes programmées';descriptions["Outils d’aide au merchandising"]='';descriptions["Outils d'aide au merchandising"]='Organisation de l’espace de vente.';
descriptions["Outils d'aide à la démarche qualité"]="Suivi et amélioration des pratiques.";
document.querySelectorAll('[data-universe]').forEach(b=>b.onclick=()=>openUniverse(b.dataset.universe));
q('#back').onclick=()=>currentUniverse==='Procédures'?void openUniverse("Outils d'aide à la démarche qualité"):showHome();
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
  heading.append(node('span',displayUniverse(name)));
}
async function openUniverse(name){
  const viewRequest=++universeViewRequest;
  q('#hr-import-action')?.remove();
  q('#universe-publications')?.remove();
  q('#back').textContent=name==='Procédures'?'Retour à la démarche qualité':'Retour aux univers';currentUniverse=name;q('#home').classList.add('hidden');q('#detail').classList.remove('hidden');q('#global-message').textContent='';setUniverseHeading(name);q('#description').textContent=descriptions[name];q('#feedback').textContent='';setPeopleAddActions(name==='Collaborateurs'&&session.user.role==='admin');q('#content').replaceChildren(node('div','Chargement…','empty'));
  try{if(name==='Collaborateurs'){people=await api('/api/users');if(currentUniverse===name)renderPeople();}else if(name==='Actualités'){const userId=session.user.id,module=await import('/news.js');if(currentUniverse===name)await module.renderNews({container:q('#content'),api,isAdmin:session.user.role==='admin',isCurrent:()=>viewRequest===universeViewRequest&&currentUniverse===name&&session?.user.id===userId,onChanged:()=>void refreshHomeExtras(),onOpenOrders:()=>void openUniverse("Outils d'aide aux commandes"),onOpenMerchandising:month=>{merchandisingReminderMonth=month;void openUniverse("Outils d'aide au merchandising");},onOpenPlanning:week=>{scheduleView='week';scheduleTemplatesView=false;if(week){scheduleWeek=week;scheduleDay=week;}void openUniverse('Emplois du temps');}});}else if(name==='Challenges'){const userId=session.user.id,module=await import('/challenges.js');if(currentUniverse===name)await module.renderChallenges({container:q('#content'),api,isCurrent:()=>viewRequest===universeViewRequest&&currentUniverse===name&&session?.user.id===userId});}else if(name==='Laboratoires'){const userId=session.user.id,module=await import('/laboratories.js');if(currentUniverse===name)await module.renderLaboratories({container:q('#content'),api,isAdmin:session.user.role==='admin',isCurrent:()=>viewRequest===universeViewRequest&&currentUniverse===name&&session?.user.id===userId});}else if(name==='Ressources humaines'){const userId=session.user.id,module=await import('/hr-documents.js');if(currentUniverse===name)await module.renderHRDocuments({container:q('#content'),heading:q('#detail .top'),api,isAdmin:session.user.role==='admin',isCurrent:()=>viewRequest===universeViewRequest&&currentUniverse===name&&session?.user.id===userId});}else if(name==="Outils d'aide aux commandes"){const userId=session.user.id,module=await import('/order-planning.js');if(currentUniverse===name)await module.renderOrderPlanning({container:q('#content'),api,canEdit:canEditUniverse(name),isCurrent:()=>viewRequest===universeViewRequest&&currentUniverse===name&&session?.user.id===userId});}else if(name==="Outils d'aide au merchandising"){const userId=session.user.id,module=await import('/merchandising.js?v=20261009-save-confirmed');if(currentUniverse===name)await module.renderMerchandisingHub({container:q('#content'),api,initialMonth:merchandisingReminderMonth,onTitleChange:title=>{if(viewRequest!==universeViewRequest||currentUniverse!==name)return;setUniverseHeading(name);if(title)q('#title').lastElementChild.textContent=title;q('#description').textContent=title?'':descriptions[name];},isCurrent:()=>viewRequest===universeViewRequest&&currentUniverse===name&&session?.user.id===userId});merchandisingReminderMonth=null;}else if(name==="Outils d'aide à la démarche qualité"){const module=await import("/quality.js");if(currentUniverse===name)module.renderQuality({container:q("#content"),api,canAccessProcedures:tileAllowed('Procédures'),onOpenProcedures:()=>void openUniverse('Procédures'),isCurrent:()=>viewRequest===universeViewRequest&&currentUniverse===name});}else if(name==='Outils de calculs rapides'){const module=await import('/promoflash.js');if(currentUniverse===name)module.renderPromoFlash({container:q('#content'),api,isAdmin:session.user.role==='admin'});}else if(name==='Procédures'){const module=await import('/procedures.js');if(currentUniverse===name)await module.renderProcedures({container:q('#content'),api,canEdit:canEditUniverse('Procédures')});}else if(name==='Formations'){const module=await import('/training-documents.js');if(currentUniverse===name)await module.renderTrainingDocuments({container:q('#content'),api,canEdit:canEditUniverse('Formations'),isCurrent:()=>currentUniverse===name&&!!session});}else if(name==='Contacts utiles'){const module=await import('/contacts.js');if(currentUniverse===name)await module.renderContacts({container:q('#content'),api,isAdmin:session.user.role==='admin'});}else if(name==='Emplois du temps')await renderSchedule();else if(name==='Fun')await renderMusic();else if(name==='Agenda'){calendarDay=parisDay();calendarQuery='';await renderCalendar();}else{await api('/api/universes/'+encodeURIComponent(name));if(currentUniverse===name)q('#content').replaceChildren(node('div','Cet espace est prêt à accueillir vos informations. Aucun contenu ajouté pour le moment.','empty'));}}catch(e){if(currentUniverse===name)q('#content').replaceChildren(node('div',e.message,'empty'));}
  if(currentUniverse===name)void renderPublications(name);
}
function button(label,action,cls='btn small'){const b=node('button',label,cls);b.type='button';b.onclick=action;return b;}
function personName(p){return [p.firstName,p.lastName?.toLocaleUpperCase('fr-FR')].filter(Boolean).join(' ');}
async function reloadPeople(message=''){people=await api('/api/users');if(currentUniverse==='Collaborateurs'){renderPeople();q('#feedback').textContent=message;}}
function setPeopleAddActions(show){q('#people-add-actions').classList.add('hidden');}
function renderPeople(){
  employeeRecordRequest++;setPeopleAddActions(session.user.role==='admin');
  const content=q('#content'),isAdmin=session.user.role==='admin';content.replaceChildren();
  content.append(node('p','Cliquez sur votre propre fiche pour accéder à vos bulletins de paie sur mySilae.','field-note'));
  if(isAdmin){const administration=node('details','','people-administration calendar-tools admin-menu'),body=node('div'),actions=node('div','','people-admin-actions');administration.append(node('summary','Administration'),body);actions.append(button('Ajouter un collaborateur manuellement',()=>openEditor(),'btn primary'),button('Ajouter à partir d’une fiche de renseignements',()=>q('#add-from-sheet').click(),'btn primary'));body.append(actions,node('p','Complétez les téléphones et les accès personnels depuis les fiches. Retirer un collaborateur le place dans les inactifs et désactive sa connexion.','field-note'));renderEmployeeScan(body);renderPeopleImport(body);renderEmployeeDocument(body);renderInvitationMail(body);const testerUserId=session.user.id;void import('/tester-admin.js').then(m=>{if(session?.user.id===testerUserId&&currentUniverse==='Collaborateurs')m.renderTesterAdmin({container:body,api,isCurrent:()=>session?.user.id===testerUserId&&currentUniverse==='Collaborateurs'});}).catch(error);content.prepend(administration);}
  for(const active of [true,false]){
    const list=people.filter(p=>p.active===active),section=node('section','','people-section'+(!active?' inactive-people':''));
    section.append(node('h3',(active?'Collaborateurs actifs':'Collaborateurs inactifs')+' · '+list.length));
    if(!list.length){section.append(node('p',active?'Aucun collaborateur actif.':'Aucun collaborateur inactif.','empty'));content.append(section);continue;}
    const wrap=node('div','','tablewrap'),table=node('table','','people-table'),head=node('thead'),header=node('tr');
    ['Prénom','Nom','Téléphone',...(isAdmin?['Connexion','Gestion']:[])].forEach(text=>{const th=node('th',text);th.scope='col';header.append(th);});head.append(header);table.append(head);
    const body=node('tbody');
    for(const p of list){
      const tr=node('tr','','person-row'+(p.isSelf?' own-person':''));tr.dataset.personId=p.id;
      const first=node('td'),last=node('td',p.lastName.toLocaleUpperCase('fr-FR')),phone=node('td',p.phone||'À renseigner','person-phone');
      if(isAdmin){const open=button(p.firstName,()=>openEmployeeRecord(p),'person-open');open.setAttribute('aria-label','Ouvrir la fiche de '+personName(p));first.append(open);const surname=button(p.lastName.toLocaleUpperCase('fr-FR'),()=>openEmployeeRecord(p),'person-open');surname.setAttribute('aria-label','Consulter la fiche de '+personName(p));last.replaceChildren(surname);}
      else if(p.isSelf){const mine=button(p.firstName+' · Ma fiche',()=>openMyPayroll(),'person-self');mine.setAttribute('aria-label','Ouvrir ma fiche, '+personName(p));first.append(mine);}else first.textContent=p.firstName;
      tr.append(first,last,phone);if(isAdmin){const state=!p.active?'Sans accès':p.passwordConfigured?'Accès activé':p.invitationSentAt?'Invitation envoyée':'Sans accès';const cell=node('td'),badge=node('span',state,'access-state '+(state==='Accès activé'?'active':state==='Invitation envoyée'?'pending':''));cell.append(badge);if(p.active&&!p.passwordConfigured&&p.invitationSentAt&&Date.now()-new Date(p.invitationSentAt).getTime()>72*3600000)cell.append(node('small','Lien expiré · renvoyer une invitation','field-note'));tr.append(cell);}
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
  api('/api/integrations/google-health').then(({mail:status})=>{
    if(session?.user.id!==userId||!panel.isConnected)return;
    panel.open=!status.connected||status.state!=='ok';state.textContent=status.state==='reconnect'||status.state==='temporary'?status.error:status.connected?'Gmail est connecté. Vous pouvez envoyer les invitations depuis la ligne de chaque collaborateur.':'Connectez le compte Gmail de la pharmacie et autorisez l’envoi des mails pour activer les invitations.';
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
  try{const module=await import('/employee-record.js');if(!valid())return;await module.renderEmployeeRecord({container:q('#content'),api,person,onClose:()=>reloadPeople(),onSaved:async(result,message)=>{await reloadPeople(message);},onPayroll:openMyPayroll,universes:[...initialTileOrder,'Procédures'],isCurrent:valid});}
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
      await record.renderEmployeeRecord({container:q('#content'),api,person,draft,universes:[...initialTileOrder,'Procédures'],isCurrent:reviewValid,onPayroll:openMyPayroll,onClose:()=>{cleanup();reloadPeople();},onSaved:async(result,message)=>{cleanup();await reloadPeople(message);}});
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
    const tools=node('details','','calendar-tools admin-menu');tools.open=!status.connected;tools.append(node('summary','Administration — Agenda'));
    if(!status.configured){tools.append(node('p','Ajoutez les identifiants Google dans les paramètres Render pour activer la connexion.','admin-hint'),node('p','Adresse de retour à renseigner dans Google : '+status.callback,'admin-hint'));}
    else tools.append(button(status.connected?'Renouveler l’autorisation Google':'Connecter Google Agenda',()=>runCalendarAction(async()=>{const result=await api('/api/google/connect','POST');window.location.assign(result.url);}),'btn primary'));
    if(status.connected){
      try{const calendars=await api('/api/google/calendars');if(currentUniverse!=='Agenda')return;const label=node('label','Agenda à afficher');label.htmlFor='calendar-choice';const select=node('select','','calendar-select');select.id='calendar-choice';select.append(new Option('Choisir un agenda',''));calendars.forEach(c=>select.append(new Option(c.name,c.id)));select.value=status.calendarId;tools.append(label,select,button('Enregistrer cet agenda',()=>runCalendarAction(async()=>{if(!select.value)throw Error('Choisissez un agenda.');await api('/api/google/calendar','POST',{id:select.value});})));}
      catch(e){tools.append(node('p',e.message,'calendar-warning'));}
      tools.append(button('Actualiser maintenant',()=>runCalendarAction(()=>api('/api/google/sync','POST'))),button('Déconnecter Google',()=>{if(confirm('Déconnecter Google et retirer les événements du portail ?'))runCalendarAction(()=>api('/api/google/disconnect','POST'));},'btn small danger'));
    }
    content.append(tools);
  }
  content.append(personalTaskForm(),node('h3',data.name));
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
function tileAllowed(name){if(["Outils d'aide à la démarche qualité",'Actualités','Agenda'].includes(name))return true;return session.user.role==='admin'||(session.user.permissionsConfigured?session.user.rights.includes(name):(['Fun','Outils de calculs rapides','Collaborateurs','Actualités','Ressources humaines','Laboratoires',"Outils d'aide au merchandising","Outils d'aide à la démarche qualité"].includes(name)||session.user.rights.includes(name)));}
function canEditUniverse(name){if(name==='Emplois du temps')return session.user.role==='admin';if(name==='Actualités')return true;if(['Laboratoires',"Outils d'aide aux commandes"].includes(name))return tileAllowed(name);if(name==='Ressources humaines')return session.user.role==='admin';return session.user.role==='admin'||(tileAllowed(name)&&(session.user.permissionsConfigured?session.user.editRights?.includes(name):name==='Fun'));}
function tilePreferences(){
  let saved;try{saved=JSON.parse(localStorage.getItem(tileOrderKey())||'null');}catch{}
  let order=Array.isArray(saved)?saved:Array.isArray(saved?.order)?saved.order:[];
  // Migrate the former first row once, while preserving custom orders and hidden tiles.
  if((saved?.version||0)<2&&order.indexOf('Procédures')===3&&order.indexOf('Actualités')>3){const index=order.indexOf('Actualités');[order[3],order[index]]=[order[index],order[3]];}
  if((saved?.version||0)<4){
    const bottom=['Fun','Passerelle groupement','Outils de calculs rapides',"Outils d'aide au merchandising","Outils d'aide aux commandes","Outils d'aide à la démarche qualité"];
    order=[...order.filter(name=>!bottom.includes(name)),...initialTileOrder.filter(name=>!order.includes(name)&&!bottom.includes(name)),...bottom];
  }
  if((saved?.version||0)<5){
    const promoted=["Outils d'aide au merchandising","Outils d'aide à la démarche qualité","Outils d'aide aux commandes"],bottom=['Outils de calculs rapides','Passerelle groupement','Fun'];
    const core=[...new Set([...order,...initialTileOrder])].filter(name=>initialTileOrder.includes(name)&&!promoted.includes(name)&&!bottom.includes(name));
    order=[...core,...promoted,...bottom];
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
    const row=node('div','','tile-order-row'),label=node('span',displayUniverse(name)),actions=node('div','','tile-order-actions');
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
  try{localStorage.setItem(tileOrderKey(),JSON.stringify({version:5,order:[...draftTileOrder,...initialTileOrder.filter(n=>!draftTileOrder.includes(n))],hidden:[...draftHiddenTiles]}));showHome();q('#tile-order-dialog').close();}
  catch{q('#tile-order-status').textContent='Ce navigateur ne permet pas de mémoriser votre ordre.';}
};

async function renderMusic(){
  let tracks=await api('/api/music');if(currentUniverse!=='Fun')return;
  const selectedTracks=new Set();
  const isMusicAdmin=session.user.role==='admin',editable=canEditUniverse('Fun'),content=q('#content');content.replaceChildren();
  const intro=node('div','','music-intro');intro.append(node('h3','La musique de toute l’équipe'),node('p','Ajoutez vos morceaux préférés à la sélection partagée de la pharmacie.'));
  const form=node('form','','music-form');
  const artistLabel=node('label','Artiste'),artist=node('input');artist.type='text';artist.id='music-artist';artist.maxLength=200;artist.required=true;artist.placeholder='Ex. : Adele';artistLabel.htmlFor=artist.id;
  const titleLabel=node('label','Titre'),title=node('input');title.type='text';title.id='music-title';title.maxLength=200;title.required=true;title.placeholder='Ex. : Hometown Glory';titleLabel.htmlFor=title.id;
  const artistField=node('div'),titleField=node('div');artistField.append(artistLabel,artist);titleField.append(titleLabel,title);
  const submit=node('button','Ajouter à la sélection','btn primary');submit.type='submit';
  const message=node('p','','music-feedback');message.setAttribute('role','status');
  form.append(artistField,titleField,submit);content.append(intro);if(editable)content.append(form);else content.append(node('p','Vous consultez la sélection musicale. L’ajout de titres nécessite un droit de modification. La suppression est réservée aux administrateurs.','field-note'));content.append(message);
  content.append(node('p','La sélection musicale est partagée par l’équipe. L’administrateur peut importer une liste CSV, exporter les titres cochés et préparer leur transfert vers Deezer avec TuneMyMusic.','status-line'));
  const toolbar=node('div','','music-toolbar'),searchLabel=node('label','Retrouver un morceau'),search=node('input');search.type='search';search.id='music-search';search.placeholder='Artiste ou titre…';searchLabel.htmlFor=search.id;toolbar.append(searchLabel,search);
  const list=node('div','','music-list');list.setAttribute('role','list');const count=node('p','','status-line'),more=button('Afficher davantage',()=>{limit+=40;display();});let limit=40;

  let exportingCSV=false,deletingTracks=false;
  async function downloadMusicCSV(){
    const ids=tracks.filter(t=>selectedTracks.has(t.id)).map(t=>t.id);if(!ids.length||exportingCSV)return false;exportingCSV=true;updateSelection();message.textContent='Préparation du CSV…';
    try{const response=await fetch('/api/music/export.csv',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify({ids})});if(!response.ok){const error=await response.json();throw Error(error.error||'Export impossible.');}const blob=await response.blob();if(currentUniverse!=='Fun')return;const url=URL.createObjectURL(blob),link=node('a');link.href=url;link.download='Playlist_PortailPlus_Trevoux.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message.textContent=ids.length+' titre(s) exporté(s).';return true;}catch(error){if(currentUniverse==='Fun')message.textContent=error.message;return false;}finally{exportingCSV=false;updateSelection();}
  }
  const csvExport=button('Exporter les titres sélectionnés en CSV',()=>downloadMusicCSV(),'btn primary');
  const tuneTransfer=button('CSV vers TuneMyMusic / Deezer',async()=>{if(exportingCSV||!selectedTracks.size)return;window.open('https://www.tunemymusic.com/fr/transfer/csv-to-deezer','_blank','noopener,noreferrer');if(await downloadMusicCSV())message.textContent='CSV téléchargé. Dans TuneMyMusic, importez Playlist_PortailPlus_Trevoux.csv puis connectez Deezer pour terminer le transfert.';},'btn primary');
  const tuneLink=node('a','Ouvrir TuneMyMusic','btn small');tuneLink.href='https://www.tunemymusic.com/fr/transfer/csv-to-deezer';tuneLink.target='_blank';tuneLink.rel='noopener noreferrer';
  const adminPanel=node('details','','calendar-tools music-admin-panel admin-menu'),adminActions=node('div','','music-admin-actions');adminPanel.append(node('summary','Administration'),node('p','Importez une liste ou cochez les titres à exporter / ajouter à la playlist équipe.','field-note'),adminActions);adminActions.append(csvExport,tuneTransfer,tuneLink);adminPanel.append(node('p','TuneMyMusic : le bouton télécharge le CSV et ouvre le service. Chargez ensuite ce fichier dans TuneMyMusic et connectez votre compte Deezer.','field-note'));
  const deleteSelected=button('Supprimer les titres sélectionnés',async()=>{
    const ids=tracks.filter(t=>selectedTracks.has(t.id)).map(t=>t.id);
    if(!ids.length||deletingTracks||exportingCSV)return;
    if(!confirm('Supprimer définitivement les '+ids.length+' titre(s) sélectionné(s) de la liste partagée, y compris ceux masqués par la recherche ?'))return;
    deletingTracks=true;updateSelection();message.textContent='Suppression en cours…';
    try{
      const result=await api('/api/music/delete-selected','POST',{ids});
      if(currentUniverse!=='Fun')return;
      const removed=new Set(result.ids);tracks=tracks.filter(t=>!removed.has(t.id));ids.forEach(id=>selectedTracks.delete(id));display();
      message.textContent=result.ids.length+' titre(s) supprimé(s).';
    }catch(error){if(currentUniverse==='Fun')message.textContent=error.message;}
    finally{deletingTracks=false;updateSelection();}
  },'btn danger');
  adminActions.append(deleteSelected);
  const selectionCount=node('span','','status-line');selectionCount.setAttribute('role','status');
  function updateSelection(){
    const total=tracks.filter(t=>selectedTracks.has(t.id)).length;
    selectionCount.textContent=total+' titre'+(total!==1?'s':'')+' coché'+(total!==1?'s':'');
    csvExport.disabled=exportingCSV||deletingTracks||!total;tuneTransfer.disabled=exportingCSV||deletingTracks||!total;deleteSelected.disabled=exportingCSV||deletingTracks||!total;
  }
  function filteredTracks(){
    const terms=normalizeSearch(search.value).split(/\s+/).filter(Boolean);
    return tracks.filter(t=>terms.every(term=>normalizeSearch(t.artist+' '+t.title).includes(term)));
  }
  const selectAll=button('Tout cocher',()=>{filteredTracks().forEach(t=>selectedTracks.add(t.id));display();});
  const selectNone=button('Tout décocher',()=>{selectedTracks.clear();display();});
  const selectionTools=node('div','','music-selection-tools');selectionTools.append(selectAll,selectNone,node('span','« Tout cocher » sélectionne tous les résultats de la recherche, y compris les lignes non affichées.','field-note'));
  adminPanel.append(selectionTools);
  const actions=node('div','','agenda-navigation');actions.append(selectionCount);
  if(isMusicAdmin)content.prepend(adminPanel);content.append(actions,toolbar,count,list,more);
  if(session.user.role==='admin'){
    const importPanel=node('details','','calendar-tools');importPanel.open=!tracks.length;importPanel.append(node('summary','Importer des morceaux (CSV)'),node('p','Choisissez votre CSV, puis cliquez sur « Importer dans le portail ». Les morceaux déjà présents sont ignorés.','field-note'));
    const label=node('label','Fichier CSV avec les colonnes Artist et Title'),file=node('input');file.type='file';file.accept='.csv,text/csv';file.id='music-csv-import';label.htmlFor=file.id;
    const importCSV=button('Importer depuis CSV',()=>{importPanel.open=true;file.click();},'btn primary');
    adminActions.prepend(importCSV);
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
    importPanel.append(label,file,state,importButton);adminPanel.append(importPanel);
  }

  function display(){
    const terms=normalizeSearch(search.value).split(/\s+/).filter(Boolean);
    const visible=filteredTracks();updateSelection();
    count.textContent=visible.length+' morceau'+(visible.length!==1?'x':'')+(terms.length?' trouvé'+(visible.length!==1?'s':''):' dans la sélection');
    list.replaceChildren();
    visible.slice(0,limit).forEach(t=>{
      const row=node('div','','music-row');row.setAttribute('role','listitem');
      const check=node('input','','music-row-check');check.type='checkbox';check.checked=selectedTracks.has(t.id);check.setAttribute('aria-label','Sélectionner '+t.title+' de '+t.artist);
      check.onchange=()=>{if(check.checked)selectedTracks.add(t.id);else selectedTracks.delete(t.id);updateSelection();};
      const song=node('span',t.title,'music-row-title'),artistName=node('span',t.artist,'music-row-artist');
      const added=node('time','','music-row-date'),addedDate=new Date(t.created_at);
      if(t.created_at&&!Number.isNaN(addedDate.getTime())){added.dateTime=addedDate.toISOString();added.textContent='Ajouté le '+addedDate.toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'});}else added.textContent='Date inconnue';
      row.append(check,song,artistName,added);list.append(row);
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

let homeExtrasPending=false;
async function refreshHomeExtras(){
  if(!session||session.user.mustChange||homeExtrasPending)return;
  const userId=session.user.id;homeExtrasPending=true;
  try{
    const results=await Promise.allSettled([Promise.resolve(null),api('/api/publications'),api('/api/collaborateurs/celebrations'),tileAllowed('Agenda')?api('/api/calendar'):Promise.resolve(null),tileAllowed('Emplois du temps')?api('/api/schedule/today'):Promise.resolve(null)]);
    const news=results[1].status==='fulfilled'?results[1].value:[],celebrations=results[2].status==='fulfilled'?results[2].value:null;
    if(session?.user.id!==userId)return;
    document.querySelectorAll('.grid .tile').forEach(tile=>{
      tile.querySelector('.tile-news')?.remove();
      if(tile.classList.contains('tool-tile')||tile.classList.contains('primary-space')||['Collaborateurs','Contacts utiles','Agenda','Emplois du temps','Fun','Passerelle groupement'].includes(tile.dataset.universe))return;
      const count=news.find(n=>n.universe===tile.dataset.universe)?.unread||0;
      const badge=node('span','','tile-news'+(count?' has-news':''));
      const label=tile.dataset.universe==='Actualités'?(count?count+' message'+(count>1?'s':'')+' non vu'+(count>1?'s':''):'Aucun message non vu'):(count?count+' nouveauté'+(count>1?'s':'')+' non lue'+(count>1?'s':''):'Aucune nouveauté non lue');
      badge.append(node('span',count?'●':'○','news-dot'),node('span',label));
      tile.append(badge);
    });
    renderHomeAgenda(results[3].status==='fulfilled'?results[3].value:null);
    const planning=q('.grid [data-universe="Emplois du temps"]');
    if(planning){
      planning.querySelector('.tile-schedule')?.remove();
      const data=results[4].status==='fulfilled'?results[4].value:null,block=node('span','','tile-schedule');
      block.append(node('span','Mes horaires aujourd’hui','tile-schedule-title'));
      const list=node('span','','tile-schedule-list');
      if(data?.slots?.length)data.slots.forEach(slot=>{const line=node('span','','tile-schedule-line');line.append(node('b',slot.start+'–'+slot.end),node('span',(['travail','formation','ecole_cfa','reunion'].includes(slot.kind||data.kind)&&slot.post?(scheduleLabels[slot.kind||data.kind]?.split(' ')[0]||'💼')+' '+slot.post:null)||(scheduleLabels[slot.kind||data.kind]||'Poste non renseigné')));list.append(line);});for(const d of data?.durations||[])list.append(node('span',(scheduleLabels[d.kind]||d.kind)+' · '+formatHours(d.minutes),'tile-schedule-line'));
      if(!data?.slots?.length&&!data?.durations?.length)list.append(node('span',data?((scheduleLabels[data.kind]||'Aucun créneau publié aujourd’hui')+(data.leavePart==='morning'?' · matin':data.leavePart==='afternoon'?' · après-midi':'')):'Horaires indisponibles'));
      list.addEventListener('click',e=>e.stopPropagation());block.append(list);planning.append(block);
    }
    renderCelebrations(celebrations);
    q('.grid [data-universe="Fun"]')?.querySelector('.daily-joke')?.remove();
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
  if(!session||session.user.mustChange||session.user.role==='tester'||document.hidden)return;
  void refreshGoogleConnections();if(currentUniverse)void renderPublications(currentUniverse);else void refreshHomeExtras();
},60000);

let scheduleWeek='',scheduleScope='',scheduleData=null,scheduleRequest=0,scheduleTemplatesView=false,scheduleView='day',scheduleDay='';
const scheduleLabels={travail:'💼 Travail',formation:'📚 Formation',ecole_cfa:'🎓 École CFA',reunion:'🗣️ Réunion',conge:'🏝️ Congés',maladie:'🩺 Arrêt maladie',recuperation:'🔄 Récupération',absence_injustifiee:'⚠️ Absence injustifiée',absence:'⏸️ Absence',repos:'🛌 Repos',mixte:'🧩 Journée mixte'};
function mondayOf(day){const date=new Date(day+'T12:00:00Z');return moveDay(day,-((date.getUTCDay()+6)%7));}
function formatHours(minutes){return Math.floor(minutes/60)+' h'+(minutes%60?' '+String(minutes%60).padStart(2,'0'):'');}
function scheduleWeekNumber(day){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));return Math.ceil(((d-Date.UTC(d.getUTCFullYear(),0,1))/86400000+1)/7);}
function scheduleMinutes(entry){return (entry?.slots||[]).reduce((sum,[a,b],i)=>{if(!['travail','formation','ecole_cfa','reunion'].includes(entry.slotKinds?.[i]||entry.kind))return sum;const parse=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};return sum+parse(b)-parse(a);},0);}

function scheduleDate(day,options={day:'numeric',month:'long'}){return new Date(day+'T12:00:00Z').toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',...options});}
function schedulePreference(){try{return localStorage.getItem('portail-plus:schedule-scope:'+session.user.id);}catch{return null;}}
async function renderSchedule(){
  if(!session)return;scheduleTemplatesView=false;const userId=session.user.id,request=++scheduleRequest;
  if(!scheduleDay)scheduleDay=parisDay();if(!scheduleWeek)scheduleWeek=mondayOf(scheduleDay);
  if(!scheduleScope)scheduleScope=schedulePreference()||(session.user.role==='admin'?'team':'mine');
  const [data,posts,tools,templates,presence]=await Promise.all([api('/api/schedule?week='+scheduleWeek+'&scope='+scheduleScope),api('/api/schedule-posts'),import('/schedule-tools.js'),session.user.role==='admin'?api('/api/schedule-templates'):Promise.resolve([]),scheduleView==='day'&&scheduleScope==='mine'?api('/api/schedule?week='+scheduleWeek+'&scope=team'):Promise.resolve(null)]);data.posts=posts;data.presenceEntries=presence?.entries||data.entries;data.presencePeople=presence?.people||data.people;
  if(currentUniverse!=='Emplois du temps'||session?.user.id!==userId||request!==scheduleRequest)return;
  scheduleData=data;const isAdmin=data.canEdit??(session.user.role==='admin'),content=q('#content');
  const root=node('div','','schedule'),toolbar=node('div','','schedule-toolbar schedule-navigation'),navigation=node('div','','schedule-date-navigation'),utilities=node('div','','schedule-user-actions'),adminPanel=node('details','','schedule-admin-panel admin-menu'),adminSummary=node('summary','Administration'),adminTools=node('div','','schedule-admin-tools');adminPanel.append(adminSummary,adminTools);
  const orderControls=person=>{const controls=node('span','','schedule-order-controls');if(session.user.role!=='admin'||scheduleScope!=='team')return controls;const index=data.people.findIndex(p=>p.id===person.id);for(const [direction,offset,label]of [['up',-1,'↑'],['down',1,'↓']]){const neighbor=data.people[index+offset],move=button(label,async()=>{controls.querySelectorAll('button').forEach(b=>b.disabled=true);try{await api('/api/schedule/people-order','POST',{userId:person.id,neighborId:neighbor.id,direction});await renderSchedule();q('#feedback').textContent='Ordre des collaborateurs enregistré.';}catch(e){error(e);await renderSchedule();}},'btn small');move.disabled=!neighbor;move.title=(direction==='up'?'Monter ':'Descendre ')+person.name;move.setAttribute('aria-label',move.title);controls.append(move);}return controls;};
  const navigate=async offset=>{if(scheduleView==='day'){scheduleDay=moveDay(scheduleDay,offset);scheduleWeek=mondayOf(scheduleDay);}else{scheduleWeek=moveDay(scheduleWeek,offset);scheduleDay=scheduleWeek;}try{await renderSchedule();}catch(e){error(e);}};
  const weekInput=node('input');weekInput.type='date';weekInput.value=scheduleView==='day'?scheduleDay:scheduleWeek;weekInput.setAttribute('aria-label',scheduleView==='day'?'Journée à consulter':'Semaine à consulter');
  weekInput.onchange=async()=>{if(weekInput.value){scheduleDay=weekInput.value;scheduleWeek=mondayOf(scheduleDay);try{await renderSchedule();}catch(e){error(e);}}};
  navigation.append(button(scheduleView==='day'?'← Jour précédent':'← Semaine précédente',()=>navigate(scheduleView==='day'?-1:-7)),button(scheduleView==='day'?'Aujourd’hui':'Cette semaine',async()=>{scheduleDay=parisDay();scheduleWeek=mondayOf(scheduleDay);try{await renderSchedule();}catch(e){error(e);}}),button(scheduleView==='day'?'Jour suivant →':'Semaine suivante →',()=>navigate(scheduleView==='day'?1:7)),weekInput);toolbar.append(navigation);const views=node('div','','schedule-scope');for(const [value,label]of [['day','Jour'],['week','Semaine']]){const b=button(label,async()=>{scheduleView=value;await renderSchedule();},'btn small'+(scheduleView===value?' primary':''));b.setAttribute('aria-pressed',String(scheduleView===value));views.append(b);}toolbar.append(views);if(session.user.role==='admin')views.append(button('Mois',async()=>{scheduleTemplatesView=true;const module=await import('/schedule-month.js');await module.renderScheduleMonth({container:content,api,month:scheduleDay.slice(0,7),onBack:()=>void renderSchedule(),isCurrent:()=>scheduleTemplatesView&&currentUniverse==='Emplois du temps'&&session?.user.id===userId});}));
  const scope=node('div','','schedule-scope');scope.setAttribute('role','group');scope.setAttribute('aria-label','Choisir le planning à afficher');
  [['mine','Mon planning'],['team','Toute l’équipe']].forEach(([value,label])=>{
    const b=button(label,async()=>{scheduleScope=value;try{localStorage.setItem('portail-plus:schedule-scope:'+session.user.id,value);}catch{}try{await renderSchedule();}catch(e){error(e);}},'btn small'+(scheduleScope===value?' primary':''));
    b.setAttribute('aria-pressed',String(scheduleScope===value));scope.append(b);
  });
  toolbar.append(scope);utilities.append(button('Demander des congés',()=>void tools.openLeaveRequests({api,user:session.user,dialogFactory:scheduleDialog}),'btn primary'));if(session.user.role==='admin')adminTools.append(button('Semaines types',async()=>{scheduleTemplatesView=true;const module=await import('/schedule-templates.js');if(currentUniverse==='Emplois du temps'&&session?.user.id===userId)await module.renderScheduleTemplates({container:content,api,isCurrent:()=>scheduleTemplatesView&&currentUniverse==='Emplois du temps'&&session?.user.id===userId,onBack:()=>void renderSchedule(),editDay:editScheduleDay,labels:scheduleLabels,paintPost:paintSchedulePost});}),button('Demandes de congés de l’équipe',()=>void tools.openLeaveRequests({api,user:session.user,team:true,dialogFactory:scheduleDialog,onChanged:renderSchedule})),button('Paramétrer les postes',()=>void tools.openSchedulePosts({api,dialogFactory:scheduleDialog,onChanged:renderSchedule})));utilities.append(button('Imprimer',()=>window.print()));const heading=node('div','','schedule-controls');heading.append(toolbar,utilities);if(isAdmin)root.append(adminPanel);root.append(heading);
  const title=node('h3',scheduleView==='day'?scheduleDate(scheduleDay,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+' · 7 h 30 à 21 h 30':'Semaine '+scheduleWeekNumber(scheduleWeek)+' du '+scheduleDate(scheduleWeek,scheduleWeek.slice(0,7)===moveDay(scheduleWeek,6).slice(0,7)?{day:'numeric'}:{day:'numeric',month:'long',...(scheduleWeek.slice(0,4)!==moveDay(scheduleWeek,6).slice(0,4)?{year:'numeric'}:{})})+' au '+scheduleDate(moveDay(scheduleWeek,6),{day:'numeric',month:'long',year:'numeric'}),'schedule-week-title');
  const status=node('p',data.publishedAt?(isAdmin&&data.unpublishedChanges?'Brouillon modifié · la dernière version publiée reste visible pour l’équipe.':'Publié le '+new Date(data.publishedAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'})):(isAdmin?'Brouillon · cette semaine n’est pas encore publiée.':'Cette semaine n’a pas encore été publiée.'),'schedule-status '+(!data.publishedAt?'state-draft':isAdmin&&data.unpublishedChanges?'state-modified':'state-published'));
  status.prepend(node('strong',!data.publishedAt?'📝 BROUILLON · ':isAdmin&&data.unpublishedChanges?'✏️ MODIFIÉ DEPUIS LA PUBLICATION · ':'✓ PUBLIÉ · '));status.setAttribute('role','status');
  if(scheduleView==='day'&&scheduleDay===parisDay()){title.classList.add('schedule-today-title');title.append(node('span','Aujourd’hui','schedule-today-label'));}
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
    if(session.user.role==='admin'){const model=node('select');model.setAttribute('aria-label','Choisir une semaine type');model.append(node('option','Choisir une semaine type'));model.firstChild.value='';templates.forEach(t=>{const o=node('option',t.name);o.value=t.id;model.append(o);});const apply=button('Appliquer le modèle',()=>{const t=templates.find(t=>t.id===Number(model.value));if(!t)return;const dialog=scheduleDialog('Appliquer « '+t.name+' » à cette semaine ?'),message=node('p','','error');dialog.append(node('p','Le brouillon de toute l’équipe sera remplacé par ce modèle. Les tickets restaurant et les heures réalisées du brouillon seront remis à zéro. La version publiée restera visible jusqu’à la prochaine publication.'));const confirm=button('Appliquer au brouillon',async()=>{confirm.disabled=true;try{await api('/api/schedule/'+data.week+'/apply-template','POST',{templateId:t.id,templateRevision:t.revision,revision:data.revision});dialog.close();await renderSchedule();q('#feedback').textContent='Modèle appliqué au brouillon. Vérifiez la semaine, puis publiez-la.';}catch(e){message.textContent=e.message;confirm.disabled=false;}},'btn primary');const buttons=node('div','','dialog-actions');buttons.append(button('Annuler',()=>dialog.close()),confirm);dialog.append(message,buttons);dialog.showModal();});actions.append(model,apply);}
    const publicationGroup=node('span','','schedule-publication-group'),publicationDate=node('span',data.publishedAt?'Dernière publication : '+new Date(data.publishedAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'}):'Cette semaine n’a pas encore été publiée.','field-note');publicationGroup.append(publish,publicationDate);const copyGroup=node('div','','schedule-copy-group');copyGroup.append(sourceLabel,source,copy);actions.append(copyGroup,publicationGroup,button('Recharger la semaine',async()=>{try{await renderSchedule();}catch(e){error(e);}}));adminTools.append(actions);const help=node('details','','schedule-help');help.append(node('summary','Comment modifier le planning ?'),node('p','Cliquez sur une journée pour saisir jusqu’à 10 créneaux. Le clic droit sur un créneau permet d’en ajouter un ou de changer son poste. La copie et la publication portent sur toute l’équipe. Chaque créneau peut avoir son propre type : travail, congé, absence ou repos.','field-note'));adminTools.append(help);
  }
  const legend=node('div','','schedule-legend');Object.entries(scheduleLabels).filter(([kind])=>session.user.role==='admin'||!['maladie','absence_injustifiee'].includes(kind)).forEach(([kind,label])=>legend.append(node('span',label,'schedule-kind '+kind)));posts.filter(p=>p.active).forEach(p=>{const item=node('span',p.name,'schedule-post-badge');paintSchedulePost(item,p.color);legend.append(item);});const legendPanel=node('details','','schedule-legend-panel');legendPanel.open=true;legendPanel.append(node('summary','Légende · postes et types de créneaux'),legend);root.append(legendPanel);
  if(scheduleView==='day'){const module=await import('/schedule-day.js');if(currentUniverse!=='Emplois du temps'||session?.user.id!==userId||request!==scheduleRequest||scheduleTemplatesView)return;const area=node('div');root.append(area);content.replaceChildren(root);module.renderScheduleDay({container:area,data,orderControls,day:scheduleDay,canEdit:isAdmin,isAdmin:session.user.role==='admin',userId,labels:scheduleLabels,paintPost:paintSchedulePost,editDay:editScheduleDay,showMenu:tools.showScheduleMenu,onMeal:async(person,enabled)=>{await api('/api/schedule/'+data.week+'/meal-ticket','POST',{userId:person.id,day:scheduleDay,enabled,revision:data.revision});await renderSchedule();},onError:error,isCurrent:()=>currentUniverse==='Emplois du temps'&&session?.user.id===userId&&request===scheduleRequest&&!scheduleTemplatesView});return;}
  const wrap=node('div','','schedule-scroll');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Planning hebdomadaire, défilement horizontal');
  const table=node('table','','schedule-table'),head=node('thead'),headRow=node('tr');headRow.append(node('th','Collaborateur'));
  const days=Array.from({length:7},(_,i)=>moveDay(scheduleWeek,i));days.forEach(day=>{const th=node('th'),locked=!!data.lockedDays?.[day],openDay=button(scheduleDate(day,{weekday:'short',day:'2-digit',month:'2-digit'}),async()=>{scheduleDay=day;scheduleView='day';try{await renderSchedule();}catch(e){error(e);}},'btn small schedule-day-open');openDay.title='Voir la journée du '+scheduleDate(day,{weekday:'long',day:'numeric',month:'long',year:'numeric'});openDay.setAttribute('aria-label',openDay.title);th.append(openDay);if(day===parisDay()){th.classList.add('schedule-today');th.setAttribute('aria-current','date');th.prepend(node('span','Aujourd’hui','schedule-today-label'));}if(session.user.role==='admin'){const lock=button(locked?'🔒':'🔓',async()=>{lock.disabled=true;try{await api('/api/schedule/'+data.week+'/day-lock','POST',{day,locked:!locked,revision:data.revision});await renderSchedule();q('#feedback').textContent=locked?'Journée dévalidée.':'Journée validée et verrouillée.';}catch(e){error(e);lock.disabled=false;}},'btn small schedule-day-lock');lock.title=(locked?'Dévalider':'Valider')+' la journée du '+scheduleDate(day);lock.setAttribute('aria-label',lock.title);lock.setAttribute('aria-pressed',String(locked));th.append(lock);}else if(locked)th.append(node('span',' 🔒'));headRow.append(th);});headRow.append(node('th','Total des heures'));headRow.querySelectorAll('th').forEach(th=>th.scope='col');head.append(headRow);table.append(head);
  const entries=new Map(data.entries.map(e=>[e.userId+':'+e.day,e])),body=node('tbody');
  data.people.forEach(person=>{
    const tr=node('tr'),name=node('th',person.name);name.scope='row';name.append(orderControls(person));tr.append(name);let total=0,tickets=0;
    days.forEach(day=>{
      const entry=entries.get(person.id+':'+day),td=node('td'),cell=node(isAdmin?'button':'div','','schedule-day '+(entry?.kind||'empty-day'));
      if(day===parisDay())td.classList.add('schedule-today');if(isAdmin){cell.disabled=!!entry?.readOnly||!!data.lockedDays?.[day];cell.type='button';cell.setAttribute('aria-label','Modifier '+person.name+', '+scheduleDate(day,{weekday:'long',day:'numeric',month:'long'}));cell.onclick=()=>editScheduleDay(person,day,entry,data);}
      if(entry){cell.append(node('span',scheduleLabels[entry.kind]+(entry.leavePart==='morning'?' · matin':entry.leavePart==='afternoon'?' · après-midi':''),'schedule-day-kind'));entry.slots.forEach(([start,end],i)=>{const post=posts.find(p=>p.id===entry.postIds?.[i]),slot=node('span',start+' – '+end+' · '+(scheduleLabels[entry.slotKinds?.[i]||entry.kind]||'')+(post?' · '+post.name:''),'schedule-slot');slot.dataset.slot=String(i);if(post&&(entry.slotKinds?.[i]||entry.kind)==='travail')paintSchedulePost(slot,post.color);else slot.classList.add(entry.slotKinds?.[i]||entry.kind);if(entry.comments?.[i]){slot.append(node('span',' 💬','schedule-comment-indicator'));slot.title=slot.textContent+' · '+entry.comments[i];slot.tabIndex=0;slot.setAttribute('aria-label',slot.title);}cell.append(slot);});for(const d of entry.durations||[]){const durationSlot=node('span',scheduleLabels[d.kind]+' · '+formatHours(d.minutes)+(d.comment?' 💬':''),'schedule-slot '+d.kind);if(d.comment){durationSlot.title=durationSlot.textContent+' · '+d.comment;durationSlot.tabIndex=0;durationSlot.setAttribute('aria-label',durationSlot.title);}cell.append(durationSlot);}total+=scheduleMinutes(entry);if(entry.mealTicket)tickets++;}
      else cell.append(node('span',isAdmin?'+':'—'));
      if(isAdmin&&!entry?.readOnly&&!data.lockedDays?.[day])cell.oncontextmenu=e=>{const slot=e.target.closest('.schedule-slot'),index=slot?Number(slot.dataset.slot):Math.max(0,(entry?.slots?.length||1)-1);tools.showScheduleMenu({event:e,canAdd:(entry?.slots?.length||0)+(entry?.durations?.length||0)<10,onAdd:()=>editScheduleDay(person,day,entry,data,{addAfter:index}),onPost:()=>editScheduleDay(person,day,entry,data,{focusPost:index})});};td.append(cell);if(session.user.role==='admin'){const label=node('label','','schedule-meal-ticket'),check=node('input');check.type='checkbox';check.checked=!!entry?.mealTicket;check.disabled=!!data.lockedDays?.[day];check.setAttribute('aria-label','Ticket restaurant · '+person.name+' · '+scheduleDate(day));const ticketIcon=mealIcon();ticketIcon.setAttribute('aria-hidden','true');label.title='Ticket restaurant';label.append(check,ticketIcon);check.onchange=async()=>{check.disabled=true;try{await api('/api/schedule/'+data.week+'/meal-ticket','POST',{userId:person.id,day,enabled:check.checked,revision:data.revision});await renderSchedule();}catch(e){check.checked=!!entry?.mealTicket;check.disabled=false;error(e);}};td.append(label);}else if(entry?.mealTicket)td.append(mealIcon('schedule-meal-mark'));tr.append(td);
    });const totals=node('td','','schedule-total');totals.append(node('span',formatHours(total)));if(session.user.role==='admin')totals.append(node('small',tickets+' ticket'+(tickets>1?'s':'')));tr.append(totals);body.append(tr);
  });table.append(body);if(scheduleScope==='mine'){const module=await import('/schedule-week-time.js');if(currentUniverse!=='Emplois du temps'||session?.user.id!==userId||request!==scheduleRequest||scheduleTemplatesView)return;module.showPersonalWeekClock(table);root.append(node('p','Chaque créneau est placé à son heure réelle, de 7 h 30 à 21 h 30. Les espaces libres représentent les périodes sans créneau. Survolez un créneau ou touchez-le pour en consulter les détails. Les durées sans horaires sont indiquées sous la grille.','field-note'));}wrap.append(table);root.append(wrap);
  if(!data.people.length)root.append(node('p','Aucun collaborateur dans cette vue.','empty'));
  if(!isAdmin&&!data.publishedAt)root.append(node('p','Vous serez averti dans les nouveautés lorsque le planning sera publié.','field-note'));
  root.append(node('p','Total des créneaux de travail, de formation, d’école CFA et de réunion, hors congés, absences et repos.','field-note'));
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
function paintSchedulePost(element,color){if(!/^#[0-9a-f]{6}$/i.test(color))return;element.style.backgroundColor=color;const n=parseInt(color.slice(1),16),channels=[n>>16,(n>>8)&255,n&255].map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}),light=channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;element.style.color=light>.179?'#000000':'#ffffff';}
async function editScheduleDay(person,day,entry,data,options={}){
 const {scheduleTimeIssues}=await import('/schedule-model.js');
 const changed=async()=>data.templateId?data.onChanged():renderSchedule(),weekday=Math.round((Date.parse(day)-Date.parse(data.week))/86400000),dialog=scheduleDialog(person.name+' · '+(data.templateId?['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'][weekday]+' (semaine type)':scheduleDate(day,{weekday:'long',day:'numeric',month:'long'}))),form=node('form'),slots=node('div','','schedule-slot-editor'),items=[],status=node('p','','error'),total=node('p','','field-note');status.setAttribute('role','alert');
 const work=k=>['travail','formation','ecole_cfa','reunion'].includes(k),parse=v=>{if(!/^\d{2}:\d{2}$/.test(v))return null;const [h,m]=v.split(':').map(Number);return h*60+m;},clock=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 function typeOptions(select,value){Object.entries(scheduleLabels).filter(([k])=>k!=='mixte'&&(k!=='absence'||value==='absence')&&(session.user.role==='admin'||!['maladie','absence_injustifiee'].includes(k))).forEach(([k,text])=>{const o=node('option',text);o.value=k;select.append(o);});select.value=value;}
 const quick=node('div','','schedule-day-shortcut'),quickLabel=node('label','Type pour toute la journée'),kind=node('select');typeOptions(kind,entry?.kind&&entry.kind!=='mixte'?entry.kind:'travail');quickLabel.append(kind);quick.append(quickLabel,button('Appliquer à tous les créneaux',()=>{items.forEach(item=>{item.type.value=kind.value;item.mode.value=work(kind.value)?'horaires':item.mode.value;});update();}));form.append(node('p','Chaque créneau possède son type et ses horaires. Pour une absence sans horaires précis, choisissez « Durée seule » et indiquez les heures et minutes.','field-note'),quick);

 function addSlot(seed={}){const row=node('div','','schedule-slot-form-row'),header=node('div','','schedule-slot-heading'),timeRow=node('div','','schedule-slot-times'),title=node('h4'),type=node('select'),typeLabel=node('label','Type de créneau'),mode=node('select'),modeLabel=node('label','Saisie'),pair=[],post=node('select'),duration=node('input'),durationLabel=node('label','Durée exacte (heures : minutes)');typeOptions(type,seed.kind||'travail');typeLabel.append(type);for(const [value,text]of [['horaires','Horaires début / fin'],['duree','Durée seule (absence / repos)']]){const o=node('option',text);o.value=value;mode.append(o);}mode.value=seed.duration!==undefined?'duree':'horaires';modeLabel.append(mode);typeLabel.className='schedule-slot-type';header.append(title,typeLabel);row.append(header,modeLabel,timeRow);
  for(const [j,text]of [[0,'Début'],[1,'Fin']]){const l=node('label',text),input=node('input');input.type='time';input.step='60';input.min='07:30';input.max='21:30';input.value=seed.times?.[j]||'';l.append(input);timeRow.append(l);pair.push(input);input.oninput=update;}
  duration.type='time';duration.step='60';duration.min='00:00';duration.max='14:00';duration.value=Number.isInteger(seed.duration)?clock(seed.duration):'';duration.oninput=update;durationLabel.append(duration);timeRow.append(durationLabel);
  const postLabel=node('label','Poste'),empty=node('option','Sans poste');empty.value='';post.append(empty);(data.posts||[]).filter(p=>p.active||p.id===seed.postId).forEach(p=>{const o=node('option',p.name+(p.active?'':' (archivé)'));o.value=p.id;post.append(o);});post.value=seed.postId??'';postLabel.className='schedule-slot-post';postLabel.append(post);timeRow.append(postLabel);function colorPost(){const selected=(data.posts||[]).find(p=>String(p.id)===post.value);post.style.backgroundColor='';post.style.color='';if(selected)paintSchedulePost(post,selected.color);}post.onchange=colorPost;colorPost();
  const commentLabel=node('label','Commentaire (facultatif)'),comment=node('textarea');commentLabel.className='schedule-comment-field';comment.rows=2;comment.maxLength=500;comment.value=seed.comment||'';commentLabel.append(comment);row.append(commentLabel);const item={row,title,type,mode,modeLabel,pair,duration,durationLabel,post,postLabel,comment};items.push(item);type.onchange=mode.onchange=update;const footer=node('div','','schedule-slot-footer');footer.append(button('Retirer ce créneau',()=>{items.splice(items.indexOf(item),1);row.remove();update();},'btn small'));row.append(footer);slots.append(row);}
 let seed=(entry?.slots||[]).map((times,i)=>({times,kind:entry.slotKinds?.[i]||entry.kind,postId:entry.postIds?.[i],comment:entry.comments?.[i]}));seed.push(...(entry?.durations||[]).map(d=>({kind:d.kind,duration:d.minutes,comment:d.comment||''})));if(!seed.length)seed=[entry&&!work(entry.kind)?{kind:entry.kind,duration:null}:{kind:'travail'}];if(options.addAfter!==undefined&&seed.length<10)seed.splice(Math.min(options.addAfter+1,seed.length),0,{kind:'travail'});seed.forEach(addSlot);
 const add=button('Ajouter un créneau (maximum 10)',()=>{if(items.length<10)addSlot();update();});
 const validation=node('div','','schedule-validation');validation.setAttribute('role','alert');
 const timeIssues=()=>scheduleTimeIssues(items.map(item=>work(item.type.value)||item.mode.value==='horaires'?{times:item.pair.map(n=>n.value),kind:item.type.value}:{duration:item.duration.value,kind:item.type.value}));
 let interacted=false;form.addEventListener('input',()=>{interacted=true;update();});form.addEventListener('change',()=>{interacted=true;update();});
 function update(){add.disabled=items.length>=10;const totals={};items.forEach((item,i)=>{const timed=work(item.type.value)||item.mode.value==='horaires';if(work(item.type.value))item.mode.value='horaires';item.title.textContent='Créneau '+(i+1);item.modeLabel.hidden=work(item.type.value);item.pair.forEach(input=>{input.parentElement.hidden=!timed;input.disabled=!timed;input.required=timed;});item.durationLabel.hidden=timed;item.duration.disabled=timed;item.duration.required=!timed;item.postLabel.hidden=item.type.value!=='travail';item.post.disabled=item.type.value!=='travail';item.comment.disabled=false;const a=parse(item.pair[0].value),b=parse(item.pair[1].value),value=timed?a!==null&&b!==null?Math.max(0,b-a):0:parse(item.duration.value)||0;item.title.textContent+=' · '+formatHours(value);totals[item.type.value]=(totals[item.type.value]||0)+value;});total.textContent=Object.entries(totals).map(([k,v])=>scheduleLabels[k]+' : '+formatHours(v)).join(' · ');const issues=interacted?timeIssues():[];validation.replaceChildren(...issues.map(issue=>node('p','⚠️ '+issue.message)));items.forEach((item,i)=>item.row.classList.toggle('schedule-slot-invalid',issues.some(issue=>issue.indices.includes(i))));}
 const actions=node('div','','dialog-actions'),save=node('button',data.templateId?'Enregistrer le modèle':'Enregistrer le brouillon','btn primary');save.type='submit';const clear=button('Vider cette journée',async()=>{clear.disabled=true;try{await api(data.templateId?'/api/schedule-templates/'+data.templateId+'/clear-day':'/api/schedule/'+data.week+'/clear-day','POST',{userId:person.id,day,weekday,revision:data.revision});dialog.close();await changed();}catch(e){status.textContent=e.message;clear.disabled=false;}});clear.disabled=!entry;actions.append(clear,button('Annuler',()=>dialog.close()),save);form.append(slots,add,total,validation,status,actions);dialog.append(form);update();
 form.onsubmit=async e=>{e.preventDefault();status.textContent='';interacted=true;update();if(timeIssues().length){status.textContent='Corrigez les horaires signalés avant d’enregistrer.';return;}if(!items.length){status.textContent='Ajoutez un créneau ou videz la journée.';return;}const timed=[],durations=[];for(const item of items){if(work(item.type.value)||item.mode.value==='horaires')timed.push({times:item.pair.map(n=>n.value),kind:item.type.value,postId:item.type.value==='travail'&&item.post.value?Number(item.post.value):null,comment:item.comment.value});else{const value=parse(item.duration.value);if(value===null||value===0&&item.type.value!=='repos'){status.textContent='Renseignez la durée exacte de chaque absence.';return;}durations.push({kind:item.type.value,minutes:value,comment:item.comment.value});}}timed.sort((a,b)=>a.times[0].localeCompare(b.times[0]));const kinds=[...new Set([...timed.map(t=>t.kind),...durations.map(d=>d.kind)])],payload={userId:person.id,day,weekday,kind:kinds.length===1?kinds[0]:'mixte',slots:timed.map(t=>t.times),slotKinds:timed.map(t=>t.kind),postIds:timed.map(t=>t.postId),comments:timed.map(t=>t.comment),durations,revision:data.revision};save.disabled=clear.disabled=true;try{await api(data.templateId?'/api/schedule-templates/'+data.templateId+'/day':'/api/schedule/'+data.week+'/day','PUT',payload);dialog.close();await changed();q('#feedback').textContent=data.templateId?'Journée enregistrée dans la semaine type.':'Journée enregistrée dans le brouillon.';}catch(e){status.textContent=e.message;save.disabled=false;clear.disabled=!entry;}};
 dialog.showModal();if(options.focusPost!==undefined)items[options.focusPost]?.post.focus();else kind.focus();
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
  const reminders=valid.filter(e=>e.remind&&(eventDays(e).start>today||(e.personalTask&&eventDays(e).start===today))&&eventDays(e).start<=last).sort(order);
  const todayEvents=valid.filter(e=>{
    const title=normalizeSearch(e.title||''),days=eventDays(e);
    return !e.personalTask&&(e.remind||/\brdv\b|\brendez[ -]+vous\b|\bformations?\b/.test(title))&&days.start<=today&&days.end>=today;
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
  if(!data||(data.error&&!events.length))block.append(node('span','Agenda momentanément indisponible'));
  else if(!data.connected&&!events.length)block.append(node('span','Agenda Google à connecter · vos tâches restent disponibles')); 
  else {
    const daily=events.filter(e=>!e.personalTask&&eventDays(e).start<=today),reminders=events.filter(e=>e.personalTask||eventDays(e).start>today);
    const daySection=node('span','','agenda-today'),reminderSection=node('span','','agenda-reminders');
    daySection.append(node('span','Aujourd’hui','agenda-group-title'));
    reminderSection.append(node('span',reminders.length?'🔔 Rappels · 7 prochains jours':'🔔 Aucun rappel à venir','agenda-group-title'));
    const addRows=(section,list,limit,isReminder)=>{
      list.slice(0,limit).forEach((e,i)=>{const icon=e.personalTask?e.icon+' ':isReminder?'🔔 ':normalizeSearch(e.title||'').includes('formation')?'🎓 ':'📅 ';const text=icon+label(e)+(i===limit-1&&list.length>limit?' · +'+(list.length-limit):'');const row=node('span','','agenda-event-line'+(isReminder?' personal-reminder':''));row.append(node('span',text,'agenda-event-text'));const meeting=meetingIcon(e.title);if(meeting)row.prepend(meeting);const lounge=loungeIcon(e.title);if(lounge)row.prepend(lounge);row.title=label(e);section.append(row);});
    };
    if(!daily.length)daySection.append(node('span','Aucun rendez-vous ni formation','agenda-event-line'));
    addRows(daySection,daily,reminders.length?3:5,false);addRows(reminderSection,reminders,2,true);
    daySection.title=daily.map(label).join('\n');reminderSection.title=reminders.map(label).join('\n');
    block.append(daySection,reminderSection);
  }
  block.setAttribute('aria-label','Agenda du jour et rappels personnels : '+events.map(label).join('; '));tile.append(block);
}
