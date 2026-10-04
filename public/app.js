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
  card.append(node('p',when,'event-time'));if(e.location)card.append(node('p',e.location));if(e.description)card.append(node('p',e.description));return card;
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
let session=null,people=[],editId=null,removeId=null,currentUniverse=null;
function node(tag,text='',cls=''){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;}
async function api(path,method='GET',data){
  const options={method,headers:{}};
  if(method!=='GET'){options.headers['Content-Type']='application/json';if(session)options.headers['X-CSRF-Token']=session.csrf;if(data!==undefined)options.body=JSON.stringify(data);}
  const response=await fetch(path,options);let body;try{body=await response.json();}catch{throw Error('Le service ne répond pas. Réessayez.');}
  if(!response.ok){if(response.status===401&&path!=='/api/login')showLogin();throw Error(body.error||'Demande impossible.');}return body;
}
function error(e){q('#global-message').textContent=e.message;}
function showLogin(){session=null;currentUniverse=null;q('#home').classList.add('hidden');q('#detail').classList.add('hidden');q('#login').classList.remove('hidden');q('#logout').classList.add('hidden');q('#account').classList.add('hidden');q('#session-name').textContent='Espace sécurisé';document.querySelectorAll('dialog[open]').forEach(d=>d.close());q('#content').replaceChildren();people=[];}
function showHome(){
  currentUniverse=null;applyTileOrder();q('#login').classList.add('hidden');q('#detail').classList.add('hidden');q('#global-message').textContent='';q('#home').classList.remove('hidden');q('#logout').classList.remove('hidden');q('#account').classList.remove('hidden');
  q('#session-name').textContent=session.user.name+(session.user.role==='admin'?' · Administrateur':'');
  document.querySelectorAll('[data-universe]').forEach(b=>b.classList.toggle('hidden',session.user.role!=='admin'&&(b.dataset.universe==='Collaborateurs'||(b.dataset.universe!=='Fun'&&!session.user.rights.includes(b.dataset.universe)))));
  q('.section-label>span').textContent=session.user.role!=='admin'&&!session.user.rights.length?'Aucun accès attribué. Contactez votre administrateur.':'Vos espaces autorisés';
}
function afterLogin(){if(session.user.mustChange){q('#login').classList.add('hidden');q('#logout').classList.remove('hidden');openPassword();}else showHome();}
q('#login-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;q('#login-error').textContent='';try{session=await api('/api/login','POST',{email:q('#login-email').value,password:q('#login-password').value});q('#login-password').value='';afterLogin();}catch(e){q('#login-error').textContent=e.message;}finally{btn.disabled=false;}};
q('#logout').onclick=async()=>{try{await api('/api/logout','POST');showLogin();}catch(e){error(e);}};
q('#account').onclick=()=>openPassword();
function openPassword(){q('#password-form').reset();q('#password-error').textContent='';q('#password-intro').textContent=session.user.mustChange?'Remplacez votre mot de passe provisoire pour accéder au portail.':'Choisissez un mot de passe personnel de 12 caractères minimum.';q('#password-cancel').classList.toggle('hidden',session.user.mustChange);q('#password-dialog').showModal();}
q('#password-dialog').addEventListener('cancel',e=>{if(session?.user.mustChange)e.preventDefault();});
q('#password-cancel').onclick=()=>q('#password-dialog').close();
q('#password-form').onsubmit=async e=>{e.preventDefault();if(q('#new-password').value!==q('#confirm-password').value){q('#password-error').textContent='Les nouveaux mots de passe ne correspondent pas.';return;}const btn=e.submitter;btn.disabled=true;try{session=await api('/api/password','POST',{currentPassword:q('#current-password').value,password:q('#new-password').value});q('#password-form').reset();q('#password-dialog').close();showHome();}catch(e){q('#password-error').textContent=e.message;}finally{btn.disabled=false;}};
const descriptions={'Fun':'La sélection musicale de l’équipe pour l’espace de vente.','Passerelle groupement':'Accès à votre groupement.','Collaborateurs':'Gérez les collaborateurs et leurs accès.','Emplois du temps':'Les horaires de votre équipe.','Agenda':'Votre agenda équipe, synchronisé avec Google.','Procédures':'Les consignes et documents de référence.','Laboratoires':'Les contacts et ressources de vos partenaires.','Challenges':'Les objectifs et défis collectifs de la pharmacie.','Actualités':'Les nouvelles et annonces de la pharmacie.','Formations':'Les ressources pour apprendre et se former.','Contacts utiles':'Les coordonnées utiles au quotidien.','Ressources humaines':'Les informations pratiques pour les collaborateurs.'};
document.querySelectorAll('[data-universe]').forEach(b=>b.onclick=()=>openUniverse(b.dataset.universe));
q('#back').onclick=()=>showHome();
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
  currentUniverse=name;q('#home').classList.add('hidden');q('#detail').classList.remove('hidden');q('#global-message').textContent='';setUniverseHeading(name);q('#description').textContent=descriptions[name];q('#feedback').textContent='';q('#add').classList.toggle('hidden',name!=='Collaborateurs');q('#content').replaceChildren(node('div','Chargement…','empty'));
  try{if(name==='Collaborateurs'){people=await api('/api/users');if(currentUniverse===name)renderPeople();}else if(name==='Fun')await renderMusic();else if(name==='Agenda'){calendarDay=parisDay();calendarQuery='';await renderCalendar();}else{await api('/api/universes/'+encodeURIComponent(name));if(currentUniverse===name)q('#content').replaceChildren(node('div','Cet espace est prêt à accueillir vos informations. Aucun contenu ajouté pour le moment.','empty'));}}catch(e){if(currentUniverse===name)q('#content').replaceChildren(node('div',e.message,'empty'));}
}
function button(label,action,cls='btn small'){const b=node('button',label,cls);b.type='button';b.onclick=action;return b;}
function renderPeople(){const content=q('#content');content.replaceChildren();if(!people.length){content.append(node('div','Aucun collaborateur ajouté. Créez un premier compte pour votre équipe.','empty'));return;}
  const wrap=node('div','','tablewrap'),table=document.createElement('table'),head=document.createElement('thead'),row=document.createElement('tr');['Collaborateur','Fonction','Adresse e-mail','Univers accessibles','Actions'].forEach(t=>{const th=node('th',t);th.scope='col';row.append(th);});head.append(row);table.append(head);const body=document.createElement('tbody');
  people.forEach(p=>{const tr=document.createElement('tr');tr.append(node('td',p.name),node('td',p.job),node('td',p.email),node('td',p.rights.join(' · ')||'Aucun univers','rights'));const actions=node('td','','actions');const change=button('Modifier',()=>openEditor(p.id));change.setAttribute('aria-label','Modifier '+p.name);const del=button('Supprimer',()=>{removeId=p.id;q('#removeText').textContent='Le compte de '+p.name+' et ses accès seront supprimés.';q('#removeDialog').showModal();},'btn small danger');del.setAttribute('aria-label','Supprimer '+p.name);del.style.marginLeft='8px';actions.append(change,del);tr.append(actions);body.append(tr);});table.append(body);wrap.append(table);content.append(wrap);
}
function openEditor(id=null){editId=id;q('#form').reset();q('#editor-error').textContent='';q('#dialogtitle').textContent=id===null?'Ajouter un collaborateur':'Modifier le collaborateur';q('#temporary-password').required=id===null;q('#password-help').textContent=id===null?'12 caractères minimum. À communiquer au salarié par un canal personnel.':'Laissez vide pour conserver le mot de passe. Remplissez pour attribuer un nouveau mot de passe provisoire.';if(id!==null){const p=people.find(p=>p.id===id);q('#fullname').value=p.name;q('#job').value=p.job;q('#email').value=p.email;document.querySelectorAll('[name=right]').forEach(c=>c.checked=p.rights.includes(c.value));}q('#editor').showModal();q('#fullname').focus();}
q('#add').onclick=()=>openEditor();q('#cancel').onclick=()=>q('#editor').close();q('#editor').addEventListener('close',()=>q('#temporary-password').value='');
q('#form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{await api('/api/users'+(editId===null?'':'/'+editId),editId===null?'POST':'PUT',{name:q('#fullname').value,job:q('#job').value,email:q('#email').value,password:q('#temporary-password').value,rights:[...document.querySelectorAll('[name=right]:checked')].map(c=>c.value)});q('#form').reset();q('#editor').close();people=await api('/api/users');renderPeople();q('#feedback').textContent='Compte enregistré. Les modifications de droits s’appliquent immédiatement.';}catch(e){q('#editor-error').textContent=e.message;}finally{btn.disabled=false;}};
q('#keep').onclick=()=>q('#removeDialog').close();q('#confirmRemove').onclick=async()=>{const btn=q('#confirmRemove');btn.disabled=true;try{await api('/api/users/'+removeId,'DELETE');q('#removeDialog').close();people=await api('/api/users');renderPeople();q('#feedback').textContent='Compte supprimé.';}catch(e){q('#removeDialog').close();q('#feedback').textContent=e.message;}finally{btn.disabled=false;}};
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
(async()=>{try{session=await api('/api/me');afterLogin();if(!session.user.mustChange&&location.search.includes('google=')){await openUniverse('Agenda');if(location.search.includes('refused'))q('#feedback').textContent='Autorisation Google annulée.';history.replaceState(null,'','/');}}catch{showLogin();}})();

const initialTileOrder=[...document.querySelectorAll('.grid [data-universe]')].map(b=>b.dataset.universe);
let draftTileOrder=[];
function tileOrderKey(){return 'portail-plus:tile-order:'+session.user.id;}
function applyTileOrder(){
  let saved=[];try{saved=JSON.parse(localStorage.getItem(tileOrderKey())||'[]');}catch{}
  if(!Array.isArray(saved))saved=[];
  const order=[...new Set([...saved.filter(n=>initialTileOrder.includes(n)),...initialTileOrder])];
  const grid=q('.grid');order.forEach(name=>{const tile=[...grid.children].find(b=>b.dataset.universe===name);if(tile)grid.append(tile);});
}
function renderTileOrder(focusName,focusDirection){
  const list=q('#tile-order-list');list.replaceChildren();
  draftTileOrder.forEach((name,index)=>{
    const row=node('div','','tile-order-row'),label=node('span',name),actions=node('div','','tile-order-actions');
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
  draftTileOrder=[...document.querySelectorAll('.grid [data-universe]')].filter(b=>!b.classList.contains('hidden')).map(b=>b.dataset.universe);
  q('#tile-order-status').textContent='';renderTileOrder();q('#tile-order-dialog').showModal();
};
q('#tile-order-cancel').onclick=()=>q('#tile-order-dialog').close();
q('#tile-order-reset').onclick=()=>{draftTileOrder=initialTileOrder.filter(n=>draftTileOrder.includes(n));renderTileOrder();};
q('#tile-order-save').onclick=()=>{
  try{localStorage.setItem(tileOrderKey(),JSON.stringify([...draftTileOrder,...initialTileOrder.filter(n=>!draftTileOrder.includes(n))]));applyTileOrder();q('#tile-order-dialog').close();}
  catch{q('#tile-order-status').textContent='Ce navigateur ne permet pas de mémoriser votre ordre.';}
};

async function renderMusic(){
  let tracks=await api('/api/music');if(currentUniverse!=='Fun')return;
  const selectedTracks=new Set();
  const content=q('#content');content.replaceChildren();
  const intro=node('div','','music-intro');intro.append(node('h3','La musique de toute l’équipe'),node('p','Ajoutez vos morceaux préférés à la sélection partagée de la pharmacie.'));
  const form=node('form','','music-form');
  const artistLabel=node('label','Artiste'),artist=node('input');artist.type='text';artist.id='music-artist';artist.maxLength=200;artist.required=true;artist.placeholder='Ex. : Adele';artistLabel.htmlFor=artist.id;
  const titleLabel=node('label','Titre'),title=node('input');title.type='text';title.id='music-title';title.maxLength=200;title.required=true;title.placeholder='Ex. : Hometown Glory';titleLabel.htmlFor=title.id;
  const artistField=node('div'),titleField=node('div');artistField.append(artistLabel,artist);titleField.append(titleLabel,title);
  const submit=node('button','Ajouter à la sélection','btn primary');submit.type='submit';
  const message=node('p','','music-feedback');message.setAttribute('role','status');
  form.append(artistField,titleField,submit);content.append(intro,form,message);
  content.append(node('p','Cette liste rassemble les choix de l’équipe. Pour créer une playlist Deezer ou YouTube, cochez vos titres, créez le CSV (étape 1), puis cliquez sur le logo de votre choix (étape 2) pour importer ce fichier avec Tune My Music. La synchronisation automatique n’est pas activée.','status-line'));
  const toolbar=node('div','','music-toolbar'),searchLabel=node('label','Retrouver un morceau'),search=node('input');search.type='search';search.id='music-search';search.placeholder='Artiste ou titre…';searchLabel.htmlFor=search.id;toolbar.append(searchLabel,search);
  const list=node('div','','music-list');list.setAttribute('role','list');const count=node('p','','status-line'),more=button('Afficher davantage',()=>{limit+=40;display();});let limit=40;

  const exportButton=button('ETAPE 1 créer un fichier CSV avec les titres cochés',()=>{
    const chosen=tracks.filter(t=>selectedTracks.has(t.id));if(!chosen.length)return;
    const csvCell=value=>'"'+String(value).replace(/"/g,'""')+'"';
    const csv='\uFEFF'+[['Artist','Title'],...chosen.map(t=>[t.artist,t.title])].map(row=>row.map(csvCell).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=node('a');a.href=url;a.download='Playlist_PORTAIL_PLUS.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const transfer=node('a','','btn small music-platform-button deezer-button');
  transfer.innerHTML="<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path fill=\"currentColor\" d=\"M.693 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807C.312 4.41 0 5.666 0 7.217s.312 2.808.693 2.808ZM21.038 1.56c-.364 0-.684.805-.91 2.096C19.765 1.446 19.184 0 18.526 0c-.78 0-1.464 2.036-1.784 5-.312-2.158-.788-3.536-1.325-3.536-.745 0-1.386 2.704-1.62 6.472-.442-1.932-1.083-3.145-1.793-3.145s-1.35 1.213-1.793 3.145c-.242-3.76-.874-6.463-1.628-6.463-.537 0-1.013 1.378-1.325 3.535C6.938 2.036 6.262 0 5.474 0c-.658 0-1.247 1.447-1.602 3.665-.217-1.291-.546-2.105-.91-2.105-.675 0-1.221 2.807-1.221 6.272 0 3.466.546 6.273 1.221 6.273.277 0 .537-.476.736-1.273.32 2.928.996 4.938 1.776 4.938.606 0 1.143-1.204 1.507-3.11.251 3.622.875 6.195 1.602 6.195.46 0 .875-1.023 1.187-2.677C10.142 21.6 11 24 12.004 24c1.005 0 1.863-2.4 2.235-5.822.312 1.654.727 2.677 1.186 2.677.728 0 1.352-2.573 1.603-6.195.364 1.906.9 3.11 1.507 3.11.78 0 1.455-2.01 1.775-4.938.208.797.46 1.273.737 1.273.675 0 1.22-2.807 1.22-6.273-.008-3.457-.553-6.272-1.23-6.272ZM23.307 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807-.381 0-.693 1.256-.693 2.807s.312 2.808.693 2.808Z\"/></svg>";transfer.href='https://www.tunemymusic.com/transfer/file-to-deezer';transfer.target='_blank';transfer.rel='noopener noreferrer';
  transfer.title='ETAPE 2 : importer le CSV généré dans Deezer';transfer.setAttribute('aria-label',transfer.title);
  const youtubeTransfer=node('a','','btn small music-platform-button youtube-button');
  youtubeTransfer.innerHTML="<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path fill=\"currentColor\" d=\"M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z\"/></svg>";youtubeTransfer.href='https://www.tunemymusic.com/transfer/file-to-youtube';youtubeTransfer.target='_blank';youtubeTransfer.rel='noopener noreferrer';
  youtubeTransfer.title='ETAPE 2 : importer le CSV généré dans YouTube';youtubeTransfer.setAttribute('aria-label',youtubeTransfer.title);
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
  const actions=node('div','','agenda-navigation');actions.append(exportButton,selectionCount,transfer,youtubeTransfer);
  content.append(actions,toolbar,count,list,more);
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
      actions.append(link,remove);row.append(check,song,artistName,added,actions);list.append(row);
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
